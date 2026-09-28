"""The talker: holds the conversation, does all the talking, never blocks.

Ported from Z360's ``front_desk/agent.py``. The worker it delegates to is the
harness ``Worker`` — a plain loop, not a LiveKit Agent — so the two run
concurrently: the conversation continues while work happens.

**The tool is non-blocking, and that is the point.** A LiveKit tool becomes
non-blocking the moment it calls ``ctx.update()``, so the first thing
``delegate`` does is update, before the worker is even started. On a LiveKit
version without async tools it degrades to blocking and logs that it did.

**This agent answers everything it can itself.** Business information is in
its prompt and the knowledge base is one tool call away. Only a request that
needs something *done* goes to the worker.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
from typing import Any

from livekit import api
from livekit.agents import Agent, RunContext, StopResponse, function_tool, get_job_context

from veyra_harness.actions import KNOWLEDGE_DESCRIPTION, search_knowledge
from veyra_harness.prompt import ACK_TEMPLATE, FALLBACK_LINE, NOTHING_NEW, STILL_WRITING, SUPERSEDE_TEMPLATE, UNCONFIRMED_LINE
from veyra_harness.state import CallState
from veyra_harness.transcript import format_transcript_delta
from veyra_harness.worker import FinalizationResult, Worker

logger = logging.getLogger("veyra.voice.front_desk")

# Smaller models sometimes emit a tool call as literal text; the caller then
# hears "<function=search…>" read aloud. Strip it on the way to the speaker.
_TOOL_LEAK = re.compile(
    r"<\s*function[^>]*>.*?</\s*function\s*>|<\s*/?\s*(?:function|tool_call|invoke)[^>]*>"
    r"|\{\s*\"(?:name|function)\"\s*:\s*\"[^\"]+\"\s*,\s*\"(?:arguments|parameters)\".*\}",
    re.S | re.I,
)
_ORPHAN = re.compile(r"(?:^|\s)[{}<>\[\]]+(?=\s|$)")

# Words that only a durable write can back. If the worker's reply uses one and
# the app says nothing durable completed, the talker is told so explicitly.
_CLAIMS = re.compile(r"\b(booked|scheduled|created|raised|sent|texted|emailed|recorded|updated|cancelled|canceled|confirmed)\b", re.I)


def strip_tool_syntax(text: str) -> str:
    cleaned = _TOOL_LEAK.sub(" ", text)
    cleaned = _ORPHAN.sub(" ", cleaned)
    cleaned = re.sub(r"\s+([.,!?])", r"\1", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def guard_reply(reply: str, *, completed_durable_write: bool) -> str:
    """Append the unconfirmed line when a reply claims a write the app did not see."""
    if completed_durable_write or not _CLAIMS.search(reply):
        return reply
    return f"{reply}\n\n{UNCONFIRMED_LINE}"


class FrontAgent(Agent):
    """Talks to the caller. Answers what it can; delegates what needs doing."""

    def __init__(self, *, instructions: str, worker: Worker, state: CallState, finalization_instructions: str) -> None:
        super().__init__(instructions=instructions)
        self._worker = worker
        self._state = state
        self._finalization_instructions = finalization_instructions
        self._transcript_cursor = 0
        self._spoken_digest = ""
        self.finalization: FinalizationResult | None = None

    # ── speech ────────────────────────────────────────────────────────────

    async def on_enter(self) -> None:
        greeting = self._state.context.agent.greeting
        if greeting:
            await self.session.say(greeting, allow_interruptions=True)
        else:
            self.session.generate_reply(instructions="Greet the caller briefly as the business's front desk and ask how you can help.")

    async def tts_node(self, text, model_settings):  # type: ignore[override]
        async def scrubbed():
            async for chunk in text:
                out = strip_tool_syntax(chunk) if ("<" in chunk or "{" in chunk) else chunk
                if out:
                    yield out

        async for frame in super().tts_node(scrubbed(), model_settings):
            yield frame

    # ── the talker's own tools ────────────────────────────────────────────

    @function_tool(description=KNOWLEDGE_DESCRIPTION)
    async def search_knowledge(self, ctx: RunContext, query: str) -> str:
        # The front desk's own lookups are shown like the worker's (Studio
        # Talk lists them beside the orb); a phone has nobody to show them to.
        observer = getattr(self._worker, "observer", None)
        step = f"fd-{id(ctx)}-{abs(hash(query)) % 10**6}"
        if observer is not None:
            await observer({"type": "tool", "id": step, "name": "search_knowledge", "status": "running", "label": "Searching knowledge", "detail": query})
        result = await search_knowledge({"query": query}, self._state)
        if observer is not None:
            await observer({"type": "tool", "id": step, "name": "search_knowledge", "status": "done", "label": "Searched knowledge", "detail": query})
        return result.output

    @function_tool
    async def stay_on_hold(self, ctx: RunContext) -> str:
        """The caller asked you to wait. Call this, say nothing more, and wait for them to come back."""
        return "Holding. Say nothing until the caller speaks again."

    # ── delegation ────────────────────────────────────────────────────────

    @function_tool
    async def delegate(self, ctx: RunContext) -> str:
        """Hand the new caller conversation to be worked on.

        Call this with no arguments when something needs doing, or after the
        caller has supplied every detail that was last asked for. Do not call
        it again until its reply has arrived; use check_progress instead.
        """
        transcript, end = format_transcript_delta(self.chat_ctx.items, self._transcript_cursor)
        if not transcript:
            self._transcript_cursor = end
            return NOTHING_NEW
        if not self._worker.claim():
            return SUPERSEDE_TEMPLATE
        # The cursor advances when the delegation begins, so a retry cannot
        # send the same caller segment twice.
        self._transcript_cursor = end

        update = getattr(ctx, "update", None)
        if callable(update):
            # Non-blocking from here on. This is also where the agent's first
            # words come from, which is why nothing is said before the call.
            await update("started", template=ACK_TEMPLATE)
        else:
            logger.warning("front_desk.blocking_delegate: this LiveKit version has no async tools; the caller hears silence while the worker runs")

        try:
            async for outcome in self._worker.run(transcript):
                self._worker.note_reported()
                if outcome.failed or not outcome.reply.strip():
                    return FALLBACK_LINE
                return guard_reply(outcome.reply, completed_durable_write=outcome.completed_durable_write)
        except Exception as e:  # noqa: BLE001 — never end a call on a tool fault
            logger.error("front_desk.delegation.error %s: %s", type(e).__name__, e)
        self._worker.note_reported()
        return FALLBACK_LINE

    @function_tool
    async def check_progress(self, ctx: RunContext) -> str:
        """See what the request has actually done so far.

        Use it when the caller asks, when a pause stretches, or before saying
        anything about how it is going. What comes back is the steps taken, for
        you, not for them: say what it means in their terms.
        """
        if self._worker.just_reported():
            raise StopResponse
        digest = self._worker.progress_digest()
        # Nothing new to report is nothing to say: the identical answer does
        # not buy another turn.
        if digest == self._spoken_digest:
            raise StopResponse
        self._spoken_digest = digest
        return digest

    # ── ending the call ───────────────────────────────────────────────────

    @function_tool
    async def hangup_call(self, ctx: RunContext) -> str:
        """End the phone call when the conversation has reached its end. Say your goodbye first, then call this."""
        # A durable write must never be in flight when the line closes. That
        # is the whole reason to refuse, and it is the only reason: a read
        # left running costs nothing once the line is down.
        if self._worker.write_in_flight:
            return STILL_WRITING

        # Close the mic before waiting on playout: a live mic can open a new
        # turn during the goodbye and turn four seconds into fourteen.
        with contextlib.suppress(Exception):
            ctx.session.input.set_audio_enabled(False)

        wait = getattr(ctx, "wait_for_playout", None)
        if callable(wait):
            with contextlib.suppress(Exception):
                await wait()
        else:
            await asyncio.sleep(2.0)

        job = get_job_context()
        try:
            await job.api.room.delete_room(api.DeleteRoomRequest(room=job.room.name))
        except Exception as e:  # noqa: BLE001
            logger.warning("front_desk.hangup.failed %s", e)
            with contextlib.suppress(Exception):
                ctx.session.input.set_audio_enabled(True)
            return json.dumps({"success": False, "error": str(e)[:200]})
        return json.dumps({"success": True})

    async def finalize_after_call(self) -> FinalizationResult:
        """Give the worker the final unseen transcript, silently, once."""
        transcript, end = format_transcript_delta(self.chat_ctx.items, self._transcript_cursor)
        self._transcript_cursor = end
        self.finalization = await self._worker.finalize(transcript, self._finalization_instructions)
        return self.finalization

    @property
    def transcript_cursor(self) -> int:
        return self._transcript_cursor
