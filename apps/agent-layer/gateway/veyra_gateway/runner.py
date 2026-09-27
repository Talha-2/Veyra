"""Run the harness without a call: Ask threads and automations.

Both are one ``Worker`` delegation with a text prompt. The differences from a
call are what is absent: no delegation rows (there is no call), no talker (the
reply goes straight back to the person or the run), and for an automation, a
tool set restricted to what the automation was allowed in Studio.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

from app_sdk import AppSdk, AppSdkError
from app_sdk.models import AutomationJob, TenantContext, ToolSpec
from veyra_harness.actions import BUILTINS, INTERNAL_SLUGS, composio_handler, http_handler, unconnected_handler
from veyra_harness.executor import ActionExecutor, ExecutionScope
from veyra_harness.llm import ChatModel, OpenAIChatModel
from veyra_harness.prompt import fill, load, text_instructions, worker_instructions
from veyra_harness.state import RunState
from veyra_harness.tools import Tool
from veyra_harness.worker import Worker

logger = logging.getLogger("veyra.gateway.runner")

ModelFactory = Callable[[str | None, str | None], ChatModel]


def default_model(reasoning: str | None = None, ref: str | None = None) -> ChatModel:
    """The worker model for a text run: Studio's choice (``ref``), else the layer default."""
    from veyra_harness.models import DEFAULT_WORKER

    effort = {"fast": "low", "balanced": "medium", "deep": "high"}.get(reasoning or "", None)
    return OpenAIChatModel.from_ref(ref, default=DEFAULT_WORKER, temperature=0.2, max_tokens=4000, reasoning_effort=effort)


def tools_from_specs(specs: list[ToolSpec], *, can_search_knowledge: bool) -> list[Tool]:
    tools: list[Tool] = []
    for spec in specs:
        if spec.kind == "internal":
            builtin = BUILTINS.get(INTERNAL_SLUGS.get(spec.name, spec.name))
            if builtin is None:
                continue
            tool = Tool.from_spec(spec, builtin.handler)
            tool.plumbing = builtin.plumbing
            tools.append(tool)
        elif spec.kind == "http":
            tools.append(Tool.from_spec(spec, http_handler(spec)))
        elif spec.kind == "composio":
            tools.append(Tool.from_spec(spec, composio_handler(spec)))
        else:
            tools.append(Tool.from_spec(spec, unconnected_handler(spec)))
    names = {t.name for t in tools}
    if "read_skill" not in names:
        tools.append(BUILTINS["read_skill"])
    if can_search_knowledge and "search_knowledge" not in names:
        tools.append(BUILTINS["search_knowledge"])
    return tools


class TextRunner:
    def __init__(self, sdk: AppSdk, *, model_factory: ModelFactory = default_model):
        self._sdk = sdk
        self._model_factory = model_factory
        # One private history per Ask thread, so a follow-up continues the
        # conversation. Keyed by (org, thread). Lost on restart, by design:
        # the readable history lives in the app.
        self._threads: dict[tuple[int, int], Worker] = {}

    async def stream_thread(self, organization_id: int, thread_id: int, message: str, history: list[dict[str, Any]] | None = None):
        """One Ask turn as a stream of events: status, delta, tool, then done or error.

        The app persists the turn from these events; nothing is written back
        through the contract, so a stream that the person stops leaves no
        half-written reply on the thread.
        """
        app = self._sdk.for_organization(organization_id)
        key = (organization_id, thread_id)
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        yield {"type": "status", "text": "Thinking"}
        worker = self._threads.get(key)
        try:
            if worker is None:
                context = await app.context()
                expert = next(iter(context.experts_for("text")), None) or (context.workers[0] if context.workers else None)
                from veyra_harness.actions import tools_for_expert

                tools = tools_for_expert(expert, context) if expert else list(BUILTINS.values())
                model = self._model_factory(expert.reasoning_effort if expert else None, (expert.model if expert and expert.model else None) or context.agent.advanced.get("worker_model"))
                worker = Worker(model=model, instructions=text_instructions(context, expert), tools=tools, executor=ActionExecutor(app, scope=ExecutionScope(expert_slug=expert.slug if expert else None)), state=RunState(sdk=app, context=context))
                worker.seed_history(history or [])
                self._threads[key] = worker
        except AppSdkError as e:
            yield {"type": "error", "message": f"Could not load the organization's agent configuration: {e}"}
            return

        async def emit(event: dict[str, Any]) -> None:
            await queue.put(event)

        async def run() -> None:
            try:
                worker.claim()
                outcome = await worker.delegate(message, emit=emit)
                if outcome.failed or not outcome.reply:
                    await queue.put({"type": "error", "message": worker.last_error or "The agent produced no reply."})
                else:
                    await queue.put({"type": "done", "content": outcome.reply, "tokens": worker.tokens, "model": getattr(worker._model, "name", None)})
            except Exception as e:  # noqa: BLE001 — reported to the person, never swallowed
                logger.exception("runner.stream_failed thread=%s", thread_id)
                await queue.put({"type": "error", "message": f"{type(e).__name__}: {e}"[:300]})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        finally:
            if not task.done():
                # The person pressed stop: the connection closed mid-turn.
                task.cancel()
                self._threads.pop(key, None)

    async def run_thread(self, organization_id: int, thread_id: int, message: str, external_id: str | None) -> str:
        app = self._sdk.for_organization(organization_id)
        key = (organization_id, thread_id)
        worker = self._threads.get(key)
        if worker is None:
            context = await app.context()
            expert = next(iter(context.experts_for("text")), None) or (context.workers[0] if context.workers else None)
            state = RunState(sdk=app, context=context)
            from veyra_harness.actions import tools_for_expert

            tools = tools_for_expert(expert, context) if expert else list(BUILTINS.values())
            worker = Worker(model=self._model_factory(expert.reasoning_effort if expert else None, (expert.model if expert and expert.model else None) or context.agent.advanced.get("worker_model")), instructions=text_instructions(context, expert), tools=tools, executor=ActionExecutor(app, scope=ExecutionScope(expert_slug=expert.slug if expert else None)), state=state)
            self._threads[key] = worker

        worker.claim()
        outcome = await worker.delegate(message)
        reply = outcome.reply or "I could not complete that. Nothing was changed."
        try:
            await app.reply_to_thread(thread_id, reply, external_id=external_id or f"thr_{organization_id}_{thread_id}")
        except AppSdkError as e:
            logger.error("runner.thread_reply_failed thread=%s error=%s", thread_id, e)
        return reply

    async def run_automation(self, organization_id: int, job: AutomationJob) -> str:
        app = self._sdk.for_organization(organization_id)
        started = time.perf_counter()
        try:
            context = await app.context()
            spec = job.automation
            instructions = fill(load("automation"), base=text_instructions(context, None), name=spec.name, system_prompt=spec.system_prompt or "", goal=spec.goal or job.input or "")
            state = RunState(sdk=app, context=context)
            worker = Worker(model=self._model_factory(spec.reasoning, context.agent.advanced.get("worker_model")), instructions=instructions, tools=tools_from_specs(spec.tools, can_search_knowledge=spec.can_search_knowledge), executor=ActionExecutor(app, scope=ExecutionScope(expert_slug=f"automation:{spec.id}")), state=state)
            worker.claim()
            outcome = await worker.delegate(job.input or spec.goal or "Run the automation.")
            steps = [{"type": "tool_call", "name": m["function"]["name"]} for h in worker.history if h.get("role") == "assistant" for m in (h.get("tool_calls") or [])]
            steps.append({"type": "final"})
            duration_ms = int((time.perf_counter() - started) * 1000)
            if outcome.failed:
                await app.finish_automation_run(job.id, status="error", error=worker.last_error or "The run produced no result.", steps=steps, tokens=worker.tokens, duration_ms=duration_ms)
                return ""
            await app.finish_automation_run(job.id, status="done", result=outcome.reply, steps=steps, tokens=worker.tokens, duration_ms=duration_ms)
            return outcome.reply
        except Exception as e:  # noqa: BLE001 — a failed run is reported, never lost
            logger.exception("runner.automation_failed run=%s", job.id)
            try:
                await app.finish_automation_run(job.id, status="error", error=f"{type(e).__name__}: {e}"[:400], duration_ms=int((time.perf_counter() - started) * 1000))
            except AppSdkError as report:
                logger.error("runner.automation_report_failed run=%s error=%s", job.id, report)
            return ""

    async def test_skill(self, organization_id: int, slug: str, scenario: str) -> dict[str, Any]:
        """Run a skill against a written scenario: the Studio 'try it' button. Writes are simulated."""
        app = self._sdk.for_organization(organization_id)
        context = await app.context()
        expert = next((e for e in context.workers if any(s.slug == slug for s in e.skills)), context.workers[0] if context.workers else None)
        from veyra_harness.actions import tools_for_expert

        state = RunState(sdk=app, context=context, dry_run=True)
        tools = tools_for_expert(expert, context) if expert else list(BUILTINS.values())
        # The *worker* prompt, not the text one: the author is testing what
        # the front desk would be handed on a call, which is private guidance
        # — not a line spoken to the caller. The first live try came back as
        # "I've successfully moved your appointment… feel free to ask!".
        instructions = (worker_instructions(context, expert, None) if expert else text_instructions(context, None)) + f"\n\nThis is a dry run of the skill '{slug}'. Read it first. Writes are simulated."
        worker = Worker(model=self._model_factory("balanced", (expert.model if expert and expert.model else None) or context.agent.advanced.get("worker_model")), instructions=instructions, tools=tools, executor=ActionExecutor(app, scope=ExecutionScope(expert_slug=expert.slug if expert else None, dry_run=True)), state=state)
        worker.claim()
        outcome = await worker.delegate(f"Human: {scenario}")
        steps = [m["function"]["name"] for h in worker.history if h.get("role") == "assistant" for m in (h.get("tool_calls") or [])]
        return {"reply": outcome.reply, "failed": outcome.failed, "steps": steps, "tokens": worker.tokens}


def _context_for(context: TenantContext) -> TenantContext:  # kept for symmetry with future caching
    return context
