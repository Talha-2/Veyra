import json
import httpx
from app_sdk import AppSdk
from app_sdk.models import ToolSpec
from veyra_gateway.runner import TextRunner
from veyra_gateway.app import create_app
from veyra_harness.tests.fakes import CALL_CONTEXT
from app_sdk.tests.test_scheduling import APPOINTMENT

async def test_approved_booking_keeps_trusted_customer_scope_and_a_stable_request_key():
    requests = []
    def app(request):
        if request.url.path.endswith("/context"):
            return httpx.Response(200, json={**CALL_CONTEXT, "healthcare_enabled": True})
        requests.append(request)
        assert request.headers["X-Veyra-Conversation"] == "9"
        return httpx.Response(201, json={"appointment": APPOINTMENT})
    async with AppSdk("http://app.test", "secret", transport=httpx.MockTransport(app)) as sdk:
        runner = TextRunner(sdk)
        spec = ToolSpec(name="book_appointment", description="Book appointment", kind="internal", is_durable_write=True, requires_approval=True)
        args = {"provider_id": 1, "location_id": 2, "service_id": 3, "starts_at": "2026-10-12T04:00:00Z", "confirmed": True, "conversation_id": 999}
        for _ in range(2):
            result = await runner.execute_tool(7, spec, args, tool_call_id=44, execution_context={"conversation_id": 9})
            assert result["ok"]
        assert json.loads(requests[0].content)["idempotency_key"] == json.loads(requests[1].content)["idempotency_key"]

async def test_gateway_preserves_execution_context_in_the_approved_action_route(monkeypatch):
    monkeypatch.setenv("AGENT_SHARED_SECRET", "secret")
    def app(request):
        if request.url.path.endswith("/context"):
            return httpx.Response(200, json={**CALL_CONTEXT, "healthcare_enabled": True})
        assert request.headers.get("X-Veyra-Conversation") == "9"
        return httpx.Response(201, json={"appointment": APPOINTMENT})
    async with AppSdk("http://app.test", "secret", transport=httpx.MockTransport(app)) as sdk:
        gateway = create_app(sdk=sdk, runner=TextRunner(sdk), claim_interval=0)
        async with gateway.router.lifespan_context(gateway):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway), base_url="http://gateway.test", headers={"Authorization": "Bearer secret"}) as client:
                result = await client.post("/v1/tools/execute", json={"organization_id": 7, "tool_call_id": 44,
                    "tool": {"name": "book_appointment", "description": "Book appointment", "kind": "internal", "requires_approval": True},
                    "arguments": {"provider_id": 1, "location_id": 2, "service_id": 3, "starts_at": "2026-10-12T04:00:00Z", "confirmed": True},
                    "execution_context": {"conversation_id": 9}})
                assert result.json()["ok"]
