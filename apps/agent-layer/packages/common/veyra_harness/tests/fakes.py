"""A scripted model and an in-memory app layer.

The fake app implements the same semantics the PHP contract tests prove:
duplicate idempotency keys return the earlier tool call, a repeated delegation
sequence is a Conflict, and ``completed_durable_write`` is computed from the
recorded tool calls, not from the reply.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app_sdk.errors import Conflict, NotFound
from app_sdk.models import (
    CallContext,
    ContactHistory,
    ContactLinked,
    ContactLookup,
    ContactRecord,
    ContactSaved,
    ConversationWrapUp,
    HandoffResult,
    LeadSaved,
    NoteRecord,
    ReminderRecord,
    TicketDetail,
    TicketUpdate,
    DelegationOutcome,
    DelegationRecord,
    KnowledgeHit,
    KnowledgeResult,
    MessageRecord,
    SkillDocument,
    TicketRecord,
    ToolCallRecord,
    ToolCallStart,
)
from veyra_harness.llm import Completion, ToolCall

CALL_CONTEXT: dict[str, Any] = {
    "contract": "v1",
    "organization": {"id": 7, "slug": "northwind", "name": "Northwind", "timezone": "America/Chicago"},
    "business": {"name": "Northwind Services", "description": "HVAC repair and installation.", "timezone": "America/Chicago", "hours": {"Mon-Fri": "8-6"}},
    "agent": {
        "display_name": "Nora", "persona": "Calm and quick.", "greeting": "Northwind Services, this is Nora.", "primary_language": "en",
        "languages": [
            {"code": "en", "label": "English"},
            {"code": "ur", "label": "Urdu", "native": "اردو", "rtl": True, "stt": "nova-3-ur", "stt_multi": False, "tts_low_latency": False, "tts_provider": "azure-ur-pk", "semantic_turns": False},
        ],
        "voice": {"provider": "elevenlabs", "id": "v1", "model": "flash"},
    },
    "experts": [
        {"slug": "front", "name": "Front desk", "description": "Talks.", "runtime": "talker", "system_prompt": "Be warm."},
        {
            "slug": "scheduling", "name": "Scheduling", "description": "Books and moves appointments.", "runtime": "worker", "system_prompt": "You schedule.",
            "skills": [{"slug": "reschedule", "name": "Reschedule", "description": "Move an appointment.", "path": "/skills/org/reschedule/SKILL.md", "version": 2}],
            "tools": [
                {"id": 1, "name": "book_appointment", "description": "Book a slot.", "kind": "http", "is_idempotent": False, "is_durable_write": True, "timeout_ms": 5000, "config": {"method": "POST", "url": "https://dispatch.example/book"}},
                {"id": 2, "name": "find_contact", "description": "Find.", "kind": "internal", "is_idempotent": True, "is_durable_write": False},
                {"id": 3, "name": "create_ticket", "description": "Raise a ticket.", "kind": "internal", "is_idempotent": False, "is_durable_write": True},
                {"id": 4, "name": "sync_crm", "description": "Push to CRM.", "kind": "composio", "is_idempotent": False, "is_durable_write": True},
            ],
            "peers": ["billing: Handles invoices."],
        },
    ],
    "skills": [], "ticket_types": [{"id": 1, "name": "Service call"}, {"id": 2, "name": "Billing", "description": "Invoices and refunds."}],
    "memory": [{"name": "Scheduling rules", "content": "No installs on Fridays."}],
    "call": {"id": 42, "conversation_id": 9, "direction": "inbound", "from": "+17735550111", "to": "+13125550142", "language": "en", "capabilities": {"code": "en", "label": "English"}},
    "line": {"id": 1, "e164": "+13125550142"},
    "caller": {"identifier": {"id": 3, "type": "phone", "value": "+17735550111"}, "contact": None},
}


def call_context(**overrides: Any) -> CallContext:
    data = {**CALL_CONTEXT, **overrides}
    return CallContext.model_validate(data)


class ScriptedModel:
    """Returns completions in order; records every request it saw."""

    name = "scripted"

    def __init__(self, *completions: Completion):
        self._completions = list(completions)
        self.requests: list[tuple[list[dict[str, Any]], list[dict[str, Any]]]] = []

    async def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> Completion:
        self.requests.append(([dict(m) for m in messages], tools))
        if not self._completions:
            return Completion(text="")
        return self._completions.pop(0)


def say(text: str) -> Completion:
    return Completion(text=text, prompt_tokens=10, completion_tokens=5)


def call(*calls: tuple[str, dict[str, Any]], text: str = "") -> Completion:
    return Completion(text=text, tool_calls=[ToolCall(id=f"c{i}-{name}", name=name, arguments=args) for i, (name, args) in enumerate(calls)], prompt_tokens=10, completion_tokens=5)


class FakeSdk:
    """In-memory app layer with the contract's semantics."""

    organization_id = 7

    def __init__(self, *, durable: set[str] | None = None, skills: dict[str, str] | None = None):
        self.durable = durable or {"book_appointment", "create_ticket", "save_ticket", "send_message", "register_contact", "update_contact", "remember", "sync_crm"}
        self.skills = skills or {"reschedule": "---\nname: Reschedule\n---\n\nAsk for the booking reference, then offer two windows."}
        self.tool_calls: list[dict[str, Any]] = []
        self.delegations: list[dict[str, Any]] = []
        self.created_tickets: list[dict[str, Any]] = []
        self.messages: list[dict[str, Any]] = []
        self.memories: dict[str, str] = {}
        self.contacts: dict[int, dict[str, Any]] = {}
        self.calls: list[str] = []
        # Every front-desk request as (method, kwargs), acting_for included.
        self.requests: list[tuple[str, dict[str, Any]]] = []
        self.notes: list[dict[str, Any]] = []
        # Set to make the next front-desk call raise this error.
        self.fail_with: Exception | None = None
        self.delay: float = 0.0

    # tool calls
    async def start_tool_call(self, **kw: Any) -> ToolCallStart:
        self.calls.append("start_tool_call")
        key = kw.get("idempotency_key")
        if key:
            for existing in self.tool_calls:
                if existing["idempotency_key"] == key:
                    return ToolCallStart(duplicate=True, tool_call=ToolCallRecord(**existing))
        record = {"id": len(self.tool_calls) + 1, "action_slug": kw["action_slug"], "kind": kw.get("kind") or "internal", "status": "running", "result": None, "error": None, "attempt": kw.get("attempt", 1), "idempotency_key": key, "confirmed_complete": False, "needs_reconciliation": False, "_delegation_id": kw.get("delegation_id")}
        self.tool_calls.append(record)
        return ToolCallStart(duplicate=False, tool_call=ToolCallRecord(**{k: v for k, v in record.items() if not k.startswith("_")}))

    async def finish_tool_call(self, tool_call_id: int, **kw: Any) -> ToolCallRecord:
        self.calls.append("finish_tool_call")
        record = self.tool_calls[tool_call_id - 1]
        record.update(status=kw["status"], result=kw.get("result"), error=kw.get("error"))
        record["confirmed_complete"] = kw["status"] == "succeeded"
        record["needs_reconciliation"] = kw["status"] == "timeout" and record["action_slug"] in self.durable
        return ToolCallRecord(**{k: v for k, v in record.items() if not k.startswith("_")})

    # delegations
    async def start_delegation(self, call_id: int, *, sequence: int, transcript_delta: str, is_finalization: bool = False) -> DelegationRecord:
        self.calls.append("start_delegation")
        if any(d["sequence"] == sequence for d in self.delegations):
            raise Conflict(f"Delegation {sequence} already exists on this call.", status=409)
        record = {"id": len(self.delegations) + 1, "sequence": sequence, "transcript_delta": transcript_delta, "status": "running", "reply": None, "is_finalization": is_finalization}
        self.delegations.append(record)
        return DelegationRecord(id=record["id"], sequence=sequence, status="running")

    async def finish_delegation(self, call_id: int, delegation_id: int, *, status: str, reply: str | None = None, error: str | None = None, duration_ms: int | None = None) -> DelegationOutcome:
        self.calls.append("finish_delegation")
        record = self.delegations[delegation_id - 1]
        record.update(status=status, reply=reply, error=error)
        failed = status != "completed" or not (reply or "").strip()
        durable = any(t["_delegation_id"] == delegation_id and t["status"] == "succeeded" and t["action_slug"] in self.durable for t in self.tool_calls)
        return DelegationOutcome(id=delegation_id, status=status, failed=failed, completed_durable_write=durable)

    # reads
    async def skill(self, slug: str, *, version: int | None = None) -> SkillDocument:
        self.calls.append(f"skill:{slug}")
        if slug not in self.skills:
            raise NotFound(f"no skill {slug}", status=404)
        return SkillDocument(slug=slug, name=slug.title(), description="d", version=version or 1, markdown=self.skills[slug])

    async def search_knowledge(self, query: str, *, limit: int = 8) -> KnowledgeResult:
        self.calls.append("search_knowledge")
        if "evanston" in query.lower():
            return KnowledgeResult(query=query, results=[KnowledgeHit(document_id=1, document="Service area", position=1, score=1, excerpt="Evanston is inside the area.", content="Evanston is inside the area.")])
        return KnowledgeResult(query=query, results=[])

    def _seen(self, method: str, kw: dict[str, Any]) -> None:
        self.calls.append(method)
        self.requests.append((method, kw))
        if self.fail_with is not None:
            error, self.fail_with = self.fail_with, None
            raise error

    async def lookup_contact(self, **kw: Any) -> ContactLookup:
        self._seen("lookup_contact", kw)
        if kw.get("name") == "tom" and not kw.get("acting_for"):
            return ContactLookup(found=False, matched_by="name", matches=[
                ContactRecord(id=1, name="Tom Byrne", phone="+17735550111"), ContactRecord(id=2, name="Tomasz Nowak"),
            ])
        if kw.get("email") == "tom@example.test" and kw.get("acting_for"):
            return ContactLookup(found=True, matched_by="email", linked=False, masked=True, contact=ContactRecord(id=1, name="Tom Byrne", phone="•••0111", email="t•••@example.test"))
        if kw.get("contact_id"):
            return ContactLookup(found=True, matched_by="id", linked=bool(kw.get("acting_for")), contact=ContactRecord(id=int(kw["contact_id"]), name="Tom Byrne", phone="+17735550111"),
                                 open_tickets=[{"id": 1, "reference": "#1", "subject": "Grinding noise", "status": "open"}])
        return ContactLookup(found=False, identifier={"id": 3, "type": "phone", "value": kw.get("phone") or "+1"})

    async def contact_history(self, contact_id: int, **kw: Any) -> ContactHistory:
        self._seen("contact_history", {"contact_id": contact_id, **kw})
        return ContactHistory.model_validate({
            "contact": {"id": contact_id, "name": "Tom Byrne"},
            "conversations": [{"id": 9, "channel": "call", "status": "open", "current": True, "messages": [{"from": "customer", "body": "The heat is out."}]}],
            "calls": [{"at": "2026-09-30T10:00:00Z", "direction": "inbound", "duration": "2:10", "summary": "Reported no heat."}],
            "tickets": [{"reference": "#1", "subject": "No heat", "status": "open"}],
        })

    async def ticket(self, number: int, **kw: Any) -> TicketDetail:
        self._seen("ticket", {"number": number, **kw})
        if number != 1:
            raise NotFound(f"There is no ticket #{number} on this customer's record.", status=404)
        return TicketDetail(id=1, number=1, reference="#1", subject="No heat", status="pending", assignees=["Sam Rivera"], last_activity={"description": "Agent added a note", "at": "2026-10-01T09:00:00Z"})

    async def update_ticket(self, number: int, **kw: Any) -> TicketUpdate:
        self._seen("update_ticket", {"number": number, **kw})
        status = kw.get("status") or "open"
        changes = [f"status Pending to {status.title()}"] if kw.get("status") else ["note added"]
        return TicketUpdate(changes=changes, ticket=TicketDetail(id=1, number=number, reference=f"#{number}", subject="No heat", status=status, assignees=["Sam Rivera"]))

    async def link_contact(self, conversation_id: int, **kw: Any) -> ContactLinked:
        self._seen("link_contact", {"conversation_id": conversation_id, **kw})
        return ContactLinked(linked=True, mode="identifier", contact=ContactRecord(id=1, name="Tom Byrne"))

    async def add_contact_note(self, contact_id: int, body: str, **kw: Any) -> NoteRecord:
        self._seen("add_contact_note", {"contact_id": contact_id, "body": body, **kw})
        self.notes.append({"subject": "contact", "id": contact_id, "body": body})
        return NoteRecord(id=len(self.notes), subject="contact", subject_id=contact_id, body=body)

    async def add_conversation_note(self, conversation_id: int, body: str, **kw: Any) -> NoteRecord:
        self._seen("add_conversation_note", {"conversation_id": conversation_id, "body": body, **kw})
        self.notes.append({"subject": "conversation", "id": conversation_id, "body": body})
        return NoteRecord(id=len(self.notes), subject="conversation", subject_id=conversation_id, body=body)

    async def summarize_conversation(self, conversation_id: int, **kw: Any) -> ConversationWrapUp:
        self._seen("summarize_conversation", {"conversation_id": conversation_id, **kw})
        return ConversationWrapUp(summarized=bool(kw.get("summary")), tags_added=kw.get("tags") or [], tags=kw.get("tags") or [])

    async def set_reminder(self, conversation_id: int, **kw: Any) -> ReminderRecord:
        self._seen("set_reminder", {"conversation_id": conversation_id, **kw})
        matched = (kw.get("teammate") == "Sam") if kw.get("teammate") else None
        return ReminderRecord.model_validate({"id": 1, "text": kw["text"], "due_at": kw.get("due_at") or "2026-10-02T12:00:00+00:00", "for": "Sam Rivera" if matched else None, "teammate_matched": matched})

    async def hand_off(self, conversation_id: int, **kw: Any) -> HandoffResult:
        self._seen("hand_off", {"conversation_id": conversation_id, **kw})
        matched = kw.get("teammate") == "Sam"
        return HandoffResult(handed_off=True, assigned_to=["Sam Rivera"] if matched else [], notified=["Sam Rivera"] if matched else ["Ada Owner"], teammate_matched=matched if kw.get("teammate") else None, tag="Needs attention")

    async def save_lead(self, **kw: Any) -> LeadSaved:
        self._seen("save_lead", kw)
        return LeadSaved(created=True, lead={"id": 1, "contact_id": kw.get("contact_id") or 1, "pipeline": "Sales", "stage": kw.get("stage") or "New"})

    async def recent_calls(self, **kw: Any) -> list:
        from app_sdk.models import CallSummary

        self._seen("recent_calls", kw)
        return [CallSummary(id=41, at="2026-09-26T19:10:00Z", direction="inbound", contact="Maria Delgado", duration="2:18", status="completed", summary="Booked furnace repair for tomorrow.")]

    async def tickets(self, **kw: Any) -> list:
        self._seen("tickets", kw)
        return [TicketRecord(id=1, number=1, reference="#1", subject="Confirm Thursday booking", status="open", assignees=["Ada"])]

    # writes
    async def create_contact(self, **kw: Any) -> ContactSaved:
        self._seen("create_contact", kw)
        for existing in self.contacts.values():
            if (kw.get("phone") and existing["phone"] == kw["phone"]) or (kw.get("email") and existing["email"] == kw["email"]):
                return ContactSaved(created=False, reason="matched", conversation_linked=bool(kw.get("acting_for")), contact=ContactRecord(**existing))
        cid = len(self.contacts) + 1
        name = kw.get("name")
        self.contacts[cid] = {"id": cid, "name": name, "display_name": name or "", "phone": kw.get("phone"), "email": kw.get("email"), "company": kw.get("company")}
        return ContactSaved(created=True, conversation_linked=bool(kw.get("acting_for")), contact=ContactRecord(**self.contacts[cid]))

    async def update_contact(self, contact_id: int, *, acting_for: int | None = None, **fields: Any) -> ContactRecord:
        self._seen("update_contact", {"contact_id": contact_id, "acting_for": acting_for, **fields})
        self.contacts.setdefault(contact_id, {"id": contact_id, "name": "Tom Byrne"}).update(fields)
        return ContactRecord(**self.contacts[contact_id])

    async def create_ticket(self, **kw: Any) -> tuple[TicketRecord, bool]:
        self._seen("create_ticket", kw)
        if self.delay:
            await asyncio.sleep(self.delay)
        key = kw.get("idempotency_key")
        for t in self.created_tickets:
            if key and t["idempotency_key"] == key:
                return TicketRecord(**t["record"]), False
        number = len(self.created_tickets) + 1
        record = {"id": number, "number": number, "reference": f"#{number}", "subject": kw["subject"], "status": "open", "assignees": ["Ada"]}
        self.created_tickets.append({"idempotency_key": key, "record": record, "call_id": kw.get("call_id"), "conversation_id": kw.get("conversation_id"), "acting_for": kw.get("acting_for"), "contact_id": kw.get("contact_id")})
        return TicketRecord(**record), True

    async def send_message(self, **kw: Any) -> MessageRecord:
        self.calls.append("send_message")
        self.messages.append(kw)
        return MessageRecord(id=len(self.messages), conversation_id=kw.get("conversation_id") or 9, channel=kw["channel"], status="queued", to="+17735550111")

    async def remember(self, name: str, content: str) -> None:
        self.memories[name] = content
