"""Telephony: real phone numbers, calls, and SMS.

Numbers are provisioned through a provider (Twilio to start) behind the adapter
in app/telephony. Call audio is bridged into the same LiveKit voice agent that
powers the web demo — outbound via a LiveKit SIP participant, inbound via the
number's voice webhook returning TwiML that dials LiveKit's SIP endpoint. SMS is
sent through the provider and inbound texts arrive on the messaging webhook,
optionally auto-answered by the business-aware LLM.

Everything degrades cleanly when unconfigured: the list endpoints read the DB
and the write endpoints return a 409 the studio renders as 'connect a provider'.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Form, Request, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import Call, CallTranscript, FaxMessage, PhoneNumber, SmsMessage, get_session, new_id, now
from ..telephony import livekit_sip, service
from ..telephony.base import TelephonyError

logger = logging.getLogger("voice-agent.telephony")

router = APIRouter(prefix="/api/telephony", tags=["telephony"])


# ── serialization ────────────────────────────────────────────────────────────
def _num_out(n: PhoneNumber) -> dict:
    import json

    return {
        "id": n.id,
        "e164": n.e164,
        "friendly_name": n.friendly_name or n.e164,
        "country": n.country,
        "provider": n.provider,
        "capabilities": json.loads(n.capabilities_json or "{}"),
        "inbound_agent": n.inbound_agent,
        "sms_autoreply": n.sms_autoreply,
        "assigned_to": n.assigned_to,
        "ivr": json.loads(n.ivr_json or "{}"),
        "status": n.status,
        "monthly_cost": n.monthly_cost,
        "created_at": n.created_at.isoformat(),
    }


def _call_out(c: Call) -> dict:
    return {
        "id": c.id,
        "direction": c.direction,
        "from_number": c.from_number,
        "to_number": c.to_number,
        "provider": c.provider,
        "room": c.room,
        "status": c.status,
        "duration_sec": c.duration_sec,
        "recording_url": c.recording_url,
        "error": c.error,
        "created_at": c.created_at.isoformat(),
    }


def _msg_out(m: SmsMessage) -> dict:
    return {
        "id": m.id,
        "direction": m.direction,
        "from_number": m.from_number,
        "to_number": m.to_number,
        "counterparty": m.counterparty,
        "body": m.body,
        "status": m.status,
        "error": m.error,
        "created_at": m.created_at.isoformat(),
    }


def _fax_out(f: FaxMessage) -> dict:
    return {
        "id": f.id,
        "direction": f.direction,
        "from_number": f.from_number,
        "to_number": f.to_number,
        "counterparty": f.counterparty,
        "media_url": f.media_url,
        "pages": f.pages,
        "status": f.status,
        "error": f.error,
        "created_at": f.created_at.isoformat(),
    }


def _err(exc: TelephonyError):
    from fastapi import HTTPException

    return HTTPException(getattr(exc, "status", 502), str(exc))


# ── settings ─────────────────────────────────────────────────────────────────
class SettingsIn(BaseModel):
    provider: str = "twilio"
    config: dict = {}


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    row = service.get_config_row(session)
    provider = service.build_provider(row)
    base = service.public_base_url()
    lk = service.livekit_dict(row)
    return {
        "provider": row.provider,
        "configured": provider.configured(),
        "config": service.masked_config(row),
        "public_base_url": base,
        # provider-aware: the studio shows the endpoints for the active carrier
        "webhooks": {
            "voice": f"{base}/api/telephony/webhooks/{row.provider}/voice",
            "sms": f"{base}/api/telephony/webhooks/{row.provider}/sms",
            "status": f"{base}/api/telephony/webhooks/{row.provider}/status",
        },
        "livekit": {
            "outbound_trunk_id": lk.get("outbound_trunk_id", ""),
            "inbound_trunk_id": lk.get("inbound_trunk_id", ""),
            "dispatch_rule_id": lk.get("dispatch_rule_id", ""),
            "sip_host": lk.get("sip_host", ""),
            "ready": bool(lk.get("outbound_trunk_id")),
        },
        "local_dev": base.startswith("http://localhost") or base.startswith("http://127."),
    }


@router.put("/settings")
def put_settings(req: SettingsIn, session: Session = Depends(get_session)):
    service.save_config(session, req.provider, req.config)
    return get_settings(session)


class ConnectIn(BaseModel):
    # provider SIP host for outbound (e.g. Twilio Elastic SIP: <name>.pstn.twilio.com)
    sip_domain: str = ""
    sip_username: str = ""
    sip_password: str = ""
    # LiveKit SIP host inbound calls are dialed to (e.g. <proj>.sip.livekit.cloud)
    sip_host: str = ""


@router.post("/connect")
async def connect(req: ConnectIn, session: Session = Depends(get_session)):
    """Provision the LiveKit SIP trunks that bridge PSTN <-> the agent, and point
    every owned number's webhooks back at us. Idempotent: cached trunk ids are
    reused. This is the 'go live' button once credentials are pasted."""
    row = service.get_config_row(session)
    provider = service.build_provider(row)
    if not provider.configured():
        raise _err(TelephonyError("Add provider credentials before connecting.", status=409))

    lk = service.livekit_dict(row)
    numbers = [n.e164 for n in session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).all()]
    result: dict = {"outbound": False, "inbound": False, "numbers_configured": 0, "warnings": []}

    # outbound trunk (dial out through the provider)
    if req.sip_domain:
        try:
            out_id = await livekit_sip.ensure_outbound_trunk(
                sip_domain=req.sip_domain,
                numbers=numbers or [],
                username=req.sip_username,
                password=req.sip_password,
                existing_id=lk.get("outbound_trunk_id", ""),
            )
            service.save_livekit(session, {"outbound_trunk_id": out_id, "sip_host": req.sip_host})
            result["outbound"] = True
        except TelephonyError as exc:
            result["warnings"].append(f"Outbound trunk: {exc}")
        except Exception as exc:  # SDK/version surprises must not 500 the button
            result["warnings"].append(f"Outbound trunk: {exc}")

    # inbound trunk + dispatch rule (accept calls forwarded to LiveKit)
    if numbers:
        try:
            in_id = await livekit_sip.ensure_inbound_trunk(
                numbers=numbers, existing_id=lk.get("inbound_trunk_id", "")
            )
            rule_id = await livekit_sip.ensure_dispatch_rule(
                trunk_id=in_id, existing_id=service.livekit_dict(service.get_config_row(session)).get("dispatch_rule_id", "")
            )
            service.save_livekit(session, {"inbound_trunk_id": in_id, "dispatch_rule_id": rule_id})
            result["inbound"] = True
        except TelephonyError as exc:
            result["warnings"].append(f"Inbound trunk: {exc}")
        except Exception as exc:
            result["warnings"].append(f"Inbound trunk: {exc}")

    # point each number's webhooks at us so calls + texts arrive
    base = service.public_base_url()
    for n in session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).all():
        if not n.provider_sid:
            continue
        try:
            await provider.configure_number(
                n.provider_sid,
                voice_url=f"{base}/api/telephony/webhooks/{provider.name}/voice",
                sms_url=f"{base}/api/telephony/webhooks/{provider.name}/sms",
                status_url=f"{base}/api/telephony/webhooks/{provider.name}/status",
            )
            result["numbers_configured"] += 1
        except Exception as exc:
            result["warnings"].append(f"{n.e164}: {exc}")

    return {**result, "settings": get_settings(session)}


# ── numbers ──────────────────────────────────────────────────────────────────
@router.get("/numbers")
def list_numbers(session: Session = Depends(get_session)):
    rows = session.exec(
        select(PhoneNumber).where(PhoneNumber.status != "released").order_by(PhoneNumber.created_at.desc())
    ).all()
    return [_num_out(n) for n in rows]


@router.get("/numbers/search")
async def search_numbers(
    country: str = "US",
    area_code: str = "",
    contains: str = "",
    sms: bool = True,
    voice: bool = True,
    session: Session = Depends(get_session),
):
    provider = service.get_provider(session)
    try:
        found = await provider.search_numbers(
            country, area_code=area_code, contains=contains, sms=sms, voice=voice, limit=20
        )
    except TelephonyError as exc:
        raise _err(exc)
    return [n.to_dict() for n in found]


class BuyIn(BaseModel):
    e164: str
    country: str = "US"
    friendly_name: str = ""


@router.post("/numbers/buy")
async def buy_number(req: BuyIn, session: Session = Depends(get_session)):
    import json

    from ..telephony.base import AvailableNumber

    provider = service.get_provider(session)
    try:
        bought = await provider.buy_number(
            AvailableNumber(e164=req.e164, country=req.country, friendly_name=req.friendly_name)
        )
    except TelephonyError as exc:
        raise _err(exc)

    row = PhoneNumber(
        id=new_id("pn"),
        e164=bought.e164,
        friendly_name=req.friendly_name or bought.friendly_name or bought.e164,
        country=bought.country,
        provider=provider.name,
        provider_sid=bought.provider_sid,
        capabilities_json=json.dumps(bought.capabilities),
        monthly_cost=bought.monthly_cost,
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    # wire this number's webhooks immediately so it works the moment it's bought
    base = service.public_base_url()
    try:
        await provider.configure_number(
            bought.provider_sid,
            voice_url=f"{base}/api/telephony/webhooks/{provider.name}/voice",
            sms_url=f"{base}/api/telephony/webhooks/{provider.name}/sms",
            status_url=f"{base}/api/telephony/webhooks/{provider.name}/status",
        )
    except Exception as exc:
        logger.warning("could not auto-configure webhooks for %s: %s", bought.e164, exc)

    return _num_out(row)


class NumberPatch(BaseModel):
    friendly_name: str | None = None
    inbound_agent: str | None = None
    sms_autoreply: bool | None = None
    assigned_to: str | None = None
    ivr: dict | None = None


@router.patch("/numbers/{number_id}")
def update_number(number_id: str, patch: NumberPatch, session: Session = Depends(get_session)):
    from fastapi import HTTPException

    n = session.get(PhoneNumber, number_id)
    if not n:
        raise HTTPException(404, "Number not found")
    if patch.friendly_name is not None:
        n.friendly_name = patch.friendly_name
    if patch.inbound_agent is not None:
        n.inbound_agent = patch.inbound_agent
    if patch.sms_autoreply is not None:
        n.sms_autoreply = patch.sms_autoreply
    if patch.assigned_to is not None:
        n.assigned_to = patch.assigned_to
    if patch.ivr is not None:
        n.ivr_json = json.dumps(patch.ivr)
    n.updated_at = now()
    session.add(n)
    session.commit()
    session.refresh(n)
    return _num_out(n)


# ── agents (team members as transfer targets) + routing resolution ───────────
class AgentPatch(BaseModel):
    phone: str | None = None
    extension: str | None = None


@router.get("/agents")
def list_agents(session: Session = Depends(get_session)):
    """Team members as call routing targets, with their direct line + extension."""
    from ..db import TeamMember

    rows = session.exec(select(TeamMember)).all()
    return [
        {"id": m.id, "name": m.name, "initials": m.initials, "color": m.color,
         "role": m.role, "phone": m.phone, "extension": m.extension}
        for m in rows
    ]


@router.patch("/agents/{agent_id}")
def update_agent(agent_id: str, patch: AgentPatch, session: Session = Depends(get_session)):
    from fastapi import HTTPException

    from ..db import TeamMember

    m = session.get(TeamMember, agent_id)
    if not m:
        raise HTTPException(404, "Team member not found")
    if patch.phone is not None:
        m.phone = patch.phone
    if patch.extension is not None:
        m.extension = patch.extension
    session.add(m)
    session.commit()
    session.refresh(m)
    return {"id": m.id, "name": m.name, "phone": m.phone, "extension": m.extension}


@router.get("/routing")
def routing(to: str = "", session: Session = Depends(get_session)):
    """Resolve how an inbound call to `to` (our e164) should be handled: the
    assigned owner and any IVR menu. The voice worker calls this on pickup."""
    from ..db import TeamMember

    n = session.exec(select(PhoneNumber).where(PhoneNumber.e164 == to)).first()
    members = {m.id: m for m in session.exec(select(TeamMember)).all()}

    def target_label(action: str, target: str) -> dict:
        if action in ("agent", "extension"):
            m = members.get(target) or next((x for x in members.values() if x.extension == target), None)
            return {"name": m.name if m else target, "phone": m.phone if m else "", "extension": m.extension if m else target}
        return {"number": target}

    if not n:
        return {"found": False, "assigned_to": "", "ivr": {"enabled": False}}
    ivr = json.loads(n.ivr_json or "{}")
    # decorate IVR options with resolved targets so the agent can act directly
    for opt in ivr.get("options", []) or []:
        opt["resolved"] = target_label(opt.get("action", ""), opt.get("target", ""))
    assigned = n.assigned_to
    assigned_member = members.get(assigned)
    return {
        "found": True,
        "e164": n.e164,
        "assigned_to": assigned,
        "assigned_member": (
            {"name": assigned_member.name, "phone": assigned_member.phone, "extension": assigned_member.extension}
            if assigned_member else None
        ),
        "inbound_agent": n.inbound_agent,
        "ivr": ivr,
    }


@router.get("/transfer-targets")
def transfer_targets(session: Session = Depends(get_session)):
    """Everything the agent can transfer a caller to: team members (with a direct
    line or extension) plus the workspace numbers."""
    from ..db import TeamMember

    members = session.exec(select(TeamMember)).all()
    numbers = session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).all()
    return {
        "agents": [
            {"id": m.id, "name": m.name, "phone": m.phone, "extension": m.extension, "role": m.role}
            for m in members if m.role != "ai"
        ],
        "numbers": [{"id": n.id, "e164": n.e164, "name": n.friendly_name} for n in numbers],
    }


@router.delete("/numbers/{number_id}")
async def release_number(number_id: str, session: Session = Depends(get_session)):
    from fastapi import HTTPException

    n = session.get(PhoneNumber, number_id)
    if not n:
        raise HTTPException(404, "Number not found")
    provider = service.get_provider(session)
    if n.provider_sid:
        try:
            await provider.release_number(n.provider_sid)
        except TelephonyError as exc:
            raise _err(exc)
    n.status = "released"
    n.updated_at = now()
    session.add(n)
    session.commit()
    return {"ok": True}


# ── calls ────────────────────────────────────────────────────────────────────
@router.get("/calls")
def list_calls(session: Session = Depends(get_session)):
    rows = session.exec(select(Call).order_by(Call.created_at.desc()).limit(100)).all()
    return [_call_out(c) for c in rows]


@router.get("/calls/{call_id}")
def get_call(call_id: str, session: Session = Depends(get_session)):
    import json

    from fastapi import HTTPException

    c = session.get(Call, call_id)
    if not c:
        raise HTTPException(404, "Call not found")
    out = _call_out(c)
    if c.room:
        t = session.exec(select(CallTranscript).where(CallTranscript.room == c.room)).first()
        out["transcript"] = json.loads(t.items_json) if t else []
        out["metrics"] = json.loads(t.metrics_json) if t else {}
    return out


class RegisterCallIn(BaseModel):
    room: str
    from_number: str = ""
    to_number: str = ""
    direction: str = "inbound"


@router.post("/calls/register")
def register_call(req: RegisterCallIn, session: Session = Depends(get_session)):
    """Upsert a call by its LiveKit room. The voice worker calls this when a SIP
    participant joins, so inbound calls land in the log even on a pure LiveKit SIP
    trunk (no provider voice webhook). Outbound calls already have a row keyed by
    the same room, so this is a no-op for them."""
    existing = session.exec(select(Call).where(Call.room == req.room)).first()
    if existing:
        return _call_out(existing)
    num = None
    if req.to_number:
        num = session.exec(select(PhoneNumber).where(PhoneNumber.e164 == req.to_number)).first()
    call = Call(
        id=new_id("cl"),
        direction=req.direction or "inbound",
        from_number=req.from_number,
        to_number=req.to_number,
        number_id=num.id if num else None,
        provider=service.get_config_row(session).provider,
        room=req.room,
        status="in-progress",
    )
    session.add(call)
    session.commit()
    session.refresh(call)
    return _call_out(call)


class PlaceCallIn(BaseModel):
    to: str
    from_number_id: str = ""  # which owned number to call from (its e164 is caller id)


@router.post("/calls")
async def place_call(req: PlaceCallIn, session: Session = Depends(get_session)):
    from fastapi import HTTPException

    row = service.get_config_row(session)
    provider = service.build_provider(row)
    if not provider.configured():
        raise HTTPException(409, "Telephony is not configured. Add credentials in Settings.")
    lk = service.livekit_dict(row)
    trunk_id = lk.get("outbound_trunk_id", "")
    if not trunk_id:
        raise HTTPException(409, "No outbound SIP trunk. Click Connect in Settings first.")

    # caller id: the chosen owned number, or the first active one
    from_num = None
    if req.from_number_id:
        from_num = session.get(PhoneNumber, req.from_number_id)
    if from_num is None:
        from_num = session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).first()
    caller_id = from_num.e164 if from_num else ""

    call = Call(
        id=new_id("cl"),
        direction="outbound",
        from_number=caller_id,
        to_number=req.to,
        number_id=from_num.id if from_num else None,
        provider=provider.name,
        room=None,
        status="queued",
    )
    room = f"call-{call.id}"
    call.room = room
    session.add(call)
    session.commit()
    session.refresh(call)

    try:
        await livekit_sip.start_outbound_call(
            trunk_id=trunk_id,
            to_e164=req.to,
            room_name=room,
            identity=f"pstn-{call.id}",
            caller_id=caller_id,
        )
        call.status = "ringing"
    except TelephonyError as exc:
        call.status = "failed"
        call.error = str(exc)
        session.add(call)
        session.commit()
        raise _err(exc)
    except Exception as exc:
        call.status = "failed"
        call.error = str(exc)
        session.add(call)
        session.commit()
        raise HTTPException(502, f"Could not place call: {exc}")

    call.updated_at = now()
    session.add(call)
    session.commit()
    session.refresh(call)
    return _call_out(call)


# ── messages ─────────────────────────────────────────────────────────────────
@router.get("/messages/threads")
def list_threads(session: Session = Depends(get_session)):
    """Group messages by counterparty into conversation threads, newest first."""
    rows = session.exec(select(SmsMessage).order_by(SmsMessage.created_at.desc()).limit(500)).all()
    threads: dict[str, dict] = {}
    for m in rows:
        key = m.counterparty or (m.to_number if m.direction == "outbound" else m.from_number)
        t = threads.get(key)
        if t is None:
            threads[key] = {
                "counterparty": key,
                "last_body": m.body,
                "last_direction": m.direction,
                "last_at": m.created_at.isoformat(),
                "count": 1,
                "our_number": m.from_number if m.direction == "outbound" else m.to_number,
            }
        else:
            t["count"] += 1
    return list(threads.values())


@router.get("/messages/threads/{counterparty}")
def get_thread(counterparty: str, session: Session = Depends(get_session)):
    rows = session.exec(
        select(SmsMessage).where(SmsMessage.counterparty == counterparty).order_by(SmsMessage.created_at.asc())
    ).all()
    return [_msg_out(m) for m in rows]


class SendSmsIn(BaseModel):
    to: str
    body: str
    from_number_id: str = ""


@router.post("/messages")
async def send_message(req: SendSmsIn, session: Session = Depends(get_session)):
    from fastapi import HTTPException

    provider = service.get_provider(session)
    from_num = None
    if req.from_number_id:
        from_num = session.get(PhoneNumber, req.from_number_id)
    if from_num is None:
        from_num = session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).first()
    if from_num is None:
        raise HTTPException(409, "Buy a number before sending messages.")

    m = SmsMessage(
        id=new_id("sm"),
        direction="outbound",
        from_number=from_num.e164,
        to_number=req.to,
        number_id=from_num.id,
        counterparty=req.to,
        provider=provider.name,
        body=req.body,
        status="queued",
    )
    try:
        sent = await provider.send_sms(from_num.e164, req.to, req.body)
        m.provider_sid = sent.provider_sid
        m.status = sent.status
    except TelephonyError as exc:
        m.status = "failed"
        m.error = str(exc)
        session.add(m)
        session.commit()
        raise _err(exc)
    session.add(m)
    session.commit()
    session.refresh(m)
    return _msg_out(m)


# ── fax ──────────────────────────────────────────────────────────────────────
class SendFaxIn(BaseModel):
    to: str
    media_url: str
    from_number_id: str = ""


@router.get("/fax")
def list_faxes(session: Session = Depends(get_session)):
    rows = session.exec(select(FaxMessage).order_by(FaxMessage.created_at.desc()).limit(100)).all()
    return [_fax_out(f) for f in rows]


@router.post("/fax")
async def send_fax(req: SendFaxIn, session: Session = Depends(get_session)):
    """Send a document (a publicly reachable PDF URL) as a fax through the
    provider. Telnyx carries it; other providers return an honest 409."""
    from fastapi import HTTPException

    if not req.media_url.strip():
        raise HTTPException(422, "A fax needs a document: pass a PDF URL as media_url.")
    provider = service.get_provider(session)
    from_num = None
    if req.from_number_id:
        from_num = session.get(PhoneNumber, req.from_number_id)
    if from_num is None:
        from_num = session.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).first()
    if from_num is None:
        raise HTTPException(409, "Buy a number before sending faxes.")

    f = FaxMessage(
        id=new_id("fx"),
        direction="outbound",
        from_number=from_num.e164,
        to_number=req.to,
        number_id=from_num.id,
        counterparty=req.to,
        provider=provider.name,
        media_url=req.media_url.strip(),
        status="queued",
    )
    try:
        sent = await provider.send_fax(from_num.e164, req.to, req.media_url.strip())
        f.provider_sid = sent.provider_sid
        f.status = sent.status
    except TelephonyError as exc:
        f.status = "failed"
        f.error = str(exc)
        session.add(f)
        session.commit()
        raise _err(exc)
    session.add(f)
    session.commit()
    session.refresh(f)
    return _fax_out(f)


@router.post("/webhooks/telnyx/fax")
async def telnyx_fax(request: Request, session: Session = Depends(get_session)):
    """Telnyx fax webhook (JSON events). fax.received logs an inbound fax with
    its document URL; delivery/failure events update the outbound row."""
    try:
        event = (await request.json()).get("data") or {}
    except Exception:
        return PlainTextResponse("")
    etype = event.get("event_type", "")
    payload = event.get("payload") or {}
    sid = payload.get("fax_id") or payload.get("id") or ""

    if etype == "fax.received":
        from_number = payload.get("from", "") or ""
        to_number = payload.get("to", "") or ""
        num = session.exec(select(PhoneNumber).where(PhoneNumber.e164 == to_number)).first()
        session.add(FaxMessage(
            id=new_id("fx"), direction="inbound", from_number=from_number, to_number=to_number,
            number_id=num.id if num else None, counterparty=from_number, provider="telnyx",
            provider_sid=sid, media_url=payload.get("media_url", "") or "",
            pages=int(payload.get("page_count") or 0), status="received",
        ))
        session.commit()
        try:
            from ..publicapi import webhooks as out_hooks

            out_hooks.emit("fax.received", {"object": "fax", "from": from_number, "to": to_number})
        except Exception:
            pass
    elif etype.startswith("fax."):
        # fax.queued / fax.media.processed / fax.sending / fax.delivered / fax.failed
        f = session.exec(select(FaxMessage).where(FaxMessage.provider_sid == sid)).first() if sid else None
        if f:
            status = etype.removeprefix("fax.").replace("media.processed", "sending")
            f.status = {"queued": "queued", "sending": "sending", "delivered": "delivered", "failed": "failed"}.get(status, f.status)
            if payload.get("page_count"):
                try:
                    f.pages = int(payload["page_count"])
                except (TypeError, ValueError):
                    pass
            if etype == "fax.failed":
                f.error = payload.get("failure_reason", "") or "delivery failed"
            session.add(f)
            session.commit()
    return PlainTextResponse("")


# ── inbound webhooks (Twilio) ────────────────────────────────────────────────
async def _verify(request: Request, session: Session) -> bool:
    provider = service.get_provider(session)
    sig = request.headers.get("X-Twilio-Signature", "")
    form = await request.form()
    params = {k: v for k, v in form.items()}
    url = str(request.url)
    try:
        return provider.verify_webhook(url, params, sig)
    except Exception:
        return False


@router.post("/webhooks/twilio/voice")
@router.post("/webhooks/telnyx/voice")  # TeXML posts are Twilio compatible
async def twilio_voice(request: Request, session: Session = Depends(get_session)):
    """Inbound call. Log it, then hand the media to the LiveKit agent by dialing
    LiveKit's SIP host (a dispatch rule there drops the call into a fresh room the
    agent auto-joins). If LiveKit SIP isn't wired yet, answer with an honest
    holding message rather than dropping the caller into dead air."""
    form = await request.form()
    from_number = str(form.get("From", ""))
    to_number = str(form.get("To", ""))
    call_sid = str(form.get("CallSid", ""))

    num = session.exec(select(PhoneNumber).where(PhoneNumber.e164 == to_number)).first()
    call = Call(
        id=new_id("cl"),
        direction="inbound",
        from_number=from_number,
        to_number=to_number,
        number_id=num.id if num else None,
        provider="twilio",
        provider_sid=call_sid,
        status="ringing",
    )
    session.add(call)
    session.commit()

    lk = service.livekit_dict(service.get_config_row(session))
    sip_host = lk.get("sip_host", "")
    if sip_host:
        # Bridge to LiveKit over SIP. answerOnBridge keeps the caller hearing
        # ringback until the agent's room actually connects.
        local = to_number.lstrip("+") or "agent"
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Response><Dial answerOnBridge="true">'
            f'<Sip>sip:{local}@{sip_host};transport=tcp</Sip>'
            "</Dial></Response>"
        )
        return Response(content=xml, media_type="application/xml")

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Say>Thanks for calling. This line is being set up and cannot take "
        "your call yet. Please try again shortly.</Say></Response>"
    )
    return Response(content=xml, media_type="application/xml")


@router.post("/webhooks/twilio/status")
@router.post("/webhooks/telnyx/status")  # TeXML status callbacks share the shape
async def twilio_status(
    request: Request,
    CallSid: str = Form(""),
    CallStatus: str = Form(""),
    CallDuration: str = Form("0"),
    RecordingUrl: str = Form(""),
    session: Session = Depends(get_session),
):
    c = session.exec(select(Call).where(Call.provider_sid == CallSid)).first()
    if c:
        if CallStatus:
            c.status = CallStatus
        try:
            c.duration_sec = int(CallDuration or 0)
        except ValueError:
            pass
        if RecordingUrl:
            c.recording_url = RecordingUrl
        c.updated_at = now()
        session.add(c)
        session.commit()
    return PlainTextResponse("")


@router.post("/webhooks/twilio/sms-status")
async def twilio_sms_status(
    MessageSid: str = Form(""), MessageStatus: str = Form(""), session: Session = Depends(get_session)
):
    m = session.exec(select(SmsMessage).where(SmsMessage.provider_sid == MessageSid)).first()
    if m and MessageStatus:
        m.status = MessageStatus
        session.add(m)
        session.commit()
    return PlainTextResponse("")


@router.post("/webhooks/twilio/sms")
async def twilio_sms(
    request: Request,
    From: str = Form(""),
    To: str = Form(""),
    Body: str = Form(""),
    MessageSid: str = Form(""),
    session: Session = Depends(get_session),
):
    """Inbound SMS. Log it, emit a webhook event, and — if the receiving number
    has auto-reply on — answer with the business-aware LLM."""
    num = session.exec(select(PhoneNumber).where(PhoneNumber.e164 == To)).first()
    inbound = SmsMessage(
        id=new_id("sm"),
        direction="inbound",
        from_number=From,
        to_number=To,
        number_id=num.id if num else None,
        counterparty=From,
        provider="twilio",
        provider_sid=MessageSid,
        body=Body,
        status="received",
    )
    session.add(inbound)
    session.commit()

    try:
        from ..publicapi import webhooks as out_hooks

        out_hooks.emit("message.received", {"object": "message", "from": From, "to": To, "body": Body})
    except Exception:
        pass

    reply_xml = ""
    if num and num.sms_autoreply and Body.strip():
        reply = await _autoreply(session, num, From, To, Body)
        if reply:
            reply_xml = f"<Message>{_xml_escape(reply)}</Message>"

    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response>{reply_xml}</Response>'
    return Response(content=xml, media_type="application/xml")


def _xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;").replace("'", "&apos;")
    )


async def _autoreply(session: Session, num: PhoneNumber, from_e164: str, to_e164: str, body: str, provider: str = "twilio") -> str:
    """Generate an SMS reply with the same business context the voice agent has,
    log it as an outbound message (TwiML sends it), and return the text. Failures
    are swallowed — a bad LLM call must never break receiving the inbound text."""
    from .. import llm as llmmod
    from . import business as business_router

    try:
        profile = business_router.load(session)
        biz = business_router.to_prompt(profile)
    except Exception:
        biz = ""
    try:
        client = llmmod.client()
        sys = (
            "You are the business texting a customer back over SMS. Reply in one or two short, "
            "warm, plain-text sentences — no markdown, no emojis unless natural. If you don't "
            "know something, say you'll follow up. Never invent prices or promises.\n\n" + (biz or "")
        )
        resp = await client.chat.completions.create(
            model=llmmod.model(),
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": body}],
            temperature=0.5,
            max_tokens=160,
        )
        reply = (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.warning("SMS auto-reply failed: %s", exc)
        return ""

    if not reply:
        return ""
    out = SmsMessage(
        id=new_id("sm"),
        direction="outbound",
        from_number=to_e164,
        to_number=from_e164,
        number_id=num.id,
        counterparty=from_e164,
        provider=provider,
        body=reply,
        status="sent",
    )
    session.add(out)
    session.commit()
    return reply


@router.post("/webhooks/telnyx/sms")
async def telnyx_sms(request: Request, session: Session = Depends(get_session)):
    """Telnyx messaging webhook (JSON events). message.received logs the inbound
    text and, when the number has auto reply on, answers through the API (there
    is no TwiML-style inline reply on Telnyx). Delivery events update status."""
    try:
        event = (await request.json()).get("data") or {}
    except Exception:
        return PlainTextResponse("")
    etype = event.get("event_type", "")
    payload = event.get("payload") or {}

    if etype == "message.received":
        from_number = (payload.get("from") or {}).get("phone_number", "")
        tos = payload.get("to") or [{}]
        to_number = tos[0].get("phone_number", "") if tos else ""
        body = payload.get("text", "") or ""
        num = session.exec(select(PhoneNumber).where(PhoneNumber.e164 == to_number)).first()
        session.add(SmsMessage(
            id=new_id("sm"), direction="inbound", from_number=from_number, to_number=to_number,
            number_id=num.id if num else None, counterparty=from_number, provider="telnyx",
            provider_sid=payload.get("id", ""), body=body, status="received",
        ))
        session.commit()
        try:
            from ..publicapi import webhooks as out_hooks

            out_hooks.emit("message.received", {"object": "message", "from": from_number, "to": to_number, "body": body})
        except Exception:
            pass
        if num and num.sms_autoreply and body.strip():
            reply = await _autoreply(session, num, from_number, to_number, body, provider="telnyx")
            if reply:
                try:
                    provider = service.get_provider(session)
                    sent = await provider.send_sms(to_number, from_number, reply)
                    row = session.exec(
                        select(SmsMessage).where(SmsMessage.counterparty == from_number)
                        .order_by(SmsMessage.created_at.desc())
                    ).first()
                    if row and row.direction == "outbound" and not row.provider_sid:
                        row.provider_sid = sent.provider_sid
                        row.status = sent.status
                        session.add(row)
                        session.commit()
                except Exception as exc:
                    logger.warning("telnyx auto reply send failed: %s", exc)
    elif etype in ("message.sent", "message.finalized"):
        sid = payload.get("id", "")
        tos = payload.get("to") or [{}]
        status = tos[0].get("status", "") if tos else ""
        if sid and status:
            m = session.exec(select(SmsMessage).where(SmsMessage.provider_sid == sid)).first()
            if m:
                m.status = status
                session.add(m)
                session.commit()
    return PlainTextResponse("")
