"""The tools an expert is given, built from the contract.

Three sources, one ``Tool`` type:

1. **Built-ins** every worker has: read a skill, search knowledge, look up and
   register the caller, raise a ticket, queue a message, remember something.
   Each is one AppSdk call. ``save_ticket`` and ``send_message`` are durable
   writes and carry idempotency keys; the rest are reads.
2. **Internal actions** from Studio (``kind: internal``) map by slug onto the
   same handlers, so an org that granted ``create_ticket`` to an expert gets
   the built-in behaviour under the name the org chose.
3. **External actions** (``http``, ``composio``, ``mcp``): HTTP runs here from
   the action's config. Composio and MCP need their own executors, which are
   not wired in this slice — such a tool answers honestly that it is not
   connected in this environment rather than pretending.

State is whatever the host passes through (``CallState`` on a call, a text
run's state on the gateway). Handlers read ``state.sdk`` and ``state.call``.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app_sdk.errors import AppSdkError, NotFound
from app_sdk.models import ExpertRecord, TenantContext, ToolSpec

from .tools import Tool, ToolResult

logger = logging.getLogger("veyra.harness.actions")

# The talker's own answer-from-knowledge tool shares this description.
KNOWLEDGE_DESCRIPTION = (
    "Search the business's knowledge base: services, prices, policies, service area, hours. "
    "Returns the matching passages. Use it before saying you do not know."
)


# ── built-in handlers ────────────────────────────────────────────────────


async def read_skill(args: dict[str, Any], state: Any) -> Any:
    slug = str(args.get("slug") or "").strip().strip("/")
    # Accept the read hint path as well as the bare slug.
    if slug.startswith("skills/org/"):
        slug = slug.split("/")[2]
    if not slug:
        return ToolResult.failure("Give the skill slug from the catalog.")
    try:
        doc = await state.sdk.skill(slug)
    except NotFound:
        return ToolResult.failure(f"No skill named {slug!r}. The catalog lists the ones that exist.")
    return ToolResult.success(doc.markdown, text=doc.markdown)


async def search_knowledge(args: dict[str, Any], state: Any) -> Any:
    query = str(args.get("query") or "").strip()
    if not query:
        return ToolResult.failure("Give a query.")
    result = await state.sdk.search_knowledge(query, limit=int(args.get("limit") or 5))
    if not result.results:
        return ToolResult.success([], text="Nothing in the knowledge base matched. The business has not written this down.")
    text = "\n---\n".join(f"[{hit.document}] {hit.content}" for hit in result.results[:5])
    return ToolResult.success([hit.model_dump() for hit in result.results], text=text)


async def lookup_contact(args: dict[str, Any], state: Any) -> Any:
    # Studio's `find_contact` action takes one `query`; decide what it is.
    query = str(args.get("query") or "").strip()
    email = args.get("email") or (query if "@" in query else None)
    phone = args.get("phone") or (query if query and "@" not in query else None) or (state.call.from_ if getattr(state, "call", None) else None)
    contact_id = args.get("contact_id")
    if not (phone or email or contact_id):
        return ToolResult.failure("Give a phone number, an email, or a contact id to look up.")
    found = await state.sdk.lookup_contact(phone=phone if not (email or contact_id) else None, email=email if not contact_id else None, contact_id=contact_id)
    return ToolResult.success(found.model_dump())


async def recent_calls(args: dict[str, Any], state: Any) -> Any:
    calls = await state.sdk.recent_calls(since=args.get("since"), contact_id=args.get("contact_id"), status=args.get("status"), limit=int(args.get("limit") or 20))
    if not calls:
        return ToolResult.success([], text="No calls in that window.")
    lines = [f"- {c.at or '?'} {c.direction} {c.contact or c.from_ or 'unknown'} ({c.duration}, {c.status}): {c.summary or 'no summary'}" for c in calls]
    return ToolResult.success([c.model_dump(by_alias=True) for c in calls], text="\n".join(lines))


async def recent_tickets(args: dict[str, Any], state: Any) -> Any:
    tickets = await state.sdk.tickets(contact_id=args.get("contact_id"), limit=int(args.get("limit") or 10))
    if not tickets:
        return ToolResult.success([], text="No tickets.")
    lines = [f"- {t.reference} [{t.status}] {t.subject} — {', '.join(t.assignees) or 'unassigned'}" for t in tickets]
    return ToolResult.success([t.model_dump() for t in tickets], text="\n".join(lines))


async def register_contact(args: dict[str, Any], state: Any) -> Any:
    name = str(args.get("name") or "").strip()
    if not name:
        return ToolResult.failure("A name is required to create a contact.")
    phone = args.get("phone") or (state.call.from_ if getattr(state, "call", None) else None)
    contact, created = await state.sdk.create_contact(name=name, phone=phone, email=args.get("email"), company=args.get("company"))
    if getattr(state, "call", None) is not None:
        state.contact = contact
    return ToolResult.success({"created": created, "contact": contact.model_dump()})


async def update_contact(args: dict[str, Any], state: Any) -> Any:
    contact_id = args.get("contact_id") or (state.contact.id if getattr(state, "contact", None) else None)
    if not contact_id:
        return ToolResult.failure("No contact to update: look the caller up or register them first.")
    fields = {k: v for k, v in args.items() if k in ("name", "email", "company") and v is not None}
    contact = await state.sdk.update_contact(int(contact_id), **fields)
    return ToolResult.success({"contact": contact.model_dump()})


async def save_ticket(args: dict[str, Any], state: Any) -> Any:
    subject = str(args.get("subject") or "").strip()
    body = str(args.get("body") or args.get("description") or "").strip() or subject
    if not subject:
        return ToolResult.failure("A ticket needs a subject.")
    call = getattr(state, "call", None)
    ticket, created = await state.sdk.create_ticket(
        subject=subject, body=body, type=args.get("type"), priority=args.get("priority"),
        contact_id=args.get("contact_id") or (state.contact.id if getattr(state, "contact", None) else None),
        conversation_id=call.conversation_id if call else args.get("conversation_id"),
        call_id=call.id if call else None,
        idempotency_key=args.get("_idempotency_key"),
    )
    if call is not None:
        state.tickets.append(ticket)
    return ToolResult.success(
        {"created": created, "ticket": ticket.model_dump()},
        text=f"Ticket {ticket.reference} {'created' if created else 'already existed'}: {ticket.subject}. Assigned to: {', '.join(ticket.assignees) or 'the team queue'}.",
    )


async def send_message(args: dict[str, Any], state: Any) -> Any:
    body = str(args.get("body") or "").strip()
    channel = str(args.get("channel") or "sms")
    if not body:
        return ToolResult.failure("The message body is empty.")
    call = getattr(state, "call", None)
    try:
        message = await state.sdk.send_message(
            channel=channel, body=body, conversation_id=call.conversation_id if call else args.get("conversation_id"),
            to=args.get("to"), subject=args.get("subject"), idempotency_key=args.get("_idempotency_key"),
        )
    except AppSdkError as e:
        if e.status == 422:
            return ToolResult.failure(str(e))
        raise
    return ToolResult.success(message.model_dump(), text=f"{channel.upper()} queued to {message.to}. It is queued, not yet delivered.")


async def remember(args: dict[str, Any], state: Any) -> Any:
    name = str(args.get("name") or "").strip()
    content = str(args.get("content") or "").strip()
    if not name or not content:
        return ToolResult.failure("A memory needs a name and content.")
    await state.sdk.remember(name, content)
    return ToolResult.success({"remembered": name})


BUILTINS: dict[str, Tool] = {
    "read_skill": Tool(
        name="read_skill", handler=read_skill, plumbing=True, timeout_ms=8000,
        description="Read a skill's full instructions by slug. Read the one that matches the caller's need before acting on it.",
        input_schema={"type": "object", "properties": {"slug": {"type": "string"}}, "required": ["slug"]},
    ),
    "search_knowledge": Tool(
        name="search_knowledge", handler=search_knowledge, timeout_ms=8000, description=KNOWLEDGE_DESCRIPTION,
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    ),
    "lookup_contact": Tool(
        name="lookup_contact", handler=lookup_contact, timeout_ms=8000,
        description="Look the caller up by phone or email: who they are, open tickets, recent conversations. Defaults to the number they are calling from.",
        input_schema={"type": "object", "properties": {"phone": {"type": "string"}, "email": {"type": "string"}, "contact_id": {"type": "integer"}}},
    ),
    "recent_calls": Tool(
        name="recent_calls", handler=recent_calls, timeout_ms=8000,
        description="List recent calls with who called, how long, and what happened. `since` is an ISO date-time; omit it for the latest calls.",
        input_schema={"type": "object", "properties": {"since": {"type": "string"}, "contact_id": {"type": "integer"}, "status": {"type": "string"}, "limit": {"type": "integer"}}},
    ),
    "recent_tickets": Tool(
        name="recent_tickets", handler=recent_tickets, timeout_ms=8000,
        description="List recent tickets: reference, status, subject, assignees. Filter by contact_id to see one customer's.",
        input_schema={"type": "object", "properties": {"contact_id": {"type": "integer"}, "limit": {"type": "integer"}}},
    ),
    "register_contact": Tool(
        name="register_contact", handler=register_contact, is_durable_write=True, is_idempotent=True, timeout_ms=10000,
        description="Create a contact record for a caller we do not have yet. Idempotent on phone/email: an existing person is returned, never duplicated.",
        input_schema={"type": "object", "properties": {"name": {"type": "string"}, "phone": {"type": "string"}, "email": {"type": "string"}, "company": {"type": "string"}}, "required": ["name"]},
    ),
    "update_contact": Tool(
        name="update_contact", handler=update_contact, is_durable_write=True, is_idempotent=True, timeout_ms=10000,
        description="Correct the caller's name, email or company on their record.",
        input_schema={"type": "object", "properties": {"contact_id": {"type": "integer"}, "name": {"type": "string"}, "email": {"type": "string"}, "company": {"type": "string"}}},
    ),
    "save_ticket": Tool(
        name="save_ticket", handler=save_ticket, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Raise a ticket for the team: what the caller needs, what was done, what is blocked. This is the only thing that lets the front desk say the team has it.",
        input_schema={"type": "object", "properties": {"subject": {"type": "string"}, "body": {"type": "string"}, "type": {"type": "string"}, "priority": {"type": "string", "enum": ["low", "normal", "high", "urgent"]}}, "required": ["subject", "body"]},
    ),
    "send_message": Tool(
        name="send_message", handler=send_message, is_durable_write=True, is_idempotent=False, timeout_ms=10000,
        description="Queue an SMS or email to the caller. It is queued for delivery, not sent yet: say 'I'm sending you a text', not 'I've texted you'.",
        input_schema={"type": "object", "properties": {"channel": {"type": "string", "enum": ["sms", "email"]}, "body": {"type": "string"}, "to": {"type": "string"}, "subject": {"type": "string"}}, "required": ["channel", "body"]},
    ),
    "remember": Tool(
        name="remember", handler=remember, is_durable_write=True, is_idempotent=True, timeout_ms=8000,
        description="Store a durable fact about how this business works that future calls should know. Not for per-caller details.",
        input_schema={"type": "object", "properties": {"name": {"type": "string"}, "content": {"type": "string"}}, "required": ["name", "content"]},
    ),
}

# Studio's internal action slugs → built-in behaviour.
INTERNAL_SLUGS: dict[str, str] = {
    "create_ticket": "save_ticket",
    "save_ticket": "save_ticket",
    "find_contact": "lookup_contact",
    "lookup_contact": "lookup_contact",
    "register_contact": "register_contact",
    "create_contact": "register_contact",
    "update_contact": "update_contact",
    "send_message": "send_message",
    "send_sms": "send_message",
    "search_knowledge": "search_knowledge",
    "remember": "remember",
    "recent_calls": "recent_calls",
    "list_calls": "recent_calls",
    "recent_tickets": "recent_tickets",
    "list_tickets": "recent_tickets",
}


# ── external actions ─────────────────────────────────────────────────────


def http_handler(spec: ToolSpec):
    """An HTTP action from Studio: method, URL and auth from its config, arguments as the body."""
    config = spec.config or {}

    async def handler(args: dict[str, Any], state: Any) -> Any:
        url = config.get("url")
        if not url:
            return ToolResult.failure("This action has no URL configured.")
        headers = dict(config.get("headers") or {})
        auth_type, auth_value = config.get("auth_type", "none"), config.get("auth_value") or ""
        auth: tuple[str, str] | None = None
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {auth_value}"
        elif auth_type == "basic" and ":" in auth_value:
            user, password = auth_value.split(":", 1)
            auth = (user, password)
        elif auth_type == "header" and ":" in auth_value:
            k, v = auth_value.split(":", 1)
            headers[k.strip()] = v.strip()
        clean = {k: v for k, v in args.items() if not k.startswith("_")}
        async with httpx.AsyncClient(timeout=spec.timeout_ms / 1000, auth=auth) as client:
            if (config.get("method") or "POST").upper() == "GET":
                response = await client.get(url, params=clean, headers=headers)
            else:
                response = await client.post(url, json=clean, headers=headers)
        body: Any
        try:
            body = response.json()
        except ValueError:
            body = response.text[:2000]
        if response.status_code >= 400:
            return ToolResult.failure(f"HTTP {response.status_code}", data={"status": response.status_code, "body": body})
        return ToolResult.success({"status": response.status_code, "body": body})

    return handler


COMPOSIO_BASE = "https://backend.composio.dev/api/v3"


def composio_handler(spec: ToolSpec):
    """A Composio tool, executed against the organization's connected account.

    The app put the toolkit, Composio's tool slug and the connected account id
    on the action's config when it mirrored the tool. The key comes from this
    layer's environment; the app never ships it.
    """
    config = spec.config or {}

    async def handler(args: dict[str, Any], state: Any) -> Any:
        key = os.getenv("COMPOSIO_API_KEY")
        if not key:
            return ToolResult.failure(f"{spec.name} runs through Composio, but COMPOSIO_API_KEY is not set on the agent layer. Nothing was done.")
        tool_slug = config.get("tool_slug") or spec.name.upper()
        account = config.get("connected_account_id")
        if not account:
            return ToolResult.failure(f"{spec.name} has no connected account yet: finish connecting it in Studio. Nothing was done.")
        clean = {k: v for k, v in args.items() if not k.startswith("_")}
        async with httpx.AsyncClient(timeout=spec.timeout_ms / 1000, transport=_composio_transport) as client:
            response = await client.post(f"{COMPOSIO_BASE}/tools/execute/{tool_slug}", headers={"x-api-key": key}, json={"connected_account_id": account, "user_id": config.get("user_id"), "arguments": clean})
        try:
            body = response.json()
        except ValueError:
            body = {"raw": response.text[:1000]}
        if response.status_code >= 400:
            return ToolResult.failure(f"Composio HTTP {response.status_code}: {str(body.get('error') or body.get('message') or body)[:300]}")
        if body.get("successful") is False or body.get("error"):
            return ToolResult.failure(str(body.get("error") or "The tool reported failure.")[:400], data=body.get("data"))
        data = body.get("data", body)
        return ToolResult.success(data)

    return handler


# Tests swap this for a mock transport; production leaves it None.
_composio_transport: Any = None


def unconnected_handler(spec: ToolSpec):
    async def handler(args: dict[str, Any], state: Any) -> Any:
        return ToolResult.failure(f"{spec.name} runs through {spec.kind}, which is not connected in this environment. Nothing was done.")

    return handler


# ── assembly ─────────────────────────────────────────────────────────────


def tools_for_expert(expert: ExpertRecord, context: TenantContext, *, include_builtins: bool = True) -> list[Tool]:
    """Everything one worker expert may call.

    Actions granted in Studio come first under the org's names; built-ins fill
    in what the org did not grant explicitly. A built-in that the org already
    granted under an internal slug is not duplicated.
    """
    tools: list[Tool] = []
    covered: set[str] = set()

    for spec in expert.tools:
        if spec.kind == "internal":
            builtin = BUILTINS.get(INTERNAL_SLUGS.get(spec.name, spec.name))
            if builtin is None:
                logger.warning("actions.unknown_internal slug=%s", spec.name)
                continue
            tool = Tool.from_spec(spec, builtin.handler)
            tool.plumbing = builtin.plumbing
            # The app's flags win, but an internal action is transactional
            # and never partially applies; keep it retryable as the model says.
            tools.append(tool)
            covered.add(builtin.name)
        elif spec.kind == "http":
            tools.append(Tool.from_spec(spec, http_handler(spec)))
        elif spec.kind == "composio":
            tools.append(Tool.from_spec(spec, composio_handler(spec)))
        else:
            tools.append(Tool.from_spec(spec, unconnected_handler(spec)))

    if include_builtins:
        for name, builtin in BUILTINS.items():
            if name not in covered and not any(t.name == name for t in tools):
                tools.append(builtin)
    return tools


def talker_tools() -> list[Tool]:
    """What the talker may do on its own: answer from knowledge. Nothing durable."""
    knowledge = BUILTINS["search_knowledge"]
    return [Tool(name=knowledge.name, description=knowledge.description, handler=knowledge.handler, input_schema=knowledge.input_schema, timeout_ms=knowledge.timeout_ms, audited=False)]
