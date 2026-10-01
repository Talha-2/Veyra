"""A small MCP client: list a server's tools, call one.

Two transports, the two Studio offers when an MCP server is added:

- **Streamable HTTP** (``streamable_http``): every JSON-RPC message is a POST
  to the server URL. The answer is JSON, or a short server-sent-event stream
  carrying it. The server may hand out a session id on ``initialize``; it is
  sent back on every later request.
- **HTTP + SSE** (``sse``, the older transport): a GET opens an event stream
  whose first ``endpoint`` event says where to POST; answers arrive on the
  stream.

Each operation is one short session: ``initialize``, the
``notifications/initialized`` notice, then the request. A tool call is
therefore three round trips; MCP tools are external actions with a 30 s
budget, and a session that outlives the call is a session to leak.

Written against JSON-RPC directly rather than the ``mcp`` SDK: the gateway
image installs only what it needs, and this is the whole of what Veyra uses.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urljoin

import httpx

logger = logging.getLogger("veyra.harness.mcp")

PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "veyra-agent", "version": "1.0"}

# Tests swap in a mock transport; production leaves it None.
_transport: Any = None


class McpError(Exception):
    pass


async def _sse(response: httpx.Response) -> AsyncIterator[tuple[str, str]]:
    """Server-sent events off a streamed response: (event, data)."""
    event, data = "message", []
    async for line in response.aiter_lines():
        if line == "":
            if data:
                yield event, "\n".join(data)
            event, data = "message", []
            continue
        if line.startswith(":"):
            continue
        field, _, value = line.partition(":")
        value = value[1:] if value.startswith(" ") else value
        if field == "event":
            event = value
        elif field == "data":
            data.append(value)
    if data:
        yield event, "\n".join(data)


def _answer(message: Any, request_id: int) -> dict[str, Any] | None:
    """The result for ``request_id`` in a JSON-RPC message or batch, raising on an error answer."""
    for item in message if isinstance(message, list) else [message]:
        if not isinstance(item, dict) or item.get("id") != request_id:
            continue
        if "error" in item:
            err = item["error"] or {}
            raise McpError(f"MCP error {err.get('code', '?')}: {err.get('message', 'unknown')}")
        return item.get("result") or {}
    return None


class McpClient:
    def __init__(self, url: str, *, transport: str = "streamable_http", headers: dict[str, str] | None = None, timeout: float = 30.0):
        self.url = url
        self.transport = transport or "streamable_http"
        self.headers = {k: v for k, v in (headers or {}).items() if k and v is not None}
        self.timeout = timeout

    async def list_tools(self) -> list[dict[str, Any]]:
        """Every tool the server offers, following pagination: name, description, inputSchema, annotations."""
        tools: list[dict[str, Any]] = []
        async with self._session() as request:
            cursor: str | None = None
            for _ in range(20):
                result = await request("tools/list", {"cursor": cursor} if cursor else {})
                tools += [t for t in result.get("tools") or [] if isinstance(t, dict) and t.get("name")]
                cursor = result.get("nextCursor")
                if not cursor:
                    break
        return tools

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        async with self._session() as request:
            return await request("tools/call", {"name": name, "arguments": arguments})

    # ── sessions ─────────────────────────────────────────────────────────

    @asynccontextmanager
    async def _session(self):
        async with httpx.AsyncClient(timeout=self.timeout, transport=_transport, follow_redirects=True) as client:
            if self.transport == "sse":
                async with self._sse_session(client) as request:
                    yield request
            else:
                async with self._http_session(client) as request:
                    yield request

    @asynccontextmanager
    async def _http_session(self, client: httpx.AsyncClient):
        state: dict[str, Any] = {"id": 0, "session": None, "protocol": None}

        async def send(method: str, params: dict[str, Any], *, notify: bool = False) -> dict[str, Any] | None:
            body: dict[str, Any] = {"jsonrpc": "2.0", "method": method, "params": params}
            if not notify:
                state["id"] += 1
                body["id"] = state["id"]
            headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json", **self.headers}
            if state["session"]:
                headers["Mcp-Session-Id"] = state["session"]
            if state["protocol"]:
                headers["MCP-Protocol-Version"] = state["protocol"]
            async with client.stream("POST", self.url, json=body, headers=headers) as response:
                if response.status_code >= 400:
                    text = (await response.aread()).decode(errors="replace")[:300]
                    raise McpError(f"HTTP {response.status_code} from the MCP server: {text}".strip())
                if response.headers.get("mcp-session-id"):
                    state["session"] = response.headers["mcp-session-id"]
                if notify:
                    await response.aread()
                    return None
                if "text/event-stream" in response.headers.get("content-type", ""):
                    async for _, data in _sse(response):
                        try:
                            found = _answer(json.loads(data), body["id"])
                        except ValueError:
                            continue
                        if found is not None:
                            return found
                    raise McpError(f"The MCP server's stream ended without answering {method}.")
                raw = await response.aread()
                try:
                    found = _answer(json.loads(raw), body["id"])
                except ValueError as e:
                    raise McpError(f"The MCP server did not answer {method} with JSON.") from e
                if found is None:
                    raise McpError(f"The MCP server did not answer {method}.")
                return found

        init = await send("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": CLIENT_INFO})
        state["protocol"] = (init or {}).get("protocolVersion") or PROTOCOL_VERSION
        await send("notifications/initialized", {}, notify=True)

        async def request(method: str, params: dict[str, Any]) -> dict[str, Any]:
            return await send(method, params) or {}

        try:
            yield request
        finally:
            if state["session"]:
                try:
                    await client.delete(self.url, headers={"Mcp-Session-Id": state["session"], **self.headers})
                except httpx.HTTPError:
                    pass

    @asynccontextmanager
    async def _sse_session(self, client: httpx.AsyncClient):
        headers = {"Accept": "text/event-stream", **self.headers}
        async with client.stream("GET", self.url, headers=headers) as stream:
            if stream.status_code >= 400:
                raise McpError(f"HTTP {stream.status_code} opening the MCP server's event stream.")
            events = _sse(stream)
            endpoint: str | None = None
            async for event, data in events:
                if event == "endpoint":
                    endpoint = urljoin(self.url, data.strip())
                    break
            if not endpoint:
                raise McpError("The MCP server's event stream did not say where to send requests.")
            counter = {"id": 0}

            async def post(body: dict[str, Any]) -> None:
                response = await client.post(endpoint, json=body, headers={"Content-Type": "application/json", **self.headers})
                if response.status_code >= 400:
                    raise McpError(f"HTTP {response.status_code} from the MCP server: {response.text[:300]}")

            async def send(method: str, params: dict[str, Any]) -> dict[str, Any]:
                counter["id"] += 1
                request_id = counter["id"]
                await post({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
                async for _, data in events:
                    try:
                        found = _answer(json.loads(data), request_id)
                    except ValueError:
                        continue
                    if found is not None:
                        return found
                raise McpError(f"The MCP server's stream ended without answering {method}.")

            await send("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": CLIENT_INFO})
            await post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
            yield send


def result_text(result: dict[str, Any]) -> str:
    """A tools/call result as the text the model reads: the text blocks, else the structured content."""
    parts: list[str] = []
    for block in result.get("content") or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and block.get("text"):
            parts.append(str(block["text"]))
        elif block.get("type") == "resource" and isinstance(block.get("resource"), dict) and block["resource"].get("text"):
            parts.append(str(block["resource"]["text"]))
        elif block.get("type") in ("image", "audio"):
            parts.append(f"[{block['type']} content omitted]")
    if not parts and result.get("structuredContent") is not None:
        parts.append(json.dumps(result["structuredContent"], ensure_ascii=False, default=str))
    return "\n".join(parts)[:8000] or "(The tool returned nothing.)"


def tool_specs(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A server's tools in the shape the app mirrors as actions: name, description, schema, and the read/write hints."""
    out = []
    for t in tools:
        hints = t.get("annotations") or {}
        out.append({
            "name": t["name"],
            "title": t.get("title") or hints.get("title"),
            "description": (t.get("description") or "").strip(),
            "input_schema": t.get("inputSchema") or {"type": "object", "properties": {}},
            "read_only": bool(hints.get("readOnlyHint", False)),
            "idempotent": bool(hints.get("idempotentHint", False)),
            "destructive": bool(hints.get("destructiveHint", not hints.get("readOnlyHint", False))),
        })
    return out
