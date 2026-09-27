"""AppSdk against a fake app layer.

The fake answers with the shapes the PHP side actually returns (kept in step
by tests/Feature/AgentApiTest.php on that side). What is tested here is the
SDK's own promises: the auth header, tenant binding, the idempotency
contract, error mapping, and that a bad tenant fails loud.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app_sdk import AppSdk, AppSdkError, Conflict, NotFound, Unauthenticated, Unavailable

SECRET = "test-secret"

CALL_CONTEXT: dict[str, Any] = {
    "contract": "v1",
    "organization": {"id": 7, "slug": "northwind", "name": "Northwind", "timezone": "America/Chicago"},
    "business": {"name": "Northwind Services"},
    "agent": {
        "display_name": "Nora", "greeting": "Northwind, this is Nora.", "primary_language": "en",
        "languages": [{"code": "en", "label": "English"}, {"code": "ur", "label": "Urdu", "rtl": True, "stt_multi": False, "tts_low_latency": False}],
        "voice": {"provider": "elevenlabs", "id": "v1", "model": "flash"},
    },
    "experts": [
        {"slug": "front", "name": "Front desk", "description": "Talks.", "runtime": "talker", "system_prompt": "You talk."},
        {
            "slug": "scheduling", "name": "Scheduling", "description": "Books.", "runtime": "worker", "system_prompt": "You book.",
            "skills": [{"slug": "reschedule", "name": "Reschedule", "description": "Move it.", "path": "/skills/org/reschedule/SKILL.md", "version": 3}],
            "tools": [
                {"name": "book_appointment", "description": "Book.", "kind": "composio", "is_idempotent": False, "is_durable_write": True, "timeout_ms": 15000},
                {"name": "find_contact", "description": "Find.", "kind": "internal", "is_idempotent": True},
            ],
        },
    ],
    "skills": [], "ticket_types": [{"id": 1, "name": "Billing"}], "memory": [],
    "call": {"id": 42, "conversation_id": 9, "direction": "inbound", "from": "+17735550111", "to": "+13125550142", "language": "ur", "capabilities": {"code": "ur", "stt_multi": False}},
    "line": {"id": 1, "e164": "+13125550142", "language": "ur"},
    "caller": {"identifier": {"id": 3, "type": "phone", "value": "+17735550111"}, "contact": None},
}


class FakeApp:
    """Records every request and answers from a routing table."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.tool_calls: dict[str, dict[str, Any]] = {}
        self.delegations: set[tuple[str, int]] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("Authorization") != f"Bearer {SECRET}":
            return httpx.Response(401, json={"error": "unauthenticated", "message": "Bearer token does not match AGENT_SHARED_SECRET."})

        path, method = request.url.path, request.method
        body = json.loads(request.content) if request.content else {}

        if path == "/api/agent/v1/health":
            return httpx.Response(200, json={"ok": True, "contract": "v1"})
        if path == "/api/agent/v1/calls/inbound":
            if body["to"] == "+19990000000":
                return httpx.Response(404, json={"error": "unknown_number", "message": "No organization owns +19990000000."})
            return httpx.Response(201, json=CALL_CONTEXT)
        if path == "/api/agent/v1/organizations/7/skills/reschedule":
            return httpx.Response(200, json={"slug": "reschedule", "name": "Reschedule", "description": "Move it.", "version": 3, "markdown": "---\nname: Reschedule\n---\n\nAsk for the reference."})
        if path == "/api/agent/v1/organizations/7/skills/missing":
            return httpx.Response(404, json={"message": "No query results."})
        if path == "/api/agent/v1/organizations/7/knowledge/search":
            return httpx.Response(200, json={"query": request.url.params["q"], "results": [{"document_id": 1, "document": "Area", "position": 1, "score": 1, "excerpt": "Evanston is inside.", "content": "Evanston is inside the area."}]})
        if path == "/api/agent/v1/organizations/7/tool-calls" and method == "POST":
            key = body.get("idempotency_key")
            if key and key in self.tool_calls:
                return httpx.Response(200, json={"duplicate": True, "tool_call": self.tool_calls[key]})
            record = {"id": len(self.tool_calls) + 1, "action_slug": body["action_slug"], "kind": body.get("kind", "composio"), "status": "running", "idempotency_key": key}
            if key:
                self.tool_calls[key] = record
            return httpx.Response(201, json={"duplicate": False, "tool_call": record})
        if path.startswith("/api/agent/v1/organizations/7/tool-calls/") and method == "PATCH":
            for record in self.tool_calls.values():
                record.update(status=body["status"], error=body.get("error"), needs_reconciliation=body["status"] == "timeout")
                return httpx.Response(200, json={"tool_call": record})
        if path == "/api/agent/v1/organizations/7/calls/42/delegations" and method == "POST":
            key = ("42", body["sequence"])
            if key in self.delegations:
                return httpx.Response(409, json={"error": "duplicate_sequence", "message": "Delegation 1 already exists on this call."})
            self.delegations.add(key)
            return httpx.Response(201, json={"id": 5, "sequence": body["sequence"], "status": "running"})
        if path == "/api/agent/v1/organizations/7/calls/42/delegations/5" and method == "PATCH":
            return httpx.Response(200, json={"id": 5, "status": body["status"], "failed": not body.get("reply"), "completed_durable_write": False})
        if path == "/api/agent/v1/organizations/7/tickets" and method == "POST":
            return httpx.Response(201, json={"created": True, "ticket": {"id": 1, "number": 12, "reference": "#12", "subject": body["subject"], "status": "open", "assignees": ["Ada"]}})
        if path == "/api/agent/v1/organizations/7/tickets" and method == "GET":
            return httpx.Response(422, json={"message": "The limit field must be between 1 and 20.", "errors": {"limit": ["The limit field must be between 1 and 20."]}})
        if path == "/api/agent/v1/organizations/7/context":
            return httpx.Response(500, text="<html>boom</html>")
        if path == "/api/agent/v1/organizations/7/automations/claim":
            return httpx.Response(200, json={"runs": [{"id": 3, "trigger": "schedule", "input": "Summarise.", "automation": {"id": 1, "name": "Digest", "goal": "Summarise.", "tools": [{"name": "find_contact", "description": "Find.", "kind": "internal", "is_idempotent": True}]}}]})
        if path == "/api/agent/v1/automations/claim":
            return httpx.Response(200, json={"runs": [{"id": 9, "trigger": "manual", "organization_id": 12, "automation": {"id": 4, "name": "Text back", "goal": "Text."}}]})
        if path == "/api/agent/v1/organizations/7/automations/runs/5/claim":
            return httpx.Response(200, json={"run": {"id": 5, "trigger": "manual", "automation": {"id": 4, "name": "Text back", "goal": "Text."}}})
        if path == "/api/agent/v1/organizations/7/automations/runs/6/claim":
            return httpx.Response(404, json={"error": "not_queued", "message": "This run is not queued."})
        return httpx.Response(404, json={"message": f"no route for {method} {path}"})


@pytest.fixture
def app() -> FakeApp:
    return FakeApp()


@pytest.fixture
def sdk(app: FakeApp) -> AppSdk:
    return AppSdk("http://app.test", SECRET, transport=httpx.MockTransport(app.handler))


async def test_every_request_carries_the_secret_and_the_contract_prefix(sdk: AppSdk, app: FakeApp):
    status = await sdk.health()
    assert status.ok and status.contract == "v1"
    request = app.requests[-1]
    assert request.headers["Authorization"] == f"Bearer {SECRET}"
    assert request.url.path == "/api/agent/v1/health"


async def test_a_wrong_secret_surfaces_the_servers_explanation(app: FakeApp):
    sdk = AppSdk("http://app.test", "nope", transport=httpx.MockTransport(app.handler))
    with pytest.raises(Unauthenticated, match="does not match AGENT_SHARED_SECRET"):
        await sdk.health()


def test_missing_configuration_fails_at_construction(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("APP_LAYER_URL", raising=False)
    monkeypatch.delenv("AGENT_SHARED_SECRET", raising=False)
    with pytest.raises(AppSdkError, match="APP_LAYER_URL"):
        AppSdk()
    with pytest.raises(AppSdkError, match="AGENT_SHARED_SECRET"):
        AppSdk("http://app.test")


async def test_an_inbound_call_returns_a_typed_context_and_names_the_tenant(sdk: AppSdk):
    ctx = await sdk.inbound_call(to="+13125550142", from_="+17735550111", provider="twilio", provider_sid="CA1")

    assert ctx.organization.id == 7
    assert ctx.call.id == 42 and ctx.call.from_ == "+17735550111"
    assert ctx.call.language == "ur" and ctx.call.capabilities.stt_multi is False
    assert ctx.talker.slug == "front"
    assert [w.slug for w in ctx.workers] == ["scheduling"]
    assert ctx.caller.known is False
    book = ctx.workers[0].tool("book_appointment")
    assert book.is_durable_write and not book.is_idempotent and book.external
    assert book.can_retry_after("failed") and not book.can_retry_after("timeout")
    assert ctx.agent.language_codes() == ["en", "ur"]


async def test_an_unknown_number_is_not_found(sdk: AppSdk):
    with pytest.raises(NotFound, match="No organization owns"):
        await sdk.inbound_call(to="+19990000000", from_="+1", provider="twilio", provider_sid="CA0")


async def test_a_truncated_context_fails_loud_instead_of_hydrating(app: FakeApp):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"contract": "v1", "organization": {"id": 7, "slug": "x", "name": "x"}, "call": {"id": 1}})

    sdk = AppSdk("http://app.test", SECRET, transport=httpx.MockTransport(handler))
    with pytest.raises(AppSdkError, match="not a v1 CallContext"):
        await sdk.inbound_call(to="+1", from_="+2", provider="twilio", provider_sid="CA1")


async def test_phps_empty_array_is_accepted_where_an_object_is_typed():
    """Caught by the first live probe: ``"advanced": []`` refused the whole call."""
    payload = {**CALL_CONTEXT, "agent": {**CALL_CONTEXT["agent"], "advanced": []}}
    payload["experts"] = [{**CALL_CONTEXT["experts"][1], "tools": [{"name": "t", "description": "d", "input_schema": [], "config": []}]}]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json=payload)

    sdk = AppSdk("http://app.test", SECRET, transport=httpx.MockTransport(handler))
    ctx = await sdk.inbound_call(to="+1", from_="+2", provider="twilio", provider_sid="CA1")
    assert ctx.agent.advanced == {}
    assert ctx.experts[0].tools[0].input_schema == {} and ctx.experts[0].tools[0].config == {}


async def test_a_different_contract_version_is_refused(app: FakeApp):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={**CALL_CONTEXT, "contract": "v2"})

    sdk = AppSdk("http://app.test", SECRET, transport=httpx.MockTransport(handler))
    with pytest.raises(AppSdkError, match="not v1"):
        await sdk.inbound_call(to="+1", from_="+2", provider="twilio", provider_sid="CA1")


async def test_organization_scoped_routes_need_a_bound_client(sdk: AppSdk):
    with pytest.raises(AppSdkError, match="for_organization"):
        await sdk.skill("reschedule")

    bound = sdk.for_organization(7)
    doc = await bound.skill("reschedule")
    assert doc.markdown.startswith("---\nname: Reschedule")
    assert sdk.organization_id is None, "binding returns a copy; the original stays unbound"


async def test_skill_bodies_are_cached_on_version(sdk: AppSdk, app: FakeApp):
    bound = sdk.for_organization(7)
    await bound.skill("reschedule", version=3)
    await bound.skill("reschedule", version=3)
    assert sum(r.url.path.endswith("/skills/reschedule") for r in app.requests) == 1

    await bound.skill("reschedule", version=4)  # edited in Studio mid-call
    assert sum(r.url.path.endswith("/skills/reschedule") for r in app.requests) == 2

    with pytest.raises(NotFound):
        await bound.skill("missing")


async def test_a_retried_non_idempotent_tool_call_comes_back_as_a_duplicate(sdk: AppSdk):
    bound = sdk.for_organization(7)
    first = await bound.start_tool_call(action_slug="book_appointment", arguments={"at": "9"}, idempotency_key="k1", kind="composio")
    assert first.duplicate is False and first.tool_call.status == "running"

    timed_out = await bound.finish_tool_call(first.tool_call.id, status="timeout", error="15000ms")
    assert timed_out.needs_reconciliation is True

    again = await bound.start_tool_call(action_slug="book_appointment", idempotency_key="k1")
    assert again.duplicate is True
    assert again.tool_call.id == first.tool_call.id
    assert again.tool_call.status == "timeout"


async def test_a_duplicate_delegation_sequence_is_a_conflict_the_talker_must_not_retry(sdk: AppSdk):
    bound = sdk.for_organization(7)
    opened = await bound.start_delegation(42, sequence=1, transcript_delta="AI: Hi\nHuman: Move it")
    assert opened.id == 5

    with pytest.raises(Conflict, match="already exists"):
        await bound.start_delegation(42, sequence=1, transcript_delta="again")

    outcome = await bound.finish_delegation(42, 5, status="completed", reply="")
    assert outcome.failed is True and outcome.completed_durable_write is False


async def test_writes_drop_none_so_the_app_sees_absent_not_null(sdk: AppSdk, app: FakeApp):
    bound = sdk.for_organization(7)
    ticket, created = await bound.create_ticket(subject="Refund", body="x", call_id=42, idempotency_key="t1")
    assert created and ticket.reference == "#12" and ticket.assignees == ["Ada"]

    sent = json.loads(app.requests[-1].content)
    assert "type" not in sent and "priority" not in sent and sent["idempotency_key"] == "t1"


async def test_validation_errors_carry_the_field_messages(sdk: AppSdk):
    bound = sdk.for_organization(7)
    with pytest.raises(AppSdkError, match=r"limit: The limit field") as info:
        await bound.tickets(limit=99)
    assert info.value.status == 422


async def test_a_5xx_is_unavailable_and_reads_retry_once(sdk: AppSdk, app: FakeApp):
    bound = sdk.for_organization(7)
    with pytest.raises(Unavailable):
        await bound.context()
    assert sum(r.url.path.endswith("/context") for r in app.requests) == 2, "one retry, no more"


async def test_a_transport_failure_on_a_write_is_reported_not_retried():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("refused")

    sdk = AppSdk("http://app.test", SECRET, transport=httpx.MockTransport(handler)).for_organization(7)
    with pytest.raises(Unavailable, match="unreachable"):
        await sdk.remember("rule", "No Fridays.")
    assert calls == 1


async def test_claimed_automations_carry_their_tools(sdk: AppSdk):
    jobs = await sdk.for_organization(7).claim_automations(limit=2)
    assert len(jobs) == 1
    assert jobs[0].automation.name == "Digest"
    assert jobs[0].automation.tools[0].is_idempotent is True


async def test_the_unscoped_claim_names_each_runs_tenant_and_needs_no_binding(sdk: AppSdk):
    jobs = await sdk.claim_all_automations(limit=5)
    assert jobs[0].organization_id == 12 and jobs[0].automation.name == "Text back"


async def test_claiming_one_run_returns_none_when_it_is_no_longer_queued(sdk: AppSdk):
    bound = sdk.for_organization(7)
    assert (await bound.automation_run(5)).id == 5
    assert await bound.automation_run(6) is None


async def test_knowledge_search_returns_typed_hits(sdk: AppSdk):
    result = await sdk.for_organization(7).search_knowledge("evanston")
    assert result.query == "evanston"
    assert "Evanston" in result.results[0].content
