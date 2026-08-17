"""Thin client for the platform backend (apps/server).

Reliability stance: the backend is a dependency, not a hard requirement.
If it's down, the agent still answers calls with baked-in defaults — a voice
agent that fails to pick up because a CRUD API is redeploying is the kind of
thing that only shows up when real users start calling.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger("voice-agent.backend")

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
TIMEOUT = httpx.Timeout(3.0, connect=1.5)

FALLBACK_CONFIG: dict = {
    "system_prompt": (
        "You are the voice assistant for this business. Be concise — one to three "
        "short spoken sentences per turn. No lists, no markdown, no URLs. If you "
        "don't know something, say so and offer to transfer to a person."
    ),
    "greeting": "Hi! Thanks for calling. How can I help you today?",
    "stt_model": os.getenv("STT_MODEL", "nova-3"),
    "stt_language": os.getenv("STT_LANGUAGE", "multi"),
    "stt_keyterms": [],
    "tts_provider": "elevenlabs",
    "tts_voice_id": os.getenv("TTS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
    "tts_model": os.getenv("TTS_MODEL", "eleven_flash_v2_5"),
    "vad_min_silence": float(os.getenv("VAD_MIN_SILENCE", "0.40")),
    "vad_activation_threshold": float(os.getenv("VAD_ACTIVATION_THRESHOLD", "0.55")),
    "min_endpointing_delay": float(os.getenv("MIN_ENDPOINTING_DELAY", "0.40")),
    "max_endpointing_delay": float(os.getenv("MAX_ENDPOINTING_DELAY", "6.0")),
    "allow_interruptions": os.getenv("ALLOW_INTERRUPTIONS", "true").lower() == "true",
    "min_interruption_duration": float(os.getenv("MIN_INTERRUPTION_DURATION", "0.55")),
    "llm_model": os.getenv("XAI_REALTIME_MODEL", "grok-3-mini"),
}


async def fetch_agent_config() -> dict:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{BACKEND_URL}/api/agent/config")
            resp.raise_for_status()
            return {**FALLBACK_CONFIG, **resp.json()}
    except Exception as exc:
        logger.warning("agent config fetch failed (%s) — using fallback defaults", exc)
        return dict(FALLBACK_CONFIG)


async def fetch_active_workflows() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{BACKEND_URL}/api/workflows/active")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("workflow fetch failed (%s) — continuing without workflows", exc)
        return []


async def fetch_compiled_ability(ability_id: str) -> dict | None:
    """Fetch a compiled Ability flow (script + tools) to structure the call."""
    if not ability_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{BACKEND_URL}/api/abilities/{ability_id}/compiled")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("ability fetch failed (%s) — continuing without it", exc)
        return None


async def search_knowledge_base(query: str, top_k: int = 5) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/knowledge/search",
                json={"query": query, "top_k": top_k},
            )
            resp.raise_for_status()
            return resp.json()["results"]
    except Exception as exc:
        logger.warning("KB search failed: %s", exc)
        return []


async def save_transcript(room: str, items: list[dict], metrics: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            await client.post(
                f"{BACKEND_URL}/api/transcripts",
                json={"room": room, "items": items, "metrics": metrics},
            )
    except Exception as exc:
        logger.warning("transcript save failed: %s", exc)


async def fetch_transfer_targets() -> dict:
    """Team members (with direct line + extension) the agent can transfer to."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{BACKEND_URL}/api/telephony/transfer-targets")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("transfer targets fetch failed: %s", exc)
        return {"agents": [], "numbers": []}


async def fetch_routing(to_number: str) -> dict:
    """How an inbound call to `to_number` should be routed (owner + IVR menu)."""
    if not to_number:
        return {"found": False}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{BACKEND_URL}/api/telephony/routing", params={"to": to_number})
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("routing fetch failed: %s", exc)
        return {"found": False}


async def register_call(room: str, from_number: str, to_number: str, direction: str = "inbound") -> None:
    """Tell the platform a phone call is live in this room, so it appears in the
    telephony call log. Best-effort: a failure here must never drop the call."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            await client.post(
                f"{BACKEND_URL}/api/telephony/calls/register",
                json={"room": room, "from_number": from_number, "to_number": to_number, "direction": direction},
            )
    except Exception as exc:
        logger.warning("call register failed: %s", exc)


async def business_prompt() -> str:
    """The business profile rendered as a prompt block.

    Returns "" when nothing is configured; the caller decides whether that is
    worth warning about. Never raises into the session start path — a missing
    profile should degrade the agent, not drop the call.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{BACKEND_URL}/api/business")
            resp.raise_for_status()
            return (resp.json().get("_prompt") or "").strip()
    except Exception:
        return ""
