"""Per-run state the tools read.

One object for a call (``CallState``) and a smaller one for a text run. Both
carry a tenant-bound ``AppSdk``; the call one also carries the call, the
caller as we learn who they are, and the tickets raised so far — which is how
the post-call pass knows not to raise a second one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app_sdk import AppSdk
from app_sdk.models import CallContext, CallInfo, ContactRecord, TenantContext, TicketRecord


@dataclass
class RunState:
    sdk: AppSdk
    context: TenantContext
    contact: ContactRecord | None = None
    tickets: list[TicketRecord] = field(default_factory=list)
    dry_run: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def call(self) -> CallInfo | None:
        return None


@dataclass
class CallState(RunState):
    """Everything about one live call that a tool or the talker needs."""

    context: CallContext  # type: ignore[assignment]
    was_voicemail: bool = False
    # The delegation sequence advances when a delegation *begins*, so a retry
    # cannot send the same segment twice (ARCHITECTURE.md §5.2).
    next_sequence: int = 1

    def __post_init__(self) -> None:
        if self.contact is None:
            self.contact = self.context.caller.contact

    @property
    def call(self) -> CallInfo:
        return self.context.call

    def take_sequence(self) -> int:
        sequence = self.next_sequence
        self.next_sequence += 1
        return sequence
