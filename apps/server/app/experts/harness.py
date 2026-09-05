"""The unified agent harness: every Expert run drives a LangGraph deep agent.

This is decision D2 of the architecture pivot (docs/architecture-pivot.md):
one execution engine for all agents. The declarative record stays the Expert
(prompt + description + goal + tools + triggers); this module compiles it
into a `deepagents` graph per run — the same engine the studio builder
copilot uses — instead of the old hand-rolled tool loop.

What that buys every triggered run, immediately:
  - planning (write_todos) and a virtual filesystem for long tasks,
  - the platform's one model resolver (studio config → env → default),
  - durable state on Postgres when DATABASE_URL is set (thread per run —
    the groundwork for resumable conversations in the chat phase),
  - the same tool set as before: the Expert's allowed tools are wrapped as
    LangChain tools around the exact executors the legacy loop used.

The run record contract is unchanged: steps land in the same
{tool_call | tool_result | final} shape, so Executions renders both engines
identically. On any *infrastructure* failure before the model is engaged
(missing dependency, checkpointer down) this raises HarnessUnavailable and
the caller falls back to the legacy loop — provider errors mid-run do not
fall back (that would double-spend), they fail the run like they always did.
"""

from __future__ import annotations

import json
import logging
import os

from sqlmodel import Session

from .models import Expert, ExpertRun

logger = logging.getLogger("experts.harness")

# reasoning depth → LangGraph recursion budget (each agent step is ~2 frames)
RECURSION = {"fast": 25, "balanced": 50, "deep": 100}
TEMPERATURE = {"fast": 0.3, "balanced": 0.4, "deep": 0.5}


class HarnessUnavailable(RuntimeError):
    """Raised only before the model is engaged; tells the caller to fall back."""


# ── checkpointer (process-lifetime) ──────────────────────────────────────────
_saver = None
_saver_failed = False


async def _checkpointer():
    """Postgres-durable when DATABASE_URL is set, in-memory otherwise. The
    async saver is created once and held for the process lifetime."""
    global _saver, _saver_failed
    if _saver is not None:
        return _saver
    url = os.getenv("DATABASE_URL", "").strip()
    if url and not _saver_failed:
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

            ctx = AsyncPostgresSaver.from_conn_string(url)
            saver = await ctx.__aenter__()  # held until process exit, deliberately
            await saver.setup()
            _saver = saver
            logger.info("harness checkpointer: postgres")
            return _saver
        except Exception:
            _saver_failed = True
            logger.warning("postgres checkpointer unavailable, using memory", exc_info=True)
    from langgraph.checkpoint.memory import MemorySaver

    _saver = MemorySaver()
    return _saver


# ── tool bridge ──────────────────────────────────────────────────────────────
def _langchain_tools(session: Session, expert: Expert) -> list:
    """The Expert's allowed tools as LangChain tools, wrapped around the exact
    executors the legacy loop used (KB search, Composio, custom actions)."""
    from langchain_core.tools import StructuredTool

    from .runtime import _build_tools, _clip

    schemas, executors = _build_tools(session, expert)
    tools = []
    for schema in schemas:
        fn = schema.get("function", schema)
        name = fn.get("name")
        executor = executors.get(name)
        if not name or executor is None:
            continue

        def _make(run=executor):
            async def call(**kwargs):
                result = await run(kwargs)
                return _clip(result, 12000)

            return call

        tools.append(StructuredTool(
            name=name,
            description=fn.get("description", ""),
            coroutine=_make(),
            args_schema=fn.get("parameters") or {"type": "object", "properties": {}},
        ))
    return tools


# ── agent factory ────────────────────────────────────────────────────────────
async def build_agent(session: Session, expert: Expert, prompt_suffix: str = ""):
    """Compile one declarative Expert into the platform's deep-agent runtime.

    All non-realtime entry points use this factory. ``prompt_suffix`` is for a
    channel contract such as website chat; the Expert's persisted instructions
    remain the source of truth.
    """
    from deepagents import create_deep_agent

    from .. import llm

    model = llm.langchain_model(temperature=TEMPERATURE.get(expert.reasoning, 0.4))
    tools = _langchain_tools(session, expert)
    checkpointer = await _checkpointer()
    system_prompt = expert.system_prompt or "You are a capable, careful agent."
    if prompt_suffix:
        system_prompt = f"{system_prompt}\n\n{prompt_suffix.strip()}"
    return create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        checkpointer=checkpointer,
    )


# ── the drive ────────────────────────────────────────────────────────────────
async def drive(session: Session, run: ExpertRun, expert: Expert) -> tuple[str, list[dict], int]:
    """Execute an Expert run on the shared deep-agent harness.

    Returns (final_text, steps, tokens). Raises HarnessUnavailable only for
    pre-flight infrastructure problems; anything after the model is engaged
    propagates as a normal run failure.
    """
    from .runtime import _task_message

    try:
        agent = await build_agent(session, expert)
    except HarnessUnavailable:
        raise
    except Exception as exc:  # anything wrong with the graph build → fall back
        raise HarnessUnavailable(str(exc)) from exc

    config = {
        "configurable": {"thread_id": run.id},
        "recursion_limit": RECURSION.get(expert.reasoning, 50),
    }
    task = _task_message(expert, run.input)

    steps: list[dict] = []
    tokens = 0
    final = ""
    seen_tool_calls: set[str] = set()

    async for chunk in agent.astream(
        {"messages": [{"role": "user", "content": task}]},
        config=config,
        stream_mode="updates",
    ):
        for node_update in (chunk or {}).values():
            for msg in (node_update or {}).get("messages", []) or []:
                mtype = getattr(msg, "type", "")
                if mtype == "ai":
                    usage = getattr(msg, "usage_metadata", None) or {}
                    tokens += int(usage.get("total_tokens") or 0)
                    for tc in getattr(msg, "tool_calls", None) or []:
                        tc_id = tc.get("id") or f"{tc.get('name')}:{len(steps)}"
                        if tc_id in seen_tool_calls:
                            continue
                        seen_tool_calls.add(tc_id)
                        steps.append({"type": "tool_call", "name": tc.get("name"), "arguments": tc.get("args") or {}})
                    if msg.content and not (getattr(msg, "tool_calls", None) or []):
                        final = msg.content if isinstance(msg.content, str) else json.dumps(msg.content)
                elif mtype == "tool":
                    content = msg.content if isinstance(msg.content, str) else json.dumps(msg.content, default=str)
                    steps.append({"type": "tool_result", "name": getattr(msg, "name", ""), "result": content[:2000]})

    steps.append({"type": "final", "text": final})
    return final, steps, tokens
