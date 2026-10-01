"""Which speech pipeline a call gets, decided from the contract, not from env.

The selection is a pure function of the call context so it can be tested
without a plugin installed. Building the actual plugin objects happens in
``build_session_kwargs`` with lazy imports, so importing this module never
requires the plugins.

Per language (docs/urdu-support.md and ``LanguageCapabilities`` on the app):

- **STT**: Deepgram Nova-3. ``language="multi"`` when the line's language
  supports code-switching, else the monolingual model for that language
  (Urdu is ``ur`` on ``nova-3``; there is no multi for it).
- **TTS**: the tenant's chosen provider — Cartesia Sonic-3 (fifteen
  languages, not Urdu) or ElevenLabs Turbo v2.5 (not Urdu either). When the
  chosen provider cannot speak the call's language, the call falls to the
  other one if it can and has a key, else Azure (ur-PK for Urdu), and the
  tenant's chosen voice does not apply; Studio already warns about that.
  A call never speaks with a provider's hidden default voice: with no voice
  chosen it gets ``DEFAULT_VOICES`` for its provider (the same ids the app
  shows in Studio as "Default: …"), and the note says so.
- **Turn detection**: LiveKit's multilingual semantic model when the language
  supports it and the tenant left it on; otherwise VAD endpointing only, with
  a slightly longer silence so the caller is not cut off mid-thought.
- **Models**: Studio's ``talker_model`` / ``worker_model`` references, else
  the harness defaults. A reference whose provider has no key degrades to
  the default and is noted.

Measured 2026-10-02 through the plugins' streaming path (median time to first
audio, five short lines): ElevenLabs Flash v2.5 300 ms, Turbo v2.5 319 ms;
Cartesia Sonic-2 173 ms, Sonic-3 159 ms. Turbo costs ~20 ms over Flash and is
ElevenLabs' more natural realtime model, so the realtime tier uses it; Sonic-3
is both Cartesia's newest and its fastest, and Sonic (v1) is sunset.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

from app_sdk.models import CallContext, LanguageCapability
from veyra_harness.models import DEFAULT_TALKER, DEFAULT_WORKER, ResolvedModel, resolve, resolve_or_default

logger = logging.getLogger("veyra.voice.pipeline")

# Studio's speed tiers (VoiceController::TTS_MODELS). "flash" is the realtime
# tier every tenant starts on; Cartesia has one model for all three.
ELEVEN_MODELS = {"flash": "eleven_turbo_v2_5", "turbo": "eleven_multilingual_v2", "expressive": "eleven_v3", "multilingual": "eleven_multilingual_v2"}
CARTESIA_MODEL = "sonic-3"
CARTESIA_MODELS = {"flash": CARTESIA_MODEL, "turbo": CARTESIA_MODEL, "expressive": CARTESIA_MODEL}
# What Sonic synthesises. Cartesia's voice list also tags ur/ar/he/th/or, but
# `language=ur` is rejected on every model (tested 2026-09-27).
CARTESIA_LANGUAGES = {"en", "fr", "de", "es", "pt", "zh", "ja", "hi", "it", "ko", "nl", "pl", "ru", "sv", "tr"}
AZURE_VOICES = {"ur": "ur-PK-UzmaNeural", "ar": "ar-SA-ZariyahNeural", "hi": "hi-IN-SwaraNeural"}

# The voice a call gets when the tenant chose none. Same ids as
# VoiceCatalog::DEFAULTS on the app, which shows them in Studio; both are
# premade/public voices any key can use.
DEFAULT_VOICES = {
    "elevenlabs": "cgSgspJ2msm6clMCkdW9",  # Jessica: warm, conversational (premade)
    "cartesia": "f786b574-daa5-4673-aa0c-cbe3e8534c02",  # Katie: "Friendly Fixer", made for support calls
}
DEFAULT_ELEVEN_VOICE = DEFAULT_VOICES["elevenlabs"]

# ElevenLabs' defaults (stability 0.5, similarity 0.75) read flat on short
# conversational lines. A little less stability gives the intonation room to
# move; style stays 0 because any style exaggeration adds latency.
ELEVEN_VOICE_SETTINGS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.0, "use_speaker_boost": True}

AUDIO_MAX_ENDPOINTING_S = 2.5


@dataclass(slots=True)
class PipelineSpec:
    language: str
    stt_provider: str = "deepgram"
    stt_model: str = "nova-3"
    stt_language: str = "multi"
    tts_provider: str = "cartesia"
    tts_model: str = CARTESIA_MODEL
    tts_voice: str | None = DEFAULT_VOICES["cartesia"]
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
        spec.tts_model = (CARTESIA_MODELS if chosen == "cartesia" else ELEVEN_MODELS).get(tier, CARTESIA_MODEL if chosen == "cartesia" else ELEVEN_MODELS["flash"])
        spec.tts_voice = agent.voice.id or DEFAULT_VOICES[chosen]
        if not agent.voice.id:
            spec.notes.append(f"No voice chosen in Studio; using the default {chosen} voice {spec.tts_voice}.")
    elif _has("cartesia") and code in CARTESIA_LANGUAGES:
        spec.tts_provider, spec.tts_model, spec.tts_voice = "cartesia", CARTESIA_MODEL, DEFAULT_VOICES["cartesia"]
        spec.notes.append(f"TTS is Cartesia Sonic for {code} with the default voice; the tenant's {chosen} voice does not apply.")
    elif _has("azure") and code in AZURE_VOICES:
        spec.tts_provider, spec.tts_model, spec.tts_voice = "azure", "neural", AZURE_VOICES[code]
        spec.notes.append(f"TTS is Azure {spec.tts_voice}; the tenant's voice does not apply.")
    elif _has("elevenlabs"):
        spec.tts_provider, spec.tts_model = "elevenlabs", ELEVEN_MODELS["multilingual"]
        spec.tts_voice = (agent.voice.id if chosen == "elevenlabs" else None) or DEFAULT_ELEVEN_VOICE
        spec.notes.append("TTS is ElevenLabs multilingual fallback; pronunciation may suffer.")
    else:
        spec.tts_provider, spec.tts_model, spec.tts_voice = "cartesia", CARTESIA_MODEL, DEFAULT_VOICES["cartesia"]
        spec.notes.append("No TTS provider key found; the session will fail to build.")

    # Turn taking
    spec.semantic_turns = bool(caps.semantic_turns and agent.turn.semantic_turn_detection) and not low_memory()
    spec.min_endpointing_s = agent.turn.min_endpointing_ms / 1000
    spec.min_interruption_s = agent.turn.min_interruption_ms / 1000
    spec.allow_interruptions = agent.turn.allow_interruptions
    if not spec.semantic_turns:
        spec.min_endpointing_s = max(spec.min_endpointing_s, 0.7)
        spec.notes.append("No semantic turn detection: VAD endpointing with a longer silence.")
    elif turn_detector_kind() == "audio":
        # max_delay is the wait when the model thinks the caller is not done.
        # The audio model says so far more often than the text one (measured:
        # p 0.27 under a 0.36 threshold on a plain question), and 6 s of
        # silence after a question is the lag callers notice. 2.5 s is
        # LiveKit's own default for this detector; a caller who was only
        # pausing simply carries on and interrupts.
        spec.max_endpointing_s = min(spec.max_endpointing_s, AUDIO_MAX_ENDPOINTING_S)

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


def _flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None or not value.strip() else value.strip().lower() in {"1", "true", "yes", "on"}


def turn_handling(spec: PipelineSpec, *, turn_detector: Any = None) -> dict[str, Any]:
    """``AgentSession(turn_handling=...)`` for a spec — livekit-agents 1.8's one place for turn options.

    The loose keywords (``min_endpointing_delay``, ``preemptive_generation``,
    ``allow_interruptions`` …) still work in 1.8 but are deprecated, and each
    one costs a warning whose source-line lookup blocked the call's event loop
    for ~700 ms (measured). Everything is explicit here so a dev worker and a
    production one behave the same: left unset, 1.8 picks its own audio turn
    detector (and loads ~108 MB on a low-memory host) and turns on LiveKit
    Cloud's adaptive interruption in ``dev`` but not in ``start``.
    """
    return {
        # No semantic model means VAD endpointing, not 1.8's default detector.
        "turn_detection": turn_detector if turn_detector is not None else "vad",
        "endpointing": {"min_delay": spec.min_endpointing_s, "max_delay": spec.max_endpointing_s},
        "interruption": {
            "enabled": spec.allow_interruptions,
            "mode": "vad",
            "min_duration": spec.min_interruption_s,
            # A cough or "mm-hm" pauses the agent; it picks up again after a second of silence.
            "resume_false_interruption": True,
            "false_interruption_timeout": 1.0,
        },
        # Start the talker's LLM on the interim transcript, before the turn is
        # confirmed; a caller who keeps talking discards it. VOICE_PREEMPTIVE_TTS
        # also synthesises ahead (faster first audio, but discarded drafts are
        # billed TTS characters).
        "preemptive_generation": {"enabled": True, "preemptive_tts": _flag("VOICE_PREEMPTIVE_TTS", False)},
    }


def build_session_kwargs(spec: PipelineSpec, *, vad: Any) -> dict[str, Any]:
    """The ``AgentSession`` keyword arguments for a spec. Imports plugins lazily.

    Constructing the LLM client loads a CA bundle (300–1000 ms of synchronous
    work, measured), so the entrypoint runs this in a thread, never on the
    call's event loop.
    """
    from livekit.plugins import deepgram

    detector = None
    if spec.semantic_turns:
        try:
            detector = _turn_detector()
        except Exception as e:  # noqa: BLE001 — the model weights may be absent; VAD still works
            logger.warning("pipeline.turn_detector_unavailable kind=%s error=%s", turn_detector_kind(), e)

    return {
        "vad": vad,
        "stt": deepgram.STT(model=spec.stt_model, language=spec.stt_language, interim_results=True, smart_format=True, filler_words=True),
        "tts": _build_tts(spec),
        "llm": build_llm(resolve_or_default(spec.talker_model, default=DEFAULT_TALKER), temperature=0.4),
        "turn_handling": turn_handling(spec, turn_detector=detector),
    }


def turn_detector_kind() -> str:
    """``audio`` (default) or ``text``: which semantic end-of-turn model a call uses.

    ``text`` is the multilingual transformer from ``livekit-plugins-turn-detector``
    (deprecated in 1.8): it waits for the STT's final transcript, then runs in
    a separate inference process — 0.3–0.9 s per prediction measured, on top
    of ~0.5 s for the transcript. ``audio`` is 1.8's ``inference.TurnDetector``
    in its local ``v1-mini`` form: it reads the last 1.2 s of audio in-process,
    ~0.1 s per prediction, ~108 MB, fourteen languages.
    """
    kind = (os.getenv("VOICE_TURN_DETECTOR") or "audio").strip().lower()
    return kind if kind in {"audio", "text"} else "audio"


def _turn_detector() -> Any:
    if turn_detector_kind() == "text":
        from livekit.plugins.turn_detector.multilingual import MultilingualModel

        return MultilingualModel()
    from livekit.agents import inference

    # v1-mini explicitly: left to choose, 1.8 uses LiveKit Cloud's v1 in
    # `dev` and the local mini in `start`, so dev and production would differ.
    return inference.TurnDetector(version="v1-mini")


def warm_turn_detector() -> None:
    """Pay the turn detector's first-use cost at process start, not on a call.

    ``audio``: the local model loads once per process (~300 ms the first
    time, then free). ``text``: ``MultilingualModel()`` resolves its languages
    file through ``huggingface_hub`` on construction; the first time, that
    imports huggingface_hub and filelock submodules and walks the cache —
    150–620 ms with the event loop blocked on the production VM, 730–1120 ms
    here. Done once in prewarm, the per-call construction is about a
    millisecond either way.
    """
    try:
        if turn_detector_kind() == "audio":
            from livekit.local_inference import EOT

            EOT()
            return
        if low_memory():
            return
        from livekit.plugins.turn_detector.base import _download_from_hf_hub
        from livekit.plugins.turn_detector.models import HG_MODEL, MODEL_REVISIONS

        _download_from_hf_hub(HG_MODEL, "languages.json", revision=MODEL_REVISIONS["multilingual"], local_files_only=True)
    except Exception as e:  # noqa: BLE001 — weights missing: the call degrades to VAD and logs it there
        logger.warning("pipeline.turn_detector_warmup_failed error=%s", e)


def _build_tts(spec: PipelineSpec) -> Any:
    if spec.tts_provider == "cartesia":
        from livekit.plugins import cartesia

        return cartesia.TTS(model=spec.tts_model, language=spec.language, voice=spec.tts_voice or DEFAULT_VOICES["cartesia"], api_key=os.getenv("CARTESIA_API_KEY"))
    if spec.tts_provider == "azure":
        from livekit.plugins import azure

        return azure.TTS(voice=spec.tts_voice, speech_key=os.getenv("AZURE_SPEECH_KEY"), speech_region=os.getenv("AZURE_SPEECH_REGION"))
    from livekit.plugins import elevenlabs

    kwargs: dict[str, Any] = {"voice_id": spec.tts_voice or DEFAULT_ELEVEN_VOICE, "model": spec.tts_model, "api_key": os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")}
    # v3 (the expressive tier) takes only a coarse stability preset; leave it its own.
    if not spec.tts_model.startswith("eleven_v3"):
        kwargs["voice_settings"] = elevenlabs.VoiceSettings(**ELEVEN_VOICE_SETTINGS)
    return elevenlabs.TTS(**kwargs)


def build_llm(model: ResolvedModel, *, temperature: float = 0.3) -> Any:
    """The talker's LLM through LiveKit's OpenAI plugin, on the resolved provider."""
    from livekit.plugins import openai

    return openai.LLM(model=model.model, base_url=model.base_url, api_key=model.api_key, temperature=temperature)
