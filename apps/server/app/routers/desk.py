"""Veyra Desk — the client CRM (v2).

A clean, AI first view over the same data the platform runs on. The inbox is
built from real telephony Calls and SmsMessages; contacts, leads (in pipelines
with stages and sources), tickets (with types and assignee stacks), notes, and
reminders sit on top. The dashboard frames everything around what the AI agent
handled. On first run a sample dataset is seeded (see db.seed_desk) so the
product is demoable before a phone line is live.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import (
    Call,
    Contact,
    Conversation,
    EmailMessage,
    FaxMessage,
    Lead,
    Note,
    PhoneNumber,
    Pipeline,
    Reminder,
    SmsMessage,
    TeamMember,
    Ticket,
    CONTACT_STAGES,
    LEAD_SOURCES,
    TICKET_STATUSES,
    get_session,
    new_id,
    now,
)

logger = logging.getLogger("voice-agent.desk")

router = APIRouter(prefix="/api/desk", tags=["desk"])


# ── helpers ──────────────────────────────────────────────────────────────────
def _members_map(session: Session) -> dict[str, dict]:
    out = {}
    for m in session.exec(select(TeamMember)).all():
        out[m.id] = {"id": m.id, "name": m.name, "initials": m.initials, "color": m.color, "role": m.role}
    return out


def _assignees(ids_json: str, mmap: dict) -> list[dict]:
    try:
        ids = json.loads(ids_json or "[]")
    except Exception:
        ids = []
    return [mmap[i] for i in ids if i in mmap]


def _as_naive(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _call_peer(c: Call) -> str:
    return c.from_number if c.direction == "inbound" else c.to_number


def _peer_contact(session: Session, peer: str) -> Contact | None:
    """A thread peer is a phone number, or an email address for mail threads."""
    if "@" in peer:
        return session.exec(select(Contact).where(Contact.email == peer.lower())).first()
    return session.exec(select(Contact).where(Contact.phone == peer)).first()


def _ensure_conv(session: Session, peer: str, contact_id: str | None, last_at: str) -> Conversation:
    """Upsert the assignment/status row for a thread, backfilling for real
    (non seeded) conversations the first time they appear in the inbox."""
    conv = session.exec(select(Conversation).where(Conversation.peer == peer)).first()
    if conv is None:
        conv = Conversation(id=new_id("cv"), peer=peer, contact_id=contact_id, status="open")
        try:
            conv.last_at = datetime.fromisoformat(last_at) if last_at else now()
        except Exception:
            conv.last_at = now()
        session.add(conv)
        session.commit()
        session.refresh(conv)
    return conv


def _conv_meta(conv: Conversation, mmap: dict) -> dict:
    return {
        "status": conv.status,
        "is_favorite": bool(conv.is_favorite),
        "created_at": conv.created_at.isoformat(),
        "assignees": _assignees(conv.assignee_ids_json, mmap),
    }


def _contact_out(c: Contact) -> dict:
    return {
        "id": c.id,
        "name": c.name or c.phone or c.email or "Unknown",
        "phone": c.phone,
        "email": c.email,
        "company": c.company,
        "stage": c.stage,
        "source": c.source,
        "owner": c.owner,
        "value": c.value,
        "notes": c.notes,
        "tags": json.loads(c.tags_json or "[]"),
        "last_contact_at": (c.last_contact_at or c.created_at).isoformat(),
        "created_at": c.created_at.isoformat(),
    }


def _ticket_out(t: Ticket, mmap: dict, contact_name: str | None = None) -> dict:
    return {
        "id": t.id,
        "subject": t.subject,
        "body": t.body,
        "status": t.status,
        "priority": t.priority,
        "type": t.type,
        "contact_id": t.contact_id,
        "contact_name": contact_name,
        "channel": t.channel,
        "assignees": _assignees(t.assignee_ids_json, mmap),
        "creator": t.creator,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


def _stage_color(pipeline: Pipeline | None, stage: str) -> str:
    if pipeline:
        for st in pipeline.stages:
            if st.get("name") == stage:
                return st.get("color", "#94a3b8")
    return "#94a3b8"


def _lead_out(l: Lead, contact: Contact | None, pipeline: Pipeline | None, mmap: dict) -> dict:
    return {
        "id": l.id,
        "contact_id": l.contact_id,
        "name": (contact.name or contact.phone or contact.email) if contact else "Unknown",
        "outreach_note": l.outreach_note,
        "pipeline_id": l.pipeline_id,
        "pipeline_name": pipeline.name if pipeline else "",
        "stage": l.stage,
        "stage_color": _stage_color(pipeline, l.stage),
        "source": l.source,
        "assignees": _assignees(l.assignee_ids_json, mmap),
        "next_response_at": l.next_response_at.isoformat() if l.next_response_at else None,
        "value": l.value,
        "created_at": l.created_at.isoformat(),
    }


def _note_out(n: Note) -> dict:
    return {"id": n.id, "contact_id": n.contact_id, "body": n.body, "author": n.author, "created_at": n.created_at.isoformat()}


def _reminder_out(r: Reminder) -> dict:
    return {"id": r.id, "contact_id": r.contact_id, "text": r.text, "done": r.done,
            "due_at": r.due_at.isoformat() if r.due_at else None, "created_at": r.created_at.isoformat()}


def _err(code: int, msg: str):
    return HTTPException(code, msg)


def _last_activity_map(session: Session) -> dict[str, dict]:
    """contact_id → {kind, at} for the most recent real touch on any channel.
    Built once per request so a contact list can show what actually happened
    instead of falling back to the row's creation date."""
    contacts = session.exec(select(Contact)).all()
    by_phone = {c.phone: c.id for c in contacts if c.phone}
    by_email = {c.email.lower(): c.id for c in contacts if c.email}
    out: dict[str, dict] = {}

    def touch(cid: str | None, kind: str, at) -> None:
        if not cid or at is None:
            return
        cur = out.get(cid)
        naive = _as_naive(at)
        if cur is None or naive > _as_naive(cur["at"]):
            out[cid] = {"kind": kind, "at": naive}

    for c in session.exec(select(Call)).all():
        touch(by_phone.get(_call_peer(c)), "call", c.created_at)
    for m in session.exec(select(SmsMessage)).all():
        touch(by_phone.get(m.counterparty), "sms", m.created_at)
    for e in session.exec(select(EmailMessage)).all():
        touch(by_email.get((e.counterparty or "").lower()), "email", e.created_at)
    for f in session.exec(select(FaxMessage)).all():
        touch(by_phone.get(f.counterparty), "fax", f.created_at)

    return {k: {"kind": v["kind"], "at": v["at"].isoformat()} for k, v in out.items()}


# ── team + pipelines + reference data ────────────────────────────────────────
_MEMBER_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#16a34a", "#ea580c", "#4f46e5", "#0d9488"]
_MEMBER_ROLES = ("admin", "agent", "ai")


def _initials(name: str) -> str:
    parts = [p for p in name.replace(".", " ").split() if p]
    return ("".join(p[0] for p in parts[:2]) or "?").upper()


@router.get("/team")
def team(session: Session = Depends(get_session)):
    return list(_members_map(session).values())


class MemberIn(BaseModel):
    name: str
    role: str = "agent"
    phone: str = ""
    extension: str = ""
    color: str = ""


@router.post("/team")
def create_member(req: MemberIn, session: Session = Depends(get_session)):
    """Add a teammate. They become assignable in the inbox and on tickets, and
    a transfer target for calls once they have a phone or extension."""
    name = req.name.strip()
    if not name:
        raise _err(422, "A team member needs a name.")
    role = req.role if req.role in _MEMBER_ROLES else "agent"
    existing = session.exec(select(TeamMember)).all()
    m = TeamMember(
        id=new_id("tm"),
        name=name,
        initials=_initials(name),
        color=req.color or _MEMBER_COLORS[len(existing) % len(_MEMBER_COLORS)],
        role=role,
        phone=req.phone.strip(),
        extension=req.extension.strip(),
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return _members_map(session)[m.id]


class MemberPatch(BaseModel):
    name: str | None = None
    role: str | None = None
    phone: str | None = None
    extension: str | None = None
    color: str | None = None


@router.patch("/team/{member_id}")
def update_member(member_id: str, patch: MemberPatch, session: Session = Depends(get_session)):
    m = session.get(TeamMember, member_id)
    if m is None:
        raise _err(404, "Team member not found.")
    if patch.name is not None:
        name = patch.name.strip()
        if not name:
            raise _err(422, "A team member needs a name.")
        m.name = name
        m.initials = _initials(name)
    if patch.role is not None and patch.role in _MEMBER_ROLES:
        m.role = patch.role
    if patch.phone is not None:
        m.phone = patch.phone.strip()
    if patch.extension is not None:
        m.extension = patch.extension.strip()
    if patch.color:
        m.color = patch.color
    session.add(m)
    session.commit()
    session.refresh(m)
    return _members_map(session)[m.id]


@router.delete("/team/{member_id}")
def delete_member(member_id: str, session: Session = Depends(get_session)):
    """Remove a teammate and hand their work back to the unassigned queue, so
    nothing is silently orphaned on a conversation or ticket nobody can see."""
    m = session.get(TeamMember, member_id)
    if m is None:
        raise _err(404, "Team member not found.")
    if m.role == "admin" and sum(1 for x in session.exec(select(TeamMember)).all() if x.role == "admin") <= 1:
        raise _err(409, "This is the last admin. Promote someone else before removing them.")

    unassigned = 0
    for conv in session.exec(select(Conversation)).all():
        ids = json.loads(conv.assignee_ids_json or "[]")
        if member_id in ids:
            conv.assignee_ids_json = json.dumps([i for i in ids if i != member_id])
            conv.updated_at = now()
            session.add(conv)
            unassigned += 1
    for t in session.exec(select(Ticket)).all():
        ids = json.loads(t.assignee_ids_json or "[]")
        if member_id in ids:
            t.assignee_ids_json = json.dumps([i for i in ids if i != member_id])
            t.updated_at = now()
            session.add(t)
            unassigned += 1
    session.delete(m)
    session.commit()
    return {"ok": True, "unassigned": unassigned}


@router.get("/pipelines")
def pipelines(session: Session = Depends(get_session)):
    rows = session.exec(select(Pipeline)).all()
    return [{"id": p.id, "name": p.name, "stages": p.stages, "is_default": p.is_default} for p in rows]


@router.get("/meta")
def meta(session: Session = Depends(get_session)):
    """Reference data the UI needs to render pickers: stages, statuses, sources, types."""
    types = sorted({t.type for t in session.exec(select(Ticket)).all() if t.type})
    default_types = ["Appointment Update", "Billing Question", "Medication", "General", "New Appointment"]
    return {
        "contact_stages": CONTACT_STAGES,
        "ticket_statuses": TICKET_STATUSES,
        "ticket_types": sorted(set(types) | set(default_types)),
        "lead_sources": LEAD_SOURCES,
    }


@router.get("/tags")
def tags(session: Session = Depends(get_session)):
    seen: dict[str, int] = {}
    for c in session.exec(select(Contact)).all():
        for t in json.loads(c.tags_json or "[]"):
            seen[t] = seen.get(t, 0) + 1
    return [{"name": k, "count": v} for k, v in sorted(seen.items(), key=lambda x: -x[1])]


# ── dashboard (AI first) ─────────────────────────────────────────────────────
@router.get("/dashboard")
def dashboard(session: Session = Depends(get_session)):
    """Every figure here is counted from real rows — calls, messages, emails,
    faxes, tickets. Nothing is modelled or extrapolated: a quiet workspace
    reports zeros rather than a plausible-looking curve. `sample` flags that
    the only activity on record is the seeded demo data."""
    contacts = session.exec(select(Contact)).all()
    tickets = session.exec(select(Ticket)).all()
    leads = session.exec(select(Lead)).all()
    calls = session.exec(select(Call)).all()
    sms = session.exec(select(SmsMessage)).all()
    emails = session.exec(select(EmailMessage)).all()
    faxes = session.exec(select(FaxMessage)).all()
    convs = session.exec(select(Conversation)).all()

    # who owns each thread: a human assignee means the team handled it, an
    # empty assignee list means the agent carried it alone
    team_peers = {c.peer for c in convs if json.loads(c.assignee_ids_json or "[]")}
    agent_only_peers = {c.peer for c in convs} - team_peers

    def peer_of(row, kind: str) -> str:
        if kind == "call":
            return _call_peer(row)
        return row.counterparty or ""

    # ── 30-day activity, agent-handled vs team-handled, from real timestamps ──
    today = _as_naive(now()).replace(hour=0, minute=0, second=0, microsecond=0)
    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    buckets: dict[str, dict] = {d.strftime("%Y-%m-%d"): {"ai": 0, "team": 0} for d in days}

    events: list[tuple] = (
        [(c.created_at, peer_of(c, "call")) for c in calls]
        + [(m.created_at, peer_of(m, "sms")) for m in sms]
        + [(e.created_at, peer_of(e, "email")) for e in emails]
        + [(f.created_at, peer_of(f, "fax")) for f in faxes]
    )
    for at, peer in events:
        key = _as_naive(at).strftime("%Y-%m-%d")
        b = buckets.get(key)
        if b is None:
            continue
        b["team" if peer in team_peers else "ai"] += 1

    series = [
        {"date": d.strftime("%b %d"), "ai": buckets[d.strftime("%Y-%m-%d")]["ai"],
         "team": buckets[d.strftime("%Y-%m-%d")]["team"]}
        for d in days
    ]
    ai_sum = sum(p["ai"] for p in series)
    team_sum = sum(p["team"] for p in series)
    handled_pct = round(ai_sum / max(ai_sum + team_sum, 1) * 100) if (ai_sum + team_sum) else 0

    # ── real operational counts ──
    inbound_calls = [c for c in calls if c.direction == "inbound"]
    answered = [c for c in inbound_calls if c.status == "completed"]
    missed = [c for c in inbound_calls if c.status in ("no-answer", "busy", "failed", "canceled")]
    talk_seconds = sum(c.duration_sec for c in calls)
    agent_calls = [c for c in calls if c.room]  # the LiveKit agent held the line
    inbound_msgs = sum(1 for m in sms if m.direction == "inbound")
    outbound_msgs = sum(1 for m in sms if m.direction == "outbound")
    inbound_email = sum(1 for e in emails if e.direction == "inbound")
    unread_email = sum(1 for e in emails if e.unread)
    ai_tickets = sum(1 for t in tickets if (t.creator or "").lower().startswith("vera"))
    open_tickets = sum(1 for t in tickets if t.status in ("open", "in_progress", "pending"))

    # busiest number, by real call + message volume
    numbers = session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).all()
    by_number: dict[str, int] = {}
    for c in calls:
        if c.number_id:
            by_number[c.number_id] = by_number.get(c.number_id, 0) + 1
    for m in sms:
        if m.number_id:
            by_number[m.number_id] = by_number.get(m.number_id, 0) + 1
    top_id = max(by_number, key=by_number.get) if by_number else None
    top_num = next((n for n in numbers if n.id == top_id), None) or (numbers[0] if numbers else None)
    most_active = (top_num.friendly_name or top_num.e164) if top_num else "No number yet"

    demo_only = all(c.provider == "demo" for c in calls) if calls else True

    return {
        "top": {
            "ai_managed_pct": handled_pct,
            "support_volume": len(events),
            "most_active_number": most_active,
            "inbound_events": len(inbound_calls) + inbound_msgs + inbound_email + sum(1 for f in faxes if f.direction == "inbound"),
            "leads": len(leads),
        },
        "ai": {
            "calls_handled": len(agent_calls),
            "talk_minutes": round(talk_seconds / 60),
            "tickets_by_ai": ai_tickets,
            "contacts_in_ai": len(agent_only_peers),
            "answered_pct": round(len(answered) / max(len(inbound_calls), 1) * 100) if inbound_calls else 0,
            "missed_calls": len(missed),
        },
        "productivity": {
            "managed": ai_sum,
            "total": ai_sum + team_sum,
            "series": series,
        },
        "handled": {
            "ai_pct": handled_pct,
            "team_pct": 100 - handled_pct if (ai_sum + team_sum) else 0,
            "open_tickets": open_tickets,
            "tool_actions": sum(1 for t in tickets if t.channel in ("form", "email")),
        },
        "channels": {
            "calls": len(calls),
            "sms_in": inbound_msgs,
            "sms_out": outbound_msgs,
            "email": len(emails),
            "email_unread": unread_email,
            "fax": len(faxes),
        },
        "counts": {
            "contacts": len(contacts),
            "tickets": len(tickets),
            "leads": len(leads),
            "open_tickets": open_tickets,
        },
        "sample": demo_only,
    }


# ── contacts (paginated) ─────────────────────────────────────────────────────
@router.get("/contacts")
def list_contacts(
    page: int = 1, per_page: int = 15, q: str = "", stage: str = "", source: str = "",
    sort: str = "newest", session: Session = Depends(get_session),
):
    rows = session.exec(select(Contact)).all()
    ql = q.lower().strip()
    rows = [
        c for c in rows
        if (not stage or c.stage == stage)
        and (not source or c.source == source)
        and (not ql or ql in f"{c.name} {c.phone} {c.email} {c.company}".lower())
    ]

    # real last activity per contact: the newest thing on any of their threads,
    # so the list reflects conversations rather than the row's creation date
    activity = _last_activity_map(session)

    def last_at(c: Contact):
        a = activity.get(c.id)
        return _as_naive(a["at"]) if a else _as_naive(c.last_contact_at or c.created_at)

    if sort == "name":
        rows.sort(key=lambda c: (c.name or "").lower())
    elif sort == "activity":
        rows.sort(key=last_at, reverse=True)
    else:
        rows.sort(key=lambda c: _as_naive(c.created_at), reverse=True)

    total = len(rows)
    per_page = max(1, min(per_page, 100))
    page = max(1, page)
    start = (page - 1) * per_page
    return {
        "rows": [
            {**_contact_out(c), "activity": activity.get(c.id)}
            for c in rows[start:start + per_page]
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


class ContactIn(BaseModel):
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    email: str = ""
    company: str = ""
    stage: str = "new"
    source: str = "Manual"
    owner: str = ""
    value: int = 0
    notes: str = ""
    tags: list[str] = []


@router.post("/contacts")
def create_contact(req: ContactIn, session: Session = Depends(get_session)):
    name = req.name or f"{req.first_name} {req.last_name}".strip()
    c = Contact(
        id=new_id("ct"), name=name, phone=req.phone, email=req.email, company=req.company,
        stage=req.stage if req.stage in CONTACT_STAGES else "new", source=req.source or "Manual",
        owner=req.owner, value=req.value, notes=req.notes, tags_json=json.dumps(req.tags or []),
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    return _contact_out(c)


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: str, session: Session = Depends(get_session)):
    c = session.get(Contact, contact_id)
    if not c:
        raise _err(404, "Contact not found")
    mmap = _members_map(session)
    out = _contact_out(c)

    activity: list[dict] = []
    if c.phone:
        for m in session.exec(select(SmsMessage).where(SmsMessage.counterparty == c.phone)).all():
            activity.append({"kind": "sms", "direction": m.direction, "text": m.body, "at": m.created_at.isoformat()})
        for call in session.exec(select(Call)).all():
            if _call_peer(call) == c.phone:
                activity.append({"kind": "call", "direction": call.direction, "text": f"{call.direction} call · {call.status}", "at": call.created_at.isoformat()})
    for n in session.exec(select(Note).where(Note.contact_id == contact_id)).all():
        activity.append({"kind": "note", "direction": "", "text": n.body, "at": n.created_at.isoformat()})
    activity.sort(key=lambda x: x["at"], reverse=True)

    tickets = session.exec(select(Ticket).where(Ticket.contact_id == contact_id)).all()
    notes = session.exec(select(Note).where(Note.contact_id == contact_id)).all()
    reminders = session.exec(select(Reminder).where(Reminder.contact_id == contact_id)).all()
    leads = session.exec(select(Lead).where(Lead.contact_id == contact_id)).all()
    pmap = {p.id: p for p in session.exec(select(Pipeline)).all()}

    out["activity"] = activity
    out["tickets"] = [_ticket_out(t, mmap, c.name) for t in tickets]
    out["notes"] = [_note_out(n) for n in notes]
    out["reminders"] = [_reminder_out(r) for r in reminders]
    out["leads"] = [_lead_out(l, c, pmap.get(l.pipeline_id), mmap) for l in leads]
    return out


class ContactPatch(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    stage: str | None = None
    owner: str | None = None
    value: int | None = None
    notes: str | None = None
    tags: list[str] | None = None


@router.patch("/contacts/{contact_id}")
def update_contact(contact_id: str, patch: ContactPatch, session: Session = Depends(get_session)):
    c = session.get(Contact, contact_id)
    if not c:
        raise _err(404, "Contact not found")
    if patch.stage is not None and patch.stage in CONTACT_STAGES:
        c.stage = patch.stage
    for f in ("name", "email", "phone", "company", "owner", "notes"):
        v = getattr(patch, f)
        if v is not None:
            setattr(c, f, v)
    if patch.value is not None:
        c.value = patch.value
    if patch.tags is not None:
        c.tags_json = json.dumps(patch.tags)
    c.updated_at = now()
    session.add(c)
    session.commit()
    session.refresh(c)
    return _contact_out(c)


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: str, session: Session = Depends(get_session)):
    c = session.get(Contact, contact_id)
    if c:
        session.delete(c)
        session.commit()
    return {"ok": True}


# ── tickets ──────────────────────────────────────────────────────────────────
@router.get("/tickets")
def list_tickets(
    status: str = "", type: str = "", q: str = "", page: int = 1, per_page: int = 20,
    session: Session = Depends(get_session),
):
    mmap = _members_map(session)
    cmap = {c.id: c for c in session.exec(select(Contact)).all()}
    rows = session.exec(select(Ticket).order_by(Ticket.created_at.desc())).all()
    ql = q.lower().strip()
    rows = [
        t for t in rows
        if (not status or t.status == status)
        and (not type or t.type == type)
        and (not ql or ql in (t.subject or "").lower())
    ]
    total = len(rows)
    per_page = max(1, min(per_page, 100))
    start = (max(1, page) - 1) * per_page
    out = []
    for t in rows[start:start + per_page]:
        c = cmap.get(t.contact_id)
        d = _ticket_out(t, mmap, c.name if c else None)
        d["contact_phone"] = c.phone if c else None
        out.append(d)
    return {"rows": out, "total": total, "page": page, "per_page": per_page,
            "pages": max(1, (total + per_page - 1) // per_page),
            "status_counts": {s: sum(1 for t in session.exec(select(Ticket)).all() if t.status == s) for s in TICKET_STATUSES}}


class TicketIn(BaseModel):
    subject: str
    body: str = ""
    priority: str = "normal"
    type: str = ""
    contact_id: str | None = None
    channel: str = "manual"
    assignee_ids: list[str] = []


@router.post("/tickets")
def create_ticket(req: TicketIn, session: Session = Depends(get_session)):
    t = Ticket(
        id=new_id("tk"), subject=req.subject, body=req.body, priority=req.priority, type=req.type,
        contact_id=req.contact_id, channel=req.channel, assignee_ids_json=json.dumps(req.assignee_ids or []),
        creator="You",
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return _ticket_out(t, _members_map(session))


class TicketPatch(BaseModel):
    subject: str | None = None
    status: str | None = None
    priority: str | None = None
    type: str | None = None
    assignee_ids: list[str] | None = None


@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: str, patch: TicketPatch, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise _err(404, "Ticket not found")
    if patch.status is not None and patch.status in TICKET_STATUSES:
        t.status = patch.status
    for f in ("subject", "priority", "type"):
        v = getattr(patch, f)
        if v is not None:
            setattr(t, f, v)
    if patch.assignee_ids is not None:
        t.assignee_ids_json = json.dumps(patch.assignee_ids)
    t.updated_at = now()
    session.add(t)
    session.commit()
    session.refresh(t)
    c = session.get(Contact, t.contact_id) if t.contact_id else None
    return _ticket_out(t, _members_map(session), c.name if c else None)


# ── leads (pipelines + stages) ───────────────────────────────────────────────
@router.get("/leads")
def list_leads(
    pipeline_id: str = "", stage: str = "", source: str = "", q: str = "",
    session: Session = Depends(get_session),
):
    mmap = _members_map(session)
    cmap = {c.id: c for c in session.exec(select(Contact)).all()}
    pmap = {p.id: p for p in session.exec(select(Pipeline)).all()}
    rows = session.exec(select(Lead).order_by(Lead.created_at.desc())).all()
    ql = q.lower().strip()
    out = []
    for l in rows:
        if pipeline_id and l.pipeline_id != pipeline_id:
            continue
        if stage and l.stage != stage:
            continue
        if source and l.source != source:
            continue
        c = cmap.get(l.contact_id)
        if ql and c and ql not in (c.name or "").lower():
            continue
        out.append(_lead_out(l, c, pmap.get(l.pipeline_id), mmap))
    return out


class LeadIn(BaseModel):
    contact_id: str = ""
    name: str = ""
    phone: str = ""
    email: str = ""
    pipeline_id: str = ""
    stage: str = ""
    source: str = "Manual"
    assignee_ids: list[str] = []
    value: int = 0


@router.post("/leads")
def create_lead(req: LeadIn, session: Session = Depends(get_session)):
    contact_id = req.contact_id
    if not contact_id:
        c = Contact(id=new_id("ct"), name=req.name, phone=req.phone, email=req.email, source=req.source, stage="new")
        session.add(c)
        session.commit()
        session.refresh(c)
        contact_id = c.id
    pipeline = session.get(Pipeline, req.pipeline_id) if req.pipeline_id else session.exec(select(Pipeline).where(Pipeline.is_default == True)).first()  # noqa: E712
    if pipeline is None:
        pipeline = session.exec(select(Pipeline)).first()
    stage = req.stage or (pipeline.stages[0]["name"] if pipeline and pipeline.stages else "New")
    l = Lead(
        id=new_id("ld"), contact_id=contact_id, pipeline_id=pipeline.id if pipeline else "",
        stage=stage, source=req.source or "Manual", assignee_ids_json=json.dumps(req.assignee_ids or []),
        value=req.value,
    )
    session.add(l)
    session.commit()
    session.refresh(l)
    return _lead_out(l, session.get(Contact, contact_id), pipeline, _members_map(session))


class LeadPatch(BaseModel):
    stage: str | None = None
    source: str | None = None
    pipeline_id: str | None = None
    assignee_ids: list[str] | None = None
    value: int | None = None


@router.patch("/leads/{lead_id}")
def update_lead(lead_id: str, patch: LeadPatch, session: Session = Depends(get_session)):
    l = session.get(Lead, lead_id)
    if not l:
        raise _err(404, "Lead not found")
    if patch.stage is not None:
        l.stage = patch.stage
    if patch.source is not None:
        l.source = patch.source
    if patch.pipeline_id is not None:
        l.pipeline_id = patch.pipeline_id
    if patch.assignee_ids is not None:
        l.assignee_ids_json = json.dumps(patch.assignee_ids)
    if patch.value is not None:
        l.value = patch.value
    l.updated_at = now()
    session.add(l)
    session.commit()
    session.refresh(l)
    return _lead_out(l, session.get(Contact, l.contact_id), session.get(Pipeline, l.pipeline_id), _members_map(session))


@router.delete("/leads/{lead_id}")
def delete_lead(lead_id: str, session: Session = Depends(get_session)):
    l = session.get(Lead, lead_id)
    if l:
        session.delete(l)
        session.commit()
    return {"ok": True}


# ── notes + reminders ────────────────────────────────────────────────────────
class NoteIn(BaseModel):
    contact_id: str
    body: str


@router.post("/notes")
def create_note(req: NoteIn, session: Session = Depends(get_session)):
    n = Note(id=new_id("nt"), contact_id=req.contact_id, body=req.body, author="You")
    session.add(n)
    session.commit()
    session.refresh(n)
    return _note_out(n)


@router.delete("/notes/{note_id}")
def delete_note(note_id: str, session: Session = Depends(get_session)):
    n = session.get(Note, note_id)
    if n:
        session.delete(n)
        session.commit()
    return {"ok": True}


class ReminderIn(BaseModel):
    contact_id: str
    text: str
    due_at: str | None = None


@router.post("/reminders")
def create_reminder(req: ReminderIn, session: Session = Depends(get_session)):
    due = None
    if req.due_at:
        try:
            due = datetime.fromisoformat(req.due_at.replace("Z", "+00:00"))
        except Exception:
            due = None
    r = Reminder(id=new_id("rm"), contact_id=req.contact_id, text=req.text, due_at=due)
    session.add(r)
    session.commit()
    session.refresh(r)
    return _reminder_out(r)


@router.patch("/reminders/{reminder_id}")
def update_reminder(reminder_id: str, done: bool = True, session: Session = Depends(get_session)):
    r = session.get(Reminder, reminder_id)
    if not r:
        raise _err(404, "Reminder not found")
    r.done = done
    session.add(r)
    session.commit()
    session.refresh(r)
    return _reminder_out(r)


# ── inbox (unified conversations from telephony) ─────────────────────────────
@router.get("/inbox")
def inbox(
    assignee: str = "", status: str = "", channel: str = "", q: str = "",
    session: Session = Depends(get_session),
):
    """Unified conversations with assignment + status, filterable by owner
    (a team member id, or 'unassigned'), status, channel, and text."""
    mmap = _members_map(session)
    convos: dict[str, dict] = {}

    def bucket(peer: str) -> dict:
        key = peer or "unknown"
        if key not in convos:
            convos[key] = {"peer": key, "channels": set(), "count": 0, "last_text": "", "last_at": "", "last_kind": ""}
        return convos[key]

    for m in session.exec(select(SmsMessage).order_by(SmsMessage.created_at.asc())).all():
        b = bucket(m.counterparty)
        b["channels"].add("sms")
        b["count"] += 1
        b["last_text"] = (("You: " if m.direction == "outbound" else "") + m.body)[:90]
        b["last_at"] = m.created_at.isoformat()
        b["last_kind"] = "sms"
    for c in session.exec(select(Call).order_by(Call.created_at.asc())).all():
        peer = _call_peer(c)
        if not peer:
            continue
        b = bucket(peer)
        b["channels"].add("call")
        b["count"] += 1
        b["last_text"] = f"{c.direction.title()} call · {c.status}"
        b["last_at"] = c.created_at.isoformat()
        b["last_kind"] = "call"
    for e in session.exec(select(EmailMessage).order_by(EmailMessage.created_at.asc())).all():
        b = bucket(e.counterparty)
        b["channels"].add("email")
        b["count"] += 1
        b["last_text"] = (("You: " if e.direction == "outbound" else "") + (e.subject or e.snippet))[:90]
        b["last_at"] = e.created_at.isoformat()
        b["last_kind"] = "email"
        if e.unread:
            b["unread"] = b.get("unread", 0) + 1
    for f in session.exec(select(FaxMessage).order_by(FaxMessage.created_at.asc())).all():
        b = bucket(f.counterparty)
        b["channels"].add("fax")
        b["count"] += 1
        b["last_text"] = f"{f.direction.title()} fax · {f.pages or '?'} pages · {f.status}"
        b["last_at"] = f.created_at.isoformat()
        b["last_kind"] = "fax"

    all_contacts = session.exec(select(Contact)).all()
    cmap = {c.phone: c for c in all_contacts if c.phone}
    cmap.update({c.email.lower(): c for c in all_contacts if c.email})
    convmap = {cv.peer: cv for cv in session.exec(select(Conversation)).all()}
    ql = q.lower().strip()
    out = []
    for peer, b in convos.items():
        if peer == "unknown":
            continue
        contact = cmap.get(peer.lower() if "@" in peer else peer)
        conv = convmap.get(peer) or _ensure_conv(session, peer, contact.id if contact else None, b["last_at"])
        meta = _conv_meta(conv, mmap)
        assignee_ids = [a["id"] for a in meta["assignees"]]
        if status and conv.status != status:
            continue
        if channel and channel not in b["channels"]:
            continue
        if assignee == "unassigned" and assignee_ids:
            continue
        if assignee and assignee != "unassigned" and assignee not in assignee_ids:
            continue
        name = contact.name if contact else peer
        if ql and ql not in f"{name} {peer} {b['last_text']}".lower():
            continue
        out.append({
            "peer": peer,
            "contact": {"id": contact.id if contact else None, "name": name, "stage": contact.stage if contact else "new"},
            "channels": sorted(b["channels"]),
            "count": b["count"],
            "unread": b.get("unread", 0),
            "last_text": b["last_text"],
            "last_at": b["last_at"],
            "last_kind": b["last_kind"],
            "status": conv.status,
            "is_favorite": bool(conv.is_favorite),
            "created_at": conv.created_at.isoformat(),
            "assignees": meta["assignees"],
        })
    out.sort(key=lambda x: x["last_at"], reverse=True)
    return out


class ConvPatch(BaseModel):
    assignee_ids: list[str] | None = None
    status: str | None = None
    is_favorite: bool | None = None


def _apply_conv_patch(session: Session, peer: str, patch: ConvPatch) -> Conversation:
    contact = _peer_contact(session, peer)
    conv = _ensure_conv(session, peer, contact.id if contact else None, now().isoformat())
    if patch.assignee_ids is not None:
        conv.assignee_ids_json = json.dumps(patch.assignee_ids)
    if patch.status is not None and patch.status in ("open", "snoozed", "closed"):
        conv.status = patch.status
    if patch.is_favorite is not None:
        conv.is_favorite = patch.is_favorite
    conv.updated_at = now()
    session.add(conv)
    return conv


@router.patch("/conversations/{peer}")
def update_conversation(peer: str, patch: ConvPatch, session: Session = Depends(get_session)):
    conv = _apply_conv_patch(session, peer, patch)
    session.commit()
    session.refresh(conv)
    return {"peer": peer, **_conv_meta(conv, _members_map(session))}


class ConvBulk(BaseModel):
    """One operation across a selection of threads. Deliberately has no delete:
    a Veyra conversation is a derived view over real telephony and mailbox
    records, so 'delete the conversation' has no safe meaning here — archiving
    (status=closed) is the reversible equivalent."""

    peers: list[str]
    status: str | None = None
    is_favorite: bool | None = None
    assignee_ids: list[str] | None = None


@router.post("/conversations/bulk")
def bulk_conversations(req: ConvBulk, session: Session = Depends(get_session)):
    patch = ConvPatch(status=req.status, is_favorite=req.is_favorite, assignee_ids=req.assignee_ids)
    for peer in req.peers:
        _apply_conv_patch(session, peer, patch)
    session.commit()
    return {"ok": True, "updated": len(req.peers)}


@router.get("/workload")
def workload(session: Session = Depends(get_session)):
    """Per team member load: open tickets and active conversations they own, so a
    manager can see and balance the team at a glance."""
    mmap = _members_map(session)
    tickets = session.exec(select(Ticket)).all()
    convs = session.exec(select(Conversation)).all()
    open_ticket_states = ("open", "in_progress", "pending")

    rows = []
    for mid, m in mmap.items():
        my_tickets = [t for t in tickets if mid in json.loads(t.assignee_ids_json or "[]")]
        open_tickets = [t for t in my_tickets if t.status in open_ticket_states]
        my_convs = [c for c in convs if mid in json.loads(c.assignee_ids_json or "[]") and c.status == "open"]
        rows.append({
            **m,
            "open_tickets": len(open_tickets),
            "total_tickets": len(my_tickets),
            "conversations": len(my_convs),
            "load": len(open_tickets) + len(my_convs),
        })
    rows.sort(key=lambda r: r["load"], reverse=True)

    unassigned_tickets = sum(1 for t in tickets if not json.loads(t.assignee_ids_json or "[]") and t.status in open_ticket_states)
    unassigned_convs = sum(1 for c in convs if not json.loads(c.assignee_ids_json or "[]") and c.status == "open")
    return {
        "members": rows,
        "unassigned": {"tickets": unassigned_tickets, "conversations": unassigned_convs},
        "totals": {
            "open_tickets": sum(1 for t in tickets if t.status in open_ticket_states),
            "open_conversations": sum(1 for c in convs if c.status == "open"),
        },
    }


@router.get("/inbox/{peer}")
def conversation(peer: str, session: Session = Depends(get_session)):
    mmap = _members_map(session)
    timeline: list[dict] = []
    for m in session.exec(select(SmsMessage).where(SmsMessage.counterparty == peer)).all():
        timeline.append({"kind": "sms", "id": m.id, "direction": m.direction, "body": m.body,
                         "status": m.status, "error": m.error, "at": m.created_at.isoformat()})
    for c in session.exec(select(Call)).all():
        if _call_peer(c) != peer:
            continue
        timeline.append({"kind": "call", "id": c.id, "direction": c.direction, "status": c.status,
                         "duration_sec": c.duration_sec, "room": c.room,
                         "recording_url": c.recording_url, "at": c.created_at.isoformat()})
    for e in session.exec(select(EmailMessage).where(EmailMessage.counterparty == peer.lower())).all():
        timeline.append({
            "kind": "email", "id": e.id, "direction": e.direction,
            "from_addr": e.from_addr, "to_addr": e.to_addr, "provider": e.provider,
            "subject": e.subject, "snippet": e.snippet,
            "body_text": e.body_text, "body_html": e.body_html,
            "thread_external_id": e.thread_external_id,
            "status": e.status, "unread": e.unread, "error": e.error,
            "at": e.created_at.isoformat(),
        })
    for f in session.exec(select(FaxMessage).where(FaxMessage.counterparty == peer)).all():
        timeline.append({"kind": "fax", "id": f.id, "direction": f.direction,
                         "media_url": f.media_url, "pages": f.pages, "status": f.status,
                         "error": f.error, "at": f.created_at.isoformat()})
    timeline.sort(key=lambda x: x["at"])

    contact = _peer_contact(session, peer)
    sidebar = {"tickets": [], "notes": [], "reminders": [], "tags": []}
    if contact:
        sidebar["tickets"] = [_ticket_out(t, mmap, contact.name) for t in session.exec(select(Ticket).where(Ticket.contact_id == contact.id)).all()]
        sidebar["notes"] = [_note_out(n) for n in session.exec(select(Note).where(Note.contact_id == contact.id)).all()]
        sidebar["reminders"] = [_reminder_out(r) for r in session.exec(select(Reminder).where(Reminder.contact_id == contact.id)).all()]
        sidebar["tags"] = json.loads(contact.tags_json or "[]")

    last = timeline[-1]["at"] if timeline else now().isoformat()
    conv = _ensure_conv(session, peer, contact.id if contact else None, last)
    fallback = {"name": peer, "phone": "" if "@" in peer else peer, "email": peer.lower() if "@" in peer else ""}
    return {
        "peer": peer,
        "contact": _contact_out(contact) if contact else fallback,
        "timeline": timeline,
        "sidebar": sidebar,
        "conversation": _conv_meta(conv, mmap),
    }


@router.post("/inbox/{peer}/read")
def mark_read(peer: str, session: Session = Depends(get_session)):
    """Opening a thread clears its unread email dot."""
    changed = 0
    for e in session.exec(
        select(EmailMessage).where(EmailMessage.counterparty == peer.lower(), EmailMessage.unread == True)  # noqa: E712
    ).all():
        e.unread = False
        session.add(e)
        changed += 1
    if changed:
        session.commit()
    return {"ok": True, "marked": changed}


# ── public lead intake (forms / ads) ─────────────────────────────────────────
def _find_contact(session: Session, phone: str = "", email: str = "") -> Contact | None:
    if phone:
        c = session.exec(select(Contact).where(Contact.phone == phone)).first()
        if c:
            return c
    if email:
        c = session.exec(select(Contact).where(Contact.email == email)).first()
        if c:
            return c
    return None


class LeadIntake(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    company: str = ""
    message: str = ""
    source: str = "form"
    tags: list[str] = []


@router.post("/leads/intake")
def lead_intake(req: LeadIntake, session: Session = Depends(get_session)):
    if not (req.email or req.phone or req.name):
        raise _err(422, "A lead needs at least a name, email, or phone.")
    c = _find_contact(session, req.phone, req.email)
    created = False
    if c is None:
        c = Contact(id=new_id("ct"), phone=req.phone, email=req.email, name=req.name,
                    company=req.company, source=req.source or "form", stage="new")
        created = True
    if req.name and not c.name:
        c.name = req.name
    if req.tags:
        existing = set(json.loads(c.tags_json or "[]"))
        c.tags_json = json.dumps(sorted(existing | set(req.tags)))
    c.last_contact_at = now()
    session.add(c)
    session.commit()
    session.refresh(c)

    # place them in the default pipeline as a fresh lead
    pipeline = session.exec(select(Pipeline).where(Pipeline.is_default == True)).first()  # noqa: E712
    if pipeline and created:
        stages = pipeline.stages
        session.add(Lead(id=new_id("ld"), contact_id=c.id, pipeline_id=pipeline.id,
                         stage=stages[0]["name"] if stages else "New", source=req.source or "form",
                         outreach_note="New lead from intake"))
        session.commit()

    ticket_id = None
    if req.message.strip():
        t = Ticket(id=new_id("tk"), subject=f"New lead from {req.source} — {c.name or c.email or c.phone}",
                   body=req.message, contact_id=c.id, channel="form", priority="normal",
                   type="New Appointment", creator="Veyra AI")
        session.add(t)
        session.commit()
        ticket_id = t.id

    try:
        from ..publicapi import webhooks as out_hooks

        out_hooks.emit("lead.created", {"object": "contact", "id": c.id, "source": req.source})
    except Exception:
        pass
    return {"ok": True, "contact_id": c.id, "ticket_id": ticket_id}
