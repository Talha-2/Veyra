"""Pipeline selection is pure: no plugin, no network."""

from __future__ import annotations

import pytest

from veyra_harness.tests.fakes import CALL_CONTEXT, call_context
from veyra_voice.pipeline import DEFAULT_VOICES, _turn_detector, build_session_kwargs, select_pipeline, turn_detector_kind, turn_handling


@pytest.fixture(autouse=True)
def keys(monkeypatch: pytest.MonkeyPatch):
    for var in ("TALKER_MODEL", "WORKER_MODEL", "AZURE_SPEECH_KEY", "GROQ_API_KEY", "LLM_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("CARTESIA_API_KEY", "car-test")
    monkeypatch.setenv("ELEVEN_API_KEY", "el-test")


def test_an_english_line_gets_multilingual_stt_the_tenants_elevenlabs_voice_and_semantic_turns():
    spec = select_pipeline(call_context())
    assert spec.stt_language == "multi"
    # The realtime tier is Turbo v2.5: ~20 ms behind Flash, and more natural.
    assert spec.tts_provider == "elevenlabs" and spec.tts_model == "eleven_turbo_v2_5" and spec.tts_voice == "v1"
    assert spec.semantic_turns is True
    assert spec.min_endpointing_s == 0.4
    assert spec.talker_model == "openai:gpt-4o-mini" and spec.worker_model == "openai:gpt-4.1-mini"
    assert spec.notes == []


def test_a_cartesia_tenant_keeps_its_voice_on_a_hindi_line():
    agent = {**CALL_CONTEXT["agent"], "voice": {"provider": "cartesia", "id": "car-voice", "model": "flash"}}
    hindi = {**CALL_CONTEXT["call"], "language": "hi", "capabilities": {"code": "hi", "label": "Hindi", "stt_multi": True, "tts_low_latency": True, "tts_provider": "cartesia-sonic", "semantic_turns": True}}
    spec = select_pipeline(call_context(agent=agent, call=hindi))
    assert spec.stt_language == "multi"
    assert spec.tts_provider == "cartesia" and spec.tts_model == "sonic-3" and spec.tts_voice == "car-voice"
    assert not any("does not apply" in n for n in spec.notes)


@pytest.mark.parametrize("provider", ["elevenlabs", "cartesia"])
def test_no_voice_chosen_means_the_named_default_voice_never_the_providers_hidden_one(provider: str):
    agent = {**CALL_CONTEXT["agent"], "voice": {"provider": provider, "id": None, "model": "flash"}}
    spec = select_pipeline(call_context(agent=agent))
    assert spec.tts_provider == provider and spec.tts_voice == DEFAULT_VOICES[provider]
    assert any("No voice chosen" in n and DEFAULT_VOICES[provider] in n for n in spec.notes)


def test_a_fallback_engine_speaks_with_its_own_default_voice_not_none(monkeypatch: pytest.MonkeyPatch):
    # The tenant chose ElevenLabs but this deployment has no ElevenLabs key.
    monkeypatch.delenv("ELEVEN_API_KEY")
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    spec = select_pipeline(call_context())
    assert spec.tts_provider == "cartesia" and spec.tts_voice == DEFAULT_VOICES["cartesia"] and spec.tts_model == "sonic-3"
    assert any("does not apply" in n for n in spec.notes)


def test_turn_options_use_the_18_turn_handling_shape_and_vad_when_there_is_no_semantic_model(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("VOICE_PREEMPTIVE_TTS", raising=False)
    agent = {**CALL_CONTEXT["agent"], "turn": {"semantic_turn_detection": False, "min_endpointing_ms": 300, "min_interruption_ms": 450, "allow_interruptions": True}}
    spec = select_pipeline(call_context(agent=agent))
    th = turn_handling(spec)
    # No detector must mean VAD, not 1.8's default audio detector (which loads ~108 MB).
    assert th["turn_detection"] == "vad"
    assert th["endpointing"] == {"min_delay": 0.7, "max_delay": spec.max_endpointing_s}
    assert th["interruption"]["enabled"] is True and th["interruption"]["min_duration"] == 0.45 and th["interruption"]["mode"] == "vad"
    assert th["interruption"]["resume_false_interruption"] is True
    assert th["preemptive_generation"] == {"enabled": True, "preemptive_tts": False}

    detector = object()
    monkeypatch.setenv("VOICE_PREEMPTIVE_TTS", "1")
    th = turn_handling(spec, turn_detector=detector)
    assert th["turn_detection"] is detector and th["preemptive_generation"]["preemptive_tts"] is True


def test_the_local_audio_turn_detector_is_the_default_and_caps_the_unsure_wait(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("VOICE_TURN_DETECTOR", raising=False)
    assert turn_detector_kind() == "audio"
    spec = select_pipeline(call_context())
    assert spec.semantic_turns and spec.max_endpointing_s == 2.5
    # The local mini model, explicitly: 1.8 would pick LiveKit Cloud's in `dev` only.
    assert _turn_detector().model == "turn-detector-v1-mini"

    monkeypatch.setenv("VOICE_TURN_DETECTOR", "text")
    assert select_pipeline(call_context()).max_endpointing_s == 6.0
    monkeypatch.setenv("VOICE_TURN_DETECTOR", "nonsense")
    assert turn_detector_kind() == "audio"


def test_the_tls_context_is_built_once_per_process_not_per_call(monkeypatch: pytest.MonkeyPatch):
    from livekit.agents.utils import http_context

    from veyra_voice.entrypoint import share_tls_context

    monkeypatch.setattr(http_context, "_create_ssl_context", http_context._create_ssl_context)
    assert http_context._create_ssl_context() is not http_context._create_ssl_context()
    share_tls_context()
    first = http_context._create_ssl_context()
    assert http_context._create_ssl_context() is first
    share_tls_context()  # idempotent
    assert http_context._create_ssl_context() is first


def test_the_session_kwargs_carry_no_deprecated_keyword_and_agentsession_accepts_them(monkeypatch: pytest.MonkeyPatch):
    import asyncio
    import warnings

    from livekit.agents import AgentSession

    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg-test")
    agent = {**CALL_CONTEXT["agent"], "turn": {"semantic_turn_detection": False, "min_endpointing_ms": 400, "min_interruption_ms": 500, "allow_interruptions": True}}
    spec = select_pipeline(call_context(agent=agent))
    kwargs = build_session_kwargs(spec, vad=None)
    assert set(kwargs) == {"vad", "stt", "tts", "llm", "turn_handling"}
    assert kwargs["tts"].model == "eleven_turbo_v2_5"
    assert kwargs["tts"]._opts.voice_settings.stability == 0.45

    async def build() -> None:
        # No LLM here: AgentSession prewarms its connection, and the suite stays off the network.
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            AgentSession(vad=None, turn_handling=kwargs["turn_handling"])
        assert not [w for w in caught if issubclass(w.category, DeprecationWarning)]

    asyncio.run(build())


def test_an_urdu_line_goes_to_azure_when_it_has_a_key_whatever_the_tenant_chose(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AZURE_SPEECH_KEY", "az")
    agent = {**CALL_CONTEXT["agent"], "voice": {"provider": "cartesia", "id": "car-voice", "model": "flash"}}
    urdu = {**CALL_CONTEXT["call"], "language": "ur", "capabilities": {"code": "ur", "stt": "nova-3-ur", "stt_multi": False, "tts_low_latency": False, "tts_provider": "azure-ur-pk", "semantic_turns": False}}
    spec = select_pipeline(call_context(agent=agent, call=urdu))
    assert spec.stt_language == "ur"
    assert spec.tts_provider == "azure" and spec.tts_voice == "ur-PK-UzmaNeural"
    assert spec.semantic_turns is False and spec.min_endpointing_s >= 0.7
    assert any("does not apply" in n for n in spec.notes)


def test_an_urdu_line_without_azure_falls_to_elevenlabs_multilingual_and_says_pronunciation_may_suffer():
    urdu = {**CALL_CONTEXT["call"], "language": "ur", "capabilities": {"code": "ur", "stt_multi": False, "tts_low_latency": False, "tts_provider": "azure-ur-pk", "semantic_turns": False}}
    spec = select_pipeline(call_context(call=urdu))
    assert spec.tts_provider == "elevenlabs" and spec.tts_model == "eleven_multilingual_v2"
    assert any("pronunciation" in n for n in spec.notes)


def test_the_tenant_can_turn_semantic_turns_off_and_pick_a_tts_tier():
    agent = {**CALL_CONTEXT["agent"], "voice": {"provider": "elevenlabs", "id": "v9", "model": "expressive"}, "turn": {"semantic_turn_detection": False, "min_endpointing_ms": 300, "min_interruption_ms": 400, "allow_interruptions": False}}
    spec = select_pipeline(call_context(agent=agent))
    assert spec.tts_model == "eleven_v3" and spec.tts_voice == "v9"
    assert spec.semantic_turns is False and spec.allow_interruptions is False
    assert spec.min_interruption_s == 0.4


def test_models_come_from_studio_then_the_expert_and_a_keyless_provider_falls_back(monkeypatch: pytest.MonkeyPatch):
    agent = {**CALL_CONTEXT["agent"], "advanced": {"talker_model": "groq:openai/gpt-oss-20b", "worker_model": "openai:gpt-4.1"}}
    experts = [CALL_CONTEXT["experts"][0], {**CALL_CONTEXT["experts"][1], "model": "openai:gpt-4.1-nano"}]
    spec = select_pipeline(call_context(agent=agent, experts=experts))
    # Groq has no key in this test: the talker degrades to the default and says so.
    assert spec.talker_model == "openai:gpt-4o-mini" and any("groq" in n for n in spec.notes)
    # The expert's own model beats Studio's global worker choice.
    assert spec.worker_model == "openai:gpt-4.1-nano"

    monkeypatch.setenv("GROQ_API_KEY", "gsk")
    assert select_pipeline(call_context(agent=agent)).talker_model == "groq:openai/gpt-oss-20b"
