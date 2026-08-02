"""In-process scheduler for active, scheduled Experts.

A single asyncio task ticks every 30s, finds active experts whose next_run_at is
due, advances their next_run_at (before running, to avoid double-fires), and
executes them. Runs in the API process — fine for a single-node reference
platform; a multi-node deploy would move this to a dedicated worker + lock.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import timezone

from sqlmodel import Session, select

from ..db import engine, now
from .models import Expert
from .runtime import run_expert
from .schedule import compute_next_run

logger = logging.getLogger("voice-agent.scheduler")
_task: asyncio.Task | None = None


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _tick_once() -> None:
    with Session(engine) as session:
        experts = session.exec(select(Expert).where(Expert.status == "active")).all()
        due = [
            e for e in experts
            if "schedule" in e.triggers and e.next_run_at and _aware(e.next_run_at) <= now()
        ]
        for e in due:
            e.next_run_at = compute_next_run(e.schedule, now())
            session.add(e)
            session.commit()
            logger.info("scheduled run: expert=%s next=%s", e.name, e.next_run_at)
            try:
                await run_expert(session, e, "schedule", "")
            except Exception as exc:
                logger.error("scheduled run failed for %s: %s", e.name, exc)


async def _loop() -> None:
    logger.info("expert scheduler started")
    while True:
        try:
            await _tick_once()
        except Exception as exc:
            logger.error("scheduler tick error: %s", exc)
        await asyncio.sleep(30)


def start_scheduler() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
