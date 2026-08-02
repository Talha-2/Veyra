"""Schedule parsing + next-run computation for scheduled Experts.

Native (no croniter dependency) — covers the common cases the UI exposes:
  {"kind": "interval", "interval_minutes": 30}
  {"kind": "hourly",   "at_minute": 0}
  {"kind": "daily",    "at": "07:00", "tz_offset": 0}
  {"kind": "weekly",   "weekday": 0, "at": "09:00", "tz_offset": 0}   # 0 = Monday
Times are interpreted at tz_offset (minutes east of UTC); default UTC.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _parse_hhmm(value: str) -> tuple[int, int]:
    try:
        h, m = value.split(":")
        return max(0, min(23, int(h))), max(0, min(59, int(m)))
    except Exception:
        return 9, 0


def compute_next_run(schedule: dict, after: datetime | None = None) -> datetime | None:
    if not schedule:
        return None
    now = after or datetime.now(timezone.utc)
    kind = schedule.get("kind")
    tz = timezone(timedelta(minutes=int(schedule.get("tz_offset", 0) or 0)))

    if kind == "interval":
        mins = max(1, int(schedule.get("interval_minutes", 60)))
        return now + timedelta(minutes=mins)

    if kind == "hourly":
        at_minute = max(0, min(59, int(schedule.get("at_minute", 0))))
        nxt = now.replace(minute=at_minute, second=0, microsecond=0)
        if nxt <= now:
            nxt += timedelta(hours=1)
        return nxt

    if kind in ("daily", "weekly"):
        h, m = _parse_hhmm(schedule.get("at", "09:00"))
        local_now = now.astimezone(tz)
        candidate = local_now.replace(hour=h, minute=m, second=0, microsecond=0)
        if kind == "daily":
            if candidate <= local_now:
                candidate += timedelta(days=1)
        else:  # weekly
            target = int(schedule.get("weekday", 0)) % 7
            delta = (target - candidate.weekday()) % 7
            candidate += timedelta(days=delta)
            if candidate <= local_now:
                candidate += timedelta(days=7)
        return candidate.astimezone(timezone.utc)

    return None


def describe(schedule: dict) -> str:
    kind = schedule.get("kind")
    if kind == "interval":
        n = int(schedule.get("interval_minutes", 60))
        return f"Every {n} minutes" if n < 60 else f"Every {n // 60} hour(s)"
    if kind == "hourly":
        return f"Hourly at :{int(schedule.get('at_minute', 0)):02d}"
    if kind == "daily":
        return f"Daily at {schedule.get('at', '09:00')}"
    if kind == "weekly":
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return f"{days[int(schedule.get('weekday', 0)) % 7]} at {schedule.get('at', '09:00')}"
    return "Not scheduled"
