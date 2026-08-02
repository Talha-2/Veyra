"""API keys for the external REST API (v1).

Follows the industry pattern (Stripe/OpenAI/GitHub): a prefixed key
`z360_sk_live_<secret>`; only a SHA-256 hash is stored; the full secret is shown
exactly once at creation. A separate publishable prefix `z360_pk_live_` is
reserved for the browser widget (safe to expose). Verification is constant-time.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Header, HTTPException
from sqlmodel import Field, Session, SQLModel, select

from ..db import engine, new_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ApiKey(SQLModel, table=True):
    id: str = Field(primary_key=True)
    workspace: str = Field(default="default", index=True)
    name: str = ""
    prefix: str = ""  # e.g. "z360_sk_live_ab12…" for display
    last4: str = ""
    key_hash: str = Field(index=True)  # sha256 of the full secret
    scopes: str = "runs:write,runs:read,agents:read"
    revoked: bool = False
    created_at: datetime = Field(default_factory=_now)
    last_used_at: datetime | None = None


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def generate_key(session: Session, workspace: str, name: str, publishable: bool = False) -> tuple[ApiKey, str]:
    """Create a key; returns (record, full_secret). The secret is not stored."""
    kind = "pk" if publishable else "sk"
    secret = f"z360_{kind}_live_{secrets.token_urlsafe(32)}"
    rec = ApiKey(
        id=new_id("key"),
        workspace=workspace,
        name=name or ("Publishable key" if publishable else "Secret key"),
        prefix=secret[: len(f"z360_{kind}_live_") + 6] + "…",
        last4=secret[-4:],
        key_hash=_hash(secret),
        scopes="widget" if publishable else "runs:write,runs:read,agents:read,tools:read",
    )
    session.add(rec)
    session.commit()
    return rec, secret


def key_out(k: ApiKey) -> dict:
    return {
        "id": k.id, "name": k.name, "prefix": k.prefix, "last4": k.last4,
        "scopes": k.scopes.split(","), "revoked": k.revoked,
        "created_at": k.created_at.isoformat(),
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
    }


def require_api_key(authorization: str = Header(default="")) -> ApiKey:
    """FastAPI dependency for /v1 endpoints. Verifies the Bearer key."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing 'Authorization: Bearer <key>'")
    secret = authorization.split(" ", 1)[1].strip()
    h = _hash(secret)
    with Session(engine) as session:
        # constant-time-ish: hash lookup is O(1) and doesn't leak via timing
        key = session.exec(select(ApiKey).where(ApiKey.key_hash == h)).first()
        if key is None or key.revoked:
            raise HTTPException(401, "Invalid or revoked API key")
        key.last_used_at = _now()
        session.add(key)
        session.commit()
        session.refresh(key)
        return key
