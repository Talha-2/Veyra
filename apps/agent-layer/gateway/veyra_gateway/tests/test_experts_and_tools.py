"""The gateway's new seams: a multi-expert chat routes, MCP tools are listed, approved actions run."""

from __future__ import annotations

import json

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

import veyra_harness.mcp as mcp
from veyra_gateway.app import create_app
from veyra_gateway.runner import TextRunner
from veyra_harness.tests.fakes import CALL_CONTEXT, ScriptedModel, call, say
from veyra_harness.tests.test_mcp_and_approvals import rpc_server

from .test_gateway import SECRET, GatewayFakeSdk

BILLING = {"slug": "billing", "name": "Billing", "description": "Invoices and refunds.", "runtime": "worker", "system_prompt": "You handle money.", "reasoning_effort": "medium"}


def app_with(sdk: GatewayFakeSdk, model: ScriptedModel, monkeypatch: pytest.MonkeyPatch, built: list | None = None):
    monkeypatch.setenv("AGENT_SHARED_SECRET", SECRET)

    def factory(effort, ref=None):
        if built is not None:
            built.append((effort, ref))
        return model

    return create_app(sdk=sdk, runner=TextRunner(sdk, model_factory=factory), claim_interval=0)


def client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"})


async def test_a_chat_with_two_workers_routes_to_the_right_one_and_says_which(monkeypatch: pytest.MonkeyPatch):
    sdk = GatewayFakeSdk()
    model = ScriptedModel(call(("switch_expert", {"expert": "billing"})), say("I've noted the refund request."))
    built: list = []
    app = app_with(sdk, model, monkeypatch, built)
    context = {k: v for k, v in CALL_CONTEXT.items() if k not in ("call", "line")}
    context["experts"] = [*CALL_CONTEXT["experts"], BILLING]

    async with app.router.lifespan_context(app):
        async with client(app) as c:
            response = await c.post("/v1/chat/stream", json={"organization_id": 7, "conversation_id": 3, "message": "Refund me", "context": context})
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
    switch = [e for e in events if e["type"] == "tool" and e["name"] == "switch_expert"]
    assert switch[-1]["status"] == "done" and switch[-1]["label"] == "Handed to Billing" and switch[-1]["expert"] == "billing"
    assert events[-1]["type"] == "done" and events[-1]["expert"] == "billing"
    assert ("medium", None) in built, "the chat worker gets each expert's reasoning effort"


async def test_mcp_tools_are_listed_for_studio(monkeypatch: pytest.MonkeyPatch):
    handler, _ = rpc_server()
    monkeypatch.setattr(mcp, "_transport", httpx.MockTransport(handler))
    app = app_with(GatewayFakeSdk(), ScriptedModel(), monkeypatch)
    async with app.router.lifespan_context(app):
        async with client(app) as c:
            response = await c.post("/v1/mcp/tools", json={"url": "https://mcp.example/mcp", "transport": "streamable_http", "headers": {"Authorization": "Bearer x"}})
    assert response.status_code == 200
    tools = response.json()["tools"]
    assert [t["name"] for t in tools] == ["get_weather", "create_issue"] and tools[0]["read_only"] is True


async def test_an_unreachable_mcp_server_is_a_502_with_the_reason(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(mcp, "_transport", httpx.MockTransport(lambda r: httpx.Response(403, text="forbidden")))
    app = app_with(GatewayFakeSdk(), ScriptedModel(), monkeypatch)
    async with app.router.lifespan_context(app):
        async with client(app) as c:
            response = await c.post("/v1/mcp/tools", json={"url": "https://mcp.example/mcp"})
    assert response.status_code == 502 and "HTTP 403" in response.json()["detail"]


async def test_an_approved_action_runs_once_and_reports_the_result(monkeypatch: pytest.MonkeyPatch):
    sdk = GatewayFakeSdk()
    app = app_with(sdk, ScriptedModel(), monkeypatch)
    spec = {"id": 3, "name": "create_ticket", "description": "Raise a ticket.", "kind": "internal", "is_durable_write": True, "requires_approval": True}
    async with app.router.lifespan_context(app):
        async with client(app) as c:
            response = await c.post("/v1/tools/execute", json={"organization_id": 7, "tool_call_id": 12, "tool": spec, "arguments": {"subject": "Refund INV-7", "body": "Approved by the owner.", "conversation_id": 9}})
    body = response.json()
    assert response.status_code == 200 and body["ok"] is True and body["status"] == "succeeded"
    assert "Ticket #1 created" in body["output"]
    assert len(sdk.created_tickets) == 1 and sdk.created_tickets[0]["conversation_id"] == 9
    assert sdk.tool_calls == [], "the app's approval row is the record; no second row"


async def test_an_unknown_internal_action_is_refused_honestly(monkeypatch: pytest.MonkeyPatch):
    app = app_with(GatewayFakeSdk(), ScriptedModel(), monkeypatch)
    async with app.router.lifespan_context(app):
        async with client(app) as c:
            response = await c.post("/v1/tools/execute", json={"organization_id": 7, "tool": {"name": "teleport", "description": "x", "kind": "internal"}, "arguments": {}})
    assert response.json()["ok"] is False and "not an action" in response.json()["error"]
