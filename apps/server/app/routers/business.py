"""The business profile: who the agent works for.

Every call starts with the agent knowing these facts. That is the whole
point of the split from the knowledge base — a caller asking "are you open
now?" should never trigger a retrieval round trip, because the answer is
identity, not reference material.

`to_prompt()` renders only the fields that are filled, so a half configured
profile produces a tight prompt instead of a wall of blank labels.
"""

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from ..db import BusinessProfile, get_session, now

router = APIRouter(prefix="/api/business", tags=["business"])

# field -> how it is introduced in the prompt. Order matters: the model reads
# top down, so identity comes before logistics before edge cases.
FIELDS: list[tuple[str, str]] = [
    ("name", "Business name"),
    ("what_we_do", "What the business does"),
    ("timezone", "Timezone (all times you say are in this zone)"),
    ("hours", "Opening hours"),
    ("address", "Address"),
    ("phone", "Main phone number"),
    ("website", "Website"),
    ("services", "Services offered"),
    ("pricing", "Pricing"),
    ("policies", "Policies (cancellation, payment, refunds)"),
    ("escalation", "When to transfer to a human"),
    ("notes", "Other things to know"),
]

DEFAULT_PROFILE = {k: "" for k, _ in FIELDS}
# Voice only: the model has no idea how an unusual name sounds, and getting
# the caller's own business name wrong on the greeting is the fastest way to
# sound fake.
DEFAULT_PROFILE["pronunciation"] = ""


class ProfileIn(BaseModel):
    name: str | None = None
    what_we_do: str | None = None
    timezone: str | None = None
    hours: str | None = None
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    services: str | None = None
    pricing: str | None = None
    policies: str | None = None
    escalation: str | None = None
    notes: str | None = None
    pronunciation: str | None = None


def load(session: Session) -> dict:
    row = session.get(BusinessProfile, 1)
    stored = json.loads(row.profile_json) if row else {}
    return {**DEFAULT_PROFILE, **stored}


def to_prompt(profile: dict) -> str:
    """Render the profile as a prompt block. Empty fields are dropped."""
    lines = []
    for key, label in FIELDS:
        val = (profile.get(key) or "").strip()
        if val:
            lines.append(f"{label}: {val}")
    if not lines:
        return ""
    say = (profile.get("pronunciation") or "").strip()
    header = "WHO YOU WORK FOR — these are facts, state them directly, never say you need to look them up:"
    block = header + "\n" + "\n".join(lines)
    if say:
        block += f"\n\nPronounce the business name as: {say}"
    return block


def completeness(profile: dict) -> dict:
    """Drives the setup nudge in the studio. Identity and timezone are what
    actually break a call when missing, so they are the required set."""
    required = ["name", "what_we_do", "timezone", "hours"]
    missing = [k for k in required if not (profile.get(k) or "").strip()]
    filled = sum(1 for k, _ in FIELDS if (profile.get(k) or "").strip())
    return {
        "ready": not missing,
        "missing_required": missing,
        "filled": filled,
        "total": len(FIELDS),
    }


@router.get("")
def get_profile(session: Session = Depends(get_session)):
    profile = load(session)
    return {**profile, "_status": completeness(profile), "_prompt": to_prompt(profile)}


@router.put("")
def put_profile(req: ProfileIn, session: Session = Depends(get_session)):
    row = session.get(BusinessProfile, 1) or BusinessProfile(id=1)
    merged = {**json.loads(row.profile_json or "{}")}
    merged.update({k: v for k, v in req.model_dump().items() if v is not None})
    row.profile_json = json.dumps(merged)
    row.updated_at = now()
    session.add(row)
    session.commit()
    profile = {**DEFAULT_PROFILE, **merged}
    return {**profile, "_status": completeness(profile), "_prompt": to_prompt(profile)}
