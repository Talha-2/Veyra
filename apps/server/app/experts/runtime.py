"""Expert runtime — run records, tool building, and the engine dispatch.

Since the architecture pivot (docs/architecture-pivot.md, D2) every run drives
the unified LangGraph deep-agent harness (experts/harness.py) — the same
engine as the studio builder copilot. This module keeps the run bookkeeping
(create/execute/finish), the tool construction shared by both engines
(_build_tools: KB + Composio + custom actions), and the legacy hand-rolled
loop as a fallback for pre-flight infrastructure failures only
(UNIFIED_HARNESS=0 forces it).

Reasoning level bounds depth and temperature on both engines. The model comes
from the platform's one resolver (app/llm.py: studio config → env → default).
"""

from __future__ import annotations

import json
import logging

import anyio
from openai import AsyncOpenAI
from sqlmodel import Session

from ..config import settings
from ..db import new_id, now
from ..integrations import composio_service as cs
from ..integrations.actions import action_tool_schema, execute_action
from ..integrations.models import CustomAction
from ..rag import store
from .models import Expert, ExpertRun

logger = logging.getLogger("experts.runtime")

REASONING = {
    "fast": {"rounds": 4, "temperature": 0.3},
    "balanced": {"rounds": 8, "temperature": 0.4},
    "deep": {"rounds": 16, "temperature": 0.5},
}

KB_TOOL = {
    "type": "function",
    "function": {
        "name": "search_knowledge_base",
        "description": "Search the workspace knowledge base for facts, policies, and context. Use before answering factual questions.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "what to look up"}},
            "required": ["query"],
        },
    },
}


def _llm() -> tuple[AsyncOpenAI, str]:
    # one resolver for the whole platform (studio config → env → default)
    from .. import llm as _resolver

    return _resolver.client(), _resolver.model()


def _clip(obj, n: int = 6000) -> str:
    s = obj if isinstance(obj, str) else json.dumps(obj, default=str)
    return s[:n]


def _build_tools(session: Session, expert: Expert):
    """Return (openai_tool_schemas, executors) for the expert's allowed tools."""
    tools: list[dict] = []
    executors: dict = {}

    async def _kb(args):
        hits = await anyio.to_thread.run_sync(lambda: store.search(args.get("query", ""), top_k=5))
        return "\n---\n".join(f"[{h['doc_name']}] {h['text']}" for h in hits) or "No matches."

    for t in expert.allowed_tools:
        kind, ref = t.get("kind"), t.get("ref")
        if kind == "kb":
            tools.append(KB_TOOL)
            executors["search_knowledge_base"] = _kb

        elif kind == "composio" and cs.is_configured():
            for schema in cs.get_openai_tools([ref]):
                fn = schema.get("function", schema)
                name = fn.get("name")
                if not name:
                    continue
                tools.append({"type": "function", "function": {
                    "name": name, "description": fn.get("description", ""),
                    "parameters": fn.get("parameters", {"type": "object", "properties": {}}),
                }})

                def _make(slug=name):
                    async def run(args):
                        res = await anyio.to_thread.run_sync(lambda: cs.execute(slug, args))
                        return res.get("data") if res.get("successful") else {"error": res.get("error")}
                    return run

                executors[name] = _make()

        elif kind == "action":
            action = session.get(CustomAction, ref)
            if action is None:
                continue
            schema = action_tool_schema(action)
            tools.append({"type": "function", "function": schema})

            def _make_action(a=action):
                async def run(args):
                    return await execute_action(a, args)
                return run

            executors[schema["name"]] = _make_action()

    return tools, executors


def _task_message(expert: Expert, input_text: str) -> str:
    parts = []
    if expert.goal:
        parts.append(f"Your task:\n{expert.goal}")
    if input_text:
        parts.append(f"Trigger input:\n{input_text}")
    if not parts:
        parts.append("Begin.")
    parts.append("Use your tools as needed, then produce a clear, complete result.")
    return "\n\n".join(parts)


def create_run(session: Session, expert: Expert, trigger: str, input_text: str = "") -> ExpertRun:
    """Create the run row synchronously so callers get an id immediately."""
    run = ExpertRun(id=new_id("run"), expert_id=expert.id, trigger=trigger, input=input_text)
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


async def execute_run(run_id: str) -> None:
    """Drive an already-created run to completion (own DB session — safe to run
    as a background task or from the scheduler)."""
    from ..db import engine
    from sqlmodel import Session as _Session

    with _Session(engine) as session:
        run = session.get(ExpertRun, run_id)
        if run is None:
            return
        expert = session.get(Expert, run.expert_id)
        if expert is None:
            run.status = "error"
            run.error = "expert not found"
            run.ended_at = now()
            session.add(run)
            session.commit()
            return
        await _drive(session, run, expert)


async def run_expert(session: Session, expert: Expert, trigger: str, input_text: str = "") -> ExpertRun:
    """Create + execute synchronously (used by the scheduler)."""
    run = create_run(session, expert, trigger, input_text)
    await _drive(session, run, expert)
    return run


async def _drive(session: Session, run: ExpertRun, expert: Expert) -> None:
    """Every Expert run goes through the shared deep-agent harness.

    A failed model or tool run is recorded as an error. Retrying through a
    second engine would duplicate side effects and make the product behave
    differently depending on which entry point woke the agent.
    """
    from . import harness

    try:
        final, steps, tokens = await harness.drive(session, run, expert)
        run.result = final
        run.status = "done"
        run.tokens += tokens
        _finish(session, run, expert, steps)
    except Exception as exc:  # the model was engaged or the graph failed
        logger.exception("deep-agent run failed: %s", run.id)
        run.status = "error"
        run.error = str(exc)[:1000]
        _finish(session, run, expert, [{"type": "error", "text": run.error}])
    return run


async def _drive_legacy(session: Session, run: ExpertRun, expert: Expert) -> None:
    input_text = run.input
    steps: list[dict] = []
    cfg = REASONING.get(expert.reasoning, REASONING["balanced"])
    try:
        client, model = _llm()
        tools, executors = _build_tools(session, expert)
        messages = [
            {"role": "system", "content": expert.system_prompt or "You are a helpful expert agent."},
            {"role": "user", "content": _task_message(expert, input_text)},
        ]

        final = ""
        for _ in range(cfg["rounds"]):
            resp = await client.chat.completions.create(
                model=model, messages=messages, temperature=cfg["temperature"],
                tools=tools or None,
            )
            msg = resp.choices[0].message
            if getattr(resp, "usage", None):
                run.tokens += resp.usage.total_tokens or 0

            if not msg.tool_calls:
                final = msg.content or ""
                steps.append({"type": "final", "text": final})
                break

            messages.append({
                "role": "assistant",
                "content": msg.content or None,
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in msg.tool_calls
                ],
            })
            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                steps.append({"type": "tool_call", "name": name, "arguments": args})
                fn = executors.get(name)
                result = await fn(args) if fn else {"error": f"unknown tool {name}"}
                steps.append({"type": "tool_result", "name": name, "result": _clip(result, 2000)})
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": _clip(result, 12000)})
        else:
            final = final or "Reached the reasoning-step limit before finishing."

        run.result = final
        run.status = "done"
    except Exception as exc:
        run.status = "error"
        run.error = str(exc)[:1000]
        steps.append({"type": "error", "text": run.error})

    _finish(session, run, expert, steps)
    return run


def _finish(session: Session, run: ExpertRun, expert: Expert, steps: list[dict]) -> None:
    """Shared bookkeeping for both engines: persist the trace, stamp the times,
    and put the run's lifecycle on the event bus (webhooks only — run.* events
    never wake agents)."""
    run.steps_json = json.dumps(steps, default=str)
    run.ended_at = now()
    expert.last_run_at = now()
    session.add(run)
    session.add(expert)
    session.commit()

    try:
        from .. import events

        events.publish(
            "run.completed" if run.status == "done" else "run.failed",
            {"object": "run", "id": run.id, "agent_id": expert.id, "status": run.status,
             "result": (run.result or "")[:2000], "error": run.error},
        )
    except Exception:
        pass
