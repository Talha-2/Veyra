"""Wire models for contract v1.

Mirrors the payloads in ``docs/agent-contract.md`` field for field. Where a
field decides which tenant a call runs as it has no default, so a truncated or
error body fails validation loudly rather than hydrating into a context that
silently points at the wrong organization (``CallContext.organization``,
``CallInfo.id``). Everything else is tolerant: the app may add fields without
a contract bump, and the SDK must keep working when it does.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


def _empty_list_is_an_object(value: Any) -> Any:
    """PHP encodes an empty array as ``[]`` whether it meant a list or a map.

    The app guards the fields it types as objects, but the guard is easy to
    forget on a new field, and the failure mode — a call refusing to start
    because ``advanced`` was empty — is far worse than tolerating it here.
    """
    return {} if value == [] else value


# ── Tenant bundle ────────────────────────────────────────────────────────


class OrganizationInfo(_Model):
    id: int
    slug: str
    name: str
    timezone: str = "UTC"


class BusinessProfile(_Model):
    name: str | None = None
    description: str | None = None
    industry: str | None = None
    timezone: str | None = None
    website: str | None = None
    address: str | None = None
    hours: Any | None = None
    holidays: Any | None = None


class LanguageCapability(_Model):
    """What one language actually gets from the pipeline. See docs/urdu-support.md."""

    code: str = ""
    label: str = ""
    native: str = ""
    rtl: bool = False
    stt: str = "nova-3"
    stt_multi: bool = True
    tts_low_latency: bool = True
    tts_provider: str = "elevenlabs-flash"
    semantic_turns: bool = True
    caveats: list[str] = Field(default_factory=list)


class VoiceSettings(_Model):
    provider: str = "elevenlabs"
    id: str | None = None
    model: str = "flash"


class TurnSettings(_Model):
    min_endpointing_ms: int = 400
    min_interruption_ms: int = 550
    allow_interruptions: bool = True
    semantic_turn_detection: bool = True


class AgentSettings(_Model):
    display_name: str = "Assistant"
    persona: str | None = None
    greeting: str | None = None
    primary_language: str = "en"
    languages: list[LanguageCapability] = Field(default_factory=list)
    voice: VoiceSettings = Field(default_factory=VoiceSettings)
    turn: TurnSettings = Field(default_factory=TurnSettings)
    max_call_seconds: int = 1800
    record_calls: bool = True
    advanced: dict[str, Any] = Field(default_factory=dict)

    _objects = field_validator("advanced", mode="before")(_empty_list_is_an_object)

    def language_codes(self) -> list[str]:
        return [lang.code for lang in self.languages if lang.code]


class SkillStub(_Model):
    """A skill as it appears in the prompt: name, description, read hint. Never the body."""

    slug: str
    name: str
    description: str
    path: str = ""
    version: int = 1
    execution_mode: Literal["prose", "gated"] = "prose"
    scope: str = "org"


class ToolSpec(_Model):
    """A tool definition plus the three reliability flags the worker branches on."""

    name: str
    description: str
    input_schema: dict[str, Any] = Field(default_factory=lambda: {"type": "object", "properties": {}})
    id: int | None = None
    kind: Literal["internal", "http", "composio", "mcp"] = "internal"
    is_idempotent: bool = False
    is_durable_write: bool = False
    requires_approval: bool = False
    timeout_ms: int = 15000
    max_retries: int = 2
    config: dict[str, Any] | None = None

    _objects = field_validator("input_schema", "config", mode="before")(_empty_list_is_an_object)

    @property
    def external(self) -> bool:
        return self.kind != "internal"

    def can_retry_after(self, failure: str) -> bool:
        """Mirror of ``Action::canRetryAfter`` — same asymmetry, same reason."""
        if self.is_idempotent:
            return True
        return failure != "timeout"


class ExpertRecord(_Model):
    """A data record, not an agent: what gets swapped into the one loop."""

    slug: str
    name: str
    description: str
    runtime: Literal["talker", "worker", "text"] = "worker"
    system_prompt: str | None = None
    model: str | None = None
    reasoning_effort: str | None = None
    skills: list[SkillStub] = Field(default_factory=list)
    tools: list[ToolSpec] = Field(default_factory=list)
    peers: list[str] = Field(default_factory=list)

    def tool(self, name: str) -> ToolSpec | None:
        return next((t for t in self.tools if t.name == name), None)


class TicketTypeInfo(_Model):
    id: int
    name: str
    description: str | None = None


class MemoryEntry(_Model):
    name: str
    content: str | None = None


class TenantContext(_Model):
    """``GET /context``: everything for one tenant, without a call."""

    contract: str
    organization: OrganizationInfo
    business: BusinessProfile = Field(default_factory=BusinessProfile)
    agent: AgentSettings = Field(default_factory=AgentSettings)
    experts: list[ExpertRecord] = Field(default_factory=list)
    skills: list[SkillStub] = Field(default_factory=list)
    ticket_types: list[TicketTypeInfo] = Field(default_factory=list)
    memory: list[MemoryEntry] = Field(default_factory=list)

    @field_validator("contract")
    @classmethod
    def _v1(cls, value: str) -> str:
        if value != "v1":
            raise ValueError(f"contract {value!r} is not v1; this SDK speaks v1")
        return value

    def experts_for(self, runtime: str) -> list[ExpertRecord]:
        return [e for e in self.experts if e.runtime == runtime]

    @property
    def talker(self) -> ExpertRecord | None:
        found = self.experts_for("talker")
        return found[0] if found else None

    @property
    def workers(self) -> list[ExpertRecord]:
        return self.experts_for("worker")


# ── Call bundle ──────────────────────────────────────────────────────────


class CallInfo(_Model):
    id: int
    conversation_id: int | None = None
    direction: str = "inbound"
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    room: str | None = None
    provider: str | None = None
    provider_sid: str | None = None
    language: str = "en"
    capabilities: LanguageCapability | None = None


class LineInfo(_Model):
    id: int
    e164: str
    friendly_name: str | None = None
    language: str | None = None
    ivr: Any | None = None
    answered_by_agent: bool = True


class IdentifierInfo(_Model):
    id: int
    type: str
    value: str
    blocked: bool = False
    dnd: bool = False


class ContactRecord(_Model):
    id: int
    name: str | None = None
    display_name: str = ""
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    stage: str | None = None


class OpenTicket(_Model):
    reference: str
    subject: str
    status: str
    created_at: str | None = None
    id: int | None = None


class RecentCall(_Model):
    at: str | None = None
    duration: str | None = None
    summary: str | None = None


class CallerInfo(_Model):
    identifier: IdentifierInfo
    contact: ContactRecord | None = None
    open_tickets: list[OpenTicket] = Field(default_factory=list)
    recent_calls: list[RecentCall] = Field(default_factory=list)

    @property
    def known(self) -> bool:
        return self.contact is not None


class CallContext(TenantContext):
    """``POST /calls/inbound``: the tenant bundle plus this call.

    ``call``, ``line`` and ``caller`` are required. A body without them is not
    a call context, whatever else it contains.
    """

    call: CallInfo
    line: LineInfo
    caller: CallerInfo


# ── Reads ────────────────────────────────────────────────────────────────


class SkillDocument(_Model):
    slug: str
    name: str
    description: str
    version: int
    execution_mode: Literal["prose", "gated"] = "prose"
    steps: list[Any] | None = None
    path: str = ""
    markdown: str


class KnowledgeHit(_Model):
    document_id: int
    document: str | None = None
    position: int
    score: int
    excerpt: str
    content: str


class KnowledgeResult(_Model):
    query: str
    results: list[KnowledgeHit] = Field(default_factory=list)


class CallSummary(_Model):
    id: int
    at: str | None = None
    direction: str = "inbound"
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    status: str = ""
    duration: str = "—"
    duration_sec: int = 0
    language: str | None = None
    contact_id: int | None = None
    contact: str | None = None
    summary: str | None = None
    conversation_id: int | None = None


class ConversationSummary(_Model):
    id: int
    channel: str
    status: str
    last_message_at: str | None = None


class ContactLookup(_Model):
    found: bool
    identifier: IdentifierInfo | None = None
    contact: ContactRecord | None = None
    open_tickets: list[OpenTicket] = Field(default_factory=list)
    conversations: list[ConversationSummary] = Field(default_factory=list)


# ── Writes ───────────────────────────────────────────────────────────────


class TicketRecord(_Model):
    id: int
    number: int
    reference: str
    subject: str
    status: str
    priority: str = "normal"
    type: str | None = None
    assignees: list[str] = Field(default_factory=list)
    created_at: str | None = None


class MessageRecord(_Model):
    id: int
    conversation_id: int
    channel: str
    status: str
    to: str | None = None


class DelegationRecord(_Model):
    id: int
    sequence: int
    status: str


class DelegationOutcome(_Model):
    """What the talker may say, decided by the app from the audit trail."""

    id: int
    status: str
    failed: bool
    completed_durable_write: bool


class ToolCallRecord(_Model):
    id: int
    action_slug: str
    kind: str
    status: str
    result: dict[str, Any] | list[Any] | None = None
    error: str | None = None
    attempt: int = 1
    idempotency_key: str | None = None
    confirmed_complete: bool = False
    needs_reconciliation: bool = False
    created_at: str | None = None


class ToolCallStart(_Model):
    """The answer to "may I run this?".

    ``duplicate`` means the key was seen before and ``tool_call`` is that
    earlier record. The worker reconciles from its status — it does not run
    the action again.
    """

    duplicate: bool
    tool_call: ToolCallRecord


class AutomationSpec(_Model):
    id: int
    name: str
    system_prompt: str | None = None
    goal: str | None = None
    reasoning: str = "balanced"
    can_search_knowledge: bool = False
    tools: list[ToolSpec] = Field(default_factory=list)


class AutomationJob(_Model):
    id: int
    trigger: str
    input: str | None = None
    automation: AutomationSpec
    # Present on the unscoped claim, which spans tenants.
    organization_id: int | None = None


class HealthStatus(_Model):
    ok: bool
    contract: str
    app: str | None = None
    time: str | None = None
