"""The front-desk tools: who they act for, what they send, and what the model is told.

The app enforces the guardrails (tests/Feature/AgentFrontDeskToolsTest.php);
these tests pin the harness's half: every customer-facing request names its
conversation, refusals come back as sentences the agent can say, and the tool
set is what the business configured.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app_sdk.errors import AppSdkError, Unavailable
from app_sdk.models import ExpertRecord, TenantContext, ToolSpec
from veyra_harness.actions import BUILTINS, tools_for_expert
from veyra_harness.desk_tools import DESK_SLUGS, acting_for
from veyra_harness.state import CallState, RunState

from .fakes import CALL_CONTEXT, FakeSdk, call_context


def tenant(**overrides) -> TenantContext:
    data = {k: v for k, v in CALL_CONTEXT.items() if k not in ("call", "line", "caller")}
    return TenantContext.model_validate({**data, **overrides})


def chat_state(sdk: FakeSdk, **kw) -> RunState:
    """A live chat on the gateway: the bundle names the conversation as `session`."""
    return RunState(sdk=sdk, context=tenant(session={"conversation_id": 31, "channel": "web_chat"}), **kw)


def staff_state(sdk: FakeSdk, **kw) -> RunState:
    """Ask or an automation: nobody outside the business on the other end."""
    return RunState(sdk=sdk, context=tenant(), **kw)


def run(name: str):
    return BUILTINS[name].handler


# ── scope ───────────────────────────────────────────────────────────────


def test_a_run_acts_for_its_calls_or_chats_conversation_and_staff_runs_for_nobody():
    sdk = FakeSdk()
    assert acting_for(CallState(sdk=sdk, context=call_context())) == 9
    assert acting_for(chat_state(sdk)) == 31
    assert acting_for(staff_state(sdk)) is None
    assert acting_for(staff_state(sdk, extra={"conversation_id": 44})) == 44, "a host may say so explicitly"


# ── contacts ────────────────────────────────────────────────────────────


async def test_find_contact_reads_a_free_query_as_phone_email_or_name():
    sdk = FakeSdk()
    state = staff_state(sdk)
    several = await run("lookup_contact")({"query": "tom"}, state)
    assert several.ok and "Several people match 'tom'" in several.output and "Tomasz Nowak" in several.output
    await run("lookup_contact")({"query": "+1 (773) 555-0111"}, state)
    await run("lookup_contact")({"query": "tom@example.test"}, state)
    assert [r[1] for r in sdk.requests] == [
        {"name": "tom", "acting_for": None}, {"phone": "+1 (773) 555-0111", "acting_for": None}, {"email": "tom@example.test", "acting_for": None},
    ]


async def test_a_masked_match_tells_the_model_to_verify_and_not_to_read_it_out():
    sdk = FakeSdk()
    state = chat_state(sdk)
    found = await run("lookup_contact")({"email": "tom@example.test"}, state)
    assert found.ok and "not this conversation's customer" in found.output and "link_contact" in found.output
    assert state.contact is None, "a masked record is not who we are talking to"


async def test_with_no_arguments_find_contact_looks_up_who_the_conversation_is_with():
    sdk = FakeSdk()
    await run("lookup_contact")({}, CallState(sdk=sdk, context=call_context()))
    assert sdk.requests[-1] == ("lookup_contact", {"phone": "+17735550111", "acting_for": 9})

    nobody = await run("lookup_contact")({}, chat_state(sdk))
    assert not nobody.ok and "not identified yet" in nobody.output


async def test_update_contact_defaults_to_the_customer_and_relays_a_refusal_in_words():
    sdk = FakeSdk()
    state = CallState(sdk=sdk, context=call_context())
    assert not (await run("update_contact")({"email": "x@y.z"}, state)).ok, "nobody identified yet"

    await run("lookup_contact")({"contact_id": 1}, state)
    updated = await run("update_contact")({"email": "tom@new.test", "name": None}, state)
    assert updated.ok and "email is now tom@new.test" in updated.output
    assert sdk.requests[-1] == ("update_contact", {"contact_id": 1, "acting_for": 9, "email": "tom@new.test"})

    sdk.fail_with = AppSdkError("That record belongs to someone other than the customer in this conversation, so it was not changed.", status=403, code="not_permitted")
    refused = await run("update_contact")({"contact_id": 2, "name": "x"}, state)
    assert not refused.ok and refused.error == "That record belongs to someone other than the customer in this conversation, so it was not changed."


async def test_link_contact_needs_the_details_on_file_and_then_knows_the_customer():
    sdk = FakeSdk()
    state = chat_state(sdk)
    assert "name alone is not enough" in (await run("link_contact")({}, state)).output
    linked = await run("link_contact")({"phone": "773 555 0111"}, state)
    assert linked.ok and state.contact.id == 1
    assert sdk.requests[-1] == ("link_contact", {"conversation_id": 31, "phone": "773 555 0111", "email": None, "contact_id": None, "acting_for": 31})
    assert not (await run("link_contact")({"phone": "1"}, staff_state(sdk))).ok, "a staff run has no conversation to link"


async def test_a_note_goes_on_the_customer_when_known_else_on_the_conversation():
    sdk = FakeSdk()
    state = chat_state(sdk)
    await run("add_note")({"text": "Prefers mornings."}, state)
    await run("lookup_contact")({"contact_id": 1}, state)
    await run("add_note")({"text": "Gate code 4411."}, state)
    await run("add_note")({"text": "Asked twice about price.", "about": "conversation"}, state)
    assert sdk.notes == [
        {"subject": "conversation", "id": 31, "body": "Prefers mornings."},
        {"subject": "contact", "id": 1, "body": "Gate code 4411."},
        {"subject": "conversation", "id": 31, "body": "Asked twice about price."},
    ]


async def test_history_renders_threads_calls_and_tickets():
    sdk = FakeSdk()
    state = CallState(sdk=sdk, context=call_context())
    assert not (await run("contact_history")({}, state)).ok
    await run("lookup_contact")({"contact_id": 1}, state)
    history = await run("contact_history")({}, state)
    assert history.ok and "(this conversation): customer: The heat is out." in history.output
    assert "Reported no heat." in history.output and "ticket #1 [open] No heat" in history.output


# ── tickets ─────────────────────────────────────────────────────────────


async def test_a_chat_ticket_names_the_conversation_and_leaves_the_customer_to_the_app():
    sdk = FakeSdk()
    state = chat_state(sdk)
    await run("lookup_contact")({"contact_id": 1}, state)
    result = await run("save_ticket")({"subject": "Refund", "body": "Charged twice.", "_idempotency_key": "k"}, state)
    assert result.ok and "Ticket #1 created" in result.output
    created = sdk.created_tickets[0]
    assert (created["conversation_id"], created["acting_for"], created["contact_id"], created["idempotency_key"]) == (31, 31, None, "k")


async def test_ticket_status_reads_the_number_however_it_was_said():
    sdk = FakeSdk()
    state = chat_state(sdk)
    for said in ("#1", "ticket 1", "1"):
        result = await run("ticket_status")({"reference": said}, state)
        assert result.ok and "Ticket #1 (No heat) is pending: waiting on the customer." in result.output
    missing = await run("ticket_status")({"reference": "#12"}, state)
    assert not missing.ok and missing.error == "There is no ticket #12 on this customer's record."
    assert not (await run("ticket_status")({"reference": "the blue one"}, state)).ok


async def test_a_refused_ticket_change_says_nothing_changed_and_the_team_will_review():
    sdk = FakeSdk()
    state = chat_state(sdk)
    ok = await run("update_ticket")({"reference": "#1", "status": "open", "note": "Still broken."}, state)
    assert ok.ok and sdk.requests[-1] == ("update_ticket", {"number": 1, "note": "Still broken.", "status": "open", "priority": None, "type": None, "acting_for": 31})

    sdk.fail_with = AppSdkError("Only the team can close a ticket. (status: Only the team can close a ticket.)", status=422)
    refused = await run("update_ticket")({"reference": "1", "status": "resolved"}, state)
    assert not refused.ok
    assert refused.error == "Only the team can close a ticket. Nothing was changed. Tell the customer the team will review it."
    assert not (await run("update_ticket")({"reference": "1"}, state)).ok, "nothing to change"

    # "It's fixed, close it": the close is refused, but what they said still lands as a note.
    sdk.fail_with = AppSdkError("Only the team can resolve #1. (status: Only the team can resolve #1.)", status=422)
    noted = await run("update_ticket")({"reference": "1", "status": "resolved", "note": "Plumber fixed it."}, state)
    assert noted.ok and noted.output.startswith("Not changed: Only the team can resolve #1. Their note was added to #1 instead")
    assert sdk.requests[-1] == ("update_ticket", {"number": 1, "note": "Plumber fixed it.", "acting_for": 31})


async def test_a_write_the_app_did_not_answer_is_not_claimed():
    sdk = FakeSdk()
    sdk.fail_with = Unavailable("app layer unreachable")
    result = await run("save_ticket")({"subject": "x", "body": "y"}, chat_state(sdk))
    assert not result.ok and "not confirmed" in result.output


# ── the conversation ────────────────────────────────────────────────────


async def test_hand_off_is_never_described_as_a_live_transfer():
    sdk = FakeSdk()
    state = chat_state(sdk)
    assert not (await run("hand_off")({}, state)).ok, "a reason is required"
    handed = await run("hand_off")({"reason": "Wants a person.", "teammate": "Sam", "urgency": "urgent"}, state)
    assert handed.ok and "assigned to Sam Rivera" in handed.output and "not a live transfer" in handed.output
    unknown = await run("hand_off")({"reason": "Wants Zed.", "teammate": "Zed"}, state)
    assert "Nobody called 'Zed'" in unknown.output and "notified Ada Owner" in unknown.output
    assert sdk.requests[-1][1]["acting_for"] == 31


async def test_reminders_summaries_and_leads_need_their_inputs():
    sdk = FakeSdk()
    state = chat_state(sdk)
    assert not (await run("set_reminder")({"text": "Call back"}, state)).ok, "needs a when"
    reminder = await run("set_reminder")({"text": "Call back", "due_in_minutes": 90, "teammate": "Sam"}, state)
    assert reminder.ok and "for Sam Rivera" in reminder.output and "not a promised call time" in reminder.output
    assert sdk.requests[-1][1]["due_in_minutes"] == 90

    assert not (await run("summarize_conversation")({}, state)).ok
    wrapped = await run("summarize_conversation")({"summary": "Asked about a refund.", "tags": ["billing"]}, state)
    assert wrapped.ok and "tagged billing" in wrapped.output

    assert not (await run("save_lead")({"note": "x"}, staff_state(sdk))).ok, "a staff run must name the contact"
    lead = await run("save_lead")({"note": "Wants a furnace quote."}, state)
    assert lead.ok and lead.output == "Added to the Sales pipeline at New."


async def test_memory_cannot_be_written_from_a_customer_conversation():
    sdk = FakeSdk()
    refused = await run("remember")({"name": "Refunds", "content": "Always free."}, chat_state(sdk))
    assert not refused.ok and sdk.memories == {}
    assert (await run("remember")({"name": "Refunds", "content": "Within 30 days."}, staff_state(sdk))).ok


# ── the tool set ────────────────────────────────────────────────────────


def test_the_tool_set_honours_studio_switch_offs_and_lists_the_ticket_types():
    expert = ExpertRecord(slug="ops", name="Ops", description="Works.", tools=[
        ToolSpec(name="create_ticket", description="Our words for raising a ticket.", kind="internal", is_durable_write=True,
                 input_schema={"type": "object", "properties": {"subject": {"type": "string"}}}),
        ToolSpec(name="send_message", description="Text the caller.", kind="internal", is_durable_write=True),
    ])
    context = tenant(disabled_actions=["hand_off", "find_contact"])
    tools = {t.name: t for t in tools_for_expert(expert, context)}

    assert "hand_off" not in tools and "lookup_contact" not in tools, "switched off in Studio stays off"
    assert "send_message" not in tools, "not offered until SMS and email are delivered"
    ticket = tools["create_ticket"]
    assert ticket.description == "Our words for raising a ticket.", "the owner's description"
    assert set(ticket.input_schema["properties"]) >= {"subject", "body", "type", "priority"}, "the handler's schema, not a stale one"
    assert ticket.input_schema["properties"]["type"]["enum"] == ["Service call", "Billing"]
    assert tools["update_ticket"].input_schema["properties"]["type"]["enum"] == ["Service call", "Billing"]
    assert BUILTINS["update_ticket"].input_schema["properties"]["type"] == {"type": "string"}, "the shared built-in is not mutated"
    for name in ("register_contact", "update_contact", "link_contact", "add_note", "contact_history", "ticket_status", "summarize_conversation", "set_reminder", "save_lead"):
        assert name in tools


STARTER_AGENT = Path(__file__).resolve().parents[5] / "app-layer" / "app" / "Services" / "Organization" / "StarterAgent.php"


@pytest.mark.skipif(not STARTER_AGENT.exists(), reason="the app layer is not checked out beside this one")
def test_the_studio_catalog_describes_each_tool_exactly_as_the_built_in_does():
    php = STARTER_AGENT.read_text(encoding="utf-8")
    # Each catalog entry: `'slug' => ['Name',` with the description on the next line.
    entries = re.findall(r"'(\w+)' => \['[^']*',\s*\n\s*(\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*')", php)
    assert len(entries) >= 15
    for slug, quoted in entries:
        description = quoted[1:-1].replace("\\'", "'")
        builtin = BUILTINS[DESK_SLUGS[slug]]
        assert description == builtin.description, f"{slug}: StarterAgent::catalog() and desk_tools.py disagree"
