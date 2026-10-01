"""Per-turn latency from ChatMessage.metrics: pure, no LiveKit session needed."""

from __future__ import annotations

from types import SimpleNamespace

from veyra_voice.latency import TurnLatency, log_line


def msg(role: str, interrupted: bool = False, **metrics: float) -> SimpleNamespace:
    return SimpleNamespace(role=role, metrics=metrics, interrupted=interrupted)


def test_a_reply_pairs_with_the_user_turn_before_it_into_one_record():
    lat = TurnLatency()
    assert lat.on_item(msg("assistant", started_speaking_at=10.0)) is None  # the greeting: no user turn yet
    assert lat.on_item(msg("user", end_of_turn_delay=0.42, transcription_delay=0.18, stopped_speaking_at=20.0)) is None
    rec = lat.on_item(msg("assistant", llm_node_ttft=0.39, tts_node_ttfb=0.17, e2e_latency=1.18, started_speaking_at=21.18))
    assert rec == {"turn": 1, "eou_ms": 420.0, "stt_ms": 180.0, "llm_ttft_ms": 390.0, "tts_ttfb_ms": 170.0, "total_ms": 1180.0, "interrupted": False}
    assert log_line(rec) == "turn=1 total=1180ms eou=420 stt=180 llm=390 tts=170"
    # A second reply to the same turn (a tool's follow-up) is not a new sample.
    assert lat.on_item(msg("assistant", e2e_latency=3.0)) is None


def test_a_reply_after_a_tool_call_has_no_e2e_so_the_gap_comes_from_the_timestamps():
    lat = TurnLatency()
    lat.on_item(msg("user", end_of_turn_delay=0.5, stopped_speaking_at=100.0))
    rec = lat.on_item(msg("assistant", llm_node_ttft=0.6, started_speaking_at=102.25, interrupted=True))
    assert rec["total_ms"] == 2250.0 and rec["tts_ttfb_ms"] is None and rec["interrupted"] is True
    assert log_line(rec).endswith("tts=- interrupted")


def test_a_reply_cut_off_before_it_played_does_not_use_up_the_turn():
    lat = TurnLatency()
    lat.on_item(msg("user", stopped_speaking_at=50.0))
    assert lat.on_item(msg("assistant", interrupted=True)) is None  # no timing: it never spoke
    rec = lat.on_item(msg("assistant", e2e_latency=1.4))
    assert rec is not None and rec["total_ms"] == 1400.0


def test_the_summary_is_the_ended_events_voice_to_voice_shape():
    lat = TurnLatency()
    assert lat.summary() == {"p50": None, "p95": None, "turns": 0}
    for total in (0.9, 1.1, 3.0):
        lat.on_item(msg("user", stopped_speaking_at=1.0))
        lat.on_item(msg("assistant", e2e_latency=total))
    assert lat.summary() == {"p50": 1100.0, "p95": 3000.0, "turns": 3}
