"""Abilities — visual, node-based conversation flows.

An Ability is a directed graph of typed nodes that structures how a voice or
chat agent handles a conversation. It's the visual, richer evolution of the
JSON Workflow: instead of a flat step list, an Ability is a real flow with
branching (Condition), tool calls (Act), questions (Ask), lines (Speak),
reusable Subflows, and terminal End nodes.

Node schema (stored in nodes_json):
  { "id","type","label","next", ...type-specific fields }
  - ask       : prompt, save_as
  - act       : tool {kind,ref}, instruction, save_as
  - speak     : text
  - condition : condition, then, else        (then/else = node ids)
  - subflow   : ability_id
  - end       : (terminal)

The compiler (compiler.py) turns this graph into an instruction script + tool
set the voice worker runs, so the model executes the flow conversationally.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


NODE_TYPES = ["trigger", "ask", "act", "agent", "speak", "condition",
              "subflow", "webhook", "start", "end", "return"]


class Ability(SQLModel, table=True):
    id: str = Field(primary_key=True)
    workspace: str = Field(default="default", index=True)
    name: str
    description: str = ""
    nodes_json: str = "[]"
    start_node: str = ""
    triggers_json: str = "[]"  # phrases/intents that start this workflow when spoken
    global_prompt: str = ""  # instructions that apply in every node unless opted out
    live_version: int = 0  # which published version calls actually run; 0 = never deployed
    enabled: bool = True
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def nodes(self) -> list[dict]:
        return json.loads(self.nodes_json or "[]")

    @property
    def triggers(self) -> list[str]:
        return json.loads(self.triggers_json or "[]")


class AbilityVersion(SQLModel, table=True):
    """A frozen copy of a pathway, taken at deploy.

    The row you edit is the draft. Calls run the deployed version, so changing a
    flow mid afternoon cannot break a call already in progress, and a bad change
    is one restore away instead of a scramble to remember what it used to say.
    """

    id: str = Field(primary_key=True)
    ability_id: str = Field(index=True)
    version: int = 0
    name: str = ""
    nodes_json: str = "[]"
    start_node: str = ""
    triggers_json: str = "[]"
    global_prompt: str = ""
    note: str = ""  # what changed, written at deploy time
    created_at: datetime = Field(default_factory=_now)

    @property
    def nodes(self) -> list[dict]:
        return json.loads(self.nodes_json or "[]")

    @property
    def triggers(self) -> list[str]:
        return json.loads(self.triggers_json or "[]")
