"""Auth API: native email+password with OTP email verification and password
reset, plus Google OAuth (active only when GOOGLE_CLIENT_ID/SECRET are set).

The studio login-wall is enforced in the web app (redirect to /login); these
endpoints issue and validate the session JWT it stores.
"""

from __future__ import annotations

import urllib.parse

import httpx
import re
from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
from sqlmodel import Session, select

from ..config import settings
from ..db import engine
from ..auth.core import (
    AuthCode,
    User,
    code_expiry,
    decode_token,
    deliver_code,
    dev_reveal,
    generate_code,
    hash_password,
    issue_token,
    new_id,
    now,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── schemas ───────────────────────────────────────────────────────────────


class _EmailBase(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        v = v.lower().strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address.")
        return v


class SignupRequest(_EmailBase):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(_EmailBase):
    password: str


class EmailRequest(_EmailBase):
    pass


class VerifyRequest(_EmailBase):
    code: str = Field(min_length=6, max_length=6)


class ResetRequest(_EmailBase):
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=200)


def _user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "email_verified": u.email_verified,
        "avatar_url": u.avatar_url,
    }


def _issue_verification(s: Session, email: str, purpose: str) -> str:
    code = generate_code()
    s.add(AuthCode(id=new_id("code"), email=email, purpose=purpose, code=code, expires_at=code_expiry()))
    s.commit()
    deliver_code(email, purpose, code)
    return code


def _consume_code(s: Session, email: str, purpose: str, code: str) -> bool:
    row = s.exec(
        select(AuthCode)
        .where(AuthCode.email == email, AuthCode.purpose == purpose, AuthCode.code == code, AuthCode.used == False)  # noqa: E712
        .order_by(AuthCode.created_at.desc())
    ).first()
    if row is None:
        return False
    # SQLite returns naive datetimes; treat stored expiry as UTC before comparing
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now():
        return False
    row.used = True
    s.add(row)
    s.commit()
    return True


# ── native auth ───────────────────────────────────────────────────────────


@router.post("/signup")
def signup(req: SignupRequest):
    email = req.email.lower().strip()
    with Session(engine) as s:
        if s.exec(select(User).where(User.email == email)).first():
            raise HTTPException(409, "An account with this email already exists.")
        user = User(id=new_id("usr"), email=email, name=req.name.strip(), password_hash=hash_password(req.password))
        s.add(user)
        s.commit()
        code = _issue_verification(s, email, "verify")
    return {"email": email, "needs_verification": True, **dev_reveal(code)}


@router.post("/login")
def login(req: LoginRequest):
    email = req.email.lower().strip()
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        if user is None or not user.password_hash or not verify_password(req.password, user.password_hash):
            raise HTTPException(401, "Incorrect email or password.")
        if not user.email_verified:
            code = _issue_verification(s, email, "verify")
            raise HTTPException(403, detail={"needs_verification": True, "email": email, **dev_reveal(code)})
        return {"token": issue_token(user), "user": _user_out(user)}


@router.post("/verify")
def verify(req: VerifyRequest):
    email = req.email.lower().strip()
    with Session(engine) as s:
        if not _consume_code(s, email, "verify", req.code):
            raise HTTPException(400, "Invalid or expired code.")
        user = s.exec(select(User).where(User.email == email)).first()
        if user is None:
            raise HTTPException(404, "Account not found.")
        user.email_verified = True
        s.add(user)
        s.commit()
        return {"token": issue_token(user), "user": _user_out(user)}


@router.post("/resend")
def resend(req: EmailRequest):
    email = req.email.lower().strip()
    with Session(engine) as s:
        if s.exec(select(User).where(User.email == email)).first():
            code = _issue_verification(s, email, "verify")
            return {"ok": True, **dev_reveal(code)}
    return {"ok": True}  # don't leak which emails exist


@router.post("/request-reset")
def request_reset(req: EmailRequest):
    email = req.email.lower().strip()
    with Session(engine) as s:
        if s.exec(select(User).where(User.email == email)).first():
            code = _issue_verification(s, email, "reset")
            return {"ok": True, **dev_reveal(code)}
    return {"ok": True}  # same response whether or not the account exists


@router.post("/reset")
def reset(req: ResetRequest):
    email = req.email.lower().strip()
    with Session(engine) as s:
        if not _consume_code(s, email, "reset", req.code):
            raise HTTPException(400, "Invalid or expired code.")
        user = s.exec(select(User).where(User.email == email)).first()
        if user is None:
            raise HTTPException(404, "Account not found.")
        user.password_hash = hash_password(req.password)
        user.email_verified = True
        s.add(user)
        s.commit()
        return {"token": issue_token(user), "user": _user_out(user)}


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(authorization.split(" ", 1)[1])
    if payload is None:
        raise HTTPException(401, "Invalid or expired session")
    return payload


@router.get("/me")
def me(payload: dict = Depends(current_user)):
    with Session(engine) as s:
        user = s.get(User, payload["sub"])
        if user is None:
            raise HTTPException(401, "Account not found")
        return _user_out(user)


# ── Google OAuth (stubbed until configured) ───────────────────────────────

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo"


def _google_redirect_uri() -> str:
    return settings.google_redirect_uri or "http://localhost:8000/api/auth/google/callback"


@router.get("/google/config")
def google_config():
    if not settings.google_client_id or not settings.google_client_secret:
        return {"configured": False}
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": _google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
    }
    return {"configured": True, "auth_url": f"{GOOGLE_AUTH}?{urllib.parse.urlencode(params)}"}


@router.get("/google/callback")
async def google_callback(code: str | None = None, error: str | None = None):
    fe = settings.frontend_url.rstrip("/")
    if error or not code or not settings.google_client_id:
        return RedirectResponse(f"{fe}/login?error=google")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            tok = await client.post(GOOGLE_TOKEN, data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": _google_redirect_uri(),
                "grant_type": "authorization_code",
            })
            tok.raise_for_status()
            access = tok.json()["access_token"]
            info = await client.get(GOOGLE_USERINFO, headers={"Authorization": f"Bearer {access}"})
            info.raise_for_status()
            profile = info.json()
    except Exception:
        return RedirectResponse(f"{fe}/login?error=google")

    email = (profile.get("email") or "").lower().strip()
    if not email:
        return RedirectResponse(f"{fe}/login?error=google")
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        if user is None:
            user = User(id=new_id("usr"), email=email, name=profile.get("name", ""), email_verified=True)
        user.google_sub = profile.get("sub")
        user.email_verified = True
        if profile.get("picture"):
            user.avatar_url = profile["picture"]
        s.add(user)
        s.commit()
        s.refresh(user)
        token = issue_token(user)
    return RedirectResponse(f"{fe}/auth/callback#token={token}")
