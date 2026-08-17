"""Desk email: Gmail / Outlook in the omnichannel inbox.

Mailboxes connect through Composio managed OAuth (the same Connections the
integrations page manages), so there are no SMTP/IMAP credentials here. This
router does three jobs:

- send: execute the mailbox's send/reply tool and log the outbound message;
- sync: pull recent messages through the mailbox's fetch tool and normalize
  them into EmailMessage rows (idempotent on the provider message id);
- ingest: accept a Composio trigger event (e.g. "New Gmail Message") forwarded
  by the app-event sink and normalize it the same way.

Everything degrades cleanly: with no Composio key or no connected mailbox the
endpoints answer with an honest 409 the inbox renders as a connect prompt.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import Contact, Conversation, EmailMessage, get_session, new_id, now
from ..integrations import composio_service as cs
from ..integrations.models import Connection

logger = logging.getLogger("voice-agent.desk.email")

router = APIRouter(prefix="/api/desk/email", tags=["desk-email"])

EMAIL_TOOLKITS = ("gmail", "outlook")


# ── helpers ──────────────────────────────────────────────────────────────────
def _addr(value: object) -> str:
    """Pull a bare address out of 'Name <a@b.c>' or nested provider shapes."""
    if isinstance(value, dict):
        value = (
            value.get("email")
            or value.get("address")
            or (value.get("emailAddress") or {}).get("address")
            or ""
        )
    s = str(value or "").strip()
    m = re.search(r"<([^>]+)>", s)
    if m:
        s = m.group(1)
    return s.strip().lower()


def _accounts(session: Session) -> list[Connection]:
    rows = session.exec(select(Connection)).all()
    return [c for c in rows if c.toolkit in EMAIL_TOOLKITS and c.status in ("active", "initiated")]


def _account_for(session: Session, toolkit: str = "") -> Connection:
    accounts = [c for c in _accounts(session) if c.status == "active"]
    if toolkit:
        accounts = [c for c in accounts if c.toolkit == toolkit]
    if not accounts:
        raise HTTPException(
            409,
            "No connected mailbox. Connect Gmail or Outlook in Integrations, then try again.",
        )
    return accounts[0]


def _touch_thread(session: Session, counterparty: str, at: datetime | None = None) -> None:
    """Keep the Conversation row's last_at fresh and link the contact."""
    peer = counterparty.lower()
    contact = session.exec(select(Contact).where(Contact.email == peer)).first()
    conv = session.exec(select(Conversation).where(Conversation.peer == peer)).first()
    if conv is None:
        conv = Conversation(id=new_id("cv"), peer=peer, contact_id=contact.id if contact else None)
    conv.last_at = at or now()
    conv.updated_at = now()
    if contact and not conv.contact_id:
        conv.contact_id = contact.id
    session.add(conv)


def _ensure_contact(session: Session, addr: str, name_hint: str = "") -> None:
    """Auto-create a contact for a new inbound sender, mirroring how phone
    activity creates contacts."""
    if not addr:
        return
    existing = session.exec(select(Contact).where(Contact.email == addr)).first()
    if existing:
        return
    session.add(Contact(
        id=new_id("ct"), name=name_hint or addr.split("@")[0].replace(".", " ").title(),
        email=addr, source="email", stage="new",
    ))


def _store(session: Session, *, direction: str, from_addr: str, to_addr: str,
           account: str, provider: str, external_id: str, thread_external_id: str,
           subject: str, snippet: str, body_text: str, body_html: str,
           status: str, unread: bool, created_at: datetime | None = None) -> EmailMessage | None:
    """Insert one normalized email; dedupe on the provider message id."""
    if external_id:
        dupe = session.exec(select(EmailMessage).where(EmailMessage.external_id == external_id)).first()
        if dupe:
            return None
    counterparty = (to_addr if direction == "outbound" else from_addr).lower()
    if not counterparty:
        return None
    m = EmailMessage(
        id=new_id("em"), direction=direction, from_addr=from_addr, to_addr=to_addr,
        counterparty=counterparty, account=account, provider=provider,
        external_id=external_id, thread_external_id=thread_external_id,
        subject=subject[:300], snippet=(snippet or body_text)[:200],
        body_text=body_text, body_html=body_html, status=status, unread=unread,
    )
    if created_at:
        m.created_at = created_at
    session.add(m)
    if direction == "inbound":
        _ensure_contact(session, counterparty)
    _touch_thread(session, counterparty, m.created_at)
    return m


def _parse_when(value: object) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        if s.isdigit():  # epoch millis or seconds
            ts = int(s)
            return datetime.fromtimestamp(ts / 1000 if ts > 10_000_000_000 else ts)
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


# ── accounts ─────────────────────────────────────────────────────────────────
@router.get("/accounts")
def accounts(session: Session = Depends(get_session)):
    """The connected mailboxes the composer can send from."""
    return {
        "composio_configured": cs.is_configured(),
        "accounts": [
            {
                "id": c.id,
                "toolkit": c.toolkit,
                "email": c.connected_email or "",
                "status": c.status,
            }
            for c in _accounts(session)
        ],
    }


# ── send ─────────────────────────────────────────────────────────────────────
class SendEmailIn(BaseModel):
    to: str
    subject: str = ""
    body: str = ""
    toolkit: str = ""  # gmail | outlook | "" = first active mailbox
    thread_external_id: str = ""  # reply into this provider thread when set


@router.post("/send")
def send_email(req: SendEmailIn, session: Session = Depends(get_session)):
    to = _addr(req.to)
    if not to:
        raise HTTPException(422, "A valid recipient address is required.")
    if not (req.subject.strip() or req.body.strip()):
        raise HTTPException(422, "Write a subject or a message before sending.")
    account = _account_for(session, req.toolkit.lower().strip())

    if account.toolkit == "gmail":
        if req.thread_external_id:
            slug = "GMAIL_REPLY_TO_THREAD"
            args = {"thread_id": req.thread_external_id, "recipient_email": to, "message_body": req.body}
        else:
            slug = "GMAIL_SEND_EMAIL"
            args = {"recipient_email": to, "subject": req.subject, "body": req.body}
    else:  # outlook
        slug = "OUTLOOK_OUTLOOK_SEND_EMAIL"
        args = {"subject": req.subject, "body": req.body, "to_email": to}

    res = cs.execute(slug, args)
    ok = bool(res.get("successful", res.get("successfull", False))) and not res.get("error")

    m = _store(
        session,
        direction="outbound", from_addr=account.connected_email or account.toolkit,
        to_addr=to, account=account.connected_email or account.toolkit,
        provider=account.toolkit, external_id="", thread_external_id=req.thread_external_id,
        subject=req.subject, snippet=req.body[:200], body_text=req.body, body_html="",
        status="sent" if ok else "failed", unread=False,
    )
    if m and not ok:
        m.error = str(res.get("error") or "send failed")[:300]
    session.commit()

    if not ok:
        raise HTTPException(502, f"The mailbox refused the send: {str(res.get('error') or 'unknown error')[:200]}")
    return {"ok": True, "id": m.id if m else None}


# ── sync (pull recent messages) ──────────────────────────────────────────────
class SyncIn(BaseModel):
    toolkit: str = ""
    max_results: int = 20


def _normalize_gmail(item: dict, account_email: str) -> dict:
    sender = _addr(item.get("sender") or item.get("from") or item.get("from_email"))
    to = _addr(item.get("to") or item.get("recipient") or account_email)
    labels = item.get("labelIds") or item.get("label_ids") or []
    return {
        "external_id": str(item.get("messageId") or item.get("message_id") or item.get("id") or ""),
        "thread_external_id": str(item.get("threadId") or item.get("thread_id") or ""),
        "from_addr": sender,
        "to_addr": to,
        "subject": str(item.get("subject") or ""),
        "snippet": str(item.get("preview") or item.get("snippet") or "")[:200],
        "body_text": str(item.get("messageText") or item.get("message_text") or item.get("snippet") or ""),
        "body_html": str(item.get("messageHtml") or ""),
        "unread": "UNREAD" in labels,
        "at": _parse_when(item.get("messageTimestamp") or item.get("message_timestamp") or item.get("internalDate")),
    }


def _normalize_outlook(item: dict, account_email: str) -> dict:
    sender = _addr(item.get("from") or item.get("sender"))
    tos = item.get("toRecipients") or []
    to = _addr(tos[0]) if tos else account_email
    body = item.get("body") or {}
    html = body.get("content", "") if str(body.get("contentType", "")).lower() == "html" else ""
    text = "" if html else str(body.get("content") or "")
    return {
        "external_id": str(item.get("id") or ""),
        "thread_external_id": str(item.get("conversationId") or ""),
        "from_addr": sender,
        "to_addr": to,
        "subject": str(item.get("subject") or ""),
        "snippet": str(item.get("bodyPreview") or "")[:200],
        "body_text": text or str(item.get("bodyPreview") or ""),
        "body_html": html,
        "unread": not bool(item.get("isRead", True)),
        "at": _parse_when(item.get("receivedDateTime")),
    }


@router.post("/sync")
def sync(req: SyncIn, session: Session = Depends(get_session)):
    """Pull the most recent messages from the connected mailbox into the inbox.
    Idempotent — already-imported messages (by provider id) are skipped."""
    account = _account_for(session, req.toolkit.lower().strip())
    account_email = _addr(account.connected_email) or account.toolkit
    limit = max(1, min(req.max_results, 50))

    if account.toolkit == "gmail":
        res = cs.execute("GMAIL_FETCH_EMAILS", {"max_results": limit})
    else:
        res = cs.execute("OUTLOOK_OUTLOOK_LIST_MESSAGES", {"top": limit})

    if res.get("error"):
        raise HTTPException(502, f"Mailbox sync failed: {str(res['error'])[:200]}")

    data = res.get("data") or {}
    items = (
        data.get("messages")
        or data.get("value")
        or (data.get("response_data") or {}).get("messages")
        or []
    )
    if not isinstance(items, list):
        items = []

    imported = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        n = _normalize_gmail(item, account_email) if account.toolkit == "gmail" else _normalize_outlook(item, account_email)
        direction = "outbound" if n["from_addr"] == account_email else "inbound"
        stored = _store(
            session,
            direction=direction,
            from_addr=n["from_addr"], to_addr=n["to_addr"],
            account=account_email, provider=account.toolkit,
            external_id=n["external_id"], thread_external_id=n["thread_external_id"],
            subject=n["subject"], snippet=n["snippet"],
            body_text=n["body_text"], body_html=n["body_html"],
            status="sent" if direction == "outbound" else "received",
            unread=bool(n["unread"]) and direction == "inbound",
            created_at=n["at"],
        )
        if stored:
            imported += 1
    session.commit()
    return {"ok": True, "imported": imported, "seen": len(items), "account": account_email}


# ── trigger ingestion (Composio app events) ──────────────────────────────────
EMAIL_TRIGGER_HINTS = ("GMAIL_NEW_GMAIL_MESSAGE", "OUTLOOK_MESSAGE", "NEW_EMAIL")


def ingest_trigger_event(slug: str, data: dict, session: Session) -> bool:
    """Called by the app-event sink for every Composio delivery. Returns True if
    the event was an email and got stored, so new mail lands in the inbox even
    though the trigger was originally subscribed for Experts."""
    s = (slug or "").upper()
    if not any(h in s for h in EMAIL_TRIGGER_HINTS):
        return False
    payload = data if isinstance(data, dict) else {}
    inner = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    toolkit = "outlook" if "OUTLOOK" in s else "gmail"
    account = next((c for c in _accounts(session) if c.toolkit == toolkit and c.status == "active"), None)
    account_email = _addr(account.connected_email) if account else ""
    n = _normalize_gmail(inner, account_email) if toolkit == "gmail" else _normalize_outlook(inner, account_email)
    if not (n["from_addr"] or n["to_addr"]):
        return False
    direction = "outbound" if account_email and n["from_addr"] == account_email else "inbound"
    stored = _store(
        session,
        direction=direction, from_addr=n["from_addr"], to_addr=n["to_addr"] or account_email,
        account=account_email or toolkit, provider=toolkit,
        external_id=n["external_id"], thread_external_id=n["thread_external_id"],
        subject=n["subject"], snippet=n["snippet"], body_text=n["body_text"], body_html=n["body_html"],
        status="received" if direction == "inbound" else "sent",
        unread=direction == "inbound", created_at=n["at"],
    )
    if stored:
        session.commit()
        logger.info("email ingested from trigger %s (%s)", slug, stored.counterparty)
    return bool(stored)
