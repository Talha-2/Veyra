"""The gateway against a fake app and a scripted model."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app_sdk.models import AutomationJob, HealthStatus, TenantContext
from veyra_gateway.app import create_app
from veyra_gateway.runner import TextRunner, tools_from_specs
from veyra_harness.tests.fakes import CALL_CONTEXT, FakeSdk, ScriptedModel, call, say

SECRET = "gw-secret"


class GatewayFakeSdk(FakeSdk):
    """FakeSdk plus the routes only the gateway uses."""

    def __init__(self):
        super().__init__()
        self.thread_replies: list[dict[str, Any]] = []
        self.finished_runs: list[dict[str, Any]] = []
        self.queued: dict[int, AutomationJob] = {}
        self.claim_all_calls = 0

    def for_organization(self, organization_id: int) -> "GatewayFakeSdk":
        self.organization_id = organization_id
        return self

    async def aclose(self) -> None:
        pass

    async def health(self) -> HealthStatus:
        return HealthStatus(ok=True, contract="v1")

    async def context(self) -> TenantContext:
        data = {k: v for k, v in CALL_CONTEXT.items() if k not in ("call", "line", "caller")}
        return TenantContext.model_validate(data)

    async def reply_to_thread(self, thread_id: int, content: str, *, external_id: str | None = None, final: bool = True) -> None:
        self.thread_replies.append({"thread_id": thread_id, "content": content, "external_id": external_id})

    async def automation_run(self, run_id: int) -> AutomationJob | None:
        return self.queued.pop(run_id, None)

    async def claim_all_automations(self, *, limit: int = 5) -> list[AutomationJob]:
        self.claim_all_calls += 1
        jobs = list(self.queued.values())[:limit]
        for job in jobs:
            self.queued.pop(job.id)
        return jobs

    async def finish_automation_run(self, run_id: int, **kw: Any) -> None:
        self.finished_runs.append({"run_id": run_id, **kw})


def job(run_id: int = 3, **automation: Any) -> AutomationJob:
    spec = {"id": 1, "name": "Digest", "goal": "Summarise overnight calls.", "reasoning": "fast", "can_search_knowledge": True,
            "tools": [{"id": 2, "name": "find_contact", "description": "Find.", "kind": "internal", "is_idempotent": True}], **automation}
    return AutomationJob(id=run_id, trigger="schedule", input="Summarise overnight calls.", automation=spec, organization_id=7)


@pytest.fixture
def sdk() -> GatewayFakeSdk:
    return GatewayFakeSdk()


def make_app(sdk: GatewayFakeSdk, model: ScriptedModel, monkeypatch: pytest.MonkeyPatch, *, claim_interval: float = 0):
    monkeypatch.setenv("AGENT_SHARED_SECRET", SECRET)
    runner = TextRunner(sdk, model_factory=lambda reasoning, ref=None: model)
    return create_app(sdk=sdk, runner=runner, claim_interval=claim_interval)


async def wait_for(predicate, timeout: float = 2.0) -> None:
    for _ in range(int(timeout / 0.02)):
        if predicate():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("condition not met in time")


async def test_health_requires_the_secret_and_reports_the_app_layer(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    app = make_app(sdk, ScriptedModel(), monkeypatch)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw") as client:
            assert (await client.get("/v1/health")).status_code == 401
            response = await client.get("/v1/health", headers={"Authorization": f"Bearer {SECRET}"})
            assert response.status_code == 200
            assert response.json() == {"ok": True, "contract": "v1", "app_layer": True, "claim_loop": False}


async def test_a_thread_run_is_accepted_then_answered_through_the_contract(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    model = ScriptedModel(call(("search_knowledge", {"query": "evanston"})), say("Yes, Evanston is inside the service area."), say("Follow-up answer."))
    app = make_app(sdk, model, monkeypatch)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"}) as client:
            response = await client.post("/v1/runs", json={"kind": "thread", "organization_id": 7, "thread_id": 5, "message": "Do we serve Evanston?"})
            assert response.status_code == 202 and response.json()["external_id"] == "thr_7_5"
            await wait_for(lambda: len(sdk.thread_replies) == 1)
            assert sdk.thread_replies[0] == {"thread_id": 5, "content": "Yes, Evanston is inside the service area.", "external_id": "thr_7_5"}
            # The system prompt is the text one: no caller, direct address.
            system = model.requests[0][0][0]["content"]
            assert "text conversation" in system and "front desk of" not in system

            # A follow-up continues the same private history.
            await client.post("/v1/runs", json={"kind": "thread", "organization_id": 7, "thread_id": 5, "message": "Thanks."})
            await wait_for(lambda: len(sdk.thread_replies) == 2)
            assert len(model.requests[-1][0]) > len(model.requests[0][0]), "history carried over"


async def test_a_pushed_automation_run_is_claimed_executed_and_reported(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    sdk.queued[3] = job()
    model = ScriptedModel(call(("find_contact", {})), say("3 calls overnight. 1 needs a callback."))
    app = make_app(sdk, model, monkeypatch)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"}) as client:
            response = await client.post("/v1/runs", json={"kind": "automation", "organization_id": 7, "run_id": 3, "automation_id": 1})
            assert response.status_code == 202
            await wait_for(lambda: len(sdk.finished_runs) == 1)
            done = sdk.finished_runs[0]
            assert done["status"] == "done" and done["result"].startswith("3 calls overnight")
            assert [s["name"] for s in done["steps"] if s["type"] == "tool_call"] == ["find_contact"]
            assert done["tokens"] == 30
            system = model.requests[0][0][0]["content"]
            assert "Automation: Digest" in system and "Summarise overnight calls." in system


async def test_the_claim_loop_pulls_queued_runs_across_tenants(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    sdk.queued[8] = job(run_id=8)
    model = ScriptedModel(say("Nothing overnight."))
    app = make_app(sdk, model, monkeypatch, claim_interval=0.05)
    async with app.router.lifespan_context(app):
        await wait_for(lambda: len(sdk.finished_runs) == 1, timeout=3)
        assert sdk.finished_runs[0]["run_id"] == 8 and sdk.claim_all_calls >= 1


async def test_a_run_whose_model_fails_is_reported_as_an_error_not_lost(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    class Broken:
        name = "broken"

        async def complete(self, messages, tools):
            raise RuntimeError("provider 500")

    sdk.queued[4] = job(run_id=4)
    monkeypatch.setenv("AGENT_SHARED_SECRET", SECRET)
    runner = TextRunner(sdk, model_factory=lambda r, ref=None: Broken())
    app = create_app(sdk=sdk, runner=runner, claim_interval=0)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"}) as client:
            await client.post("/v1/runs", json={"kind": "automation", "organization_id": 7, "run_id": 4})
            await wait_for(lambda: len(sdk.finished_runs) == 1)
            assert sdk.finished_runs[0]["status"] == "error"


async def test_skill_test_runs_dry_and_returns_the_steps(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    model = ScriptedModel(call(("read_skill", {"slug": "reschedule"})), call(("create_ticket", {"subject": "s", "body": "b"})), say("Would raise a ticket."))
    app = make_app(sdk, model, monkeypatch)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"}) as client:
            response = await client.post("/v1/skills/test", json={"organization_id": 7, "skill": "reschedule", "scenario": "Caller wants to move Thursday."})
            assert response.status_code == 200
            body = response.json()
            assert body["steps"] == ["read_skill", "create_ticket"] and body["failed"] is False
            assert sdk.created_tickets == [], "writes are simulated on a dry run"


async def test_outbound_is_an_honest_501(sdk: GatewayFakeSdk, monkeypatch: pytest.MonkeyPatch):
    app = make_app(sdk, ScriptedModel(), monkeypatch)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"}) as client:
            response = await client.post("/v1/calls/outbound", json={"organization_id": 7, "to": "+1", "from": "+2", "goal": "g"})
            assert response.status_code == 501 and response.json()["error"] == "outbound_not_implemented"


def test_automation_tools_are_only_what_studio_allowed_plus_skill_reading():
    tools = tools_from_specs(job().automation.tools, can_search_knowledge=False)
    assert [t.name for t in tools] == ["find_contact", "read_skill"]
    with_kb = tools_from_specs(job().automation.tools, can_search_knowledge=True)
    assert "search_knowledge" in [t.name for t in with_kb]
