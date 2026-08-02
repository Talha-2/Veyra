"""Resolve the active telephony provider from stored config, and hold the small
amount of shared state the router needs (public base URL for webhooks, LiveKit
SIP trunk ids). The router does the DB bookkeeping; this module owns 'which
provider, configured how'."""

from __future__ import annotations

import json

from sqlmodel import Session

from ..config import settings
from ..db import TelephonyConfig
from .base import TelephonyProvider
from .twilio_provider import TwilioProvider, UnconfiguredProvider

# Secrets we never echo back to the browser once stored. The settings endpoint
# returns a masked hint instead so the studio can show "configured" without
# handing the token back out.
SECRET_KEYS = {"auth_token", "api_key", "api_secret", "auth_password"}


def get_config_row(session: Session) -> TelephonyConfig:
    row = session.get(TelephonyConfig, 1)
    if row is None:
        row = TelephonyConfig(id=1)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def config_dict(row: TelephonyConfig) -> dict:
    try:
        return json.loads(row.config_json or "{}")
    except Exception:
        return {}


def livekit_dict(row: TelephonyConfig) -> dict:
    try:
        return json.loads(row.livekit_json or "{}")
    except Exception:
        return {}


def public_base_url() -> str:
    """Where Twilio should send inbound webhooks. Falls back to the API's own
    public base; in local dev this is localhost and inbound won't reach us, which
    the settings UI calls out (use a tunnel / deploy to a public host)."""
    return (settings.public_base_url or "http://localhost:8000").rstrip("/")


def build_provider(row: TelephonyConfig) -> TelephonyProvider:
    cfg = config_dict(row)
    # the provider needs to know where our webhooks live to set status callbacks
    cfg = {**cfg, "public_base_url": public_base_url()}
    provider = (row.provider or "twilio").lower()
    if provider == "twilio" and (cfg.get("account_sid") and cfg.get("auth_token")):
        return TwilioProvider(cfg)
    # telnyx / signalwire adapters slot in here the same way
    return UnconfiguredProvider()


def get_provider(session: Session) -> TelephonyProvider:
    return build_provider(get_config_row(session))


def masked_config(row: TelephonyConfig) -> dict:
    """Config safe to send to the browser: secrets replaced by a set/unset flag."""
    cfg = config_dict(row)
    out: dict = {}
    for k, v in cfg.items():
        if k in SECRET_KEYS:
            out[k] = {"set": bool(v)}
        else:
            out[k] = v
    return out


def save_config(session: Session, provider: str, updates: dict) -> TelephonyConfig:
    """Merge new settings in. A blank value for a secret key means 'leave it', so
    the studio can save non-secret changes without re-pasting the token; sending
    the literal string 'null' clears it."""
    from ..db import now

    row = get_config_row(session)
    cfg = config_dict(row)
    for k, v in (updates or {}).items():
        if k in SECRET_KEYS and (v is None or v == ""):
            continue  # keep the existing secret
        if v == "null":
            cfg.pop(k, None)
            continue
        cfg[k] = v
    if provider:
        row.provider = provider.lower()
    row.config_json = json.dumps(cfg)
    row.updated_at = now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def save_livekit(session: Session, updates: dict) -> TelephonyConfig:
    from ..db import now

    row = get_config_row(session)
    lk = livekit_dict(row)
    lk.update({k: v for k, v in updates.items() if v})
    row.livekit_json = json.dumps(lk)
    row.updated_at = now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
