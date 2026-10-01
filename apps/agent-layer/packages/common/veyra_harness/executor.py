"""Run one tool call the way the reliability rules require.

The order is the whole design and it is fixed: **record, then dispatch, then
close**. The record goes to the app before the action runs, carrying an
idempotency key for anything non-idempotent. If the app answers that the key
was seen before, the action is not run again — the earlier record's status
decides what happens:

| earlier status | what the worker does |
|---|---|
| succeeded      | reuses its result; the caller is told the same thing twice at worst |
| timeout        | reports "unconfirmed" — never re-runs, never claims success |
| running        | treats it as in flight; reports unconfirmed |
| failed/rejected| runs again (those prove nothing happened) — with a new attempt number |

Timeouts are per tool from the spec. A read that times out can be retried;
a write that times out cannot, and is closed as ``timeout`` so the app's
``needs_reconciliation`` flag lights up on the Desk.

Nothing in here knows about LiveKit or about the model. It takes a ``Tool``
and arguments and returns a ``ToolResult``; the worker records the result into
its history.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

from app_sdk.errors import AppSdkError, Unavailable

from .tools import Tool, ToolResult
from .tracing import span

# Deferred closes, held so the event loop does not drop them mid-retry.
_PENDING_CLOSES: set[asyncio.Task[None]] = set()

logger = logging.getLogger("veyra.harness.executor")


@dataclass(slots=True)
class ExecutionScope:
    """Where a tool call is happening, for the audit row."""

    call_id: int | None = None
    delegation_id: int | None = None
    expert_slug: str | None = None
    # A simulation drives the agent with a made-up caller against real tools:
    # reads run, writes are answered without happening.
    dry_run: bool = False


class ActionExecutor:
    def __init__(self, sdk: Any, *, scope: ExecutionScope | None = None):
        self._sdk = sdk
        self.scope = scope or ExecutionScope()
        self._write_in_flight = 0
        # Attempts per idempotency key, so a legitimate re-run after a
        # *definite* failure carries attempt=2 rather than pretending to be new.
        self._attempts: dict[str, int] = {}
        # A run without a call (a live chat, Ask, an automation) has no call
        # id to scope its keys by. Without this every chat in the tenant
        # shared "call0-d0-…": a second visitor raising a ticket with the same
        # words got the first visitor's ticket back as a duplicate.
        self._run = uuid.uuid4().hex[:12]

    @property
    def write_in_flight(self) -> bool:
        return self._write_in_flight > 0

    def idempotency_key(self, tool: Tool, arguments: dict[str, Any]) -> str:
        """Stable across a retry of the same call with the same arguments.

        Scoped to the delegation, not the call: a caller who books two slots in
        two exchanges has made two bookings, and they must not collapse. A run
        with no call is scoped to this executor (one per chat conversation,
        Ask thread or automation run).
        """
        digest = hashlib.sha256(json.dumps(arguments, sort_keys=True, default=str).encode()).hexdigest()[:16]
        where = f"call{self.scope.call_id}" if self.scope.call_id else f"run{self._run}"
        return f"{where}-d{self.scope.delegation_id or 0}-{tool.name}-{digest}"

    async def execute(self, tool: Tool, arguments: dict[str, Any], state: Any) -> ToolResult:
        if not tool.audited:
            return await self._dispatch(tool, arguments, state)

        if tool.requires_approval:
            if self.scope.dry_run:
                # A simulation must not put a request in front of a person.
                return ToolResult.success({"simulated": True, "needs_approval": True}, text="Simulated. In a live conversation this action would wait for a person to approve it in Studio before running.")
            # Recorded so a person can approve it (Studio → Overview). Never
            # run here: the approval runs it, through `run_approved`.
            record = await self._start(tool, arguments, key=None)
            if record is None:
                return ToolResult.failure("This action needs a person to approve it, and the request could not be recorded. Nothing was done.")
            await self._finish(record["id"], status="awaiting_approval", error="Requires human approval.")
            return ToolResult.failure(
                "Not run yet: this action needs a person to approve it, and it is now waiting for approval. "
                "Do not say it was done. Say a member of the team will review it.",
                data={"awaiting_approval": True, "tool_call_id": record["id"]},
            )

        if self.scope.dry_run and tool.is_durable_write:
            logger.info("executor.dry_run_write tool=%s", tool.name)
            return ToolResult.success({"success": True, "simulated": True})

        key = self.idempotency_key(tool, arguments) if not tool.is_idempotent else None
        if key is not None:
            self._attempts[key] = self._attempts.get(key, 0) + 1

        record = await self._start(tool, arguments, key=key, attempt=self._attempts.get(key or "", 1))
        if record is None:
            # The audit write itself failed. A write with no record is a write
            # nobody can reconcile, so it does not run. Reads carry on.
            if tool.is_durable_write:
                return ToolResult.failure("Could not record this action before running it, so it was not run.")
            return await self._dispatch(tool, arguments, state)

        if record.get("duplicate"):
            return self._reconcile(tool, record["tool_call"])

        tool_call_id = record["tool_call"]["id"]
        started = time.perf_counter()
        if tool.is_durable_write:
            self._write_in_flight += 1
        try:
            with span(f"tool.{tool.name}", kind=tool.kind, durable=tool.is_durable_write, tool_call_id=tool_call_id, arguments=arguments):
                result = await self._run_with_timeout(tool, arguments, state)
        finally:
            if tool.is_durable_write:
                self._write_in_flight -= 1
        duration_ms = int((time.perf_counter() - started) * 1000)

        status = "succeeded" if result.ok else ("timeout" if result.error == "timeout" else "failed")
        await self._finish(tool_call_id, status=status, result=_jsonable(result.data), error=result.error, duration_ms=duration_ms)
        return result

    async def run_approved(self, tool: Tool, arguments: dict[str, Any], state: Any) -> tuple[ToolResult, int]:
        """Run an action a person approved, once, with its own timeout. Returns the result and the duration.

        No new audit row: the approval request *is* the row, and the app
        closes it with this result. Not retried — a person pressed the button
        once, and a write that times out stays unconfirmed for a person to
        check, exactly as on a call.
        """
        started = time.perf_counter()
        with span(f"tool.{tool.name}", kind=tool.kind, durable=tool.is_durable_write, approved=True):
            result = await self._run_with_timeout(tool, arguments, state)
        return result, int((time.perf_counter() - started) * 1000)

    # ── steps ────────────────────────────────────────────────────────────

    async def _start(self, tool: Tool, arguments: dict[str, Any], *, key: str | None, attempt: int = 1) -> dict[str, Any] | None:
        try:
            started = await self._sdk.start_tool_call(
                action_slug=tool.name, arguments=arguments, idempotency_key=key, call_id=self.scope.call_id,
                delegation_id=self.scope.delegation_id, expert_slug=self.scope.expert_slug, kind=tool.kind, attempt=attempt,
            )
        except AppSdkError as e:
            logger.warning("executor.record_failed tool=%s error=%s", tool.name, e)
            return None
        return {"duplicate": started.duplicate, "tool_call": started.tool_call.model_dump(), "id": started.tool_call.id}

    async def _finish(self, tool_call_id: int, **fields: Any) -> None:
        try:
            await self._sdk.finish_tool_call(tool_call_id, **fields)
        except Unavailable as e:
            # The app was briefly unreachable (a restart, a cold instance). A
            # record left open reads as "timed out mid-write" and puts a
            # finished action in front of a person, so keep trying in the
            # background; the caller does not wait for the audit trail.
            logger.warning("executor.close_deferred id=%s error=%s", tool_call_id, e)
            task = asyncio.create_task(self._finish_later(tool_call_id, fields))
            _PENDING_CLOSES.add(task)
            task.add_done_callback(_PENDING_CLOSES.discard)
        except AppSdkError as e:
            logger.warning("executor.close_failed id=%s error=%s", tool_call_id, e)

    async def _finish_later(self, tool_call_id: int, fields: dict[str, Any]) -> None:
        for delay in (1.0, 3.0, 8.0, 20.0):
            await asyncio.sleep(delay)
            try:
                await self._sdk.finish_tool_call(tool_call_id, **fields)
                logger.info("executor.close_recovered id=%s", tool_call_id)
                return
            except Unavailable:
                continue
            except AppSdkError as e:
                logger.warning("executor.close_failed id=%s error=%s", tool_call_id, e)
                return
        logger.error("executor.close_abandoned id=%s — the record stays open and will read as unconfirmed", tool_call_id)

    def _reconcile(self, tool: Tool, earlier: dict[str, Any]) -> ToolResult:
        status = earlier.get("status")
        logger.info("executor.duplicate tool=%s earlier=%s", tool.name, status)
        if status == "succeeded":
            return ToolResult.success(earlier.get("result") or {"success": True}, text=_render_reuse(earlier))
        if status in ("timeout", "running"):
            return ToolResult.failure(
                "This action was already attempted on this call and its outcome is unconfirmed. Do not run it again; "
                "tell the caller it could not be confirmed and it will be checked by the team.",
                data={"unconfirmed": True, "earlier_tool_call_id": earlier.get("id")},
            )
        # failed / rejected prove nothing happened: the caller may try again
        # explicitly, but *this* invocation reports the earlier failure.
        return ToolResult.failure(earlier.get("error") or "The earlier attempt failed.", data={"earlier_tool_call_id": earlier.get("id")})

    async def _run_with_timeout(self, tool: Tool, arguments: dict[str, Any], state: Any) -> ToolResult:
        try:
            return await asyncio.wait_for(self._dispatch(tool, arguments, state), timeout=tool.timeout_ms / 1000)
        except asyncio.TimeoutError:
            logger.warning("executor.timeout tool=%s ms=%s", tool.name, tool.timeout_ms)
            return ToolResult(output=f"No response after {tool.timeout_ms / 1000:.0f}s. The outcome is unknown.", ok=False, error="timeout")

    async def _dispatch(self, tool: Tool, arguments: dict[str, Any], state: Any) -> ToolResult:
        try:
            raw = await tool.handler(arguments, state)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 — a tool fault must not kill the loop
            logger.warning("executor.tool_failed tool=%s error=%s", tool.name, e)
            return ToolResult.failure(f"{type(e).__name__}: {e}"[:400])
        if isinstance(raw, ToolResult):
            return raw
        return ToolResult.success(raw)


def _render_reuse(earlier: dict[str, Any]) -> str:
    return json.dumps({"success": True, "already_done": True, "result": earlier.get("result")}, ensure_ascii=False, default=str)


def _jsonable(data: Any) -> Any:
    if data is None or isinstance(data, (dict, list)):
        return data
    return {"value": str(data)}
