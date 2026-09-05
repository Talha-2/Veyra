"""The web chat channel: /v1/chat — browsers talk to an agent, streamed.

The missing channel the marketing site has been claiming. A visitor (through
the embeddable widget or the site chatbot) sends a message; the named Expert
answers on the unified LangGraph harness with **durable multi-turn memory**
(the checkpointer thread is the visitor's session id, so a conversation
survives page reloads — and server restarts when Postgres is configured).

Auth is the publishable key (`z360_pk_live_`, scope "widget") — safe to ship
in page source, verified per request. The widget itself is an iframe served
from our own origin, so no cross-origin story is needed for the API calls.

Every message is stored as a WebChatMessage keyed by session, which makes the
thread a first-class Desk inbox projection like SMS and email — and inbound
messages go on the event bus, so Desk-side agents subscribed to
message.received see webchat traffic like any other channel.
"""

from __future__ import annotations

import json
import logging
import re
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import WebChatMessage, engine, get_session, new_id
from ..experts.models import Expert
from ..publicapi.keys import ApiKey, require_widget_key

logger = logging.getLogger("chat")

router = APIRouter(prefix="/v1/chat", tags=["chat"])

_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

# per-session throttle: generous for a human, hostile to a script
_WINDOW_SEC = 60
_MAX_PER_WINDOW = 20
_hits: dict[str, list[float]] = {}


def _throttled(session_id: str) -> bool:
    cutoff = time.monotonic() - _WINDOW_SEC
    hits = [t for t in _hits.get(session_id, []) if t > cutoff]
    if len(hits) >= _MAX_PER_WINDOW:
        _hits[session_id] = hits
        return True
    hits.append(time.monotonic())
    _hits[session_id] = hits
    return False


def _chat_expert(session: Session, agent_id: str) -> Expert:
    """Only agents deliberately opened to chat are reachable from a browser."""
    e = session.get(Expert, agent_id)
    if e is None or e.status != "active":
        raise HTTPException(404, "No active agent at this id")
    if e.kind != "chat" and "chat" not in e.triggers:
        raise HTTPException(403, "This agent is not enabled for chat")
    return e


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


class ChatIn(BaseModel):
    session_id: str
    message: str


@router.get("/config")
def widget_config(db: Session = Depends(get_session)):
    """Zero-config bootstrap for the first-party widget: the default chat agent
    and a publishable key. The key is DERIVED (HMAC of the auth secret), so it
    needs no storage, survives restarts, and rotates with the auth secret —
    the row is upserted so /v1 auth recognises it. Publishable keys are public
    by design; this endpoint hands out nothing a page's source wouldn't."""
    import base64
    import hashlib
    import hmac as hmac_mod

    from ..config import settings
    from ..publicapi.keys import ApiKey, _hash

    agent = db.exec(select(Expert).where(Expert.status == "active", Expert.kind == "chat")).first()
    if agent is None:
        for e in db.exec(select(Expert).where(Expert.status == "active")).all():
            if "chat" in e.triggers:
                agent = e
                break
    if agent is None:
        raise HTTPException(404, "No chat-enabled agent is active")

    digest = hmac_mod.new(settings.auth_secret.encode(), b"site-widget-key", hashlib.sha256).digest()
    secret = "z360_pk_live_" + base64.urlsafe_b64encode(digest).decode().rstrip("=")[:32]
    h = _hash(secret)
    row = db.exec(select(ApiKey).where(ApiKey.key_hash == h)).first()
    if row is None:
        db.add(ApiKey(id=new_id("key"), workspace="default", name="Site widget (derived)",
                      prefix=secret[:19] + "…", last4=secret[-4:], key_hash=h, scopes="widget"))
        db.commit()
    return {"agent_id": agent.id, "agent_name": agent.name, "publishable_key": secret}


@router.post("/{agent_id}")
async def chat(agent_id: str, body: ChatIn, key: ApiKey = Depends(require_widget_key)):
    if not _SESSION_RE.match(body.session_id):
        raise HTTPException(422, "session_id must be 8-64 url-safe characters")
    message = body.message.strip()
    if not message:
        raise HTTPException(422, "Empty message")
    if len(message) > 4000:
        raise HTTPException(422, "Message too long")
    if _throttled(body.session_id):
        raise HTTPException(429, "Slow down a little — try again in a minute.")

    with Session(engine) as s:
        expert = _chat_expert(s, agent_id)
        s.add(WebChatMessage(id=new_id("wm"), session_id=body.session_id,
                             direction="inbound", body=message))
        s.commit()
        # Resolve tools against a live session inside the stream; build later.
        expert_id = expert.id

    async def stream():
        from .. import events
        from ..experts import harness

        final = ""
        try:
            with Session(engine) as s:
                expert = s.get(Expert, expert_id)
                agent = await harness.build_agent(
                    s,
                    expert,
                    "You are chatting with a website visitor. Keep replies short, warm, and concrete. "
                    "Never invent facts about the business; use your tools when you need them.",
                )
            config = {"configurable": {"thread_id": f"chat:{body.session_id}"}, "recursion_limit": 40}

            async for chunk, _meta in agent.astream(
                {"messages": [{"role": "user", "content": message}]},
                config=config,
                stream_mode="messages",
            ):
                if getattr(chunk, "type", "") == "AIMessageChunk" or chunk.__class__.__name__ == "AIMessageChunk":
                    text = chunk.content if isinstance(chunk.content, str) else ""
                    if text:
                        final += text
                        yield _sse({"type": "token", "text": text})

            yield _sse({"type": "done", "text": final})
        except Exception as exc:
            logger.warning("chat stream failed for %s", agent_id, exc_info=True)
            yield _sse({"type": "error", "text": "The agent hit a problem. Try again in a moment."})

        # persist the reply and put the visitor's message on the event bus
        # (after the stream so the visitor never waits on bookkeeping)
        try:
            if final.strip():
                with Session(engine) as s:
                    s.add(WebChatMessage(id=new_id("wm"), session_id=body.session_id,
                                         direction="outbound", body=final, agent_id=expert_id))
                    s.commit()
            events.publish("message.received", {
                "object": "message", "channel": "webchat", "session_id": body.session_id,
                "body": message, "_answered_by": expert_id,
            })
        except Exception:
            logger.warning("chat bookkeeping failed", exc_info=True)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{agent_id}/history")
def history(agent_id: str, session_id: str, key: ApiKey = Depends(require_widget_key),
            db: Session = Depends(get_session)):
    """The session's transcript, oldest first — the widget restores from this,
    and picks up human replies sent later from the Desk."""
    if not _SESSION_RE.match(session_id):
        raise HTTPException(422, "session_id must be 8-64 url-safe characters")
    _chat_expert(db, agent_id)
    rows = db.exec(
        select(WebChatMessage)
        .where(WebChatMessage.session_id == session_id)
        .order_by(WebChatMessage.created_at)  # type: ignore[arg-type]
        .limit(200)
    ).all()
    return {"messages": [
        {"id": m.id, "direction": m.direction, "body": m.body,
         "agent_id": m.agent_id, "at": m.created_at.isoformat()}
        for m in rows
    ]}
