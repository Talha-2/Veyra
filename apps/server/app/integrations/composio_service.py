"""Composio v3 SDK wrapper (package `composio` >= 0.17).

Stub-safe: every function degrades gracefully when COMPOSIO_API_KEY is unset, so
the integrations UI is fully browsable and custom actions / MCP still work. The
client is constructed lazily and cached (construction is offline-safe — no
network at import/init per the SDK).

Single-workspace: all connections share one Composio `user_id`, so the voice
agent (which serves anonymous demo callers) can use them on any call.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from ..config import settings

logger = logging.getLogger("voice-agent.composio")

# stable Composio user/entity id for this workspace's connected accounts
USER_ID = "relayvoice-workspace"


READONLY_MSG = (
    "Your Composio API key is read only, so it can browse the catalog but cannot connect apps. "
    "Create a key with write access in the Composio dashboard, set COMPOSIO_API_KEY in .env, "
    "then restart the server."
)

# probe result is cached: connecting is a write, and a read only key fails it
_write_probe: dict = {"ts": 0.0, "ok": None}


def is_configured() -> bool:
    return bool(settings.composio_api_key)


def _is_auth_error(exc: object) -> bool:
    s = str(exc)
    return "401" in s or "Invalid API key" in s or "HTTP_Unauthorized" in s


def can_write() -> bool:
    """Composio issues read only keys too, and every connect is a write.

    Probe once with an intentionally empty POST body: a read only key is
    rejected at auth (401) before validation, while a writable key gets a
    validation error instead. No object is ever created either way.
    """
    import time
    import urllib.error
    import urllib.request

    if not settings.composio_api_key:
        return False
    if _write_probe["ok"] is not None and time.time() - _write_probe["ts"] < 300:
        return bool(_write_probe["ok"])

    ok = True
    try:
        req = urllib.request.Request(
            "https://backend.composio.dev/api/v3.1/auth_configs",
            data=b"{}",
            method="POST",
            headers={"x-api-key": settings.composio_api_key, "Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as exc:
        ok = exc.code != 401  # 401 = read only key; 4xx validation = key may write
    except Exception:
        ok = True  # network trouble should not block the UI
    _write_probe.update(ts=time.time(), ok=ok)
    return ok


@lru_cache(maxsize=1)
def _client():
    if not settings.composio_api_key:
        return None
    try:
        from composio import Composio  # local import: optional dependency

        return Composio(api_key=settings.composio_api_key)
    except Exception as exc:  # pragma: no cover - env dependent
        logger.warning("Composio client init failed: %s", exc)
        return None


def authorize(toolkit: str) -> dict:
    """Start managed-OAuth for a toolkit; returns the hosted redirect URL the
    user visits to authorize, plus Composio's connection-request id."""
    client = _client()
    if client is None:
        return {"configured": False}
    try:
        req = client.toolkits.authorize(user_id=USER_ID, toolkit=toolkit.lower())
        return {
            "configured": True,
            "redirect_url": getattr(req, "redirect_url", None),
            "composio_connection_id": getattr(req, "id", None),
        }
    except Exception as exc:
        logger.error("authorize(%s) failed: %s", toolkit, exc)
        if _is_auth_error(exc):
            return {"configured": True, "error": READONLY_MSG}
        return {"configured": True, "error": str(exc)[:300]}


def connect_with_credentials(toolkit: str, scheme: str, credentials: dict) -> dict:
    """Connect a non OAuth app (API key, bearer, basic).

    Creates a custom auth config for the toolkit, then initiates a connected
    account with the credentials the user typed into the generic connect form.
    """
    client = _client()
    if client is None:
        return {"configured": False}
    try:
        auth_config = client.auth_configs.create(
            toolkit=toolkit.lower(),
            options={"type": "use_custom_auth", "auth_scheme": scheme.upper(), "credentials": {}},
        )
        req = client.connected_accounts.initiate(
            user_id=USER_ID,
            auth_config_id=getattr(auth_config, "id", None) or auth_config["id"],
            config={"auth_scheme": scheme.upper(), "val": credentials or {}},
        )
        return {
            "configured": True,
            "composio_connection_id": getattr(req, "id", None),
            "redirect_url": getattr(req, "redirect_url", None),  # usually None for API key
            "status": (getattr(req, "status", "") or "").lower(),
        }
    except Exception as exc:
        logger.error("connect_with_credentials(%s) failed: %s", toolkit, exc)
        if _is_auth_error(exc):
            return {"configured": True, "error": READONLY_MSG}
        return {"configured": True, "error": str(exc)[:300]}


def connection_status(composio_connection_id: str) -> dict:
    """Poll a connection's status; used to flip 'initiated' → 'active'."""
    client = _client()
    if client is None or not composio_connection_id:
        return {}
    try:
        acc = client.connected_accounts.get(composio_connection_id)
        status = (getattr(acc, "status", "") or "").lower()
        email = None
        data = getattr(acc, "data", None) or {}
        if isinstance(data, dict):
            email = data.get("email") or data.get("user_email")
        return {"status": status, "email": email}
    except Exception as exc:
        logger.warning("connection_status failed: %s", exc)
        return {}


def get_openai_tools(toolkits: list[str]) -> list[dict]:
    """OpenAI function-tool dicts for the given connected toolkits — consumed by
    the voice worker. Returns [] on any failure so a call never breaks."""
    client = _client()
    if client is None or not toolkits:
        return []
    try:
        tools = client.tools.get(user_id=USER_ID, toolkits=[t.upper() for t in toolkits])
        return list(tools) if tools else []
    except Exception as exc:
        logger.warning("get_openai_tools failed: %s", exc)
        return []


def execute(slug: str, arguments: dict) -> dict:
    """Execute a Composio tool. Returns {data, error, successful}-ish."""
    client = _client()
    if client is None:
        return {"successful": False, "error": "Composio not configured"}
    try:
        res = client.tools.execute(
            slug, user_id=USER_ID, arguments=arguments or {},
            dangerously_skip_version_check=True,
        )
        if isinstance(res, dict):
            return res
        return {"successful": getattr(res, "successful", True), "data": getattr(res, "data", res),
                "error": getattr(res, "error", None)}
    except Exception as exc:
        logger.error("execute(%s) failed: %s", slug, exc)
        return {"successful": False, "error": str(exc)[:300]}
