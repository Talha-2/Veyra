"""The delegation loop, driven by a scripted model against the fake app."""

from __future__ import annotations

import asyncio

import pytest

from veyra_harness.actions import tools_for_expert
from veyra_harness.executor import ActionExecutor, ExecutionScope
from veyra_harness.prompt import worker_instructions
from veyra_harness.state import CallState
from veyra_harness.tools import Tool
from veyra_harness.worker import MAX_EMPTY_RESPONSE_NUDGES, Worker

from .fakes import FakeSdk, ScriptedModel, call, call_context, say


async def http_stub(args, state):
    return {"booking_id": "bk_9", "slot": args.get("slot")}


def build(sdk: FakeSdk, *completions, dry_run: bool = False) -> tuple[Worker, CallState, ScriptedModel]:
    ctx = call_context()
    state = CallState(sdk=sdk, context=ctx, dry_run=dry_run)
    expert = ctx.workers[0]
    tools = tools_for_expert(expert, ctx)
    # The HTTP action would reach the network; stub its handler, keep its flags.
    for t in tools:
        if t.name == "book_appointment":
            t.handler = http_stub
    model = ScriptedModel(*completions)
    executor = ActionExecutor(sdk, scope=ExecutionScope(call_id=ctx.call.id, expert_slug=expert.slug, dry_run=dry_run))
    return Worker(model=model, instructions=worker_instructions(ctx, expert, ctx), tools=tools, executor=executor, state=state), state, model


async def test_a_delegation_reads_the_skill_books_and_reports_a_confirmed_durable_write():
    sdk = FakeSdk()
    worker, state, model = build(
        sdk,
        call(("read_skill", {"slug": "reschedule"})),
        call(("book_appointment", {"slot": "Thu 9-12"})),
        say("Booked Thursday 9-12. Tell the caller it is confirmed."),
    )
    assert worker.claim()
    outcome = await worker.delegate("AI: Hello\nHuman: Move my appointment to Thursday morning")

    assert outcome.reply.startswith("Booked Thursday")
    assert outcome.failed is False
    assert outcome.completed_durable_write is True, "computed by the app from the audit trail"
    assert worker.is_running is False

    # One delegation row, opened before the loop and closed with the reply.
    assert sdk.delegations[0]["sequence"] == 1 and sdk.delegations[0]["reply"].startswith("Booked")
    # The skill read is plumbing and unaudited... no: it is recorded, but hidden from the digest.
    slugs = [t["action_slug"] for t in sdk.tool_calls]
    assert slugs == ["read_skill", "book_appointment"]
    assert sdk.tool_calls[1]["idempotency_key"].startswith("call42-d1-book_appointment-")
    # The model saw the skill body as a tool result and never as part of the prompt.
    system = model.requests[0][0][0]["content"]
    assert "Ask for the booking reference" not in system and "read_skill: reschedule" in system
    assert any("Ask for the booking reference" in (m.get("content") or "") for m in model.requests[1][0])
    # No private keys leak into what the model receives.
    assert all("_ok" not in m for req in model.requests for m in req[0])


async def test_an_empty_reply_is_a_failed_delegation_not_a_success():
    sdk = FakeSdk()
    worker, _, model = build(sdk, say(""), say(""))
    worker.claim()
    outcome = await worker.delegate("Human: hi")
    assert outcome.reply == "" and outcome.failed is True
    assert len(model.requests) == 1 + MAX_EMPTY_RESPONSE_NUDGES
    assert sdk.delegations[0]["status"] == "failed"


async def test_a_reply_without_a_durable_write_cannot_be_confirmed():
    sdk = FakeSdk()
    worker, _, _ = build(sdk, call(("find_contact", {})), say("Ask the caller for their name."))
    worker.claim()
    outcome = await worker.delegate("Human: I want to book")
    assert outcome.failed is False and outcome.completed_durable_write is False


async def test_independent_reads_run_in_one_batch_and_writes_are_serialized():
    sdk = FakeSdk()
    order: list[str] = []
    worker, _, _ = build(
        sdk,
        call(("find_contact", {}), ("search_knowledge", {"query": "evanston"}), ("read_skill", {"slug": "reschedule"})),
        call(("book_appointment", {"slot": "a"}), ("create_ticket", {"subject": "s", "body": "b"})),
        say("done"),
    )
    real_book = next(t for t in worker._tools.values() if t.name == "book_appointment").handler

    async def slow_book(args, state):
        order.append("book:start")
        await asyncio.sleep(0.05)
        order.append("book:end")
        return await real_book(args, state)

    async def ticket_marker(args, state):
        order.append("ticket")
        from veyra_harness.actions import save_ticket

        return await save_ticket(args, state)

    worker._tools["book_appointment"].handler = slow_book
    worker._tools["create_ticket"].handler = ticket_marker
    worker.claim()
    await worker.delegate("Human: book it and log it")

    assert order == ["book:start", "book:end", "ticket"], "writes never overlap"
    assert [t["action_slug"] for t in sdk.tool_calls[:3]] == ["find_contact", "search_knowledge", "read_skill"]


async def test_the_claim_is_synchronous_and_refuses_a_second_delegation_while_working():
    sdk = FakeSdk()
    sdk.delay = 0.1
    worker, _, _ = build(sdk, call(("create_ticket", {"subject": "s", "body": "b"})), say("Recorded."))
    assert worker.claim() is True
    task = asyncio.create_task(worker.delegate("Human: log this"))
    await asyncio.sleep(0.02)
    assert worker.is_running and worker.claim() is False
    assert worker.write_in_flight is True
    outcome = await task
    assert outcome.completed_durable_write is True
    assert worker.claim() is True, "waiting is not running: sending answers back is the next delegation"


async def test_progress_digest_hides_plumbing_and_results_and_detects_a_stall():
    sdk = FakeSdk()
    sdk.delay = 0.3
    worker, _, _ = build(sdk, call(("read_skill", {"slug": "reschedule"})), call(("find_contact", {})), call(("create_ticket", {"subject": "s", "body": "b"})), say("ok"))
    assert worker.progress_digest() == "No request is running."
    worker.claim()
    task = asyncio.create_task(worker.delegate("Human: hi"))
    await asyncio.sleep(0.1)
    digest = worker.progress_digest()
    assert "find contact" in digest and "read_skill" not in digest and "bk_" not in digest
    # Unchanged checks accumulate into a stall verdict.
    d2, d3, d4 = worker.progress_digest(), worker.progress_digest(), worker.progress_digest()
    assert "not progressing" in d4 or "not progressing" in worker.progress_digest()
    await task
    assert worker.progress_digest() == "No request is running."


async def test_a_duplicate_sequence_never_runs_the_worker():
    sdk = FakeSdk()
    worker, state, model = build(sdk, say("should not run"))
    state.next_sequence = 1
    await sdk.start_delegation(42, sequence=1, transcript_delta="earlier")
    worker.claim()
    outcome = await worker.delegate("Human: again")
    assert outcome.failed is True and model.requests == []


async def test_voicemail_stops_writes_but_the_history_stays_consistent():
    sdk = FakeSdk()
    worker, state, model = build(sdk, call(("create_ticket", {"subject": "s", "body": "b"})), say("later"))
    worker.claim()

    async def flip(args, s):
        state.was_voicemail = True
        return {}

    task = asyncio.create_task(worker.delegate("Human: hi"))
    await asyncio.sleep(0)
    state.was_voicemail = True
    outcome = await task
    assert outcome.reply == "" and sdk.created_tickets == []
    # Every tool call in history has its result, so the next turn is valid.
    roles = [m["role"] for m in worker.history]
    assert roles.count("tool") == sum(len(m.get("tool_calls") or []) for m in worker.history if m["role"] == "assistant")


async def test_finalization_runs_once_and_classifies_from_records_not_prose():
    sdk = FakeSdk()
    worker, _, _ = build(sdk, call(("create_ticket", {"subject": "Follow up", "body": "Caller hung up mid-booking."})), say("Ticket raised; nothing else was authorised."))
    first, second = await asyncio.gather(worker.finalize("Human: actually never mind", "The call is over."), worker.finalize("ignored", "ignored"))
    assert first is second or first == second
    assert first.outcome == "ticket_created_or_updated"
    assert first.action_names == ("create_ticket",)
    assert first.transcript_had_new_turns is True
    assert len(sdk.created_tickets) == 1


async def test_finalization_with_no_writes_needs_no_action():
    sdk = FakeSdk()
    worker, _, _ = build(sdk, say("Purely informational; nothing to do."))
    result = await worker.finalize("", "over")
    assert result.outcome == "no_action_needed" and result.transcript_had_new_turns is False


async def test_a_composio_tool_without_an_account_answers_honestly(monkeypatch):
    monkeypatch.delenv("COMPOSIO_API_KEY", raising=False)
    sdk = FakeSdk()
    worker, _, _ = build(sdk, call(("sync_crm", {"x": 1})), say("Could not sync."))
    worker.claim()
    outcome = await worker.delegate("Human: sync me")
    assert sdk.tool_calls[0]["status"] == "failed" and "nothing was done" in (sdk.tool_calls[0]["error"] or "").lower()
    assert outcome.completed_durable_write is False


async def test_tokens_are_summed_across_turns():
    sdk = FakeSdk()
    worker, _, _ = build(sdk, call(("find_contact", {})), say("ok"))
    worker.claim()
    await worker.delegate("Human: hi")
    assert worker.tokens == 30
