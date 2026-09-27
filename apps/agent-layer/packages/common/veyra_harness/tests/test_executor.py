"""The executor's promises: record first, reconcile duplicates, never claim a timeout."""

from __future__ import annotations

import asyncio

import pytest

from veyra_harness.executor import ActionExecutor, ExecutionScope
from veyra_harness.tools import Tool, ToolResult

from .fakes import FakeSdk


def tool(name: str, handler, **flags) -> Tool:
    defaults = {"is_durable_write": True, "is_idempotent": False, "timeout_ms": 200}
    return Tool(name=name, description="d", handler=handler, **{**defaults, **flags})


async def ok(args, state):
    return {"booking_id": "bk_1", "at": args.get("at")}


async def boom(args, state):
    raise RuntimeError("upstream exploded")


async def slow(args, state):
    await asyncio.sleep(1.0)
    return {"never": True}


@pytest.fixture
def sdk() -> FakeSdk:
    return FakeSdk()


@pytest.fixture
def executor(sdk: FakeSdk) -> ActionExecutor:
    return ActionExecutor(sdk, scope=ExecutionScope(call_id=42, delegation_id=1, expert_slug="scheduling"))


async def test_a_write_is_recorded_before_it_runs_and_closed_after(executor: ActionExecutor, sdk: FakeSdk):
    result = await executor.execute(tool("book_appointment", ok), {"at": "9"}, state=None)

    assert result.ok and result.data["booking_id"] == "bk_1"
    assert sdk.calls == ["start_tool_call", "finish_tool_call"]
    record = sdk.tool_calls[0]
    assert record["status"] == "succeeded"
    assert record["idempotency_key"] == executor.idempotency_key(tool("book_appointment", ok), {"at": "9"})
    assert record["result"] == {"booking_id": "bk_1", "at": "9"}


async def test_the_idempotency_key_is_stable_for_the_same_call_and_arguments(executor: ActionExecutor):
    t = tool("book_appointment", ok)
    assert executor.idempotency_key(t, {"at": "9", "who": "tom"}) == executor.idempotency_key(t, {"who": "tom", "at": "9"})
    assert executor.idempotency_key(t, {"at": "9"}) != executor.idempotency_key(t, {"at": "10"})
    executor.scope.delegation_id = 2
    assert "d2-" in executor.idempotency_key(t, {"at": "9"}), "a later delegation is a different booking"


async def test_a_timed_out_write_is_closed_as_timeout_and_a_retry_reconciles_instead_of_re_running(executor: ActionExecutor, sdk: FakeSdk):
    runs = 0

    async def flaky(args, state):
        nonlocal runs
        runs += 1
        await asyncio.sleep(1.0)

    t = tool("book_appointment", flaky, timeout_ms=50)
    first = await executor.execute(t, {"at": "9"}, state=None)
    assert not first.ok and first.error == "timeout"
    assert sdk.tool_calls[0]["status"] == "timeout"
    assert sdk.tool_calls[0]["needs_reconciliation"] is True

    again = await executor.execute(t, {"at": "9"}, state=None)
    assert runs == 1, "the action must not run a second time"
    assert not again.ok and again.data["unconfirmed"] is True
    assert "unconfirmed" in again.output
    assert len(sdk.tool_calls) == 1


async def test_a_duplicate_of_a_succeeded_write_reuses_the_result(executor: ActionExecutor, sdk: FakeSdk):
    t = tool("book_appointment", ok)
    await executor.execute(t, {"at": "9"}, state=None)
    again = await executor.execute(t, {"at": "9"}, state=None)
    assert again.ok and again.data == {"booking_id": "bk_1", "at": "9"}
    assert "already_done" in again.output
    assert len(sdk.tool_calls) == 1


async def test_a_definite_failure_may_be_tried_again_with_a_new_attempt_number(executor: ActionExecutor, sdk: FakeSdk):
    t = tool("book_appointment", boom)
    first = await executor.execute(t, {"at": "9"}, state=None)
    assert not first.ok and "upstream exploded" in first.error
    assert sdk.tool_calls[0]["status"] == "failed"
    # Same key: the app returns the earlier failed row; the executor reports it.
    second = await executor.execute(t, {"at": "9"}, state=None)
    assert not second.ok and "upstream exploded" in second.output


async def test_reads_are_not_keyed_and_a_read_timeout_is_just_a_failure(executor: ActionExecutor, sdk: FakeSdk):
    t = tool("find_contact", slow, is_durable_write=False, is_idempotent=True, timeout_ms=50)
    result = await executor.execute(t, {}, state=None)
    assert not result.ok and result.error == "timeout"
    assert sdk.tool_calls[0]["idempotency_key"] is None
    assert sdk.tool_calls[0]["needs_reconciliation"] is False


async def test_an_approval_gated_action_is_recorded_but_never_run(executor: ActionExecutor, sdk: FakeSdk):
    runs = 0

    async def handler(args, state):
        nonlocal runs
        runs += 1

    result = await executor.execute(tool("refund", handler, requires_approval=True), {"amount": 50}, state=None)
    assert runs == 0
    assert not result.ok and "approve" in result.output
    assert sdk.tool_calls[0]["status"] == "awaiting_approval"


async def test_dry_run_fakes_writes_and_runs_reads(sdk: FakeSdk):
    executor = ActionExecutor(sdk, scope=ExecutionScope(call_id=1, dry_run=True))
    ran: list[str] = []

    async def handler(args, state):
        ran.append("ran")
        return {"x": 1}

    write = await executor.execute(tool("book_appointment", handler), {}, state=None)
    assert write.ok and write.data["simulated"] is True and ran == []
    read = await executor.execute(tool("find_contact", handler, is_durable_write=False, is_idempotent=True), {}, state=None)
    assert read.ok and ran == ["ran"]


async def test_write_in_flight_is_true_only_while_a_durable_write_runs(executor: ActionExecutor):
    seen: list[bool] = []

    async def handler(args, state):
        seen.append(executor.write_in_flight)
        return {}

    assert executor.write_in_flight is False
    await executor.execute(tool("book_appointment", handler), {}, state=None)
    assert seen == [True] and executor.write_in_flight is False
    await executor.execute(tool("find_contact", handler, is_durable_write=False, is_idempotent=True), {}, state=None)
    assert seen[-1] is False


async def test_an_unaudited_tool_is_not_recorded(executor: ActionExecutor, sdk: FakeSdk):
    result = await executor.execute(Tool(name="search_knowledge", description="d", handler=ok, audited=False), {}, state=None)
    assert result.ok and sdk.calls == []


async def test_a_handler_may_return_a_tool_result_directly(executor: ActionExecutor):
    async def handler(args, state):
        return ToolResult.failure("nope", data={"code": 7})

    result = await executor.execute(tool("find_contact", handler, is_durable_write=False, is_idempotent=True), {}, state=None)
    assert not result.ok and result.error == "nope" and '"code": 7' in result.output


async def test_when_the_audit_row_cannot_be_written_a_write_does_not_run_but_a_read_does():
    class Down(FakeSdk):
        async def start_tool_call(self, **kw):
            from app_sdk.errors import Unavailable

            raise Unavailable("app down")

    executor = ActionExecutor(Down(), scope=ExecutionScope(call_id=1))
    ran: list[str] = []

    async def handler(args, state):
        ran.append("ran")
        return {}

    write = await executor.execute(tool("book_appointment", handler), {}, state=None)
    assert not write.ok and "not run" in write.output and ran == []
    read = await executor.execute(tool("find_contact", handler, is_durable_write=False, is_idempotent=True), {}, state=None)
    assert read.ok and ran == ["ran"]
