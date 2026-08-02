"""Minimal MCP client for the studio's 'Configure MCP → Test connection & fetch
tools' flow and for agent-side tool execution fallback.

Uses the official `mcp` SDK (streamable_http + sse). Guarded imports so the
server still boots if the package is missing.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("voice-agent.mcp")


def _auth_headers(auth_type: str, auth_value: str) -> dict:
    if auth_type == "bearer" and auth_value:
        return {"Authorization": f"Bearer {auth_value}"}
    if auth_type == "header" and auth_value and ":" in auth_value:
        k, v = auth_value.split(":", 1)
        return {k.strip(): v.strip()}
    return {}


async def _session(url: str, transport: str, headers: dict):
    """Yield an initialized ClientSession for the given transport."""
    from mcp import ClientSession

    if transport == "sse":
        from mcp.client.sse import sse_client

        return sse_client(url, headers=headers), ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    return streamablehttp_client(url, headers=headers), ClientSession


async def list_tools(url: str, transport: str, auth_type: str, auth_value: str) -> dict:
    """Return {ok, tools|error}. tools = [{name, description}]."""
    headers = _auth_headers(auth_type, auth_value)
    try:
        from mcp import ClientSession

        if transport == "sse":
            from mcp.client.sse import sse_client

            ctx = sse_client(url, headers=headers)
        else:
            from mcp.client.streamable_http import streamablehttp_client

            ctx = streamablehttp_client(url, headers=headers)

        async with ctx as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                tools = [{"name": t.name, "description": (t.description or "")[:200]} for t in result.tools]
                return {"ok": True, "tools": tools}
    except ImportError:
        return {"ok": False, "error": "MCP client library not installed on the server."}
    except Exception as exc:
        logger.warning("MCP list_tools failed for %s: %s", url, exc)
        return {"ok": False, "error": str(exc)[:300]}


async def call_tool(url: str, transport: str, auth_type: str, auth_value: str, name: str, arguments: dict) -> dict:
    headers = _auth_headers(auth_type, auth_value)
    try:
        from mcp import ClientSession

        if transport == "sse":
            from mcp.client.sse import sse_client

            ctx = sse_client(url, headers=headers)
        else:
            from mcp.client.streamable_http import streamablehttp_client

            ctx = streamablehttp_client(url, headers=headers)

        async with ctx as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                await session.initialize()
                res = await session.call_tool(name, arguments or {})
                parts = []
                for c in res.content or []:
                    parts.append(getattr(c, "text", None) or str(c))
                return {"ok": not res.isError, "result": "\n".join(parts)[:4000]}
    except Exception as exc:
        logger.warning("MCP call_tool failed: %s", exc)
        return {"ok": False, "error": str(exc)[:300]}
