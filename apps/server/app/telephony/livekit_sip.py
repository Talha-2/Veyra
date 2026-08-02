"""Bridge PSTN calls into the LiveKit voice agent over SIP.

The provider (Twilio) only carries the call to a SIP endpoint; LiveKit's SIP
service is what turns that into a room the agent joins. Two directions:

  Outbound  — we create a room and ask LiveKit to dial the callee through the
              provider's SIP trunk (create_sip_participant). The agent
              auto-dispatches to the new room and starts talking.
  Inbound   — the provider points the number's SIP/voice at LiveKit's inbound
              trunk; a dispatch rule drops each call into its own room, which
              again auto-dispatches the agent.

Trunks are provisioned once (ids cached in TelephonyConfig.livekit_json) rather
than per call. Everything here is a no-op-with-clear-error until LiveKit
credentials exist, so importing the module never requires a configured stack.
"""

from __future__ import annotations

import logging

from ..config import settings
from .base import TelephonyError

logger = logging.getLogger("voice-agent.telephony.sip")


def _lk_ready() -> bool:
    return bool(settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret)


def _client():
    if not _lk_ready():
        raise TelephonyError(
            "LiveKit is not configured (LIVEKIT_URL / API key / secret). "
            "Calls are bridged through LiveKit SIP, so it must be set up first.",
            status=409,
        )
    from livekit import api

    return api.LiveKitAPI(
        settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
    )


async def ensure_outbound_trunk(
    *, sip_domain: str, numbers: list[str], username: str, password: str, existing_id: str = ""
) -> str:
    """Create (or reuse) a LiveKit outbound SIP trunk that dials through the
    provider. `sip_domain` is the provider's SIP host (e.g. Twilio Elastic SIP
    Trunking's `<name>.pstn.twilio.com`). Returns the trunk id to cache."""
    if existing_id:
        return existing_id
    from livekit import api

    lk = _client()
    try:
        trunk = api.SIPOutboundTrunkInfo(
            name="Vera outbound",
            address=sip_domain,
            numbers=numbers,
            auth_username=username,
            auth_password=password,
        )
        resp = await lk.sip.create_sip_outbound_trunk(
            api.CreateSIPOutboundTrunkRequest(trunk=trunk)
        )
        logger.info("created LiveKit outbound trunk %s -> %s", resp.sip_trunk_id, sip_domain)
        return resp.sip_trunk_id
    finally:
        await _aclose(lk)


async def ensure_inbound_trunk(*, numbers: list[str], existing_id: str = "") -> str:
    """Create (or reuse) a LiveKit inbound trunk that accepts calls the provider
    forwards to LiveKit's SIP URI for these numbers."""
    if existing_id:
        return existing_id
    from livekit import api

    lk = _client()
    try:
        trunk = api.SIPInboundTrunkInfo(name="Vera inbound", numbers=numbers)
        resp = await lk.sip.create_sip_inbound_trunk(
            api.CreateSIPInboundTrunkRequest(trunk=trunk)
        )
        logger.info("created LiveKit inbound trunk %s", resp.sip_trunk_id)
        return resp.sip_trunk_id
    finally:
        await _aclose(lk)


async def ensure_dispatch_rule(*, trunk_id: str, existing_id: str = "", room_prefix: str = "call") -> str:
    """A dispatch rule turns each inbound call into its own room (`call-xxxx`),
    which the agent auto-dispatches to."""
    if existing_id:
        return existing_id
    from livekit import api

    lk = _client()
    try:
        rule = api.SIPDispatchRule(
            dispatch_rule_individual=api.SIPDispatchRuleIndividual(room_prefix=room_prefix)
        )
        resp = await lk.sip.create_sip_dispatch_rule(
            api.CreateSIPDispatchRuleRequest(rule=rule, trunk_ids=[trunk_id])
        )
        logger.info("created LiveKit dispatch rule %s", resp.sip_dispatch_rule_id)
        return resp.sip_dispatch_rule_id
    finally:
        await _aclose(lk)


async def start_outbound_call(
    *, trunk_id: str, to_e164: str, room_name: str, identity: str, caller_id: str = ""
) -> None:
    """Ask LiveKit to dial `to_e164` through the trunk and drop them into
    `room_name`. The agent worker auto-joins that room and speaks."""
    from livekit import api

    lk = _client()
    try:
        req = api.CreateSIPParticipantRequest(
            sip_trunk_id=trunk_id,
            sip_call_to=to_e164,
            room_name=room_name,
            participant_identity=identity,
            participant_name=to_e164,
            wait_until_answered=False,
        )
        # caller id (the number the callee sees) is optional and version-dependent
        if caller_id:
            for attr in ("sip_number", "from_number"):
                if hasattr(req, attr):
                    setattr(req, attr, caller_id)
                    break
        await lk.sip.create_sip_participant(req)
        logger.info("outbound SIP dial %s -> room %s", to_e164, room_name)
    finally:
        await _aclose(lk)


async def _aclose(lk) -> None:
    try:
        await lk.aclose()
    except Exception:
        pass
