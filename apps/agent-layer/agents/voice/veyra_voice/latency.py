"""Per-turn voice latency, read from ``ChatMessage.metrics`` (livekit-agents 1.8).

``metrics_collected`` is deprecated: per-turn numbers now ride on the chat
items themselves. A user message carries how long the turn took to end
(``end_of_turn_delay``) and the transcript to arrive (``transcription_delay``);
the agent's reply carries LLM time to first token, TTS time to first audio and
the whole voice-to-voice gap (``e2e_latency``). This pairs the two into one
record per reply.

A reply that follows a tool call (``delegate``'s holding line, a knowledge
lookup) is often generated without the user metrics attached, so LiveKit
leaves ``e2e_latency`` out. The gap is still real — it is what the caller
waits through — so it is computed from the two speaking timestamps instead.
"""

from __future__ import annotations

from typing import Any

FIELDS = ("eou_ms", "stt_ms", "llm_ttft_ms", "tts_ttfb_ms", "total_ms")


def _ms(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value) * 1000, 1)
    except (TypeError, ValueError):
        return None


class TurnLatency:
    """Feed it every conversation item; it returns a record when a reply closes a user turn."""

    def __init__(self) -> None:
        self._user: dict[str, Any] | None = None
        self.turns: list[dict[str, Any]] = []

    def on_item(self, item: Any) -> dict[str, Any] | None:
        role = getattr(item, "role", None)
        metrics = dict(getattr(item, "metrics", None) or {})
        if role == "user":
            # The latest user turn wins: one that never got a spoken reply
            # (an interruption, a hold) is not a latency sample.
            self._user = metrics
            return None
        if role != "assistant" or self._user is None:
            # The greeting, or a second reply to the same turn: nothing to pair.
            return None

        user = self._user
        total = metrics.get("e2e_latency")
        if total is None and metrics.get("started_speaking_at") and user.get("stopped_speaking_at"):
            total = metrics["started_speaking_at"] - user["stopped_speaking_at"]
        if total is None or total < 0:
            # A reply that never played (cut off before its first audio when
            # the caller kept talking) leaves the turn open for the one that does.
            return None
        self._user = None

        record: dict[str, Any] = {
            "turn": len(self.turns) + 1,
            "eou_ms": _ms(user.get("end_of_turn_delay")),
            "stt_ms": _ms(user.get("transcription_delay")),
            "llm_ttft_ms": _ms(metrics.get("llm_node_ttft")),
            "tts_ttfb_ms": _ms(metrics.get("tts_node_ttfb")),
            "total_ms": _ms(total),
            "interrupted": bool(getattr(item, "interrupted", False)),
        }
        self.turns.append(record)
        return record

    def summary(self) -> dict[str, Any]:
        """``voice_to_voice`` for the call's ``ended`` event: p50, p95, turns (ms)."""
        totals = sorted(t["total_ms"] for t in self.turns)
        if not totals:
            return {"p50": None, "p95": None, "turns": 0}
        return {"p50": totals[len(totals) // 2], "p95": totals[min(len(totals) - 1, int(len(totals) * 0.95))], "turns": len(totals)}


def log_line(record: dict[str, Any]) -> str:
    """One compact line: ``turn=3 total=1180ms eou=420 stt=180 llm=390 tts=170``."""
    def part(label: str, key: str) -> str:
        value = record.get(key)
        return f"{label}={value:.0f}" if isinstance(value, (int, float)) else f"{label}=-"

    line = f"turn={record.get('turn')} total={record.get('total_ms', 0):.0f}ms {part('eou', 'eou_ms')} {part('stt', 'stt_ms')} {part('llm', 'llm_ttft_ms')} {part('tts', 'tts_ttfb_ms')}"
    return line + (" interrupted" if record.get("interrupted") else "")
