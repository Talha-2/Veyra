"""Subscribing to app events for real.

Choosing "New Gmail Message" in the UI only records intent. This is the part
that makes it happen: it finds the live connected account for that toolkit,
creates a trigger instance with Composio, and hands back the instance id so the
expert can be unsubscribed later.

Composio polls the app and delivers the event to the webhook configured on the
account, so nothing here has to hold a connection open.
"""

from __future__ import annotations

import logging

import httpx

from ..config import settings

logger = logging.getLogger("voice-agent.triggers")

BASE = "https://backend.composio.dev/api/v3.1"


def _headers() -> dict:
    return {"x-api-key": settings.composio_api_key, "Content-Type": "application/json"}


def connected_account(toolkit: str) -> str | None:
    """The live account for a toolkit. Expired and revoked ones cannot carry a
    subscription, so they are skipped rather than failing later."""
    if not settings.composio_api_key:
        return None
    try:
        r = httpx.get(f"{BASE}/connected_accounts", params={"limit": 50},
                      headers=_headers(), timeout=25)
        r.raise_for_status()
        for a in r.json().get("items", []):
            tk = (a.get("toolkit") or {}).get("slug") or a.get("toolkit_slug")
            if tk == toolkit.lower() and (a.get("status") or "").upper() == "ACTIVE":
                return a.get("id")
    except Exception as exc:
        logger.warning("connected_account(%s) failed: %s", toolkit, exc)
    return None


def subscribe(toolkit: str, trigger_slug: str, config: dict | None = None) -> dict:
    """Create a trigger instance. Returns {ok, id} or {ok:False, error}."""
    if not settings.composio_api_key:
        return {"ok": False, "error": "Composio is not configured."}

    account = connected_account(toolkit)
    if not account:
        return {"ok": False,
                "error": f"No active {toolkit} connection. Connect it in Integrations first."}

    # Composio wants declared config keys only, and typed: the schema says
    # number for things like interval, and a string there is rejected
    clean: dict = {}
    for k, v in (config or {}).items():
        if v in ("", None):
            continue
        if isinstance(v, str) and v.replace(".", "", 1).isdigit():
            clean[k] = float(v) if "." in v else int(v)
        else:
            clean[k] = v

    try:
        r = httpx.post(
            f"{BASE}/trigger_instances/{trigger_slug}/upsert",
            headers=_headers(), timeout=30,
            json={"connected_account_id": account, "trigger_config": clean},
        )
        if r.status_code >= 400:
            return {"ok": False, "error": f"{r.status_code}: {r.text[:220]}"}
        data = r.json()
        return {"ok": True, "id": data.get("trigger_id") or data.get("id"), "account": account}
    except Exception as exc:
        logger.error("subscribe(%s) failed: %s", trigger_slug, exc)
        return {"ok": False, "error": str(exc)[:220]}


def unsubscribe(instance_id: str) -> dict:
    if not settings.composio_api_key or not instance_id:
        return {"ok": True}
    try:
        r = httpx.delete(f"{BASE}/trigger_instances/manage/{instance_id}",
                         headers=_headers(), timeout=25)
        return {"ok": r.status_code < 400, "status": r.status_code}
    except Exception as exc:
        logger.warning("unsubscribe(%s) failed: %s", instance_id, exc)
        return {"ok": False, "error": str(exc)[:160]}


def set_enabled(instance_id: str, enabled: bool) -> dict:
    """Pause without losing the subscription, for when an expert goes inactive."""
    if not settings.composio_api_key or not instance_id:
        return {"ok": True}
    try:
        r = httpx.patch(f"{BASE}/trigger_instances/manage/{instance_id}",
                        headers=_headers(), timeout=25,
                        json={"status": "enable" if enabled else "disable"})
        return {"ok": r.status_code < 400, "status": r.status_code}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:160]}
