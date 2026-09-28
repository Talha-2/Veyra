"""The worker: does the work, never speaks, never asks the caller.

Ported from Z360's Voice V2 ``front_desk/worker.py`` onto Veyra's own seams:
a ``ChatModel`` instead of a LiveKit LLM, ``Tool`` objects whose reliability
flags come from Studio instead of a name heuristic, and an ``ActionExecutor``
that records every call through the contract.

Three things here are load-bearing, unchanged from the original:

**It keeps its history for the whole call.** Each delegation appends only its
new transcript delta as another user message and carries on from the same
context — the skill it already read is still there, nothing is re-fetched,
and the unchanged prefix stays prompt-cacheable.

**It only ever sees transcript deltas**, never the whole raw transcript. The
talker owns the conversation; the worker owns the work.

**It returns private guidance, never caller-facing speech.**

And two Veyra additions:

**Every delegation is a row.** Opened through the contract before the loop
starts, closed with the reply and the status. The app computes
``completed_durable_write`` from the audit trail and hands it back; the talker
confirms a booking only when that is true.

**Write-in-flight is a fact, not a guess.** The executor counts durable writes
by their Studio flag; ``hangup_call`` asks it.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from app_sdk.errors import AppSdkError, Conflict

from .executor import ActionExecutor, ExecutionScope
from .llm import ChatModel, Completion, ToolCall, tool_call_message, tool_result_message
from .tools import Tool, ToolResult
from .tracing import span

logger = logging.getLogger("veyra.harness.worker")

# Ceiling on tool-calling rounds per delegation. A real booking skill needs
# fifteen distinct actions; with typed tools that is fifteen calls, not thirty.
MAX_STEPS = 40

# Wall-clock ceiling on one delegation. Steps alone are not a bound: a hung
# action holds the turn open forever and the talker has no exit. A definite
# failure it can tell the caller about beats silence.
MAX_SECONDS = 150.0

# An empty assistant message has no caller meaning; one bounded nudge before failing.
_EMPTY_RESPONSE_NUDGE = (
    "Your response was empty. Continue with any required tools, or give the front desk one concise update: "
    "the next caller detail needed, verified choices, or the confirmed outcome."
)
MAX_EMPTY_RESPONSE_NUDGES = 1

FinalizationOutcome = Literal["no_action_needed", "action_completed", "ticket_created_or_updated", "failed"]

Emit = Callable[[dict[str, Any]], Awaitable[None]]

# How a tool call reads in a transcript: an action someone took, not a function name.
_TOOL_LABELS = {
    "read_skill": ("Reading skill", "Read skill"),
    "search_knowledge": ("Searching knowledge", "Searched knowledge"),
    "lookup_contact": ("Looking up the contact", "Looked up the contact"),
    "find_contact": ("Looking up the contact", "Looked up the contact"),
    "register_contact": ("Creating the contact", "Created the contact"),
    "update_contact": ("Updating the contact", "Updated the contact"),
    "save_ticket": ("Raising a ticket", "Raised a ticket"),
    "create_ticket": ("Raising a ticket", "Raised a ticket"),
    "send_message": ("Queuing a message", "Queued a message"),
    "remember": ("Saving to memory", "Saved to memory"),
    "recent_calls": ("Reading recent calls", "Read recent calls"),
    "recent_tickets": ("Reading recent tickets", "Read recent tickets"),
}


def tool_label(name: str, done: bool) -> str:
    known = _TOOL_LABELS.get(name)
    if known:
        return known[1] if done else known[0]
    words = name.replace("-", " ").replace("_", " ").strip()
    return (f"Ran {words}" if done else f"Running {words}") if words else "Tool"


def tool_detail(name: str, args: dict[str, Any]) -> str | None:
    """The one argument worth showing next to a step: the query, the skill, the subject."""
    for key in ("query", "slug", "subject", "name", "since", "phone", "email"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:80]
    return None


@dataclass(frozen=True, slots=True)
class FinalizationResult:
    outcome: FinalizationOutcome
    reply: str
    transcript_had_new_turns: bool
    action_names: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class DelegationOutcome:
    """What one delegation produced, plus what the app says the talker may claim."""

    reply: str
    failed: bool
    completed_durable_write: bool
    delegation_id: int | None
    duration_ms: int


class Worker:
    """Does the caller's work. Reports facts when it stops, or when asked."""

    def __init__(self, *, model: ChatModel, instructions: str, tools: list[Tool], executor: ActionExecutor, state: Any):
        self._model = model
        self._tools = {t.name: t for t in tools}
        self._schemas = [t.schema() for t in tools]
        self._executor = executor
        self._state = state
        self._history: list[dict[str, Any]] = [{"role": "system", "content": instructions}]

        self._status = "idle"  # idle | working | waiting | failed
        self._last_digest: tuple[str, int] = ("", -1)
        self._unchanged = 0
        self._reported_at = 0.0
        self._driver: asyncio.Task[None] | None = None
        self._history_lock = asyncio.Lock()
        self._finalization_task: asyncio.Task[FinalizationResult] | None = None
        # Tool calls made since the last transcript delta, for the digest.
        self._steps_since_delta: list[str] = []
        self._tokens = 0
        # Whether each recorded tool call succeeded, keyed by call id. Kept
        # beside the history rather than in it: an extra key on a message is
        # a 400 from every provider.
        self._tool_ok: dict[str, bool] = {}
        # Why the last delegation failed, for hosts that report it (the
        # automation run's error column). Never spoken.
        self.last_error: str | None = None
        self._emit: Emit | None = None
        # A standing listener for tool steps only (never text deltas): a voice
        # host publishes them to the browser so the person can see the agent
        # look things up and act while it talks.
        self.observer: Emit | None = None

    # ── talker-facing surface ─────────────────────────────────────────────

    @property
    def is_running(self) -> bool:
        return self._status == "working"

    @property
    def write_in_flight(self) -> bool:
        return self._executor.write_in_flight

    @property
    def tokens(self) -> int:
        return self._tokens

    def note_reported(self) -> None:
        self._reported_at = time.monotonic()

    def just_reported(self, within: float = 3.0) -> bool:
        """Whether a delegation reply reached the talker in the last *within* seconds.

        ``delegate`` is non-blocking, so it produces two results: the ack when
        it starts and the reply when it lands. A ``check_progress`` answered in
        the same breath hands the model two results and it speaks twice.
        """
        return (time.monotonic() - self._reported_at) < within

    def claim(self) -> bool:
        """Take the delegation slot, or refuse it. Synchronous, and that is the point.

        Between a tool entering and the driver task being scheduled there is a
        window where ``is_running`` still reads False. Two byte-identical
        delegations 417 ms apart both passed the guard once; this claim is the
        only thing between a second send and a second delegation, so it happens
        before the first await.
        """
        if self._status == "working":
            return False
        self._status = "working"
        return True

    def abort(self) -> None:
        if self._driver is not None:
            self._driver.cancel()
        if self._status == "working":
            self._status = "idle"

    def progress_digest(self) -> str:
        """The steps taken since the last delegation — facts, for ``check_progress``.

        No model call, so it answers instantly and cannot invent a step. Tool
        *results* are withheld (that is how record ids get read down the
        phone), plumbing is withheld (reading a skill is the worker deciding
        how to do the job), and the worker's prose between calls is withheld
        (a reasoning model thinking out loud).

        It states what has happened and stops. Telling the talker what to do
        next belongs to the prompt.
        """
        if self._status in ("idle", "waiting"):
            return "No request is running."
        if self._status == "failed":
            return "The request failed. Nothing it was asked to do was completed."

        named = [name for name in self._steps_since_delta if not (self._tools.get(name) and self._tools[name].plumbing)]
        steps = len(self._steps_since_delta)
        body = "Just started. Nothing yet." if not named else "In progress, not finished. Steps so far, latest last:\n" + "\n".join(f"- {n.replace('_', ' ')}" for n in named)

        # Counting the checks that changed nothing is what turns a stall into
        # evidence. The count includes hidden plumbing so a busy worker
        # reading skills is not declared dead.
        fingerprint = (body, steps)
        if fingerprint == self._last_digest:
            self._unchanged += 1
        else:
            self._unchanged = 0
            self._last_digest = fingerprint
        if self._unchanged >= 3:
            return f"{body}\n\nNothing has changed here across {self._unchanged + 1} checks. This request is not progressing."
        return body

    # ── running ──────────────────────────────────────────────────────────

    async def run(self, transcript: str, *, is_finalization: bool = False) -> AsyncIterator[DelegationOutcome]:
        """Work one transcript delta until a reply or a failure. Yields at most once."""
        queue: asyncio.Queue[DelegationOutcome | None] = asyncio.Queue()
        driver = asyncio.create_task(self._drive(transcript, queue, is_finalization=is_finalization))
        self._driver = driver
        try:
            while True:
                outcome = await queue.get()
                if outcome is None:
                    return
                yield outcome
        finally:
            driver.cancel()
            if self._driver is driver:
                self._driver = None
            if self._status == "working":
                self._status = "failed"

    async def delegate(self, transcript: str, *, emit: Emit | None = None) -> DelegationOutcome:
        """One delegation, one outcome.

        With ``emit``, the host also gets the turn as it happens: text deltas
        from a streaming model, and a ``tool`` event when each call starts and
        ends. That is how Ask streams; a call has no use for it (the talker
        speaks from the whole reply).
        """
        self._emit = emit
        try:
            async for outcome in self.run(transcript):
                return outcome
            return DelegationOutcome(reply="", failed=True, completed_durable_write=False, delegation_id=None, duration_ms=0)
        finally:
            self._emit = None

    def seed_history(self, messages: list[dict[str, Any]]) -> None:
        """Rebuild a conversation this process has not seen: prior user and assistant turns, in order.

        Only on a fresh worker. Tool plumbing from earlier turns is not
        replayed; the readable history is enough for the model to continue.
        """
        if len(self._history) > 1:
            return
        for m in messages:
            role, content = m.get("role"), (m.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                self._history.append({"role": role, "content": content})

    async def _say(self, event: dict[str, Any]) -> None:
        listeners = [self._emit] + ([self.observer] if self.observer is not None and event.get("type") == "tool" else [])
        for listener in listeners:
            if listener is None:
                continue
            try:
                await listener(event)
            except Exception:  # noqa: BLE001 — a dead listener must not kill the work
                logger.debug("worker.emit_failed", exc_info=True)

    async def finalize(self, transcript: str, instructions: str) -> FinalizationResult:
        """The silent shutdown pass, exactly once. Later callers get the same result."""
        task = self._finalization_task
        if task is None:
            task = asyncio.create_task(self._run_finalization(transcript, instructions))
            self._finalization_task = task
        return await asyncio.shield(task)

    # ── internals ────────────────────────────────────────────────────────

    async def _drive(self, transcript: str, queue: asyncio.Queue[DelegationOutcome | None], *, is_finalization: bool) -> None:
        self._status = "working"
        started = time.perf_counter()
        delegation_id = await self._open_delegation(transcript, is_finalization)
        if delegation_id is None:
            # A Conflict: this segment was already sent. Do not run it again.
            self._status = "failed"
            await queue.put(None)
            return
        self._executor.scope.delegation_id = delegation_id
        reply = ""
        status = "completed"
        error: str | None = None
        self.last_error = None
        call = getattr(self._state, "call", None)
        try:
            async with self._history_lock:
                with span("worker.delegation", call_id=call.id if call else None, delegation_id=delegation_id, finalization=is_finalization, model=getattr(self._model, "name", None)):
                    reply = await asyncio.wait_for(self._loop(transcript), timeout=MAX_SECONDS)
            self._status = "waiting" if reply else "failed"
            if not reply:
                status, error = "failed", "empty reply"
        except asyncio.TimeoutError:
            logger.warning("worker.timed_out seconds=%s", MAX_SECONDS)
            self._status, status, error = "failed", "timeout", f"no reply within {MAX_SECONDS:.0f}s"
        except asyncio.CancelledError:
            await self._close_delegation(delegation_id, "aborted", None, "cancelled", started)
            raise
        except Exception as e:  # noqa: BLE001 — a worker fault must not kill the call
            logger.exception("worker.error")
            self._status, status, error = "failed", "failed", f"{type(e).__name__}: {e}"[:400]
        finally:
            self.last_error = error
            outcome = await self._close_delegation(delegation_id, status, reply, error, started)
            if outcome is not None and self._status != "failed":
                await queue.put(outcome)
            await queue.put(None)

    async def _open_delegation(self, transcript: str, is_finalization: bool) -> int | None:
        """The delegation row's id; 0 when this run has no call (text) and so no row; -1 when the row could not be written; None on a Conflict."""
        call = getattr(self._state, "call", None)
        if call is None:
            return 0  # text runs have no delegation rows
        try:
            record = await self._state.sdk.start_delegation(call.id, sequence=self._state.take_sequence(), transcript_delta=transcript, is_finalization=is_finalization)
            return record.id
        except Conflict as e:
            logger.error("worker.duplicate_sequence %s", e)
            return None
        except AppSdkError as e:
            # The audit row failed, the work should not: the call is live and
            # the caller is waiting. Logged loudly; the delegation runs unrecorded.
            logger.warning("worker.delegation_unrecorded error=%s", e)
            return -1

    async def _close_delegation(self, delegation_id: int | None, status: str, reply: str, error: str | None, started: float) -> DelegationOutcome | None:
        duration_ms = int((time.perf_counter() - started) * 1000)
        call = getattr(self._state, "call", None)
        failed = status != "completed" or not reply
        durable = False
        if call is not None and delegation_id and delegation_id > 0:
            try:
                closed = await self._state.sdk.finish_delegation(call.id, delegation_id, status=status, reply=reply or None, error=error, duration_ms=duration_ms)
                failed, durable = closed.failed, closed.completed_durable_write
            except AppSdkError as e:
                logger.warning("worker.delegation_close_failed error=%s", e)
        if status == "aborted":
            return None
        return DelegationOutcome(reply=reply, failed=failed, completed_durable_write=durable, delegation_id=delegation_id if delegation_id and delegation_id > 0 else None, duration_ms=duration_ms)

    async def _run_finalization(self, transcript: str, instructions: str) -> FinalizationResult:
        had_new_turns = bool(transcript.strip())
        final_turn = "\n\n".join(p for p in (instructions.strip(), "New conversation since the last worker handoff:", transcript.strip() or "(No new caller-facing turns.)") if p)
        before = len(self._history)
        try:
            async with self._history_lock:
                self._status = "working"
                reply = await asyncio.wait_for(self._loop(final_turn), timeout=MAX_SECONDS)
                names, outcome = self._finalization_outcome(before)
                self._status = "waiting"
                return FinalizationResult(outcome=outcome, reply=reply, transcript_had_new_turns=had_new_turns, action_names=names)
        except asyncio.TimeoutError:
            logger.warning("worker.finalization_timed_out")
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("worker.finalization_failed")
        self._status = "failed"
        return FinalizationResult(outcome="failed", reply="", transcript_had_new_turns=had_new_turns, action_names=())

    def _finalization_outcome(self, history_start: int) -> tuple[tuple[str, ...], FinalizationOutcome]:
        """Classify durable post-call work from recorded calls, never from prose."""
        writes: list[tuple[str, str]] = []  # (call id, tool name)
        for item in self._history[history_start:]:
            if item.get("role") != "assistant":
                continue
            for tc in item.get("tool_calls") or []:
                name = tc["function"]["name"]
                tool = self._tools.get(name)
                if tool and tool.is_durable_write:
                    writes.append((tc["id"], name))
        names = tuple(name for _, name in writes)
        if not writes:
            return names, "no_action_needed"
        successful = [name for call_id, name in writes if self._tool_ok.get(call_id)]
        if any(name in ("save_ticket", "create_ticket") for name in successful):
            return names, "ticket_created_or_updated"
        if successful:
            return names, "action_completed"
        return names, "failed"

    async def _loop(self, transcript: str) -> str:
        # Resume, don't restart: each user message is one unseen transcript delta.
        self._history.append({"role": "user", "content": transcript})
        self._steps_since_delta = []
        nudges = 0

        for _ in range(MAX_STEPS):
            if getattr(self._state, "was_voicemail", False):
                logger.info("worker.stopped_voicemail")
                return ""
            streaming = self._emit is not None and hasattr(self._model, "complete_stream")
            if streaming:
                async def on_delta(text: str) -> None:
                    await self._say({"type": "delta", "text": text})

                completion = await self._model.complete_stream(self._history, self._schemas, on_delta)  # type: ignore[attr-defined]
            else:
                completion = await self._model.complete(self._history, self._schemas)
                if self._emit is not None and completion.text and not completion.tool_calls:
                    await self._say({"type": "delta", "text": completion.text})
            self._tokens += completion.tokens

            if not completion.tool_calls:
                text = completion.text.strip()
                if text:
                    self._history.append({"role": "assistant", "content": text})
                    return text
                if nudges < MAX_EMPTY_RESPONSE_NUDGES:
                    nudges += 1
                    self._history.append({"role": "user", "content": _EMPTY_RESPONSE_NUDGE})
                    continue
                return ""

            self._history.append(tool_call_message(completion.text, completion.tool_calls))
            await self._run_calls(completion)

        logger.warning("worker.max_steps steps=%s", MAX_STEPS)
        return ""

    async def _run_calls(self, completion: Completion) -> None:
        """Execute a turn's calls: reads in parallel, writes in the order asked."""
        calls = list(completion.tool_calls)
        writes = any(self._is_write(c.name) for c in calls)
        if len(calls) > 1 and not writes:
            results = await asyncio.gather(*(self._execute(c) for c in calls))
            for call, result in zip(calls, results, strict=True):
                self._record(call, result)
            return
        for call in calls:
            if getattr(self._state, "was_voicemail", False) and self._is_write(call.name):
                self._record(call, ToolResult.failure("voicemail reached; no writes"))
                continue
            self._record(call, await self._execute(call))

    async def _execute(self, call: ToolCall) -> ToolResult:
        tool = self._tools.get(call.name)
        self._steps_since_delta.append(call.name)
        detail = tool_detail(call.name, call.arguments)
        await self._say({"type": "tool", "id": call.id, "name": call.name, "status": "running", "label": tool_label(call.name, False), "detail": detail})
        started = time.perf_counter()
        if tool is None:
            result = ToolResult.failure(f"No tool named {call.name!r}.")
        else:
            args = dict(call.arguments)
            if not tool.is_idempotent and tool.audited:
                args["_idempotency_key"] = self._executor.idempotency_key(tool, call.arguments)
            result = await self._executor.execute(tool, args, self._state)
        await self._say({
            "type": "tool", "id": call.id, "name": call.name, "status": "done" if result.ok else "error",
            "label": tool_label(call.name, True) if result.ok else f"{tool_label(call.name, False)} failed",
            "detail": detail, "summary": (result.error or result.output)[:280], "ms": int((time.perf_counter() - started) * 1000),
        })
        return result

    def _record(self, call: ToolCall, result: ToolResult) -> None:
        self._history.append(tool_result_message(call, result.output))
        self._tool_ok[call.id] = result.ok

    def _is_write(self, name: str) -> bool:
        tool = self._tools.get(name)
        # Unknown names are treated as writes: guessing "write" wrongly costs a
        # serialized batch; guessing "read" wrongly costs a half-finished record.
        return tool.is_durable_write if tool else True

    @property
    def history(self) -> list[dict[str, Any]]:
        """The private history, for tests and the post-call classifier."""
        return self._history
