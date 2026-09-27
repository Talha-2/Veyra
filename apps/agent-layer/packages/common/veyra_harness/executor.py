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
from dataclasses import dataclass
from typing import Any

from app_sdk.errors import AppSdkError

from .tools import Tool, ToolResult
from .tracing import span

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

    @property
    def write_in_flight(self) -> bool:
        return self._write_in_flight > 0

    def idempotency_key(self, tool: Tool, arguments: dict[str, Any]) -> str:
        """Stable across a retry of the same call with the same arguments.

        Scoped to the delegation, not the call: a caller who books two slots in
        two exchanges has made two bookings, and they must not collapse.
        """
        digest = hashlib.sha256(json.dumps(arguments, sort_keys=True, default=str).encode()).hexdigest()[:16]
        return f"call{self.scope.call_id or 0}-d{self.scope.delegation_id or 0}-{tool.name}-{digest}"

    async def execute(self, tool: Tool, arguments: dict[str, Any], state: Any) -> ToolResult:
        if not tool.audited:
            return await self._dispatch(tool, arguments, state)

        if tool.requires_approval:
            # Recorded so a person can approve it later; never run on the call.
            record = await self._start(tool, arguments, key=None)
            if record is not None:
                await self._finish(record["id"], status="awaiting_approval", error="Requires human approval.")
            return ToolResult.failure("This action needs a person to approve it before it runs. It has been recorded for review.")

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
        except AppSdkError as e:
            logger.warning("executor.close_failed id=%s error=%s", tool_call_id, e)

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
