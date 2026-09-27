"""The talker's pure helpers. The Agent class itself needs a LiveKit room."""

from __future__ import annotations

import pytest

pytest.importorskip("livekit.agents", reason="front_desk imports LiveKit; its pure helpers are tested when it is installed")

from veyra_voice.front_desk import guard_reply, strip_tool_syntax  # noqa: E402


def test_tool_syntax_never_reaches_the_speaker():
    assert strip_tool_syntax('Sure. <function=search_knowledge>{"query":"hours"}</function> We open at eight.') == "Sure. We open at eight."
    assert strip_tool_syntax('{"name": "delegate", "arguments": {}} One moment.') == "One moment."
    assert strip_tool_syntax("Hello } there") == "Hello there"


def test_a_reply_that_claims_a_write_the_app_did_not_see_is_flagged():
    assert guard_reply("Ask for their email.", completed_durable_write=False) == "Ask for their email."
    flagged = guard_reply("Booked for Thursday 9-12.", completed_durable_write=False)
    assert flagged.startswith("Booked for Thursday") and "nothing durable was confirmed" in flagged
    assert guard_reply("Booked for Thursday 9-12.", completed_durable_write=True) == "Booked for Thursday 9-12."
