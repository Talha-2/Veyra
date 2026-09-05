"""The internal event bus: every product moment, published once.

A single seam — ``publish(event_type, data)`` — through which the product
announces its own moments: a message arrives, an email lands, a call ends, a
lead is filed, a ticket opens. Each publish fans out twice:

  1. **Outbound developer webhooks** (``publicapi.webhooks.emit``) — the
     existing behaviour, unchanged: Standard-Webhooks-signed POSTs to
     subscribed endpoints.
  2. **Subscribed agents** — new. Any active Expert whose triggers include
     ``"events"`` and whose ``trigger_meta["events"]["types"]`` lists the
     event type gets a run, with the event payload as its input. This is the
     "product internal triggers wake the agent" model: the same fan-out shape
     as the Composio app-event path (routers/experts.py::app_event), applied
     to the product's own events.

Loop safety, deliberately simple for now:
  - ``run.*`` events never wake agents — an agent completing must not be able
    to wake agents, or two experts subscribed to each other's completions
    would ping-pong forever.
  - A per-(expert, event_type) throttle caps dispatches per minute, so an
    agent whose own actions raise events (it files a ticket → ticket.created)
    degrades to a bounded trickle instead of a storm.

The catalog below is the single source of truth for event names; the
developer router imports it so the webhook-subscription UI can never drift
from what is actually emitted again.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

from sqlmodel import Session, select

logger = logging.getLogger("events")

# every event the platform emits, with the moment it fires
EVENT_TYPES: list[dict] = [
    {"type": "message.received", "label": "SMS received", "desc": "An inbound text message arrived on one of your numbers"},
    {"type": "email.received", "label": "Email received", "desc": "An inbound email landed in a connected mailbox"},
    {"type": "fax.received", "label": "Fax received", "desc": "An inbound fax finished receiving"},
    {"type": "call.started", "label": "Call started", "desc": "A browser voice session was opened via the API"},
    {"type": "call.ended", "label": "Call ended", "desc": "A voice call finished and its transcript was saved"},
    {"type": "lead.created", "label": "Lead created", "desc": "A new lead arrived from a form or ad"},
    {"type": "ticket.created", "label": "Ticket created", "desc": "A ticket was filed, by a person or an agent"},
    {"type": "run.started", "label": "Agent run started", "desc": "An agent began a run (webhooks only — never wakes agents)"},
    {"type": "run.completed", "label": "Agent run completed", "desc": "An agent finished a run (webhooks only)"},
    {"type": "run.failed", "label": "Agent run failed", "desc": "An agent run errored (webhooks only)"},
]

EVENT_TYPE_NAMES = [e["type"] for e in EVENT_TYPES]

# events that may wake agents (everything except agent-run lifecycle)
AGENT_WAKEABLE = [t for t in EVENT_TYPE_NAMES if not t.startswith("run.")]

# ── dispatch throttle ────────────────────────────────────────────────────────
_THROTTLE_WINDOW_SEC = 60
_THROTTLE_MAX_PER_WINDOW = 6
_dispatch_log: dict[tuple[str, str], list[float]] = {}


def _throttled(expert_id: str, event_type: str) -> bool:
    key = (expert_id, event_type)
    cutoff = time.monotonic() - _THROTTLE_WINDOW_SEC
    hits = [t for t in _dispatch_log.get(key, []) if t > cutoff]
    if len(hits) >= _THROTTLE_MAX_PER_WINDOW:
        _dispatch_log[key] = hits
        return True
    hits.append(time.monotonic())
    _dispatch_log[key] = hits
    return False


# ── the seam ─────────────────────────────────────────────────────────────────
def publish(event_type: str, data: dict) -> list[dict]:
    """Announce a product moment. Fire-and-forget on both fan-out paths.

    Returns the list of agent dispatches started (empty when none matched),
    so callers that want to report "these agents woke up" can.
    """
    # 1) outbound developer webhooks — existing behaviour, unchanged
    try:
        from .publicapi import webhooks as out_hooks

        out_hooks.emit(event_type, data)
    except Exception:
        logger.warning("webhook emit failed for %s", event_type, exc_info=True)

    # 2) wake subscribed agents
    if event_type not in AGENT_WAKEABLE:
        return []
    try:
        return _dispatch_to_experts(event_type, data)
    except Exception:
        logger.warning("agent dispatch failed for %s", event_type, exc_info=True)
        return []


def _dispatch_to_experts(event_type: str, data: dict) -> list[dict]:
    """Run every active Expert subscribed to this event type.

    Mirrors the Composio app-event fan-out: one run per matching expert, the
    event payload as input, visible in Executions like any other run. Uses its
    own session — publish() is called from inside request handlers whose
    session state should not be entangled with dispatch.
    """
    from .db import engine
    from .experts.models import Expert
    from .experts.runtime import create_run, execute_run

    started: list[dict] = []
    with Session(engine) as session:
        for e in session.exec(select(Expert).where(Expert.status == "active")).all():
            if "events" not in e.triggers:
                continue
            sub = (e.trigger_meta or {}).get("events") or {}
            types = sub.get("types") or []
            if event_type not in types:
                continue
            if data.get("_answered_by") == e.id:
                continue  # this agent already handled the message synchronously
            if _throttled(e.id, event_type):
                logger.warning("throttled %s for expert %s", event_type, e.id)
                continue
            payload = {"event": event_type, "data": data}
            run = create_run(session, e, f"event:{event_type}", json.dumps(payload)[:4000])
            _spawn(execute_run(run.id))
            started.append({"expert_id": e.id, "run_id": run.id})
    if started:
        logger.info("event %s woke %d agent(s)", event_type, len(started))
    return started


def _spawn(coro) -> None:
    """Schedule a coroutine whether or not the caller is on the event loop
    (telephony webhook handlers are sync-context in places)."""
    try:
        asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        import threading

        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()
