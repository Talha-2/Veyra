"""The tools an expert is given, built from the contract.

Three sources, one ``Tool`` type:

1. **Built-ins** every worker has: read a skill, search knowledge, remember
   something, and the front-desk tools in ``desk_tools.py`` (contacts,
   tickets, the conversation, leads). Each is one AppSdk call; the
   non-idempotent writes carry idempotency keys. An owner who switches a
   built-in off in Studio (``disabled_actions``) switches it off here too.
2. **Internal actions** from Studio (``kind: internal``) map by slug onto the
   same handlers, so an org that granted ``create_ticket`` to an expert gets
   the built-in behaviour under the name the org chose.
3. **External actions** (``http``, ``composio``, ``mcp``): each runs here from
   the action's config — HTTP directly, Composio through its API, MCP through
   a short session with the server (``mcp.py``). An unknown kind answers
   honestly that it is not connected rather than pretending.

State is whatever the host passes through (``CallState`` on a call, a text
run's state on the gateway). Handlers read ``state.sdk`` and ``state.call``.
"""

from __future__ import annotations

import dataclasses
import logging
import os
from typing import Any

import httpx

from app_sdk.errors import NotFound
from app_sdk.models import ExpertRecord, TenantContext, ToolSpec

from .desk_tools import DESK_SLUGS, DESK_TOOLS, TICKET_TYPE_ARGUMENTS, acting_for
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


async def remember(args: dict[str, Any], state: Any) -> Any:
    name = str(args.get("name") or "").strip()
    content = str(args.get("content") or "").strip()
    if not name or not content:
        return ToolResult.failure("A memory needs a name and content.")
    if acting_for(state) is not None:
        # Memory is the business's own notes, read on every future call. A
        # customer must not be able to write it ("remember refunds are free").
        return ToolResult.failure("Memory is written by the team in Studio, not from a customer conversation. Use add_note for something about this customer.")
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
    # Contacts, tickets, the conversation and leads: see desk_tools.py.
    **DESK_TOOLS,
    "remember": Tool(
        name="remember", handler=remember, is_durable_write=True, is_idempotent=True, timeout_ms=8000,
        description="Store a durable fact about how this business works that future calls should know. Not for per-caller details. Not available in a customer conversation.",
        input_schema={"type": "object", "properties": {"name": {"type": "string"}, "content": {"type": "string"}}, "required": ["name", "content"]},
    ),
}

# Studio's internal action slugs → built-in behaviour. `send_message` /
# `send_sms` are deliberately absent (see desk_tools.py): an org that has such
# an action is not offered it until SMS and email are actually delivered.
INTERNAL_SLUGS: dict[str, str] = {
    **DESK_SLUGS,
    "search_knowledge": "search_knowledge",
    "remember": "remember",
}


# One client per event loop (per transport), reused across action calls: a
# fresh httpx client builds a TLS context on the call's loop, measured at
# 0.3-1 s on the voice worker, which the caller hears as dead air. Timeouts
# and auth stay per request.
_shared: dict[int, tuple[Any, httpx.AsyncClient]] = {}


def _client(transport: Any = None) -> httpx.AsyncClient:
    import asyncio

    loop = asyncio.get_running_loop()
    held = _shared.get(id(transport))
    if held and held[0] is loop and not held[1].is_closed:
        return held[1]
    client = httpx.AsyncClient(transport=transport)
    _shared[id(transport)] = (loop, client)
    return client


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
        client, timeout = _client(), spec.timeout_ms / 1000
        if (config.get("method") or "POST").upper() == "GET":
            response = await client.get(url, params=clean, headers=headers, auth=auth or httpx.USE_CLIENT_DEFAULT, timeout=timeout)
        else:
            response = await client.post(url, json=clean, headers=headers, auth=auth or httpx.USE_CLIENT_DEFAULT, timeout=timeout)
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
        response = await _client(_composio_transport).post(
            f"{COMPOSIO_BASE}/tools/execute/{tool_slug}",
            headers={"x-api-key": key},
            json={"connected_account_id": account, "user_id": config.get("user_id"), "arguments": clean},
            timeout=spec.timeout_ms / 1000,
        )
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


def mcp_handler(spec: ToolSpec):
    """A tool on an MCP server. The app mirrored it as an action and put the
    server's URL, transport, the tool's own name and the auth headers on its
    config; one short MCP session per call (see ``mcp.py``)."""
    from .mcp import McpClient, McpError, result_text

    config = spec.config or {}

    async def handler(args: dict[str, Any], state: Any) -> Any:
        url = config.get("url")
        if not url:
            return ToolResult.failure(f"{spec.name} has no MCP server URL. Test the server again in Studio → Integrations. Nothing was done.")
        clean = {k: v for k, v in args.items() if not k.startswith("_")}
        client = McpClient(url, transport=config.get("transport") or "streamable_http", headers=config.get("headers") or {}, timeout=max(1.0, spec.timeout_ms / 1000))
        try:
            result = await client.call_tool(config.get("tool") or spec.name, clean)
        except (McpError, httpx.HTTPError) as e:
            return ToolResult.failure(f"MCP server: {e}"[:400])
        text = result_text(result)
        if result.get("isError"):
            return ToolResult.failure(text[:400], data=result.get("structuredContent"))
        return ToolResult.success(result.get("structuredContent") if result.get("structuredContent") is not None else {"text": text}, text=text)

    return handler


def unconnected_handler(spec: ToolSpec):
    async def handler(args: dict[str, Any], state: Any) -> Any:
        return ToolResult.failure(f"{spec.name} runs through {spec.kind}, which is not connected in this environment. Nothing was done.")

    return handler


# ── assembly ─────────────────────────────────────────────────────────────


def tools_for_expert(expert: ExpertRecord, context: TenantContext, *, include_builtins: bool = True) -> list[Tool]:
    """Everything one worker expert may call.

    Actions granted in Studio come first under the org's names; built-ins fill
    in what the org did not grant explicitly. A built-in that the org already
    granted under an internal slug is not duplicated, and one the owner
    switched off in Studio (``context.disabled_actions``) is not offered.

    An internal action keeps the org's name and description (the owner's
    words) but always takes the built-in's input schema: the handler defines
    what it understands. Ticket-type arguments list the business's types.
    """
    tools: list[Tool] = []
    covered: set[str] = set()
    disabled = {INTERNAL_SLUGS.get(slug, slug) for slug in (getattr(context, "disabled_actions", None) or [])}

    for spec in expert.tools:
        if spec.kind == "internal":
            builtin = BUILTINS.get(INTERNAL_SLUGS.get(spec.name, spec.name))
            if builtin is None:
                logger.warning("actions.unknown_internal slug=%s", spec.name)
                continue
            tool = Tool.from_spec(spec, builtin.handler)
            tool.plumbing = builtin.plumbing
            tool.description = spec.description or builtin.description
            tool.input_schema = _schema_for(builtin, context)
            # The app's flags win, but an internal action is transactional
            # and never partially applies; keep it retryable as the model says.
            tools.append(tool)
            covered.add(builtin.name)
        elif spec.kind == "http":
            tools.append(Tool.from_spec(spec, http_handler(spec)))
        elif spec.kind == "composio":
            tools.append(Tool.from_spec(spec, composio_handler(spec)))
        elif spec.kind == "mcp":
            tools.append(Tool.from_spec(spec, mcp_handler(spec)))
        else:
            tools.append(Tool.from_spec(spec, unconnected_handler(spec)))

    if include_builtins:
        for name, builtin in BUILTINS.items():
            if name not in covered and name not in disabled and not any(t.name == name for t in tools):
                schema = _schema_for(builtin, context)
                tools.append(builtin if schema is builtin.input_schema else dataclasses.replace(builtin, input_schema=schema))
    return tools


def _schema_for(builtin: Tool, context: TenantContext) -> dict[str, Any]:
    """The built-in's schema, with its ticket-type argument limited to the business's types."""
    argument = TICKET_TYPE_ARGUMENTS.get(builtin.name)
    names = [t.name for t in getattr(context, "ticket_types", None) or []]
    if not argument or not names:
        return builtin.input_schema
    properties = dict(builtin.input_schema.get("properties") or {})
    properties[argument] = {"type": "string", "enum": names, "description": "One of the business's ticket types."}
    return {**builtin.input_schema, "properties": properties}


def talker_tools() -> list[Tool]:
    """What the talker may do on its own: answer from knowledge. Nothing durable."""
    knowledge = BUILTINS["search_knowledge"]
    return [Tool(name=knowledge.name, description=knowledge.description, handler=knowledge.handler, input_schema=knowledge.input_schema, timeout_ms=knowledge.timeout_ms, audited=False)]
