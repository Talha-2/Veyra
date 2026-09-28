"""Which speech pipeline a call gets, decided from the contract, not from env.

The selection is a pure function of the call context so it can be tested
without a plugin installed. Building the actual plugin objects happens in
``build_session_kwargs`` with lazy imports, so importing this module never
requires the plugins.

Per language (docs/urdu-support.md and ``LanguageCapabilities`` on the app):

- **STT**: Deepgram Nova-3. ``language="multi"`` when the line's language
  supports code-switching, else the monolingual model for that language
  (Urdu is ``ur`` on ``nova-3``; there is no multi for it).
- **TTS**: the tenant's chosen provider — Cartesia Sonic (~90 ms, fifteen
  languages, not Urdu) or ElevenLabs Flash (not Urdu either). When the
  chosen provider cannot speak the call's language, the call falls to the
  other one if it can and has a key, else Azure (ur-PK for Urdu), and the
  tenant's chosen voice does not apply; Studio already warns about that.
- **Turn detection**: LiveKit's multilingual semantic model when the language
  supports it and the tenant left it on; otherwise VAD endpointing only, with
  a slightly longer silence so the caller is not cut off mid-thought.
- **Models**: Studio's ``talker_model`` / ``worker_model`` references, else
  the harness defaults. A reference whose provider has no key degrades to
  the default and is noted.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

from app_sdk.models import CallContext, LanguageCapability
from veyra_harness.models import DEFAULT_TALKER, DEFAULT_WORKER, ResolvedModel, resolve, resolve_or_default

logger = logging.getLogger("veyra.voice.pipeline")

ELEVEN_MODELS = {"flash": "eleven_flash_v2_5", "turbo": "eleven_turbo_v2_5", "expressive": "eleven_v3", "multilingual": "eleven_multilingual_v2"}
CARTESIA_MODELS = {"flash": "sonic-2", "turbo": "sonic-2", "expressive": "sonic-2"}
# What Sonic synthesises. Cartesia's voice list also tags ur/ar/he/th/or, but
# `language=ur` is rejected on every model (tested 2026-09-27).
CARTESIA_LANGUAGES = {"en", "fr", "de", "es", "pt", "zh", "ja", "hi", "it", "ko", "nl", "pl", "ru", "sv", "tr"}
AZURE_VOICES = {"ur": "ur-PK-UzmaNeural", "ar": "ar-SA-ZariyahNeural", "hi": "hi-IN-SwaraNeural"}
DEFAULT_ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL"


@dataclass(slots=True)
class PipelineSpec:
    language: str
    stt_provider: str = "deepgram"
    stt_model: str = "nova-3"
    stt_language: str = "multi"
    tts_provider: str = "cartesia"
    tts_model: str = "sonic-2"
    tts_voice: str | None = None
    semantic_turns: bool = True
    min_endpointing_s: float = 0.4
    max_endpointing_s: float = 6.0
    min_interruption_s: float = 0.55
    allow_interruptions: bool = True
    talker_model: str = DEFAULT_TALKER
    worker_model: str = DEFAULT_WORKER
    notes: list[str] = field(default_factory=list)


def low_memory() -> bool:
    """VOICE_LOW_MEMORY=1: a ~1 GB host (Oracle's free Micro VM). Calls run as
    threads in one process and the turn-detector model is never loaded, so
    turns end on VAD silence alone. One call at a time is the realistic load."""
    return os.getenv("VOICE_LOW_MEMORY", "").strip().lower() in {"1", "true", "yes"}


def _has(provider: str) -> bool:
    return bool({"cartesia": os.getenv("CARTESIA_API_KEY"), "elevenlabs": os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY"), "azure": os.getenv("AZURE_SPEECH_KEY")}.get(provider))


def select_pipeline(ctx: CallContext) -> PipelineSpec:
    agent = ctx.agent
    code = ctx.call.language or agent.primary_language or "en"
    caps: LanguageCapability = ctx.call.capabilities or next((l for l in agent.languages if l.code == code), LanguageCapability(code=code))
    spec = PipelineSpec(language=code)

    # STT
    spec.stt_language = "multi" if caps.stt_multi else code
    if not caps.stt_multi:
        spec.notes.append(f"STT is monolingual {code}: no code-switching on this line.")

    # TTS: the tenant's provider and voice, unless the language rules it out.
    chosen = agent.voice.provider or "cartesia"
    tier = agent.voice.model or "flash"
    covered = (chosen == "cartesia" and code in CARTESIA_LANGUAGES) or (chosen == "elevenlabs" and code != "ur")
    if chosen in ("cartesia", "elevenlabs") and covered and _has(chosen):
        spec.tts_provider = chosen
        spec.tts_model = (CARTESIA_MODELS if chosen == "cartesia" else ELEVEN_MODELS).get(tier, "sonic-2" if chosen == "cartesia" else ELEVEN_MODELS["flash"])
        spec.tts_voice = agent.voice.id or (None if chosen == "cartesia" else DEFAULT_ELEVEN_VOICE)
    elif _has("cartesia") and code in CARTESIA_LANGUAGES:
        spec.tts_provider, spec.tts_model, spec.tts_voice = "cartesia", "sonic-2", None
        spec.notes.append(f"TTS is Cartesia Sonic for {code}; the tenant's {chosen} voice does not apply.")
    elif _has("azure") and code in AZURE_VOICES:
        spec.tts_provider, spec.tts_model, spec.tts_voice = "azure", "neural", AZURE_VOICES[code]
        spec.notes.append(f"TTS is Azure {spec.tts_voice}; the tenant's voice does not apply.")
    elif _has("elevenlabs"):
        spec.tts_provider, spec.tts_model, spec.tts_voice = "elevenlabs", ELEVEN_MODELS["multilingual"], agent.voice.id if chosen == "elevenlabs" else DEFAULT_ELEVEN_VOICE
        spec.notes.append("TTS is ElevenLabs multilingual fallback; pronunciation may suffer.")
    else:
        spec.tts_provider, spec.tts_model, spec.tts_voice = "cartesia", "sonic-2", None
        spec.notes.append("No TTS provider key found; the session will fail to build.")

    # Turn taking
    spec.semantic_turns = bool(caps.semantic_turns and agent.turn.semantic_turn_detection) and not low_memory()
    spec.min_endpointing_s = agent.turn.min_endpointing_ms / 1000
    spec.min_interruption_s = agent.turn.min_interruption_ms / 1000
    spec.allow_interruptions = agent.turn.allow_interruptions
    if not spec.semantic_turns:
        spec.min_endpointing_s = max(spec.min_endpointing_s, 0.7)
        spec.notes.append("No semantic turn detection: VAD endpointing with a longer silence.")

    # Models: Studio's references, else defaults. Env can still force either.
    spec.talker_model = os.getenv("TALKER_MODEL") or agent.advanced.get("talker_model") or DEFAULT_TALKER
    worker = ctx.workers[0] if ctx.workers else None
    spec.worker_model = os.getenv("WORKER_MODEL") or (worker.model if worker and worker.model else None) or agent.advanced.get("worker_model") or DEFAULT_WORKER
    for role, ref in (("talker", spec.talker_model), ("worker", spec.worker_model)):
        try:
            resolve(ref, default=ref)
        except LookupError as e:
            spec.notes.append(f"{role} model {ref!r} unavailable ({e}); using the default.")
            setattr(spec, f"{role}_model", DEFAULT_TALKER if role == "talker" else DEFAULT_WORKER)
    return spec


def build_session_kwargs(spec: PipelineSpec, *, vad: Any) -> dict[str, Any]:
    """The ``AgentSession`` keyword arguments for a spec. Imports plugins lazily."""
    from livekit.plugins import deepgram

    kwargs: dict[str, Any] = {
        "vad": vad,
        "stt": deepgram.STT(model=spec.stt_model, language=spec.stt_language, interim_results=True, smart_format=True, filler_words=True),
        "tts": _build_tts(spec),
        "llm": build_llm(resolve_or_default(spec.talker_model, default=DEFAULT_TALKER), temperature=0.4),
        "allow_interruptions": spec.allow_interruptions,
        "min_interruption_duration": spec.min_interruption_s,
        "min_endpointing_delay": spec.min_endpointing_s,
        "max_endpointing_delay": spec.max_endpointing_s,
        # Start LLM+TTS on the interim transcript; discard if the caller keeps talking.
        "preemptive_generation": True,
    }
    if spec.semantic_turns:
        try:
            from livekit.plugins.turn_detector.multilingual import MultilingualModel

            kwargs["turn_detection"] = MultilingualModel()
        except Exception as e:  # noqa: BLE001 — the model weights may be absent; VAD still works
            logger.warning("pipeline.turn_detector_unavailable error=%s", e)
    return kwargs


def _build_tts(spec: PipelineSpec) -> Any:
    if spec.tts_provider == "cartesia":
        from livekit.plugins import cartesia

        kwargs: dict[str, Any] = {"model": spec.tts_model, "language": spec.language, "api_key": os.getenv("CARTESIA_API_KEY")}
        if spec.tts_voice:
            kwargs["voice"] = spec.tts_voice
        return cartesia.TTS(**kwargs)
    if spec.tts_provider == "azure":
        from livekit.plugins import azure

        return azure.TTS(voice=spec.tts_voice, speech_key=os.getenv("AZURE_SPEECH_KEY"), speech_region=os.getenv("AZURE_SPEECH_REGION"))
    from livekit.plugins import elevenlabs

    return elevenlabs.TTS(voice_id=spec.tts_voice or DEFAULT_ELEVEN_VOICE, model=spec.tts_model, api_key=os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY"))


def build_llm(model: ResolvedModel, *, temperature: float = 0.3) -> Any:
    """The talker's LLM through LiveKit's OpenAI plugin, on the resolved provider."""
    from livekit.plugins import openai

    return openai.LLM(model=model.model, base_url=model.base_url, api_key=model.api_key, temperature=temperature)
