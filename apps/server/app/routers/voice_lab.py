"""Voice lab — the testing bench for the Voice Tuning page.

Proxies ElevenLabs (voices list + TTS synthesis) so the API key never reaches
the browser, and lets the studio preview a voice, A/B compare voices/models, and
read per synthesis latency. Degrades to a stub (configured:false) with a small
curated catalog when no ElevenLabs key is set, so the UI stays useful.
"""

from __future__ import annotations

import json
import os
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session

from ..config import settings
from ..db import AgentConfig, get_session

router = APIRouter(prefix="/api/voice", tags=["voice-lab"])

EL_BASE = "https://api.elevenlabs.io"

# model tiers with research seeded latency/positioning (labelled as vendor claim)
MODELS = [
    {"id": "eleven_flash_v2_5", "label": "Flash v2.5", "latency_ms": 75, "note": "Fastest, best for realtime voice"},
    {"id": "eleven_turbo_v2_5", "label": "Turbo v2.5", "latency_ms": 300, "note": "Balanced quality and speed"},
    {"id": "eleven_multilingual_v2", "label": "Multilingual v2", "latency_ms": 1200, "note": "Highest fidelity, not realtime"},
]

# Curated catalog of well known ElevenLabs voices.
#
# Listing the account's own voices needs the `voices_read` permission, which a
# scoped key often lacks, while synthesis still works fine. So the library is
# built from this catalog and the live list is merged on top when it is
# available: the page is useful either way, and every voice here is playable.
#
# (voice_id, name, gender, accent, age, best_for, description)
_CURATED = [
    ("EXAVITQu4vr4xnSDxMaL", "Sarah", "female", "american", "young", "support", "Soft and reassuring. A safe default for inbound support."),
    ("21m00Tcm4TlvDq8ikWAM", "Rachel", "female", "american", "young", "narration", "Calm and even. Reads long answers without tiring the ear."),
    ("cgSgspJ2msm6clMCkdW9", "Jessica", "female", "american", "young", "sales", "Expressive and upbeat. Good for outbound and demos."),
    ("XrExE9yKIg1WjnnlVkGX", "Matilda", "female", "american", "middle", "support", "Warm and unhurried. Suits healthcare and appointments."),
    ("Xb7hH8MSUJpSbSDYk0k2", "Alice", "female", "british", "middle", "reception", "Confident and crisp. Reads numbers clearly."),
    ("pFZP5JQG7iQjIQuC4Bku", "Lily", "female", "british", "middle", "support", "Slightly raspy and friendly. Sounds like a real person."),
    ("ThT5KcBeYPX3keUQqHPh", "Dorothy", "female", "british", "young", "reception", "Pleasant and bright. Works well for front desk."),
    ("XB0fDUnXU5powFXDhCwa", "Charlotte", "female", "swedish", "young", "sales", "Smooth with a light accent."),
    ("pNInz6obpgDQGcFmaJgB", "Adam", "male", "american", "middle", "narration", "Deep and steady. A dependable male default."),
    ("cjVigY5qzO86Huf0OWal", "Eric", "male", "american", "middle", "support", "Friendly and natural. Good for everyday service calls."),
    ("bIHbv24MWmeRgasZH58o", "Will", "male", "american", "young", "sales", "Easy and conversational. Does not sound scripted."),
    ("iP95p4xoKVk53GoZ742B", "Chris", "male", "american", "middle", "support", "Casual and grounded."),
    ("nPczCjzI2devNBz1zQrb", "Brian", "male", "american", "middle", "narration", "Deep and resonant. Carries authority."),
    ("TxGEqnHWrfWFTfGW9XjX", "Josh", "male", "american", "young", "sales", "Youthful and energetic."),
    ("VR6AewLTigWG4xSOukaG", "Arnold", "male", "american", "middle", "narration", "Crisp and articulate."),
    ("JBFqnCBsd6RMkjVDRZzb", "George", "male", "british", "middle", "support", "Warm and measured. Reassuring on difficult calls."),
    ("onwK4e9ZLuTAKqWW03F9", "Daniel", "male", "british", "middle", "reception", "Deep and formal. Suits professional services."),
    ("IKne3meq5aSn9XLyUdCD", "Charlie", "male", "australian", "middle", "sales", "Relaxed and casual."),
    ("N2lVS1w4EtoT3dr4eOWO", "Callum", "male", "american", "middle", "narration", "Hoarse and characterful."),
    ("SAz9YHcvj6GT2YYXdXww", "River", "neutral", "american", "middle", "support", "Calm and gender neutral."),
]

_FALLBACK_VOICES = [
    {
        "voice_id": vid, "name": name, "preview_url": None, "category": "curated",
        "provider": "elevenlabs", "description": desc, "best_for": best,
        "labels": {"gender": gender, "accent": accent, "age": age, "use case": best},
    }
    for vid, name, gender, accent, age, best, desc in _CURATED
]

# ── open source voices ────────────────────────────────────────────────────
#
# Orpheus (Canopy Labs) is Apache 2.0 and hosted on Groq, so it runs on the key
# the platform already uses for the language model. That matters: it is the
# difference between paying per character for speech and not. The weights are
# also downloadable, so the same voices can be self hosted later without
# changing anything above this layer.
ORPHEUS_MODEL = "canopylabs/orpheus-v1-english"
_ORPHEUS = [
    ("tara", "Tara", "female", "american", "support", "Warm and even. The most neutral of the set."),
    ("leah", "Leah", "female", "american", "support", "Softer and slower. Good for sensitive calls."),
    ("jess", "Jess", "female", "american", "sales", "Bright and quick."),
    ("mia", "Mia", "female", "american", "reception", "Clear and professional."),
    ("zoe", "Zoe", "female", "american", "narration", "Calm and measured."),
    ("leo", "Leo", "male", "american", "support", "Steady and friendly."),
    ("dan", "Dan", "male", "american", "narration", "Deeper, unhurried."),
    ("zac", "Zac", "male", "american", "sales", "Energetic and casual."),
]
_ORPHEUS_VOICES = [
    {
        "voice_id": vid, "name": name, "preview_url": None, "category": "open source",
        "provider": "groq", "description": desc, "best_for": best,
        "labels": {"gender": gender, "accent": accent, "licence": "apache 2.0", "use case": best},
    }
    for vid, name, gender, accent, best, desc in _ORPHEUS
]


# ── Cartesia Sonic ─────────────────────────────────────────────────────────
#
# The expressive, low latency engine. These are Cartesia's built in agent voices;
# the account's own and cloned voices are merged on top live when the key allows.
CARTESIA_BASE = "https://api.cartesia.ai"
CARTESIA_VERSION = "2024-11-13"
_CARTESIA = [
    ("db6b0ed5-d5d3-463d-ae85-518a07d3c2b4", "Skylar", "female", "support", "Friendly guide. Warm and easy, a strong default."),
    ("630ed21c-2c5c-41cf-9d82-10a7fd668370", "Corey", "male", "support", "Supportive buddy. Calm and reassuring."),
    ("62ae83ad-4f6a-430b-af41-a9bede9286ca", "Gemma", "female", "sales", "Decisive agent. Crisp and confident."),
    ("ef191366-f52f-447a-a398-ed8c0f2943a1", "Archie", "male", "reception", "Approachable mate. Light and natural."),
    ("47c38ca4-5f35-497b-b1a3-415245fb35e1", "Daniel", "male", "support", "Modern assistant. Clear and even."),
    ("f786b574-daa5-4673-aa0c-cbe3e8534c02", "Katie", "female", "support", "Friendly fixer. Bright and helpful."),
    ("9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", "Jacqueline", "female", "support", "Reassuring agent. Soft and patient."),
    ("5ee9feff-1265-424a-9d7f-8e4d431a12c7", "Ronald", "male", "narration", "Thinker. Deeper and measured."),
]
_CARTESIA_VOICES = [
    {
        "voice_id": vid, "name": name, "preview_url": None, "category": "sonic",
        "provider": "cartesia", "description": desc, "best_for": best,
        "labels": {"gender": gender, "accent": "american", "use case": best},
    }
    for vid, name, gender, best, desc in _CARTESIA
]


def _cartesia_available() -> bool:
    return bool(os.getenv("CARTESIA_API_KEY"))


# ── OpenAI voices ──────────────────────────────────────────────────────────
#
# The same voices the Realtime (speech to speech) engine uses. Marin and Cedar
# are the newest and most natural. Previews are synthesized with gpt-4o-mini-tts.
OPENAI_TTS_MODEL = "gpt-4o-mini-tts"
_OPENAI = [
    ("marin", "Marin", "female", "Newest and most natural. The Realtime default."),
    ("cedar", "Cedar", "male", "Newest male voice. Warm and grounded."),
    ("alloy", "Alloy", "neutral", "Balanced and neutral."),
    ("ash", "Ash", "male", "Calm and clear."),
    ("ballad", "Ballad", "male", "Expressive and characterful."),
    ("coral", "Coral", "female", "Bright and friendly."),
    ("echo", "Echo", "male", "Even and professional."),
    ("sage", "Sage", "female", "Soft and measured."),
    ("shimmer", "Shimmer", "female", "Light and upbeat."),
    ("verse", "Verse", "male", "Engaging and lively."),
]
_OPENAI_VOICES = [
    {
        "voice_id": vid, "name": name, "preview_url": None, "category": "openai",
        "provider": "openai", "description": desc, "best_for": "realtime",
        "labels": {"gender": gender, "engine": "realtime + tts"},
    }
    for vid, name, gender, desc in _OPENAI
]


def _openai_available() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def _groq_conf() -> tuple[str, str]:
    base = (os.getenv("LLM_BASE_URL") or "").rstrip("/")
    key = os.getenv("LLM_API_KEY") or ""
    return base, key


def _groq_tts_available() -> bool:
    base, key = _groq_conf()
    return bool(key) and "groq.com" in base


def _configured() -> bool:
    return bool(settings.eleven_api_key)


@router.get("/status")
def status():
    return {"configured": _configured(), "models": MODELS}


def _extra_provider_voices() -> list[dict]:
    """Voices from providers other than ElevenLabs that are configured right now."""
    extra: list[dict] = []
    if _cartesia_available():
        extra += _CARTESIA_VOICES
    if _openai_available():
        extra += _OPENAI_VOICES
    if _groq_tts_available():
        extra += _ORPHEUS_VOICES
    return extra


@router.get("/voices")
async def voices():
    """The voice library across every configured provider: ElevenLabs (curated +
    the account's own when the key allows), Cartesia Sonic, OpenAI, and Orpheus."""
    if not _configured():
        # no ElevenLabs, but Cartesia/OpenAI/Orpheus may still be available
        return {"configured": _cartesia_available() or _openai_available(),
                "voices": _FALLBACK_VOICES + _extra_provider_voices(),
                "models": MODELS, "can_list": False, "providers": _provider_status()}

    merged = {v["voice_id"]: dict(v) for v in _FALLBACK_VOICES}
    can_list, note = False, None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{EL_BASE}/v2/voices",
                headers={"xi-api-key": settings.eleven_api_key},
                params={"page_size": 100},
            )
        if resp.status_code == 401:
            note = ("This key cannot list voices (it is missing the voices_read permission), "
                    "so the curated library is shown. Synthesis works normally. Add the "
                    "permission in the ElevenLabs dashboard to see your own and cloned voices.")
        else:
            resp.raise_for_status()
            can_list = True
            for v in resp.json().get("voices", []):
                vid = v.get("voice_id")
                if not vid:
                    continue
                base = merged.get(vid, {})
                merged[vid] = {
                    **base,
                    "voice_id": vid,
                    "name": v.get("name") or base.get("name"),
                    "labels": v.get("labels") or base.get("labels") or {},
                    "category": v.get("category") or base.get("category") or "custom",
                    "preview_url": v.get("preview_url") or base.get("preview_url"),
                    "description": v.get("description") or base.get("description") or "",
                }
    except Exception as exc:
        note = f"Could not reach ElevenLabs: {str(exc)[:140]}"

    voices = sorted(merged.values(), key=lambda v: (v.get("category") != "custom", v.get("name") or ""))
    voices = voices + _extra_provider_voices()
    return {"configured": True, "voices": voices, "models": MODELS,
            "can_list": can_list, "note": note,
            "providers": _provider_status()}


def _provider_status() -> list[dict]:
    """What can actually make sound right now, and what it costs."""
    out = [{
        "id": "elevenlabs", "name": "ElevenLabs",
        "kind": "hosted", "licence": "commercial",
        "available": _configured(),
        "note": "Paid per character. The lowest latency option at around 75 ms on Flash.",
    }, {
        "id": "cartesia", "name": "Cartesia Sonic",
        "kind": "hosted", "licence": "commercial",
        "available": _cartesia_available(),
        "note": "Expressive and low latency. The recommended cascade voice.",
    }, {
        "id": "openai", "name": "OpenAI",
        "kind": "hosted", "licence": "commercial",
        "available": _openai_available(),
        "note": "The voices the Realtime speech to speech engine uses. Marin and Cedar are the most natural.",
    }]
    base, key = _groq_conf()
    out.append({
        "id": "groq", "name": "Orpheus on Groq",
        "kind": "open source", "licence": "Apache 2.0",
        "available": _groq_tts_available(),
        "note": ("Open weights, served on the key the platform already uses for the language model. "
                 "Accept the model terms once at console.groq.com to enable it."),
    })
    return out


# ── language model bench ──────────────────────────────────────────────────
#
# On a call, the number that decides whether the agent feels alive is time to
# first token: everything after it is streamed and overlaps with speech. So we
# measure TTFT for real against the configured provider rather than quoting
# vendor numbers.


def _llm_conf() -> tuple[str, str, str]:
    base = (os.getenv("LLM_BASE_URL") or "https://api.x.ai/v1").rstrip("/")
    key = os.getenv("LLM_API_KEY") or settings.xai_api_key
    model = os.getenv("LLM_MODEL") or settings.xai_realtime_model
    return base, key, model


# Any OpenAI compatible endpoint works, so switching provider is a base URL and
# a key. These are the ones worth considering for voice, with the constraint
# that actually bites listed honestly: a free tier that cannot sustain a
# conversation is worse than a slower model that can.
PROVIDERS = [
    {
        "id": "openai", "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4.1-nano",
        "models": ["gpt-4.1-nano", "gpt-4.1-mini", "gpt-4o-mini", "gpt-5-nano"],
        "free": "paid, reliable rate limits",
        "note": "Fast nano models with strong tool calling and no per minute cliff. The current recommended default.",
        "key_url": "https://platform.openai.com/api-keys",
    },
    {
        "id": "groq", "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"],
        "free": "6k to 12k tokens per minute",
        "note": "Fastest first token, but the per minute ceiling is easy to exhaust mid conversation.",
        "key_url": "https://console.groq.com/keys",
    },
    {
        "id": "cerebras", "name": "Cerebras",
        "base_url": "https://api.cerebras.ai/v1",
        "model": "llama-3.3-70b",
        "models": ["llama-3.3-70b", "llama3.1-8b"],
        "free": "1,000,000 tokens per day",
        "note": "Far bigger free budget, still very fast. Good when a per minute cap keeps breaking calls.",
        "key_url": "https://cloud.cerebras.ai",
    },
    {
        "id": "gemini", "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-2.5-flash",
        "models": ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"],
        "free": "generous daily free tier",
        "note": "Native tool calling on a free tier, fast and multilingual. The best free option to A B against OpenAI.",
        "key_url": "https://aistudio.google.com/apikey",
    },
    {
        "id": "openrouter", "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "meta-llama/llama-3.3-70b-instruct",
        "models": ["meta-llama/llama-3.3-70b-instruct", "google/gemini-2.0-flash-001"],
        "free": "20 requests per minute",
        "note": "One key, many models, useful as a fallback. Routing adds latency versus going direct.",
        "key_url": "https://openrouter.ai/keys",
    },
    {
        "id": "mistral", "name": "Mistral",
        "base_url": "https://api.mistral.ai/v1",
        "model": "mistral-small-latest",
        "models": ["mistral-small-latest", "mistral-large-latest"],
        "free": "free tier available",
        "note": "European hosting, solid small models.",
        "key_url": "https://console.mistral.ai/api-keys",
    },
    {
        "id": "xai", "name": "xAI Grok",
        "base_url": "https://api.x.ai/v1",
        "model": "grok-3-mini",
        "models": ["grok-3-mini", "grok-2"],
        "free": "paid credits",
        "note": "Good latency, but needs credits on the team.",
        "key_url": "https://console.x.ai",
    },
]


@router.get("/llm/providers")
def llm_providers(session: Session = Depends(get_session)):
    # Read the SAME source the agent reads — the studio config in the DB, then env
    # — so the picker reflects the model that actually answers calls, not a stale
    # env default. This was the source of the "UI says Groq, agent uses OpenAI" gap.
    row = session.get(AgentConfig, 1)
    stored = json.loads(row.config_json) if row and row.config_json else {}
    base = (stored.get("llm_base_url") or os.getenv("LLM_BASE_URL") or "https://api.x.ai/v1").rstrip("/")
    model = stored.get("llm_model") or os.getenv("LLM_MODEL") or settings.xai_realtime_model
    active = next((p["id"] for p in PROVIDERS if p["base_url"].rstrip("/") == base), "custom")
    return {"providers": PROVIDERS, "active": active, "base_url": base, "model": model,
            "configured": True}


class ProviderTest(BaseModel):
    base_url: str
    api_key: str
    model: str


@router.post("/llm/providers/test")
async def llm_provider_test(req: ProviderTest):
    """Prove a provider works before committing to it: streams a real completion
    and reports time to first token, which is the number that decides voice."""
    base = req.base_url.rstrip("/")
    t0 = time.perf_counter()
    ttft = None
    text = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST", f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {req.api_key}", "Content-Type": "application/json"},
                json={"model": req.model, "stream": True, "max_tokens": 60,
                      "messages": [
                          {"role": "system", "content": "You are a concise voice assistant. One short spoken sentence."},
                          {"role": "user", "content": "A caller wants to book an appointment. Ask for their name."}]},
            ) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread())[:220].decode(errors="replace")
                    return {"ok": False, "error": f"{resp.status_code}: {body}"}
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                    except Exception:
                        continue
                    delta = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content")
                    if delta:
                        if ttft is None:
                            ttft = round((time.perf_counter() - t0) * 1000, 1)
                        text += delta
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}

    if ttft is None:
        return {"ok": False, "error": "The model streamed no content. Reasoning models often buffer, which cannot work on a call."}
    if "<think" in text.lower():
        return {"ok": False, "ttft_ms": ttft,
                "error": "This model emits its reasoning as text, so the caller would hear it. Pick a non reasoning model."}
    return {"ok": True, "ttft_ms": ttft,
            "total_ms": round((time.perf_counter() - t0) * 1000, 1),
            "output": text.strip()[:160]}


@router.get("/llm/models")
async def llm_models():
    """Models the configured OpenAI compatible provider actually offers."""
    base, key, current = _llm_conf()
    out = {"configured": bool(key), "base_url": base, "current": current, "models": []}
    if not key:
        return out
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
        out["models"] = sorted({m.get("id") for m in data.get("data", []) if m.get("id")})
    except Exception as exc:
        out["error"] = str(exc)[:200]
    return out


class BenchRequest(BaseModel):
    models: list[str]
    prompt: str = "A caller asks what your opening hours are. Answer in one short sentence."
    system: str = "You are a concise voice assistant. Reply in one short spoken sentence."


@router.post("/llm/bench")
async def llm_bench(req: BenchRequest):
    """Stream a real completion from each model and time the first token."""
    base, key, _ = _llm_conf()
    if not key:
        raise HTTPException(503, "No LLM key configured. Set LLM_API_KEY in .env.")

    results: list[dict] = []
    for model in req.models[:6]:  # sequential, so the models do not contend
        rec: dict = {"model": model}
        t0 = time.perf_counter()
        ttft: float | None = None
        text = ""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    f"{base}/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "stream": True,
                        "max_tokens": 90,
                        "messages": [
                            {"role": "system", "content": req.system},
                            {"role": "user", "content": req.prompt},
                        ],
                    },
                ) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread())[:160].decode(errors="replace")
                        rec["error"] = f"{resp.status_code}: {body}"
                        results.append(rec)
                        continue
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                        except Exception:
                            continue
                        choices = chunk.get("choices") or [{}]
                        delta = (choices[0].get("delta") or {}).get("content")
                        if delta:
                            if ttft is None:
                                ttft = round((time.perf_counter() - t0) * 1000, 1)
                            text += delta
            rec.update(
                ttft_ms=ttft,
                total_ms=round((time.perf_counter() - t0) * 1000, 1),
                chars=len(text),
                output=text.strip()[:220],
            )
            if ttft is None:
                rec["error"] = "No content streamed (a reasoning model may buffer its output)."
        except Exception as exc:
            rec["error"] = str(exc)[:180]
        results.append(rec)

    return {"results": results, "base_url": base}


class PreviewRequest(BaseModel):
    voice_id: str
    provider: str = ""
    text: str = "Hi! Thanks for calling. How can I help you today?"
    model: str = "eleven_flash_v2_5"
    stability: float = 0.5
    similarity: float = 0.75
    style: float = 0.0
    speed: float = 1.0


async def _synth_groq(req: "PreviewRequest") -> Response:
    """Orpheus via Groq: open weights, and it runs on the key we already have."""
    base, key = _groq_conf()
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{base}/audio/speech",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": ORPHEUS_MODEL, "voice": req.voice_id,
                  "input": req.text[:900], "response_format": "wav"},
        )
    if resp.status_code >= 400:
        detail = resp.text[:300]
        if "terms acceptance" in detail:
            raise HTTPException(403, (
                "Orpheus needs its model terms accepted once. Open console.groq.com, "
                "accept the terms for canopylabs/orpheus-v1-english, then try again."))
        raise HTTPException(resp.status_code, f"Groq TTS: {detail}")
    ms = round((time.perf_counter() - t0) * 1000, 1)
    return Response(content=resp.content, media_type="audio/wav",
                    headers={"X-Synth-Ms": str(ms), "X-Provider": "groq", "Cache-Control": "no-store"})


async def _synth_cartesia(req: "PreviewRequest") -> Response:
    """Cartesia Sonic: the expressive, low latency cascade voice."""
    key = os.getenv("CARTESIA_API_KEY") or ""
    model = req.model if req.model.startswith("sonic") else "sonic-3"
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{CARTESIA_BASE}/tts/bytes",
            headers={"X-API-Key": key, "Cartesia-Version": CARTESIA_VERSION,
                     "Content-Type": "application/json"},
            json={
                "model_id": model,
                "transcript": req.text[:600],
                "voice": {"mode": "id", "id": req.voice_id},
                "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 24000},
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"Cartesia: {resp.text[:200]}")
    ms = round((time.perf_counter() - t0) * 1000, 1)
    return Response(content=resp.content, media_type="audio/wav",
                    headers={"X-Synth-Ms": str(ms), "X-Provider": "cartesia", "Cache-Control": "no-store"})


async def _synth_openai(req: "PreviewRequest") -> Response:
    """OpenAI TTS (gpt-4o-mini-tts): previews the voices the Realtime engine uses."""
    key = os.getenv("OPENAI_API_KEY") or ""
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=40) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": OPENAI_TTS_MODEL, "input": req.text[:600],
                  "voice": req.voice_id, "response_format": "mp3"},
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"OpenAI: {resp.text[:200]}")
    ms = round((time.perf_counter() - t0) * 1000, 1)
    return Response(content=resp.content, media_type="audio/mpeg",
                    headers={"X-Synth-Ms": str(ms), "X-Provider": "openai", "Cache-Control": "no-store"})


@router.post("/preview")
async def preview(req: PreviewRequest):
    """Synthesize a sample and report how long it took.

    Routes to whichever provider owns the voice, so the page works the same
    whether the voice is ElevenLabs, Cartesia, OpenAI, or open weights Orpheus.
    """
    if req.provider == "cartesia" or any(v["voice_id"] == req.voice_id for v in _CARTESIA_VOICES):
        if not _cartesia_available():
            raise HTTPException(503, "Cartesia is not configured (set CARTESIA_API_KEY).")
        return await _synth_cartesia(req)

    if req.provider == "openai" or any(v["voice_id"] == req.voice_id for v in _OPENAI_VOICES):
        if not _openai_available():
            raise HTTPException(503, "OpenAI is not configured (set OPENAI_API_KEY).")
        return await _synth_openai(req)

    if req.provider == "groq" or any(v["voice_id"] == req.voice_id for v in _ORPHEUS_VOICES):
        if not _groq_tts_available():
            raise HTTPException(503, "Groq is not configured for speech on this deployment.")
        return await _synth_groq(req)

    if not _configured():
        raise HTTPException(503, "ElevenLabs not configured. Set ELEVEN_API_KEY in .env.")
    body = {
        "text": req.text[:600],
        "model_id": req.model,
        "voice_settings": {
            "stability": req.stability,
            "similarity_boost": req.similarity,
            "style": req.style,
            "use_speaker_boost": True,
            "speed": req.speed,
        },
    }
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EL_BASE}/v1/text-to-speech/{req.voice_id}",
                headers={"xi-api-key": settings.eleven_api_key, "Content-Type": "application/json"},
                params={"output_format": "mp3_44100_128"},
                json=body,
            )
        if resp.status_code >= 400:
            raise HTTPException(resp.status_code, f"ElevenLabs: {resp.text[:200]}")
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return Response(
            content=resp.content,
            media_type="audio/mpeg",
            headers={"X-Synth-Ms": str(ms), "X-Provider": "elevenlabs", "Cache-Control": "no-store"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Synthesis failed: {exc}") from exc
