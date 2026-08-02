"""Developer settings (studio side) — manage API keys + webhook endpoints.

Open behind the studio login wall like the other studio APIs. The keys minted
here authenticate the external /v1 API; the webhooks here receive run events.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session, new_id
from ..publicapi.keys import ApiKey, generate_key, key_out
from ..publicapi.webhooks import WebhookEndpoint, endpoint_out, new_secret

router = APIRouter(prefix="/api/dev", tags=["developer"])

EVENT_TYPES = [
    "run.started", "run.completed", "run.failed",
    "call.started", "call.ended",
    "tool.called",
]


# ── API keys ─────────────────────────────────────────────────────────────


class KeyRequest(BaseModel):
    name: str = ""
    publishable: bool = False


@router.get("/keys")
def list_keys(session: Session = Depends(get_session)):
    rows = session.exec(select(ApiKey).order_by(ApiKey.created_at.desc())).all()
    return [key_out(k) for k in rows]


@router.post("/keys")
def create_key(req: KeyRequest, session: Session = Depends(get_session)):
    rec, secret = generate_key(session, "default", req.name, req.publishable)
    return {**key_out(rec), "secret": secret}  # secret shown exactly once


@router.delete("/keys/{key_id}")
def revoke_key(key_id: str, session: Session = Depends(get_session)):
    k = session.get(ApiKey, key_id)
    if k is None:
        raise HTTPException(404, "key not found")
    k.revoked = True
    session.add(k)
    session.commit()
    return {"ok": True}


# ── webhook endpoints ─────────────────────────────────────────────────────


class WebhookRequest(BaseModel):
    url: str
    events: list[str] = ["*"]


@router.get("/events")
def event_types():
    return {"events": EVENT_TYPES}


@router.get("/webhooks")
def list_webhooks(session: Session = Depends(get_session)):
    rows = session.exec(select(WebhookEndpoint).order_by(WebhookEndpoint.created_at.desc())).all()
    return [endpoint_out(e) for e in rows]


@router.post("/webhooks")
def create_webhook(req: WebhookRequest, session: Session = Depends(get_session)):
    e = WebhookEndpoint(
        id=new_id("whep"), url=req.url,
        events=",".join(req.events) if req.events else "*",
        secret=new_secret(),
    )
    session.add(e)
    session.commit()
    return {**endpoint_out(e), "secret": e.secret}  # full secret shown once


@router.delete("/webhooks/{wh_id}")
def delete_webhook(wh_id: str, session: Session = Depends(get_session)):
    e = session.get(WebhookEndpoint, wh_id)
    if e is None:
        raise HTTPException(404, "webhook not found")
    session.delete(e)
    session.commit()
    return {"ok": True}


@router.post("/webhooks/{wh_id}/test")
def test_webhook(wh_id: str, session: Session = Depends(get_session)):
    """Send a signed sample event so the developer can verify their endpoint and
    their signature check without waiting for a real call."""
    from ..publicapi.webhooks import deliver_one

    e = session.get(WebhookEndpoint, wh_id)
    if e is None:
        raise HTTPException(404, "webhook not found")
    sample = {
        "object": "run", "id": "run_test_0000", "agent_id": "exp_test_0000",
        "status": "success", "output": {"result": "This is a test event from RelayVoice."},
    }
    return deliver_one(e, "run.completed", sample)
