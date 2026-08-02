import json
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import DeepAgentThread, get_session, now
from ..deep_agent.agent import run_agent

router = APIRouter(prefix="/api/deep-agent", tags=["deep-agent"])


class ChatRequest(BaseModel):
    # full history from the client: [{role: "user"|"assistant", content: str}]
    messages: list[dict] = Field(min_length=1)


@router.post("/chat")
async def chat(req: ChatRequest):
    async def event_stream():
        async for event in run_agent(req.messages):
            yield f"data: {json.dumps(event, default=str)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── the deepagents builder (orchestrator + system experts) ─────────────────

class BuildRequest(BaseModel):
    message: str = Field(min_length=1)
    thread_id: str = ""  # reuse to continue a conversation; blank starts a new one
    full_access: bool = True  # True = auto-approve actions; False = pause for approval


class ResumeRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    approve: bool
    message: str = ""       # reason, when rejecting
    full_access: bool = False


def _text(content) -> str:
    """LangChain message content is a string or a list of content blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict):
                parts.append(b.get("text") or b.get("content") or "")
            else:
                parts.append(str(b))
        return "".join(parts)
    return str(content or "")


SUBAGENTS = ("workflow-builder", "business-manager", "expert-builder")


def _task_target(args) -> str:
    """The system expert a `task` delegation targets, from the tool-call args."""
    if not isinstance(args, dict):
        return ""
    for k in ("subagent_type", "subagent", "name", "agent"):
        v = args.get(k)
        if isinstance(v, str) and v in SUBAGENTS:
            return v
    blob = json.dumps(args)
    return next((s for s in SUBAGENTS if s in blob), "")


def _save_thread(session: Session, thread_id: str, user_msg: str, assistant_text: str) -> None:
    row = session.get(DeepAgentThread, thread_id)
    if row is None:
        row = DeepAgentThread(id=thread_id, title=user_msg[:80], messages_json="[]")
    msgs = json.loads(row.messages_json or "[]")
    msgs.append({"role": "user", "content": user_msg})
    if assistant_text.strip():
        msgs.append({"role": "assistant", "content": assistant_text.strip()})
    row.messages_json = json.dumps(msgs)
    row.updated_at = now()
    session.add(row)
    session.commit()


async def _stream_run(agent, config, inp, active, final_text):
    """Stream one run (initial or resume) as SSE strings. 'messages' streams model
    tokens; 'updates' carries the todo list and completed tool calls/results."""
    async for ns, mode, chunk in agent.astream(
        inp, config=config, stream_mode=["messages", "updates"], subgraphs=True
    ):
        in_subgraph = bool(ns)
        who = active["who"] if in_subgraph else "orchestrator"
        if mode == "messages":
            msg = chunk[0] if isinstance(chunk, (list, tuple)) else chunk
            if "AIMessage" in type(msg).__name__:
                token = _text(getattr(msg, "content", ""))
                if token:
                    if not in_subgraph:
                        final_text.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'agent': who, 'text': token})}\n\n"
            continue
        for _node, update in (chunk or {}).items():
            if not isinstance(update, dict):
                continue
            if update.get("todos") is not None:
                yield f"data: {json.dumps({'type': 'todos', 'todos': update['todos']}, default=str)}\n\n"
            for msg in update.get("messages", []) or []:
                cls = type(msg).__name__
                if "AIMessage" in cls:
                    for tc in getattr(msg, "tool_calls", None) or []:
                        name = tc.get("name")
                        if name == "task":
                            target = _task_target(tc.get("args"))
                            if target:
                                active["who"] = target
                                yield f"data: {json.dumps({'type': 'delegate', 'agent': target})}\n\n"
                        yield f"data: {json.dumps({'type': 'tool_call', 'agent': who, 'name': name, 'args': tc.get('args')}, default=str)}\n\n"
                elif "ToolMessage" in cls:
                    yield f"data: {json.dumps({'type': 'tool_result', 'agent': who, 'name': getattr(msg, 'name', ''), 'result': _text(getattr(msg, 'content', ''))[:2000]}, default=str)}\n\n"


def _pending_actions(agent, config) -> list[dict]:
    """Tool calls currently paused for approval — walks nested sub-agent interrupts."""
    try:
        snap = agent.get_state(config, subgraphs=True)
    except Exception:
        return []
    out: list[dict] = []

    def walk(s) -> None:
        for t in getattr(s, "tasks", ()) or ():
            for i in getattr(t, "interrupts", None) or []:
                v = getattr(i, "value", None)
                if isinstance(v, dict):
                    for ar in v.get("action_requests", []) or []:
                        out.append({"name": ar.get("name"), "args": ar.get("args")})
            st = getattr(t, "state", None)
            if hasattr(st, "tasks"):
                walk(st)

    walk(snap)
    return out


async def _drive(agent, config, inp, full_access, active, final_text):
    """Run the agent, auto-resuming approved actions in full-access mode, and pausing
    with an 'approval' event otherwise. Yields SSE strings; returns via generator end."""
    from langgraph.types import Command
    while True:
        async for ev in _stream_run(agent, config, inp, active, final_text):
            yield ev
        pending = _pending_actions(agent, config)
        if not pending:
            return
        if full_access:
            yield f"data: {json.dumps({'type': 'note', 'text': 'Full access — running ' + ', '.join(p['name'] for p in pending)})}\n\n"
            inp = Command(resume={"decisions": [{"type": "approve"} for _ in pending]})
            continue
        yield f"data: {json.dumps({'type': 'approval', 'actions': pending}, default=str)}\n\n"
        return


@router.post("/build")
async def build(req: BuildRequest, session: Session = Depends(get_session)):
    """Run the deep agent and stream its work: tokens, tool calls/results, the live
    todo list, expert handoffs, and — in review mode — approval requests for actions
    that go live or run in the world. thread_id makes it resumable."""
    from ..deep_agent.builder import get_agent

    thread_id = req.thread_id or f"da_{uuid.uuid4().hex[:12]}"
    active = {"who": "orchestrator"}
    final_text: list[str] = []

    async def event_stream():
        yield f"data: {json.dumps({'type': 'thread', 'thread_id': thread_id})}\n\n"
        try:
            agent = get_agent()
            config = {"configurable": {"thread_id": thread_id}}
            inp = {"messages": [{"role": "user", "content": req.message}]}
            async for ev in _drive(agent, config, inp, req.full_access, active, final_text):
                yield ev
            _save_thread(session, thread_id, req.message, "".join(final_text))
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)[:500]})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/resume")
async def resume(req: ResumeRequest, session: Session = Depends(get_session)):
    """Approve or reject the actions the agent paused on, then keep streaming."""
    from ..deep_agent.builder import get_agent
    from langgraph.types import Command

    active = {"who": "orchestrator"}
    final_text: list[str] = []

    async def event_stream():
        try:
            agent = get_agent()
            config = {"configurable": {"thread_id": req.thread_id}}
            pending = _pending_actions(agent, config)
            n = max(len(pending), 1)
            decisions = ([{"type": "approve"} for _ in range(n)] if req.approve
                         else [{"type": "reject", "message": req.message or "Rejected by the user."} for _ in range(n)])
            inp = Command(resume={"decisions": decisions})
            async for ev in _drive(agent, config, inp, req.full_access, active, final_text):
                yield ev
            if final_text:
                _save_thread(session, req.thread_id, "", "".join(final_text))
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)[:500]})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── thread sidebar ─────────────────────────────────────────────────────────

@router.get("/threads")
def list_threads(session: Session = Depends(get_session)):
    rows = session.exec(
        select(DeepAgentThread).order_by(DeepAgentThread.updated_at.desc()).limit(100)
    ).all()
    return [{"id": r.id, "title": r.title or "New conversation",
             "updated_at": r.updated_at.isoformat()} for r in rows]


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str, session: Session = Depends(get_session)):
    row = session.get(DeepAgentThread, thread_id)
    if row is None:
        return {"id": thread_id, "title": "", "messages": []}
    return {"id": row.id, "title": row.title, "messages": json.loads(row.messages_json or "[]")}


@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str, session: Session = Depends(get_session)):
    row = session.get(DeepAgentThread, thread_id)
    if row:
        session.delete(row)
        session.commit()
    return {"ok": True}
