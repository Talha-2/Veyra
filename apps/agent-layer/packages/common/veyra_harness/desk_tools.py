"""The front-desk tools: what the worker does to the business's own records.

Contacts, tickets, the conversation itself and leads, each one AppSdk call
(``docs/agent-contract.md``). The app enforces the rules; these handlers turn
each answer into a short factual line the model can act on, and turn every
refusal into a sentence it can say to the customer.

**Acting for a customer.** On a call or a live chat every request carries the
conversation it acts for (``X-Veyra-Conversation``), and the app then limits
reads and writes to that conversation's customer: someone else's record comes
back masked, someone else's ticket does not exist, an edit to another person
is refused. Ask threads and automations (staff runs) carry no conversation
and see the whole tenant. ``acting_for`` below is the one place that decides
which a run is.

**Writes are audited by the executor**, not here: every call is recorded as
a tool call before it runs, with an idempotency key on the non-idempotent
ones, and the app writes an Activity row on the record it changed, so Desk
shows "Agent …" on the contact, ticket or thread.

``send_message`` is not offered: SMS and email are not delivered yet, and an
agent that says "I've texted you" when nothing went out is worse than one that
says the team will follow up. ``AppSdk.send_message`` stays for when they are.
"""

from __future__ import annotations

import re
from typing import Any

from app_sdk.errors import AppSdkError, NotFound, Unavailable

from .tools import Tool, ToolResult

# ── run scope ────────────────────────────────────────────────────────────


def acting_for(state: Any) -> int | None:
    """The conversation a customer-facing run acts for; None on a staff run (Ask, automations).

    A host may set it explicitly (``state.extra["conversation_id"]``); a call
    has it on the call; a live chat's bundle carries it as ``session``.
    """
    extra = getattr(state, "extra", None) or {}
    if extra.get("conversation_id"):
        return int(extra["conversation_id"])
    call = getattr(state, "call", None)
    if call is not None and getattr(call, "conversation_id", None):
        return int(call.conversation_id)
    session = getattr(getattr(state, "context", None), "session", None)
    if session is not None and getattr(session, "conversation_id", None):
        return int(session.conversation_id)
    return None


def _contact_id(args: dict[str, Any], state: Any) -> int | None:
    given = args.get("contact_id")
    if given not in (None, ""):
        try:
            return int(given)
        except (TypeError, ValueError):
            return None
    contact = getattr(state, "contact", None)
    return contact.id if contact is not None else None


def _remember_contact(state: Any, contact: Any) -> None:
    """Keep the run's idea of who the customer is in step with the record."""
    if contact is not None and hasattr(state, "contact"):
        state.contact = contact


def _speakable(e: AppSdkError) -> str:
    """The app's reason, without the transport detail: it is said to the customer."""
    message = str(e.args[0]) if e.args else str(e)
    if e.status == 422 and " (" in message and message.endswith(")"):
        message = message.split(" (")[0]
    return re.sub(r"\s*\(and \d+ more errors?\)", "", message).strip()


async def _call(coro: Any, *, write: bool) -> tuple[Any, ToolResult | None]:
    """Run one SDK call; a refusal or a missing record becomes a failure the model can say."""
    try:
        return await coro, None
    except Unavailable:
        if write:
            return None, ToolResult.failure("The business's records did not answer, so this is not confirmed. Do not say it was done; say the team will check.")
        return None, ToolResult.failure("The business's records did not answer just now. Try once more, or carry on without it.")
    except NotFound as e:
        return None, ToolResult.failure(_speakable(e) or "Not found.")
    except AppSdkError as e:
        if e.status in (403, 409, 422):
            reason = _speakable(e)
            return None, ToolResult.failure(f"{reason} Nothing was changed." if write and "not changed" not in reason and "Nothing" not in reason else reason)
        raise


def _who(contact: Any) -> str:
    return contact.name or contact.display_name or f"contact {contact.id}"


_PHONEISH = re.compile(r"^[+()\-.\s\d]{7,}$")


# ── contacts ─────────────────────────────────────────────────────────────


async def lookup_contact(args: dict[str, Any], state: Any) -> Any:
    # Studio's `find_contact` takes one `query`: decide what it is.
    query = str(args.get("query") or "").strip()
    email = args.get("email") or (query if "@" in query else None)
    phone = args.get("phone") or (query if query and not email and _PHONEISH.match(query) else None)
    name = args.get("name") or (query if query and not email and not phone else None)
    contact_id = args.get("contact_id")
    if not (phone or email or name or contact_id):
        # No arguments: who this conversation is with.
        known = getattr(state, "contact", None)
        caller = getattr(getattr(state, "context", None), "caller", None)
        if known is not None:
            contact_id = known.id
        elif caller is not None and caller.identifier.type == "phone":
            phone = caller.identifier.value
        elif getattr(state, "call", None) is not None and state.call.from_ and _PHONEISH.match(state.call.from_):
            phone = state.call.from_
        else:
            return ToolResult.failure("The customer is not identified yet. Ask for their phone number, email or name, then look them up.")

    by = {"contact_id": contact_id} if contact_id else {"email": email} if email else {"phone": phone} if phone else {"name": name}
    found, failed = await _call(state.sdk.lookup_contact(**by, acting_for=acting_for(state)), write=False)
    if failed:
        return failed
    what = next(iter(by.values()))

    if found.matches:
        people = "; ".join(f"{_who(c)} (contact {c.id}{', phone ' + c.phone if c.phone else ''})" for c in found.matches)
        return ToolResult.success(found.model_dump(), text=f"Several people match {what!r}: {people}. Ask for their phone number or email to tell which one it is.")
    if not found.found:
        seen = " We have seen this number before, but it is not linked to anyone." if found.identifier else ""
        return ToolResult.success(found.model_dump(), text=f"No customer record matches {what!r}.{seen}")

    contact = found.contact
    if found.masked:
        return ToolResult.success(found.model_dump(), text=(
            f"A record matches ({_who(contact)}, phone {contact.phone or 'none'}, email {contact.email or 'none'}), but it is not this "
            "conversation's customer, so its details and tickets are hidden. Do not read anything from it out. If the customer says "
            "it is them, ask for the phone number or email on that record and call link_contact with it."
        ))

    _remember_contact(state, contact)
    parts = [f"Found {_who(contact)} (contact {contact.id})"]
    details = ", ".join(f"{k} {v}" for k, v in (("phone", contact.phone), ("email", contact.email), ("company", contact.company)) if v)
    if details:
        parts.append(details)
    if found.open_tickets:
        parts.append("open tickets: " + "; ".join(f"{t.reference} [{t.status}] {t.subject}" for t in found.open_tickets))
    else:
        parts.append("no open tickets")
    if found.conversations:
        parts.append(f"{len(found.conversations)} recent conversation(s); contact_history has them")
    if found.linked is False:
        parts.append("not yet linked to this conversation")
    return ToolResult.success(found.model_dump(), text=". ".join(parts) + ".")


async def register_contact(args: dict[str, Any], state: Any) -> Any:
    name = str(args.get("name") or "").strip() or None
    phone = str(args.get("phone") or "").strip() or None
    email = str(args.get("email") or "").strip() or None
    if not (name or phone or email):
        return ToolResult.failure("Give at least the customer's name, phone number or email.")
    saved, failed = await _call(state.sdk.create_contact(name=name, phone=phone, email=email, company=args.get("company") or None, acting_for=acting_for(state)), write=True)
    if failed:
        return failed
    _remember_contact(state, saved.contact)
    who = f"{_who(saved.contact)} (contact {saved.contact.id})"
    linked = " This conversation is now linked to them." if saved.conversation_linked else ""
    if saved.created:
        text = f"Saved {who} as a new contact.{linked}"
    elif saved.reason == "already_linked":
        text = f"This conversation is already linked to {who}; nothing new was created. Use update_contact to change their details. If this is a different person, ask for their phone number or email."
    elif saved.reason == "restored":
        text = f"{who} had an earlier record, which was brought back rather than duplicated.{linked}"
    else:
        text = f"{who} is already on file (their phone or email matched), so no duplicate was made.{linked} Do not assume the other details on file are current; confirm them."
    return ToolResult.success(saved.model_dump(), text=text)


async def update_contact(args: dict[str, Any], state: Any) -> Any:
    contact_id = _contact_id(args, state)
    if not contact_id:
        return ToolResult.failure("The customer is not identified yet: look them up or save them as a contact first.")
    fields = {k: str(v).strip() for k, v in args.items() if k in ("name", "phone", "email", "company") and v not in (None, "")}
    if not fields:
        return ToolResult.failure("Say what to change: name, phone, email or company.")
    contact, failed = await _call(state.sdk.update_contact(contact_id, acting_for=acting_for(state), **fields), write=True)
    if failed:
        return failed
    current = getattr(state, "contact", None)
    if current is None or current.id == contact.id:
        _remember_contact(state, contact)
    changed = ", ".join(f"{k} is now {getattr(contact, k)}" for k in fields)
    return ToolResult.success({"contact": contact.model_dump()}, text=f"Updated {_who(contact)}'s record: {changed}.")


async def link_contact(args: dict[str, Any], state: Any) -> Any:
    conversation = acting_for(state) or args.get("conversation_id")
    if not conversation:
        return ToolResult.failure("Linking attaches the conversation with a customer to their record; there is no such conversation here.")
    phone = str(args.get("phone") or "").strip() or None
    email = str(args.get("email") or "").strip() or None
    if not (phone or email):
        return ToolResult.failure("Ask the customer for the phone number or email on their record; a name alone is not enough to link them.")
    linked, failed = await _call(state.sdk.link_contact(int(conversation), phone=phone, email=email, contact_id=args.get("contact_id"), acting_for=acting_for(state)), write=True)
    if failed:
        return failed
    _remember_contact(state, linked.contact)
    extra = " The number they are calling from stays on another person's record; only this conversation was attributed." if linked.mode == "conversation" else ""
    return ToolResult.success(linked.model_dump(), text=f"This conversation is now linked to {_who(linked.contact)} (contact {linked.contact.id}). Their tickets and history are available.{extra}")


async def add_note(args: dict[str, Any], state: Any) -> Any:
    text = str(args.get("text") or args.get("note") or args.get("body") or "").strip()
    if not text:
        return ToolResult.failure("The note is empty.")
    contact_id = _contact_id(args, state)
    about = str(args.get("about") or ("customer" if contact_id else "conversation"))
    scope = acting_for(state)
    if about == "customer" and contact_id:
        note, failed = await _call(state.sdk.add_contact_note(contact_id, text, acting_for=scope), write=True)
        where = "the customer's record"
    else:
        conversation = scope or args.get("conversation_id")
        if not conversation:
            return ToolResult.failure("There is no customer record or conversation to put the note on.")
        note, failed = await _call(state.sdk.add_conversation_note(int(conversation), text, acting_for=scope), write=True)
        where = "this conversation" + (" (the customer is not identified yet, so not on a record)" if about == "customer" else "")
    if failed:
        return failed
    return ToolResult.success(note.model_dump(), text=f"Note saved on {where}. It is internal: do not read it to the customer.")


async def contact_history(args: dict[str, Any], state: Any) -> Any:
    contact_id = _contact_id(args, state)
    if not contact_id:
        return ToolResult.failure("The customer is not identified yet, so there is no history to read. Look them up or save them first.")
    history, failed = await _call(state.sdk.contact_history(contact_id, limit=min(int(args.get("limit") or 5), 10), acting_for=acting_for(state)), write=False)
    if failed:
        return failed
    lines = [f"History for {_who(history.contact)}:"]
    for c in history.conversations:
        said = " | ".join(f"{m.from_}: {m.body}" for m in c.messages)
        lines.append(f"- {c.channel} {c.last_message_at or ''} [{c.status}]{' (this conversation)' if c.current else ''}{': ' + said if said else ''}")
    for call in history.calls:
        lines.append(f"- call {call.at or ''} {call.direction} ({call.duration or '?'}): {call.summary or 'no summary'}")
    for t in history.tickets:
        lines.append(f"- ticket {t.reference} [{t.status}] {t.subject}")
    for n in history.notes:
        lines.append(f"- internal note {n.get('at') or ''}: {n.get('body')}")
    if len(lines) == 1:
        lines.append("Nothing yet.")
    return ToolResult.success(history.model_dump(by_alias=True), text="\n".join(lines))


# ── tickets ──────────────────────────────────────────────────────────────

_STATUS_WORDS = {
    "open": "open, with the team",
    "in_progress": "in progress: someone is working on it",
    "pending": "pending: waiting on the customer",
    "resolved": "resolved",
    "closed": "closed",
}


def _number(args: dict[str, Any]) -> int | None:
    found = re.search(r"\d+", str(args.get("reference") or args.get("number") or args.get("ticket") or ""))
    return int(found.group()) if found else None


def _ticket_line(t: Any) -> str:
    who = ", ".join(t.assignees) or "not assigned yet"
    return f"Ticket {t.reference} ({t.subject}) is {_STATUS_WORDS.get(t.status, t.status)}. Priority {t.priority}. With: {who}."


async def save_ticket(args: dict[str, Any], state: Any) -> Any:
    subject = str(args.get("subject") or "").strip()
    body = str(args.get("body") or args.get("description") or "").strip() or subject
    if not subject:
        return ToolResult.failure("A ticket needs a subject.")
    call = getattr(state, "call", None)
    scope = acting_for(state)
    result, failed = await _call(state.sdk.create_ticket(
        subject=subject, body=body, type=args.get("type") or None, priority=args.get("priority") or None,
        # On a call or chat the app files it under the conversation's customer itself.
        contact_id=None if scope else _contact_id(args, state),
        conversation_id=scope or args.get("conversation_id"),
        call_id=call.id if call else None,
        idempotency_key=args.get("_idempotency_key"),
        acting_for=scope,
    ), write=True)
    if failed:
        return failed
    ticket, created = result
    if hasattr(state, "tickets"):
        state.tickets.append(ticket)
    note = f" {ticket.type_note}" if ticket.type_note else ""
    return ToolResult.success(
        {"created": created, "ticket": ticket.model_dump()},
        text=f"Ticket {ticket.reference} {'created' if created else 'already existed'}: {ticket.subject}. Type: {ticket.type or 'none'}. Assigned to: {', '.join(ticket.assignees) or 'the team queue'}.{note}",
    )


async def recent_tickets(args: dict[str, Any], state: Any) -> Any:
    status = args.get("status") if args.get("status") in ("open", "all") else None
    tickets, failed = await _call(state.sdk.tickets(contact_id=args.get("contact_id"), status=status, limit=min(int(args.get("limit") or 10), 20), acting_for=acting_for(state)), write=False)
    if failed:
        return failed
    if not tickets:
        return ToolResult.success([], text="No tickets." if not acting_for(state) else "This customer has no tickets" + (" open." if status == "open" else "."))
    lines = [f"- {t.reference} [{t.status}] {t.subject} — {', '.join(t.assignees) or 'unassigned'}" for t in tickets]
    return ToolResult.success([t.model_dump() for t in tickets], text="\n".join(lines))


async def ticket_status(args: dict[str, Any], state: Any) -> Any:
    number = _number(args)
    if number is None:
        return ToolResult.failure("Give the ticket number, for example 12.")
    ticket, failed = await _call(state.sdk.ticket(number, acting_for=acting_for(state)), write=False)
    if failed:
        return failed
    last = ticket.last_activity or {}
    when = f" Last change {last.get('at')}: {last.get('description')}." if last else ""
    return ToolResult.success(ticket.model_dump(), text=_ticket_line(ticket) + when)


async def update_ticket(args: dict[str, Any], state: Any) -> Any:
    number = _number(args)
    if number is None:
        return ToolResult.failure("Give the ticket number, for example 12.")
    fields = {k: (str(args[k]).strip() if args.get(k) not in (None, "") else None) for k in ("note", "status", "priority", "type")}
    if not any(fields.values()):
        return ToolResult.failure("Say what to change: a note, the status (open or pending), or the priority.")
    result, failed = await _call(state.sdk.update_ticket(number, **fields, acting_for=acting_for(state)), write=True)
    refused = None
    if failed and fields["note"] and any(fields[k] for k in ("status", "priority", "type")) and "Nothing was changed" in (failed.error or ""):
        # The change was refused as a whole. What the customer said still
        # belongs on the ticket ("it's fixed, close it"): add it on its own.
        refused = failed.error.replace(" Nothing was changed.", "")
        result, failed = await _call(state.sdk.update_ticket(number, note=fields["note"], acting_for=acting_for(state)), write=True)
    if failed:
        return ToolResult.failure(f"{failed.error} Tell the customer the team will review it.", data=failed.data)
    changed = ", ".join(result.changes) or "nothing needed changing"
    note = f" {result.type_note}" if result.type_note else ""
    if refused:
        return ToolResult.success(result.model_dump(), text=f"Not changed: {refused} Their note was added to {result.ticket.reference} instead, so the team will see it. {_ticket_line(result.ticket)}")
    return ToolResult.success(result.model_dump(), text=f"Ticket {result.ticket.reference} updated ({changed}). {_ticket_line(result.ticket)}{note}")


# ── the conversation ─────────────────────────────────────────────────────


def _conversation(args: dict[str, Any], state: Any) -> int | None:
    scope = acting_for(state)
    if scope:
        return scope
    given = args.get("conversation_id")
    return int(given) if given not in (None, "") and str(given).isdigit() else None


async def summarize_conversation(args: dict[str, Any], state: Any) -> Any:
    conversation = _conversation(args, state)
    if not conversation:
        return ToolResult.failure("There is no conversation with a customer to summarise here.")
    summary = str(args.get("summary") or "").strip() or None
    tags = [str(t).strip() for t in (args.get("tags") or []) if str(t).strip()][:5] or None
    if not (summary or tags):
        return ToolResult.failure("Give a summary, tags, or both.")
    done, failed = await _call(state.sdk.summarize_conversation(conversation, summary=summary, tags=tags, acting_for=acting_for(state)), write=True)
    if failed:
        return failed
    bits = (["Summary saved on the conversation for the team"] if done.summarized else []) + ([f"tagged {', '.join(done.tags_added)}"] if done.tags_added else [])
    return ToolResult.success(done.model_dump(), text=("; ".join(bits) or "Nothing new: those tags were already there") + ".")


async def set_reminder(args: dict[str, Any], state: Any) -> Any:
    conversation = _conversation(args, state)
    if not conversation:
        return ToolResult.failure("There is no conversation to set a reminder on.")
    text = str(args.get("text") or "").strip()
    if not text:
        return ToolResult.failure("Say what the team should be reminded to do.")
    minutes = args.get("due_in_minutes")
    due_at = str(args.get("due_at") or "").strip() or None
    if not due_at and minutes in (None, ""):
        return ToolResult.failure("Say when: due_at as a date and time, or due_in_minutes.")
    reminder, failed = await _call(state.sdk.set_reminder(
        conversation, text=text, due_at=due_at, due_in_minutes=int(minutes) if minutes not in (None, "") and not due_at else None,
        teammate=args.get("teammate") or None, acting_for=acting_for(state),
    ), write=True)
    if failed:
        return failed
    who = f" for {reminder.for_}" if reminder.for_ else ""
    missed = f" No teammate called {args.get('teammate')!r} was found, so it is on the conversation for whoever picks it up." if reminder.teammate_matched is False else ""
    return ToolResult.success(reminder.model_dump(by_alias=True), text=f"Reminder set{who}: {reminder.text!r}, due {reminder.due_at}.{missed} It is a reminder for the team, not a promised call time.")


async def hand_off(args: dict[str, Any], state: Any) -> Any:
    conversation = _conversation(args, state)
    if not conversation:
        return ToolResult.failure("There is no conversation with a customer to hand off here.")
    reason = str(args.get("reason") or "").strip()
    if not reason:
        return ToolResult.failure("Say why a person is needed; the team reads it first.")
    urgency = args.get("urgency") if args.get("urgency") in ("normal", "urgent") else None
    result, failed = await _call(state.sdk.hand_off(
        conversation, reason=reason, urgency=urgency, teammate=args.get("teammate") or None, ticket_type=args.get("team") or args.get("ticket_type") or None,
        acting_for=acting_for(state),
    ), write=True)
    if failed:
        return failed
    to = ", ".join(result.assigned_to) or "the team (nobody in particular)"
    notified = ", ".join(result.notified) or "nobody"
    asked = args.get("teammate")
    missed = ""
    if result.teammate_candidates:
        missed = f" Several teammates match {asked!r} ({', '.join(result.teammate_candidates)}), so none was picked by name."
    elif result.teammate_matched is False:
        missed = f" Nobody called {asked!r} is on the team."
    return ToolResult.success(result.model_dump(), text=(
        f"Handed off: assigned to {to}, flagged {result.tag or 'Needs attention'} in the inbox, notified {notified}.{missed} "
        "This is not a live transfer: tell the customer the team has been asked to follow up. Do not promise when, or that someone is joining now."
    ))


# ── leads ────────────────────────────────────────────────────────────────


async def save_lead(args: dict[str, Any], state: Any) -> Any:
    scope = acting_for(state)
    contact_id = args.get("contact_id") or (None if scope else _contact_id(args, state))
    if not scope and not contact_id:
        return ToolResult.failure("Say which contact the lead is for.")
    value = args.get("value")
    saved, failed = await _call(state.sdk.save_lead(
        contact_id=int(contact_id) if contact_id else None, stage=args.get("stage") or None, note=str(args.get("note") or "").strip() or None,
        value=int(value) if isinstance(value, (int, float)) or (isinstance(value, str) and value.isdigit()) else None, acting_for=scope,
    ), write=True)
    if failed:
        return failed
    lead = saved.lead
    if saved.created:
        text = f"Added to the {lead.pipeline} pipeline at {lead.stage}."
    elif saved.moved:
        text = f"Their lead moved to {lead.stage}."
    else:
        text = f"They are already in the {lead.pipeline} pipeline at {lead.stage}." + (f" {saved.note}" if saved.note else "")
    return ToolResult.success(saved.model_dump(), text=text)


# ── calls ────────────────────────────────────────────────────────────────


async def recent_calls(args: dict[str, Any], state: Any) -> Any:
    calls, failed = await _call(state.sdk.recent_calls(
        since=args.get("since"), contact_id=args.get("contact_id"), status=args.get("status"), limit=min(int(args.get("limit") or 20), 100), acting_for=acting_for(state),
    ), write=False)
    if failed:
        return failed
    if not calls:
        return ToolResult.success([], text="No calls in that window.")
    lines = [f"- {c.at or '?'} {c.direction} {c.contact or c.from_ or 'unknown'} ({c.duration}, {c.status}): {c.summary or 'no summary'}" for c in calls]
    return ToolResult.success([c.model_dump(by_alias=True) for c in calls], text="\n".join(lines))


# ── the catalog ──────────────────────────────────────────────────────────
#
# The descriptions are what the model picks tools by: each says when to use
# it. The app's StarterAgent::catalog() carries the same text for the Studio
# action rows (a test keeps them in step); an owner's edit there wins.

_S = {"type": "string"}
_PRIORITY = {"type": "string", "enum": ["low", "normal", "high", "urgent"]}

DESK_TOOLS: dict[str, Tool] = {
    "lookup_contact": Tool(
        name="lookup_contact", handler=lookup_contact, timeout_ms=8000,
        description="Find a customer's record by phone, email or name. Use it before asking for details you may already have, and when a caller says who they are. With no arguments it looks up who this conversation is with. On a call or chat, a record that is not this conversation's customer comes back masked: attach it with link_contact (using the phone or email on file) before reading anything back.",
        input_schema={"type": "object", "properties": {"query": {**_S, "description": "A phone number, email address or name."}, "phone": _S, "email": _S, "name": _S, "contact_id": {"type": "integer"}}},
    ),
    "register_contact": Tool(
        name="register_contact", handler=register_contact, is_durable_write=True, is_idempotent=True, timeout_ms=10000,
        description="Save the customer as a contact once you know their name (and their phone or email if they gave one). It also attaches this conversation to them. If the phone or email is already on file you get that existing record back, never a duplicate. To change details on a record that exists, use update_contact.",
        input_schema={"type": "object", "properties": {"name": _S, "phone": _S, "email": _S, "company": _S}},
    ),
    "update_contact": Tool(
        name="update_contact", handler=update_contact, is_durable_write=True, is_idempotent=True, timeout_ms=10000,
        description="Correct or add the customer's name, phone, email or company on their record. Only for the customer in this conversation. Read the new detail back to them before saving.",
        input_schema={"type": "object", "properties": {"name": _S, "phone": _S, "email": _S, "company": _S, "contact_id": {"type": "integer", "description": "Only on a staff request; on a call or chat it is the customer in the conversation."}}},
    ),
    "link_contact": Tool(
        name="link_contact", handler=link_contact, is_durable_write=True, is_idempotent=True, timeout_ms=10000,
        description="Attach this conversation to an existing customer record when they are calling or chatting from a number or session we do not recognise. Needs the phone number or email on their record, as the customer gives it; a name alone is not enough. Their history and tickets become visible once linked.",
        input_schema={"type": "object", "properties": {"phone": _S, "email": _S}},
    ),
    "add_note": Tool(
        name="add_note", handler=add_note, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Leave an internal note for the team: on the customer record (the default) for lasting facts such as preferences, access details or who to ask for, or on this conversation for something about this exchange. Notes are internal; never read them out to the customer.",
        input_schema={"type": "object", "properties": {"text": _S, "about": {"type": "string", "enum": ["customer", "conversation"]}}, "required": ["text"]},
    ),
    "contact_history": Tool(
        name="contact_history", handler=contact_history, timeout_ms=8000,
        description="Read what has happened with this customer across calls, chats, texts and email: recent conversations with their latest messages, call summaries and tickets. Use it when they refer to an earlier conversation, or before asking them to repeat themselves.",
        input_schema={"type": "object", "properties": {"limit": {"type": "integer"}, "contact_id": {"type": "integer"}}},
    ),
    "save_ticket": Tool(
        name="save_ticket", handler=save_ticket, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Raise a ticket for the team when something needs a person: what the customer needs, what was done, what is blocked. It is numbered, filed under its type, routed to that type's team and linked to this customer and conversation. Only after it succeeds may you say the team has it; give the customer the ticket number. Keep related requests in one ticket; to add to an existing ticket use update_ticket. When the customer asks for a person, use hand_off.",
        input_schema={"type": "object", "properties": {"subject": _S, "body": _S, "type": _S, "priority": _PRIORITY}, "required": ["subject", "body"]},
    ),
    "recent_tickets": Tool(
        name="recent_tickets", handler=recent_tickets, timeout_ms=8000,
        description="List tickets with their number, status, subject and who has them. On a call or chat it lists only this customer's tickets; set status to open for the unresolved ones.",
        input_schema={"type": "object", "properties": {"status": {"type": "string", "enum": ["open", "all"]}, "limit": {"type": "integer"}, "contact_id": {"type": "integer"}}},
    ),
    "ticket_status": Tool(
        name="ticket_status", handler=ticket_status, timeout_ms=8000,
        description="Look up one ticket by its number (the customer may say ticket 12 or #12): status, priority, who has it and when it last changed. On a call or chat only this customer's own tickets can be found.",
        input_schema={"type": "object", "properties": {"reference": _S}, "required": ["reference"]},
    ),
    "update_ticket": Tool(
        name="update_ticket", handler=update_ticket, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Update an existing ticket: add what the customer just told you as a note, reopen it when they say the problem is back (status open), mark it as waiting on the customer (status pending), or raise its priority. Status resolved is only for withdrawing a ticket you raised in this same conversation. You cannot close tickets or lower a priority the team set: when the customer asks to close one, add their words as a note and say the team will close it. If a change is refused, say the team will review it.",
        input_schema={"type": "object", "properties": {"reference": _S, "note": _S, "status": {"type": "string", "enum": ["open", "pending", "resolved"]}, "priority": _PRIORITY, "type": _S}, "required": ["reference"]},
    ),
    "summarize_conversation": Tool(
        name="summarize_conversation", handler=summarize_conversation, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Leave a short summary of this conversation for the team, and optionally tag it (for example billing or new customer). Use it once, near the end of a conversation that had substance.",
        input_schema={"type": "object", "properties": {"summary": _S, "tags": {"type": "array", "items": _S}}},
    ),
    "set_reminder": Tool(
        name="set_reminder", handler=set_reminder, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Set a follow-up reminder for the team on this conversation, for example call back about the quote tomorrow at 10. Give due_at as an ISO 8601 date-time with a timezone offset, or due_in_minutes. Optionally name the teammate it is for. A reminder is for the team; it does not promise the customer a call at that time.",
        input_schema={"type": "object", "properties": {"text": _S, "due_at": _S, "due_in_minutes": {"type": "integer"}, "teammate": _S}, "required": ["text"]},
    ),
    "hand_off": Tool(
        name="hand_off", handler=hand_off, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Hand this conversation to a person on the team when the customer asks for a person (use this, not just a ticket), is upset, or needs something you cannot do. It assigns the conversation (to the named teammate, or to a team by ticket type), flags it Needs attention in the inbox and notifies them. It is not a live transfer: say the team has been asked to follow up, not that someone is joining now. If the matter needs tracking, also raise a ticket.",
        input_schema={"type": "object", "properties": {"reason": _S, "urgency": {"type": "string", "enum": ["normal", "urgent"]}, "teammate": _S, "team": _S}, "required": ["reason"]},
    ),
    "save_lead": Tool(
        name="save_lead", handler=save_lead, is_durable_write=True, is_idempotent=True, timeout_ms=10000,
        description="Add a prospect to the sales pipeline, or move their existing lead forward, when someone wants to buy: a quote, an estimate, a new service. Save them as a contact first, and note what they want.",
        input_schema={"type": "object", "properties": {"note": _S, "stage": _S, "value": {"type": "integer"}}},
    ),
    "recent_calls": Tool(
        name="recent_calls", handler=recent_calls, timeout_ms=8000,
        description="List recent calls with who called, how long, and what happened. Use since (an ISO date-time) to bound the window. On a call or chat it lists only this customer's calls.",
        input_schema={"type": "object", "properties": {"since": {"type": "string", "format": "date-time"}, "limit": {"type": "integer"}, "contact_id": {"type": "integer"}, "status": _S}},
    ),
}

# Studio's internal action slugs → the built-in each one runs.
DESK_SLUGS: dict[str, str] = {
    "find_contact": "lookup_contact",
    "lookup_contact": "lookup_contact",
    "create_contact": "register_contact",
    "register_contact": "register_contact",
    "update_contact": "update_contact",
    "link_contact": "link_contact",
    "add_note": "add_note",
    "contact_history": "contact_history",
    "create_ticket": "save_ticket",
    "save_ticket": "save_ticket",
    "recent_tickets": "recent_tickets",
    "list_tickets": "recent_tickets",
    "ticket_status": "ticket_status",
    "update_ticket": "update_ticket",
    "summarize_conversation": "summarize_conversation",
    "set_reminder": "set_reminder",
    "hand_off": "hand_off",
    "save_lead": "save_lead",
    "recent_calls": "recent_calls",
    "list_calls": "recent_calls",
}

# Built-ins whose `type` / `team` argument names one of the business's ticket types.
TICKET_TYPE_ARGUMENTS: dict[str, str] = {"save_ticket": "type", "update_ticket": "type", "hand_off": "team"}
