"""Run the harness without a call: Ask threads, live chat, automations, skill tests.

Every one of them is one ``Worker`` from ``assembly.build_worker`` — the same
builder a voice call uses — so an organization's experts, skills, step gates,
tools and models behave the same on every surface. What differs here is what
is absent: no delegation rows (there is no call), no talker (the reply goes
straight back to the person or the run), and for an automation, a tool set
restricted to what the automation was allowed in Studio.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

from app_sdk import AppSdk, AppSdkError
from app_sdk.models import AutomationJob, TenantContext, ToolSpec
from veyra_harness.assembly import build_worker, tool_from_spec, tools_from_specs  # noqa: F401 — tools_from_specs re-exported
from veyra_harness.executor import ActionExecutor
from veyra_harness.llm import ChatModel, OpenAIChatModel, reasoning_effort
from veyra_harness.state import RunState
from veyra_harness.worker import Worker

logger = logging.getLogger("veyra.gateway.runner")

ModelFactory = Callable[[str | None, str | None], ChatModel]


def default_model(reasoning: str | None = None, ref: str | None = None) -> ChatModel:
    """The worker model for a text run: Studio's choice (``ref``), else the layer default.

    ``reasoning`` is either vocabulary Studio uses — an expert's low / medium
    / high or an automation's fast / balanced / deep. It used to accept only
    the second, so every expert's setting was dropped in Ask and chat.
    """
    from veyra_harness.models import DEFAULT_WORKER

    return OpenAIChatModel.from_ref(ref, default=DEFAULT_WORKER, temperature=0.2, max_tokens=4000, reasoning_effort=reasoning_effort(reasoning))


class TextRunner:
    def __init__(self, sdk: AppSdk, *, model_factory: ModelFactory = default_model):
        self._sdk = sdk
        self._model_factory = model_factory
        # One private history per Ask thread or chat conversation, so a
        # follow-up continues where it left off (and as the expert it last
        # switched to). Keyed by (org, thread); chats use a negative id. Lost
        # on restart, by design: the readable history lives in the app.
        self._threads: dict[tuple[int, int], Worker] = {}

    async def _stream(self, worker: Worker, message: str, label: str, on_cancel: Callable[[], None]):
        """Run one delegation and yield its events: tool, delta, then done or error."""
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        async def emit(event: dict[str, Any]) -> None:
            await queue.put(event)

        async def run() -> None:
            try:
                worker.claim()
                outcome = await worker.delegate(message, emit=emit)
                if outcome.failed or not outcome.reply:
                    await queue.put({"type": "error", "message": worker.last_error or "The agent produced no reply."})
                else:
                    done: dict[str, Any] = {"type": "done", "content": outcome.reply, "tokens": worker.tokens, "model": worker.model_name}
                    if len(worker.experts) > 1:
                        done["expert"] = worker.expert
                    await queue.put(done)
            except Exception as e:  # noqa: BLE001 — reported to the person, never swallowed
                logger.exception("runner.stream_failed %s", label)
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
                on_cancel()

    async def stream_thread(self, organization_id: int, thread_id: int, message: str, history: list[dict[str, Any]] | None = None):
        """One Ask turn as a stream of events: status, delta, tool, then done or error.

        The app persists the turn from these events; nothing is written back
        through the contract, so a stream that the person stops leaves no
        half-written reply on the thread.
        """
        app = self._sdk.for_organization(organization_id)
        key = (organization_id, thread_id)

        yield {"type": "status", "text": "Thinking"}
        worker = self._threads.get(key)
        if worker is None:
            try:
                context = await app.context()
            except AppSdkError as e:
                yield {"type": "error", "message": f"Could not load the organization's agent configuration: {e}"}
                return
            worker = build_worker(surface="ask", context=context, sdk=app, state=RunState(sdk=app, context=context), model_factory=self._model_factory)
            worker.seed_history(history or [])
            self._threads[key] = worker

        async for event in self._stream(worker, message, f"thread={thread_id}", lambda: self._threads.pop(key, None)):
            yield event

    async def stream_chat(self, organization_id: int, conversation_id: int, message: str, history: list[dict[str, Any]], context: dict[str, Any]):
        """One live-chat turn with the customer-facing agent, as a stream of events.

        The same worker a phone call uses (the worker experts, their skills,
        tools, knowledge search and memory), with the chat prompt in place of
        the talker: in text there is no latency budget that needs a separate
        voice, so one agent speaks and acts. One worker per conversation, kept
        between turns; a restarted gateway rebuilds it from `history`.
        """
        from app_sdk.models import CallerInfo

        app = self._sdk.for_organization(organization_id)
        key = (organization_id, -conversation_id)  # negative: never collides with an Ask thread id

        yield {"type": "status", "text": "Thinking"}
        worker = self._threads.get(key)
        if worker is None:
            try:
                tenant = TenantContext.model_validate({k: v for k, v in context.items() if k not in ("caller", "conversation")})
                caller = CallerInfo.model_validate(context["caller"]) if context.get("caller") else None
            except Exception as e:  # noqa: BLE001 — a malformed bundle is the app's bug; say so
                yield {"type": "error", "message": f"The conversation context could not be read: {e}"[:300]}
                return
            state = RunState(sdk=app, context=tenant, contact=caller.contact if caller else None)
            worker = build_worker(surface="chat", context=tenant, sdk=app, state=state, model_factory=self._model_factory, caller=caller)
            worker.seed_history(history)
            self._threads[key] = worker

        async for event in self._stream(worker, message, f"conversation={conversation_id}", lambda: self._threads.pop(key, None)):
            yield event

    async def run_thread(self, organization_id: int, thread_id: int, message: str, external_id: str | None) -> str:
        app = self._sdk.for_organization(organization_id)
        key = (organization_id, thread_id)
        worker = self._threads.get(key)
        if worker is None:
            context = await app.context()
            worker = build_worker(surface="ask", context=context, sdk=app, state=RunState(sdk=app, context=context), model_factory=self._model_factory)
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
            spec = job.automation if job.automation.goal else job.automation.model_copy(update={"goal": job.input or ""})
            worker = build_worker(surface="automation", context=context, sdk=app, state=RunState(sdk=app, context=context), model_factory=self._model_factory, automation=spec)
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
        state = RunState(sdk=app, context=context, dry_run=True)
        worker = build_worker(surface="skill_test", context=context, sdk=app, state=state, model_factory=self._model_factory, skill_slug=slug, dry_run=True)
        worker.claim()
        outcome = await worker.delegate(f"Human: {scenario}")
        steps = [m["function"]["name"] for h in worker.history if h.get("role") == "assistant" for m in (h.get("tool_calls") or [])]
        return {"reply": outcome.reply, "failed": outcome.failed, "steps": steps, "tokens": worker.tokens, "expert": worker.expert}

    async def execute_tool(self, organization_id: int, spec: ToolSpec, arguments: dict[str, Any]) -> dict[str, Any]:
        """Run one action a person approved in Studio, once, and say what happened.

        The app holds the approval request (the tool-call row) and closes it
        with this answer, so nothing is recorded through the contract here.
        """
        tool = tool_from_spec(spec)
        if tool is None:
            return {"ok": False, "status": "failed", "error": f"{spec.name} is not an action this agent layer can run.", "output": "", "duration_ms": 0}
        app = self._sdk.for_organization(organization_id)
        context = await app.context()
        result, duration_ms = await ActionExecutor(app).run_approved(tool, arguments, RunState(sdk=app, context=context))
        status = "succeeded" if result.ok else ("timeout" if result.error == "timeout" else "failed")
        data = result.data if isinstance(result.data, (dict, list)) or result.data is None else {"value": str(result.data)}
        return {"ok": result.ok, "status": status, "output": result.output[:4000], "result": data, "error": result.error, "duration_ms": duration_ms}
