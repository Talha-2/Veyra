"""Integration data model.

Three kinds of agent capabilities, all surfaced in the studio Integrations page
and loaded by the voice worker as callable tools:

- Connection  — a Composio connected account (Gmail, Google Calendar, Slack…),
  authorized via Composio's managed OAuth. Composio holds the credentials; we
  store the connection id + which toolkit/app it is.
- CustomAction — a plain HTTP endpoint exposed to the agent as one tool
  (name, description, method, url, args, headers, auth).
- McpServer    — a remote MCP server (streamable_http or sse) whose tools are
  fetched and exposed to the agent.

All are scoped to a workspace (single-tenant here: "default") so the model is
ready for multi-tenant without reshaping.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Connection(SQLModel, table=True):
    """A Composio connected account."""

    id: str = Field(primary_key=True)  # our id
    workspace: str = Field(default="default", index=True)
    toolkit: str = Field(index=True)  # composio toolkit slug, e.g. "gmail"
    app_name: str = ""  # display name
    composio_connection_id: str | None = None  # id returned by Composio
    entity_id: str = "default"  # composio user/entity id
    status: str = "initiated"  # initiated | active | failed | disabled
    connected_email: str | None = None
    enabled_tools_json: str = "[]"  # subset of tool slugs enabled for the agent ([] = all)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def enabled_tools(self) -> list[str]:
        return json.loads(self.enabled_tools_json or "[]")


class CustomAction(SQLModel, table=True):
    """A user-defined HTTP endpoint exposed to the agent as a single tool."""

    id: str = Field(primary_key=True)
    workspace: str = Field(default="default", index=True)
    name: str
    description: str = ""
    method: str = "POST"  # GET | POST
    url: str = ""
    auth_type: str = "none"  # none | bearer | header | basic
    auth_value: str = ""  # token / header value (stored as-is; local reference platform)
    args_json: str = "[]"  # [{name, description, required, location: body|query}]
    headers_json: str = "{}"  # {name: value}
    enabled: bool = True
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def args(self) -> list[dict]:
        return json.loads(self.args_json or "[]")

    @property
    def headers(self) -> dict:
        return json.loads(self.headers_json or "{}")


class McpServer(SQLModel, table=True):
    """A remote MCP server whose tools are exposed to the agent."""

    id: str = Field(primary_key=True)
    workspace: str = Field(default="default", index=True)
    name: str
    url: str = ""
    transport: str = "streamable_http"  # streamable_http | sse
    auth_type: str = "none"  # none | bearer | header
    auth_value: str = ""
    tools_json: str = "[]"  # cached tool list from the last successful test
    enabled: bool = True
    status: str = "unknown"  # unknown | connected | error
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def tools(self) -> list[dict]:
        return json.loads(self.tools_json or "[]")
