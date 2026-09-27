"""A tool the worker can call, with the flags that decide how it may fail.

``Tool`` is the harness's own type, built from the contract's ``ToolSpec`` for
actions and by hand for the built-ins. The three reliability flags are copied
onto it because the executor branches on them on every call:

- ``is_durable_write``  — ``hangup_call`` waits for these, and only these.
- ``is_idempotent``     — decides retry vs reconcile after a transport fault.
- ``requires_approval`` — never executed on a live call; recorded as awaiting.

``plumbing`` marks tools that are the worker reasoning about how to do the
job (reading a skill) rather than the job. They are hidden from the progress
digest so the talker cannot narrate them.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app_sdk.models import ToolSpec

from .llm import openai_tool_schema

Handler = Callable[[dict[str, Any], Any], Awaitable[Any]]


@dataclass(slots=True)
class ToolResult:
    """What a handler produced, normalised for the history and the audit row."""

    output: str
    ok: bool = True
    data: Any = None
    error: str | None = None

    @classmethod
    def success(cls, data: Any, *, text: str | None = None) -> "ToolResult":
        return cls(output=text if text is not None else _render(data), ok=True, data=data)

    @classmethod
    def failure(cls, error: str, *, data: Any = None) -> "ToolResult":
        # Tool result strings state facts and stop; the reason is the fact.
        return cls(output=_render({"success": False, "error": error, **(data if isinstance(data, dict) else {})}), ok=False, data=data, error=error)


@dataclass(slots=True)
class Tool:
    name: str
    description: str
    handler: Handler
    input_schema: dict[str, Any] = field(default_factory=lambda: {"type": "object", "properties": {}})
    kind: str = "internal"
    is_durable_write: bool = False
    is_idempotent: bool = True
    requires_approval: bool = False
    timeout_ms: int = 15000
    max_retries: int = 2
    plumbing: bool = False
    # For contract actions: the app's action id, so audit rows link to it.
    action_id: int | None = None
    # For the talker's own tools, which are conversation rather than work and
    # are not recorded as tool calls.
    audited: bool = True

    def schema(self) -> dict[str, Any]:
        return openai_tool_schema(self.name, self.description, self.input_schema)

    @property
    def external(self) -> bool:
        return self.kind != "internal"

    def can_retry_after(self, failure: str) -> bool:
        if self.is_idempotent:
            return True
        return failure != "timeout"

    @classmethod
    def from_spec(cls, spec: ToolSpec, handler: Handler) -> "Tool":
        return cls(
            name=spec.name,
            description=spec.description,
            handler=handler,
            input_schema=spec.input_schema or {"type": "object", "properties": {}},
            kind=spec.kind,
            is_durable_write=spec.is_durable_write,
            is_idempotent=spec.is_idempotent,
            requires_approval=spec.requires_approval,
            timeout_ms=spec.timeout_ms,
            max_retries=spec.max_retries,
            action_id=spec.id,
        )


def _render(data: Any) -> str:
    if isinstance(data, str):
        return data
    try:
        return json.dumps(data, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(data)
