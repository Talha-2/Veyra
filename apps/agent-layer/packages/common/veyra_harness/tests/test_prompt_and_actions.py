from __future__ import annotations

from veyra_harness.actions import BUILTINS, tools_for_expert
from veyra_harness.prompt import fill, talker_instructions, worker_instructions
from veyra_harness.state import CallState
from veyra_harness.transcript import format_transcript_delta, transcript_items

from .fakes import FakeSdk, call_context


def test_the_talker_prompt_carries_persona_business_caller_and_no_architecture():
    ctx = call_context()
    text = talker_instructions(ctx, ctx)
    assert "You are Nora, the front desk of Northwind Services" in text
    assert "Be warm." in text and "Calm and quick." in text
    assert "No installs on Fridays." in text
    assert "Calling from: +17735550111" in text and "not on file yet" in text
    assert "Speak English." in text
    assert "worker" not in text.lower().replace("network", "")
    assert "{{" not in text


def test_the_urdu_line_gets_monolingual_and_turn_taking_rules():
    ctx = call_context(call={**call_context().call.model_dump(by_alias=True), "language": "ur", "capabilities": {"code": "ur", "label": "Urdu", "stt_multi": False, "semantic_turns": False}})
    text = talker_instructions(ctx, ctx)
    assert "Speak Urdu." in text
    assert "understands Urdu only" in text
    assert "Pause a beat" in text


def test_the_worker_prompt_lists_skills_as_stubs_with_read_hints_and_never_bodies():
    ctx = call_context()
    text = worker_instructions(ctx, ctx.workers[0], ctx)
    assert "**Reschedule** — Move an appointment. (read with read_skill: reschedule)" in text
    assert "You schedule." in text
    assert "- Billing: Invoices and refunds." in text
    assert "- billing: Handles invoices." in text
    assert "Ask for the booking reference" not in text


def test_fill_drops_unknown_slots_and_squeezes_blank_runs():
    assert fill("a\n\n\n\n{{gone}}\n\nb", x="1") == "a\n\nb\n"


def test_expert_tools_map_internal_slugs_and_fill_in_builtins_once():
    ctx = call_context()
    tools = tools_for_expert(ctx.workers[0], ctx)
    names = [t.name for t in tools]
    assert names[:4] == ["book_appointment", "find_contact", "create_ticket", "sync_crm"], "Studio's names first"
    assert "save_ticket" not in names, "create_ticket already covers the built-in"
    assert "lookup_contact" not in names
    assert "read_skill" in names and "search_knowledge" in names
    assert "send_message" not in names, "SMS and email are not delivered yet, so the agent is not offered them"
    by_name = {t.name: t for t in tools}
    assert by_name["create_ticket"].handler is BUILTINS["save_ticket"].handler
    assert by_name["book_appointment"].kind == "http" and by_name["book_appointment"].is_durable_write
    assert by_name["read_skill"].plumbing is True


async def test_save_ticket_carries_the_call_and_the_idempotency_key_through():
    sdk = FakeSdk()
    ctx = call_context()
    state = CallState(sdk=sdk, context=ctx)
    result = await BUILTINS["save_ticket"].handler({"subject": "Refund", "body": "x", "_idempotency_key": "k1"}, state)
    assert result.ok and "Ticket #1 created" in result.output
    assert sdk.created_tickets[0]["call_id"] == 42 and sdk.created_tickets[0]["conversation_id"] == 9 and sdk.created_tickets[0]["idempotency_key"] == "k1"
    assert state.tickets[0].reference == "#1"


async def test_register_contact_acts_for_the_calls_conversation_and_updates_state():
    sdk = FakeSdk()
    state = CallState(sdk=sdk, context=call_context())
    result = await BUILTINS["register_contact"].handler({"name": "Tom Byrne"}, state)
    assert result.ok and state.contact.name == "Tom Byrne"
    # The app links the call's conversation (and with it the calling number).
    assert sdk.requests[-1] == ("create_contact", {"name": "Tom Byrne", "phone": None, "email": None, "company": None, "acting_for": 9})
    assert "now linked" in result.output


async def test_read_skill_accepts_the_path_hint_and_reports_missing_skills():
    sdk = FakeSdk()
    state = CallState(sdk=sdk, context=call_context())
    ok = await BUILTINS["read_skill"].handler({"slug": "/skills/org/reschedule/SKILL.md"}, state)
    assert ok.ok and ok.output.startswith("---")
    missing = await BUILTINS["read_skill"].handler({"slug": "nope"}, state)
    assert not missing.ok and "catalog" in missing.output


async def test_find_contact_accepts_studios_single_query_argument():
    sdk = FakeSdk()
    state = CallState(sdk=sdk, context=call_context())
    ok = await BUILTINS["lookup_contact"].handler({"query": "tom@example.test"}, state)
    assert ok.ok and sdk.calls[-1] == "lookup_contact"
    # A browser session: no number to fall back on, and nobody known yet.
    no_number = {**call_context().call.model_dump(by_alias=True), "from": "Studio test"}
    anonymous = CallState(sdk=sdk, context=call_context(call=no_number, caller={"identifier": {"id": 4, "type": "web_session", "value": "Studio test"}, "contact": None}))
    nothing = await BUILTINS["lookup_contact"].handler({}, anonymous)
    assert not nothing.ok and "phone number" in nothing.output


async def test_recent_calls_and_tickets_render_one_line_per_record():
    sdk = FakeSdk()
    state = CallState(sdk=sdk, context=call_context())
    calls = await BUILTINS["recent_calls"].handler({"since": "2026-09-26T18:00:00Z"}, state)
    assert calls.ok and "Maria Delgado (2:18, completed): Booked furnace repair" in calls.output
    tickets = await BUILTINS["recent_tickets"].handler({}, state)
    assert tickets.ok and "#1 [open] Confirm Thursday booking — Ada" in tickets.output


def test_transcript_delta_skips_tool_plumbing_and_advances_past_everything():
    items = [
        {"type": "message", "role": "system", "content": "sys"},
        {"type": "message", "role": "assistant", "content": "Hello, Northwind."},
        {"type": "message", "role": "user", "content": "Move my appointment."},
        {"type": "function_call", "name": "delegate"},
        {"type": "function_call_output", "output": "Sent."},
        {"type": "message", "role": "assistant", "content": ""},
    ]
    delta, cursor = format_transcript_delta(items, 0)
    assert delta == "AI: Hello, Northwind.\nHuman: Move my appointment."
    assert cursor == len(items)
    again, _ = format_transcript_delta(items, cursor)
    assert again == ""
    assert transcript_items(items) == [{"role": "agent", "text": "Hello, Northwind."}, {"role": "caller", "text": "Move my appointment."}]
