"""Outbound event webhooks — Standard Webhooks spec (Svix), the closest thing to
an industry standard (Composio/Stripe-lineage).

Signature: HMAC-SHA256 over "{id}.{timestamp}.{body}", key = base64-decoded
`whsec_` secret, output base64, header `webhook-signature: v1,<b64>` plus
`webhook-id` and `webhook-timestamp`. Receivers verify with any Standard
Webhooks library. Delivery is best-effort fire-and-forget for this reference
platform (a production build would add retries + a delivery worker + DLQ).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from datetime import datetime, timezone

import httpx
from sqlmodel import Field, Session, SQLModel, select

from ..db import engine, new_id

logger = logging.getLogger("voice-agent.webhooks")


class WebhookEndpoint(SQLModel, table=True):
    id: str = Field(primary_key=True)
    workspace: str = Field(default="default", index=True)
    url: str
    secret: str = ""  # whsec_<base64>
    events: str = "*"  # csv of event types, or "*"
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def new_secret() -> str:
    return "whsec_" + base64.b64encode(secrets.token_bytes(24)).decode()


def sign(secret: str, msg_id: str, timestamp: int, body: bytes) -> str:
    key = base64.b64decode(secret.split("_", 1)[1]) if "_" in secret else secret.encode()
    signed = f"{msg_id}.{timestamp}.".encode() + body
    digest = hmac.new(key, signed, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def endpoint_out(e: WebhookEndpoint) -> dict:
    return {"id": e.id, "url": e.url, "events": e.events.split(","), "enabled": e.enabled,
            "secret_hint": (e.secret[:14] + "…") if e.secret else "", "created_at": e.created_at.isoformat()}


def _headers(secret: str, event: dict, body: bytes) -> dict:
    msg_id = event["id"]
    ts = int(time.time())
    return {
        "Content-Type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": sign(secret, msg_id, ts, body),
    }


def _post_sync(url: str, secret: str, event: dict) -> dict:
    body = json.dumps(event, default=str).encode()
    try:
        with httpx.Client(timeout=10) as client:
            r = client.post(url, content=body, headers=_headers(secret, event, body))
        return {"ok": 200 <= r.status_code < 300, "status": r.status_code,
                "response": (r.text or "")[:300], "event_id": event["id"]}
    except Exception as exc:
        logger.warning("webhook delivery to %s failed: %s", url, exc)
        return {"ok": False, "status": 0, "error": str(exc)[:200], "event_id": event["id"]}


async def _deliver(url: str, secret: str, event: dict) -> None:
    body = json.dumps(event, default=str).encode()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            await client.post(url, content=body, headers=_headers(secret, event, body))
    except Exception as exc:
        logger.warning("webhook delivery to %s failed: %s", url, exc)


def make_event(event_type: str, data: dict) -> dict:
    return {
        "id": new_id("evt"),
        "type": event_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


def deliver_one(endpoint: WebhookEndpoint, event_type: str, data: dict) -> dict:
    """Deliver one event and report the real outcome. Powers the 'send test
    event' button, so the developer sees the status their endpoint returned."""
    return _post_sync(endpoint.url, endpoint.secret, make_event(event_type, data))


def emit(event_type: str, data: dict) -> None:
    """Fire an event to every subscribed endpoint, without blocking the caller."""
    event = make_event(event_type, data)
    try:
        with Session(engine) as session:
            eps = session.exec(select(WebhookEndpoint).where(WebhookEndpoint.enabled == True)).all()  # noqa: E712
    except Exception:
        return
    targets = [e for e in eps if e.events == "*" or event_type in e.events.split(",")]
    for e in targets:
        try:
            asyncio.get_running_loop().create_task(_deliver(e.url, e.secret, event))
        except RuntimeError:
            # Sync routes run in a threadpool with no event loop, so the task
            # above would raise and the event would be dropped. Deliver on a
            # daemon thread instead.
            threading.Thread(target=_post_sync, args=(e.url, e.secret, event), daemon=True).start()
