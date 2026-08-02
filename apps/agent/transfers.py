"""Call transfers.

Two modes, both real patterns from production telephony:

- COLD (blind): SIP REFER via LiveKit's TransferSIPParticipant. The caller is
  gone from our room the moment it succeeds. Use for "just get me billing".
  Failure mode to handle: the transfer target doesn't pick up — so we announce
  BEFORE transferring and keep the session alive until the REFER is accepted.

- WARM (announced): we dial the human into the caller's room, the agent speaks
  a briefing summary to both parties, then leaves. This is the pragmatic warm
  variant. The full consult-room variant (agent briefs the human privately
  while the caller holds) needs a second AgentSession in a breakout room —
  the seam for it is `_briefing_summary()` + CreateSIPParticipant with a
  different room name.

Web demo (no SIP configured): we announce the transfer and publish a
`transfer` data event so the frontend can render the handoff. Degrading
loudly-but-gracefully beats a tool that errors into the LLM context and makes
the agent apologize in circles.
"""

from __future__ import annotations

import json
import logging
import os

from livekit import api, rtc
from livekit.agents import get_job_context

logger = logging.getLogger("voice-agent.transfers")

TRANSFER_NUMBER = os.getenv("SIP_TRANSFER_NUMBER", "")
SUPERVISOR_NUMBER = os.getenv("SIP_SUPERVISOR_NUMBER", "")
OUTBOUND_TRUNK_ID = os.getenv("SIP_OUTBOUND_TRUNK_ID", "")


def _find_sip_participant(room: rtc.Room) -> rtc.RemoteParticipant | None:
    for participant in room.remote_participants.values():
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            return participant
    return None


async def _publish_transfer_event(room: rtc.Room, mode: str, status: str, detail: str = "") -> None:
    try:
        payload = json.dumps({"mode": mode, "status": status, "detail": detail}).encode()
        await room.local_participant.publish_data(payload, reliable=True, topic="transfer")
    except Exception as exc:
        logger.warning("transfer event publish failed: %s", exc)


async def cold_transfer(target: str | None = None) -> str:
    """Returns a short status string for the LLM."""
    ctx = get_job_context()
    room = ctx.room
    number = target or TRANSFER_NUMBER

    sip_participant = _find_sip_participant(room)
    if sip_participant is None or not number:
        await _publish_transfer_event(room, "cold", "simulated",
                                      "No SIP leg on this call (web demo) or no target configured.")
        return ("This is a web demo call with no phone leg, so the transfer is simulated. "
                "Tell the caller a human would now take over.")

    try:
        await ctx.api.sip.transfer_sip_participant(
            api.TransferSIPParticipantRequest(
                room_name=room.name,
                participant_identity=sip_participant.identity,
                transfer_to=number,
                play_dialtone=True,
            )
        )
        await _publish_transfer_event(room, "cold", "completed", number)
        return "Transfer completed — the caller is now connected to the target."
    except Exception as exc:
        logger.error("cold transfer failed: %s", exc)
        await _publish_transfer_event(room, "cold", "failed", str(exc))
        return ("The transfer failed to connect. Apologize, offer to take a message "
                "or have someone call back.")


async def warm_transfer(summary: str, target: str | None = None) -> str:
    """Dial a human into the room, agent announces the briefing, then exits."""
    ctx = get_job_context()
    room = ctx.room
    number = target or SUPERVISOR_NUMBER

    if not number or not OUTBOUND_TRUNK_ID:
        await _publish_transfer_event(room, "warm", "simulated", summary)
        return ("Warm transfer is simulated in the web demo. Speak the briefing summary "
                f"aloud as if introducing a colleague, then wrap up: {summary}")

    try:
        await ctx.api.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=OUTBOUND_TRUNK_ID,
                sip_call_to=number,
                room_name=room.name,
                participant_identity="human-agent",
                participant_name="Human agent",
                wait_until_answered=True,
            )
        )
        await _publish_transfer_event(room, "warm", "connected", number)
        return (f"The human agent has joined the call. Introduce them to the caller with "
                f"this briefing, then say goodbye: {summary}")
    except Exception as exc:
        logger.error("warm transfer failed: %s", exc)
        await _publish_transfer_event(room, "warm", "failed", str(exc))
        return ("Could not reach a human agent. Apologize and offer to take a callback "
                "number instead.")
