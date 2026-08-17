"""Experts — the platform's agent abstraction.

An Expert is a declaratively-configured agent (system prompt + goal + tools +
triggers). The same entity backs three run modes:
  - chat      : interactive tool-use loop (the studio Deep-Agent style)
  - schedule  : runs autonomously on a cron/interval (a "digest at 7am" agent)
  - external  : run kicked off by an API/webhook call with a payload

Tools come from the Integrations layer (Composio apps, custom HTTP actions, MCP,
and the knowledge base) — so an Expert is a thin, reliable orchestration layer
over that tooling rather than bespoke agent code (the LangGraph-style loop lives
in runtime.py).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Expert(SQLModel, table=True):
    id: str = Field(primary_key=True)
    workspace: str = Field(default="default", index=True)
    name: str
    description: str = ""
    kind: str = "expert"  # expert | chat | voice

    system_prompt: str = ""
    goal: str = ""  # the task for schedule/external runs

    triggers_json: str = '["chat"]'  # subset of chat | schedule | external
    trigger_meta_json: str = "{}"  # per trigger name + notes, keyed by kind
    app_trigger_json: str = "{}"  # {toolkit, slug, name, config} when an app event starts it
    app_trigger_instance: str = ""  # Composio trigger instance id while subscribed  # per trigger name + notes, keyed by kind
    schedule_json: str = "{}"  # {kind: daily|hourly|interval|weekly, at, interval_minutes, weekday, tz}
    reasoning: str = "balanced"  # fast | balanced | deep
    allowed_tools_json: str = "[]"  # [{kind: composio|action|mcp|kb, ref, label}]

    status: str = "inactive"  # active | inactive  (gates scheduled runs)
    external_secret: str = ""  # signing secret for the external trigger webhook

    next_run_at: datetime | None = None
    last_run_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def app_trigger(self) -> dict:
        return json.loads(self.app_trigger_json or "{}")

    @property
    def trigger_meta(self) -> dict:
        return json.loads(self.trigger_meta_json or "{}")

    @property
    def triggers(self) -> list[str]:
        return json.loads(self.triggers_json or "[]")

    @property
    def schedule(self) -> dict:
        return json.loads(self.schedule_json or "{}")

    @property
    def allowed_tools(self) -> list[dict]:
        return json.loads(self.allowed_tools_json or "[]")


class ExpertRun(SQLModel, table=True):
    id: str = Field(primary_key=True)
    expert_id: str = Field(index=True)
    trigger: str = "manual"  # manual | schedule | external | chat
    status: str = "running"  # running | done | error
    input: str = ""  # external payload / chat message / goal
    result: str = ""
    steps_json: str = "[]"  # [{type: thought|tool_call|tool_result|final, ...}]
    error: str | None = None
    tokens: int = 0
    started_at: datetime = Field(default_factory=_now)
    ended_at: datetime | None = None

    @property
    def steps(self) -> list[dict]:
        return json.loads(self.steps_json or "[]")
