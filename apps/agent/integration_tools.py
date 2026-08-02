"""Load studio-configured integrations (Composio apps, custom HTTP actions, MCP
servers) as LiveKit function tools the agent can call mid-call.

The backend holds the Composio key and does the actual execution; the agent just
fetches tool schemas from /api/integrations/agent-tools and routes calls back to
/api/integrations/execute. MCP servers are attached via LiveKit's native MCP
support when available (guarded — never breaks a call).
"""

from __future__ import annotations

import logging
import os

import httpx
from livekit.agents import RunContext, function_tool

logger = logging.getLogger("voice-agent.integrations")

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")


async def fetch_agent_tools() -> dict:
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(f"{BACKEND_URL}/api/integrations/agent-tools")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.info("no integration tools loaded (%s)", exc)
        return {}


async def _execute(kind: str, ref: str, arguments: dict, name: str = "") -> dict:
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/integrations/execute",
                json={"kind": kind, "ref": ref, "name": name, "arguments": arguments or {}},
            )
            return resp.json()
    except Exception as exc:
        return {"successful": False, "error": str(exc)[:300]}


def _clip(text: str, n: int = 1000) -> str:
    return (text or "")[:n]


def build_integration_tools(data: dict) -> list:
    """function_tools for Composio tools + custom HTTP actions."""
    tools: list = []

    for t in data.get("composio_tools", []):
        slug = t.get("slug")
        if not slug:
            continue
        raw_schema = {
            "type": "function",
            "name": slug,
            "description": _clip(t.get("description", "")),
            "parameters": t.get("parameters") or {"type": "object", "properties": {}},
        }

        def _make(slug=slug):
            async def handler(raw_arguments: dict, context: RunContext):
                res = await _execute("composio", slug, raw_arguments)
                if res.get("successful"):
                    return res.get("data", "Done.")
                return {"error": res.get("error", "tool failed")}
            return handler

        try:
            tools.append(function_tool(_make(), raw_schema=raw_schema))
        except Exception as exc:
            logger.warning("skip composio tool %s: %s", slug, exc)

    for a in data.get("custom_actions", []):
        schema = a.get("schema") or {}
        aid = a.get("id")
        name = schema.get("name")
        if not (aid and name):
            continue
        raw_schema = {
            "type": "function",
            "name": name,
            "description": _clip(schema.get("description", "")),
            "parameters": schema.get("parameters") or {"type": "object", "properties": {}},
        }

        def _make_action(aid=aid):
            async def handler(raw_arguments: dict, context: RunContext):
                return await _execute("action", aid, raw_arguments)
            return handler

        try:
            tools.append(function_tool(_make_action(), raw_schema=raw_schema))
        except Exception as exc:
            logger.warning("skip custom action %s: %s", name, exc)

    if tools:
        logger.info("loaded %d integration tools", len(tools))
    return tools


def build_mcp_servers(data: dict) -> list:
    """LiveKit MCP server objects for attached MCP servers, best-effort."""
    servers = data.get("mcp_servers", [])
    if not servers:
        return []
    try:
        from livekit.agents import mcp
    except Exception:
        logger.info("livekit MCP support unavailable; skipping %d MCP servers", len(servers))
        return []

    out = []
    for m in servers:
        headers = {}
        if m.get("auth_type") == "bearer" and m.get("auth_value"):
            headers["Authorization"] = f"Bearer {m['auth_value']}"
        elif m.get("auth_type") == "header" and ":" in (m.get("auth_value") or ""):
            k, v = m["auth_value"].split(":", 1)
            headers[k.strip()] = v.strip()
        try:
            out.append(mcp.MCPServerHTTP(url=m["url"], headers=headers or None))
        except Exception as exc:
            logger.warning("skip MCP server %s: %s", m.get("name"), exc)
    return out
