"""MCP tools load and run; approval-gated actions wait, then run once when approved."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

import veyra_harness.mcp as mcp
from app_sdk.models import ToolSpec
from veyra_harness.actions import tools_for_expert
from veyra_harness.executor import ActionExecutor, ExecutionScope
from veyra_harness.mcp import McpClient, McpError, tool_specs
from veyra_harness.tools import Tool, ToolResult

from .fakes import FakeSdk, call_context

TOOLS = [
    {"name": "get_weather", "description": "Weather for a city.", "inputSchema": {"type": "object", "properties": {"city": {"type": "string"}}}, "annotations": {"readOnlyHint": True}},
    {"name": "create_issue", "description": "Open an issue.", "inputSchema": {"type": "object"}},
]


def rpc_server(*, sse_answers: bool = False, session: str | None = "s-1"):
    """A streamable-HTTP MCP server: answers initialize, tools/list (two pages) and tools/call."""
    seen: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            return httpx.Response(204)
        body = json.loads(request.content)
        seen.append({"body": body, "headers": dict(request.headers)})
        if "id" not in body:
            return httpx.Response(202)
        method = body["method"]
        if method == "initialize":
            result: dict[str, Any] = {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "t", "version": "1"}}
        elif method == "tools/list":
            result = {"tools": TOOLS[:1], "nextCursor": "p2"} if not body["params"].get("cursor") else {"tools": TOOLS[1:]}
        elif method == "tools/call":
            name = body["params"]["name"]
            if name == "explode":
                return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "error": {"code": -32602, "message": "Unknown tool"}})
            failed = name == "create_issue" and not body["params"]["arguments"].get("title")
            result = {"content": [{"type": "text", "text": "title is required" if failed else f"Sunny in {body['params']['arguments'].get('city')}"}], "isError": failed}
        else:
            result = {}
        message = {"jsonrpc": "2.0", "id": body["id"], "result": result}
        headers = {"mcp-session-id": session} if session and method == "initialize" else {}
        if sse_answers:
            return httpx.Response(200, headers={"content-type": "text/event-stream", **headers}, content=f"event: message\ndata: {json.dumps(message)}\n\n".encode())
        return httpx.Response(200, headers=headers, json=message)

    return handler, seen


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch):
    def install(**kw: Any):
        handler, seen = rpc_server(**kw)
        monkeypatch.setattr(mcp, "_transport", httpx.MockTransport(handler))
        return seen

    return install


@pytest.mark.parametrize("sse_answers", [False, True])
async def test_tools_are_listed_across_pages_over_streamable_http(server, sse_answers: bool):
    seen = server(sse_answers=sse_answers)
    tools = await McpClient("https://mcp.example/mcp", headers={"Authorization": "Bearer t"}).list_tools()
    assert [t["name"] for t in tools] == ["get_weather", "create_issue"]
    methods = [s["body"]["method"] for s in seen]
    assert methods == ["initialize", "notifications/initialized", "tools/list", "tools/list"]
    assert seen[0]["headers"]["authorization"] == "Bearer t"
    assert seen[2]["headers"]["mcp-session-id"] == "s-1" and seen[2]["headers"]["mcp-protocol-version"] == "2025-06-18"


def test_tool_specs_carry_the_read_write_hints():
    specs = {s["name"]: s for s in tool_specs(TOOLS)}
    assert specs["get_weather"]["read_only"] is True and specs["get_weather"]["destructive"] is False
    assert specs["create_issue"]["read_only"] is False and specs["create_issue"]["destructive"] is True


def mcp_expert_context():
    ctx = call_context()
    worker = ctx.workers[0].model_copy(update={"tools": [ToolSpec(name="mcp_tools_get_weather", description="Weather.", kind="mcp", is_idempotent=True, config={"url": "https://mcp.example/mcp", "transport": "streamable_http", "tool": "get_weather", "headers": {}})]})
    return ctx, worker


async def test_an_mcp_action_granted_to_an_expert_is_called_on_its_server(server):
    server()
    ctx, worker = mcp_expert_context()
    tool = next(t for t in tools_for_expert(worker, ctx) if t.name == "mcp_tools_get_weather")
    result = await tool.handler({"city": "Lahore", "_idempotency_key": "k"}, None)
    assert result.ok and result.output == "Sunny in Lahore"


async def test_an_mcp_error_result_or_protocol_error_is_a_failure_not_a_success(server):
    server()
    spec = ToolSpec(name="issue", description="d", kind="mcp", config={"url": "https://mcp.example/mcp", "tool": "create_issue"})
    from veyra_harness.actions import mcp_handler

    failed = await mcp_handler(spec)({}, None)
    assert not failed.ok and "title is required" in failed.output
    broken = await mcp_handler(spec.model_copy(update={"config": {"url": "https://mcp.example/mcp", "tool": "explode"}}))({}, None)
    assert not broken.ok and "Unknown tool" in broken.output


async def test_an_unreachable_server_is_an_honest_failure(monkeypatch: pytest.MonkeyPatch):
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    monkeypatch.setattr(mcp, "_transport", httpx.MockTransport(down))
    from veyra_harness.actions import mcp_handler

    result = await mcp_handler(ToolSpec(name="x", description="d", kind="mcp", config={"url": "https://down.example/mcp", "tool": "x"}))({}, None)
    assert not result.ok and "MCP server" in result.output


async def test_the_older_sse_transport_posts_to_the_announced_endpoint_and_reads_answers_off_the_stream(monkeypatch: pytest.MonkeyPatch):
    outbox: asyncio.Queue[str] = asyncio.Queue()
    posted: list[str] = []

    async def stream():
        yield b"event: endpoint\ndata: /messages?session=abc\n\n"
        while True:
            message = await outbox.get()
            if message == "":
                return
            yield f"event: message\ndata: {message}\n\n".encode()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=stream())
        posted.append(str(request.url))
        body = json.loads(request.content)
        if "id" in body:
            result = {"protocolVersion": "2024-11-05"} if body["method"] == "initialize" else {"tools": TOOLS}
            await outbox.put(json.dumps({"jsonrpc": "2.0", "id": body["id"], "result": result}))
        return httpx.Response(202)

    monkeypatch.setattr(mcp, "_transport", httpx.MockTransport(handler))
    tools = await McpClient("https://mcp.example/sse", transport="sse").list_tools()
    await outbox.put("")
    assert [t["name"] for t in tools] == ["get_weather", "create_issue"]
    assert posted and all(p == "https://mcp.example/messages?session=abc" for p in posted)


async def test_an_http_error_from_the_server_raises_mcp_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(mcp, "_transport", httpx.MockTransport(lambda r: httpx.Response(401, text="no token")))
    with pytest.raises(McpError, match="HTTP 401"):
        await McpClient("https://mcp.example/mcp").list_tools()


# ── approvals ────────────────────────────────────────────────────────────


def approval_tool(handler) -> Tool:
    return Tool(name="refund", description="Refund.", handler=handler, kind="http", is_durable_write=True, is_idempotent=False, requires_approval=True, timeout_ms=2000)


async def test_an_approval_gated_action_waits_and_says_so():
    sdk = FakeSdk()
    ran: list[dict[str, Any]] = []

    async def handler(args, state):
        ran.append(args)
        return {"ok": True}

    result = await ActionExecutor(sdk).execute(approval_tool(handler), {"amount": 50}, state=None)
    assert not result.ok and "waiting for approval" in result.output and "Do not say it was done" in result.output
    assert ran == [] and sdk.tool_calls[0]["status"] == "awaiting_approval"
    assert result.data["tool_call_id"] == 1


async def test_a_dry_run_never_puts_an_approval_request_in_front_of_a_person():
    sdk = FakeSdk()

    async def handler(args, state):
        raise AssertionError("must not run")

    result = await ActionExecutor(sdk, scope=ExecutionScope(dry_run=True)).execute(approval_tool(handler), {"amount": 50}, state=None)
    assert result.ok and "Simulated" in result.output and sdk.tool_calls == []


async def test_an_approved_action_runs_once_without_a_new_audit_row():
    sdk = FakeSdk()
    ran: list[dict[str, Any]] = []

    async def handler(args, state):
        ran.append(args)
        return ToolResult.success({"refund": "R-1"}, text="Refunded.")

    result, ms = await ActionExecutor(sdk).run_approved(approval_tool(handler), {"amount": 50}, state=None)
    assert result.ok and result.output == "Refunded." and ran == [{"amount": 50}] and ms >= 0
    assert sdk.tool_calls == []


async def test_an_approved_action_that_hangs_reports_timeout():
    async def handler(args, state):
        await asyncio.sleep(5)

    tool = approval_tool(handler)
    tool.timeout_ms = 50
    result, _ = await ActionExecutor(FakeSdk()).run_approved(tool, {}, state=None)
    assert not result.ok and result.error == "timeout"
