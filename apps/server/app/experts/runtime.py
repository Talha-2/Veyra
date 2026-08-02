"""Expert runtime — the agentic executor.

A controlled plan→act→observe loop (LangGraph-style state machine, implemented
directly so the platform owns it end-to-end): the LLM plans and calls tools,
the runtime executes them against the Integrations layer (Composio apps, custom
HTTP actions, knowledge base), feeds results back, and iterates to a final
result. Every step is recorded so runs are fully inspectable.

Reasoning level bounds the loop depth and temperature. The LLM is provider-
agnostic (LLM_BASE_URL/LLM_API_KEY/LLM_MODEL env override → any OpenAI-compatible
model, e.g. Groq; falls back to xAI).
"""

from __future__ import annotations

import json
import os

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
    base_url = os.getenv("LLM_BASE_URL") or "https://api.x.ai/v1"
    api_key = os.getenv("LLM_API_KEY") or settings.xai_api_key
    model = os.getenv("LLM_MODEL") or settings.xai_agent_model
    return AsyncOpenAI(base_url=base_url, api_key=api_key), model


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

    run.steps_json = json.dumps(steps, default=str)
    run.ended_at = now()
    expert.last_run_at = now()
    session.add(run)
    session.add(expert)
    session.commit()

    # fire an outbound webhook for the run lifecycle (best-effort)
    try:
        from ..publicapi import webhooks

        webhooks.emit(
            "run.completed" if run.status == "done" else "run.failed",
            {"object": "run", "id": run.id, "agent_id": expert.id, "status": run.status,
             "result": (run.result or "")[:2000], "error": run.error},
        )
    except Exception:
        pass
    return run
