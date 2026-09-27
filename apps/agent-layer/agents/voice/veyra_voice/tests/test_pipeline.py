"""Pipeline selection is pure: no plugin, no network."""

from __future__ import annotations

import pytest

from veyra_harness.tests.fakes import CALL_CONTEXT, call_context
from veyra_voice.pipeline import select_pipeline


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
    assert spec.tts_provider == "elevenlabs" and spec.tts_model == "eleven_flash_v2_5" and spec.tts_voice == "v1"
    assert spec.semantic_turns is True
    assert spec.min_endpointing_s == 0.4
    assert spec.talker_model == "openai:gpt-4o-mini" and spec.worker_model == "openai:gpt-4.1-mini"
    assert spec.notes == []


def test_a_cartesia_tenant_keeps_its_voice_on_a_hindi_line():
    agent = {**CALL_CONTEXT["agent"], "voice": {"provider": "cartesia", "id": "car-voice", "model": "flash"}}
    hindi = {**CALL_CONTEXT["call"], "language": "hi", "capabilities": {"code": "hi", "label": "Hindi", "stt_multi": True, "tts_low_latency": True, "tts_provider": "cartesia-sonic", "semantic_turns": True}}
    spec = select_pipeline(call_context(agent=agent, call=hindi))
    assert spec.stt_language == "multi"
    assert spec.tts_provider == "cartesia" and spec.tts_model == "sonic-2" and spec.tts_voice == "car-voice"
    assert not any("does not apply" in n for n in spec.notes)


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
