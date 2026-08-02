"""Auth primitives: user/code models, password hashing (stdlib pbkdf2 — no
native build deps), JWT sessions, OTP generation, and dev-mode email.

Design notes:
- Password hashing uses hashlib.pbkdf2_hmac so the image needs no bcrypt/argon2
  wheel (one less thing to break on a flaky Docker build). 200k iterations.
- OTP + reset codes live in a table with a purpose + expiry; single-use.
- Dev mode returns codes in API responses so the flow is testable without an
  email provider. Swap _send_email for real SMTP/Resend later — that's the only
  seam that changes.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from sqlmodel import Field, SQLModel

from ..config import settings

logger = logging.getLogger("voice-agent.auth")

_PBKDF2_ROUNDS = 200_000


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


# ── models ────────────────────────────────────────────────────────────────


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str = ""
    password_hash: str = ""  # empty for OAuth-only accounts
    google_sub: str | None = Field(default=None, index=True)
    email_verified: bool = False
    avatar_url: str | None = None
    created_at: datetime = Field(default_factory=now)


class AuthCode(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(index=True)
    purpose: str  # "verify" | "reset"
    code: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=now)


# ── password hashing ──────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, rounds, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ── JWT sessions ──────────────────────────────────────────────────────────


def issue_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "iat": int(now().timestamp()),
        "exp": int((now() + timedelta(hours=settings.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.auth_secret, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.auth_secret, algorithms=["HS256"])
    except Exception:
        return None


# ── OTP / codes ───────────────────────────────────────────────────────────


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def code_expiry(minutes: int = 15) -> datetime:
    return now() + timedelta(minutes=minutes)


# ── email (dev-mode) ──────────────────────────────────────────────────────


def send_email(to: str, subject: str, body: str) -> None:
    """Dev-mode: log only. Replace with SMTP/Resend to go live — nothing else
    in the flow needs to change."""
    logger.info("EMAIL to=%s | %s\n%s", to, subject, body)


def deliver_code(email: str, purpose: str, code: str) -> None:
    label = "verification" if purpose == "verify" else "password reset"
    send_email(email, f"Your RelayVoice {label} code", f"Your {label} code is: {code}\nIt expires in 15 minutes.")


def dev_reveal(code: str) -> dict:
    """Include the code in the API response only in dev mode, so the flow is
    testable without an inbox."""
    return {"dev_code": code} if settings.dev_mode else {}
