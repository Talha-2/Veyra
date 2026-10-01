"""The front-desk routes from the SDK's side: paths, the acting-for header, and typed answers.

The fake answers with the shapes the PHP controllers return
(tests/Feature/AgentFrontDeskToolsTest.php exercises those on that side).
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app_sdk import AppSdk, AppSdkError, NotFound
from app_sdk.client import ACTING_FOR_HEADER

SECRET = "test-secret"
BASE = "/api/agent/v1/organizations/7"

CONTACT = {"id": 12, "name": "Tom Byrne", "display_name": "Tom Byrne", "phone": "+17735550111", "email": "tom@example.test", "company": None, "stage": "new"}
DETAIL = {"id": 3, "number": 12, "reference": "#12", "subject": "No heat", "status": "pending", "priority": "high", "type": "Service", "assignees": ["Sam Rivera"],
          "created_at": "2026-10-01T09:00:00+00:00", "status_label": "Pending", "created_by_agent": True, "updated_at": "2026-10-02T09:00:00+00:00", "resolved_at": None,
          "last_activity": {"description": "Agent added a note", "at": "2026-10-02T09:00:00+00:00"}}


class FakeApp:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def body(self, i: int = -1) -> dict[str, Any]:
        content = self.requests[i].content
        return json.loads(content) if content else {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path, method = request.url.path.removeprefix(BASE), request.method
        routes: dict[tuple[str, str], tuple[int, dict[str, Any]]] = {
            ("GET", "/contacts/lookup"): (200, {"found": True, "matched_by": "email", "linked": False, "masked": True, "identifier": None,
                                               "contact": {**CONTACT, "phone": "•••0111", "email": "t•••@example.test", "company": None, "stage": None}, "matches": [], "open_tickets": [], "conversations": []}),
            ("POST", "/contacts"): (200, {"created": False, "reason": "matched", "conversation_linked": True, "contact": CONTACT}),
            ("PATCH", "/contacts/12"): (200, {"contact": {**CONTACT, "company": "Byrne Builders"}}),
            ("PATCH", "/contacts/13"): (403, {"error": "not_permitted", "message": "That record belongs to someone other than the customer in this conversation, so it was not changed."}),
            ("POST", "/contacts/12/notes"): (201, {"note": {"id": 5, "subject": "contact", "subject_id": 12, "body": "Gate code 4411.", "created_at": "2026-10-02T09:00:00+00:00"}}),
            ("GET", "/contacts/12/history"): (200, {"contact": CONTACT, "conversations": [{"id": 9, "channel": "call", "status": "open", "current": True, "last_message_at": None, "messages": [{"from": "customer", "body": "Hi", "at": None}]}],
                                                   "calls": [{"at": None, "direction": "inbound", "status": "completed", "duration": "1:30", "summary": "Asked about a refund."}], "tickets": [], "notes": []}),
            ("POST", "/conversations/9/link"): (200, {"linked": True, "mode": "identifier", "contact": CONTACT}),
            ("POST", "/conversations/9/notes"): (201, {"note": {"id": 6, "subject": "conversation", "subject_id": 9, "body": "x", "created_at": None}}),
            ("POST", "/conversations/9/summary"): (200, {"summarized": True, "tags_added": ["billing"], "tags": ["billing", "vip"]}),
            ("POST", "/conversations/9/reminders"): (201, {"reminder": {"id": 2, "text": "Call back", "due_at": "2026-10-02T12:00:00+00:00", "for": "Sam Rivera", "teammate_matched": True}}),
            ("POST", "/conversations/9/handoff"): (200, {"handed_off": True, "assigned_to": ["Sam Rivera"], "notified": ["Sam Rivera"], "teammate_matched": True, "teammate_candidates": [], "tag": "Needs attention"}),
            ("POST", "/tickets"): (201, {"created": True, "type_note": "\"Plumbing\" is not one of this business's ticket types, so it was filed as General.",
                                         "ticket": {"id": 4, "number": 13, "reference": "#13", "subject": "Leak", "status": "open", "priority": "normal", "type": "General", "assignees": ["Ada Owner"], "created_at": None}}),
            ("GET", "/tickets"): (200, {"tickets": [{k: DETAIL[k] for k in ("id", "number", "reference", "subject", "status", "priority", "type", "assignees", "created_at")}]}),
            ("GET", "/tickets/12"): (200, {"ticket": DETAIL}),
            ("GET", "/tickets/99"): (404, {"error": "not_found", "message": "There is no ticket #99 on this customer's record."}),
            ("PATCH", "/tickets/12"): (200, {"changes": ["status Pending → Open", "note added"], "type_note": None, "ticket": {**DETAIL, "status": "open"}}),
            ("PATCH", "/tickets/14"): (422, {"message": "Only the team can close a ticket.", "errors": {"status": ["Only the team can close a ticket."]}}),
            ("POST", "/leads"): (201, {"created": True, "moved": False, "note": None, "lead": {"id": 1, "contact_id": 12, "pipeline": "Sales", "stage": "New", "value": 0}}),
            ("GET", "/calls"): (200, {"calls": []}),
        }
        status, payload = routes.get((method, path), (404, {"message": f"no route for {method} {path}"}))
        return httpx.Response(status, json=payload)


@pytest.fixture
def app() -> FakeApp:
    return FakeApp()


@pytest.fixture
def sdk(app: FakeApp) -> AppSdk:
    return AppSdk("http://app.test", SECRET, transport=httpx.MockTransport(app.handler)).for_organization(7)


async def test_acting_for_sends_the_conversation_header_and_staff_runs_send_none(sdk: AppSdk, app: FakeApp):
    found = await sdk.lookup_contact(email="tom@example.test", acting_for=9)
    assert app.requests[-1].headers[ACTING_FOR_HEADER] == "9"
    assert found.masked and found.linked is False and found.contact.phone == "•••0111"

    await sdk.recent_calls(limit=5)
    assert ACTING_FOR_HEADER not in app.requests[-1].headers


async def test_contact_writes_return_typed_results(sdk: AppSdk, app: FakeApp):
    saved = await sdk.create_contact(name="Tom", phone="773 555 0111", acting_for=9)
    assert (saved.created, saved.reason, saved.conversation_linked, saved.contact.id) == (False, "matched", True, 12)
    assert app.body() == {"name": "Tom", "phone": "773 555 0111"}, "nulls are not sent"

    updated = await sdk.update_contact(12, company="Byrne Builders", acting_for=9)
    assert updated.company == "Byrne Builders" and app.body() == {"company": "Byrne Builders"}
    with pytest.raises(AppSdkError, match="someone other than the customer") as refused:
        await sdk.update_contact(13, name="x", acting_for=9)
    assert refused.value.status == 403 and refused.value.code == "not_permitted"

    linked = await sdk.link_contact(9, phone="773 555 0111", acting_for=9)
    assert linked.mode == "identifier" and linked.contact.id == 12
    note = await sdk.add_contact_note(12, "Gate code 4411.", acting_for=9)
    assert note.subject == "contact" and note.subject_id == 12
    assert (await sdk.add_conversation_note(9, "x")).subject == "conversation"

    history = await sdk.contact_history(12, limit=3, acting_for=9)
    assert app.requests[-1].url.params["limit"] == "3"
    assert history.conversations[0].current and history.conversations[0].messages[0].from_ == "customer"
    assert history.calls[0].summary == "Asked about a refund."


async def test_tickets_by_number_and_their_guardrail_refusals(sdk: AppSdk, app: FakeApp):
    ticket, created = await sdk.create_ticket(subject="Leak", body="x", type="Plumbing", idempotency_key="k1", acting_for=9)
    assert created and ticket.reference == "#13" and ticket.type == "General" and "filed as General" in ticket.type_note

    listed = await sdk.tickets(status="open", acting_for=9)
    assert app.requests[-1].url.params["status"] == "open" and listed[0].reference == "#12"

    detail = await sdk.ticket(12, acting_for=9)
    assert detail.status_label == "Pending" and detail.last_activity["description"] == "Agent added a note"
    with pytest.raises(NotFound, match="no ticket #99"):
        await sdk.ticket(99, acting_for=9)

    update = await sdk.update_ticket(12, status="open", note="Still broken.", acting_for=9)
    assert update.changes == ["status Pending → Open", "note added"] and update.ticket.status == "open"
    assert app.body() == {"status": "open", "note": "Still broken."}
    with pytest.raises(AppSdkError, match="Only the team can close a ticket") as refused:
        await sdk.update_ticket(14, status="closed")
    assert refused.value.status == 422


async def test_conversation_work_and_leads(sdk: AppSdk, app: FakeApp):
    wrapped = await sdk.summarize_conversation(9, summary="Refund question.", tags=["billing"], acting_for=9)
    assert wrapped.tags_added == ["billing"] and app.body() == {"summary": "Refund question.", "tags": ["billing"]}

    reminder = await sdk.set_reminder(9, text="Call back", due_in_minutes=120, teammate="Sam", acting_for=9)
    assert reminder.for_ == "Sam Rivera" and reminder.teammate_matched is True

    handed = await sdk.hand_off(9, reason="Wants a person.", urgency="urgent", teammate="Sam", acting_for=9)
    assert handed.assigned_to == ["Sam Rivera"] and handed.tag == "Needs attention"
    assert app.body() == {"reason": "Wants a person.", "urgency": "urgent", "teammate": "Sam"}

    lead = await sdk.save_lead(note="Wants a quote.", acting_for=9)
    assert lead.created and lead.lead.stage == "New" and app.requests[-1].url.path == f"{BASE}/leads"
