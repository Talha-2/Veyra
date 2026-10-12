from types import SimpleNamespace
import httpx
from app_sdk import AppSdk
from veyra_harness.actions import BUILTINS
from veyra_harness.executor import ActionExecutor, ExecutionScope
from .fakes import FakeSdk
from app_sdk.tests.test_scheduling import APPOINTMENT

async def test_booking_requires_confirmation_before_any_request():
    def app(request):
        raise AssertionError("Unconfirmed request must not reach the app")
    async with AppSdk("http://app.test", "secret", organization_id=7, transport=httpx.MockTransport(app)) as sdk:
        state = SimpleNamespace(sdk=sdk, extra={"conversation_id": 9})
        result = await BUILTINS["book_appointment"].handler({"confirmed": False}, state)
        assert not result.ok and "confirm" in result.output.lower()

async def test_executor_supplies_booking_key_without_mutating_model_arguments():
    requests = []
    def app(request):
        requests.append(request)
        return httpx.Response(201, json={"appointment": APPOINTMENT})
    async with AppSdk("http://app.test", "secret", organization_id=7, transport=httpx.MockTransport(app)) as sdk:
        state = SimpleNamespace(sdk=sdk, extra={"conversation_id": 9})
        audit = FakeSdk()
        executor = ActionExecutor(audit, scope=ExecutionScope(call_id=42, delegation_id=1))
        args = {"provider_id": 1, "location_id": 2, "service_id": 3, "starts_at": "2026-10-12T04:00:00Z", "confirmed": True}
        result = await executor.execute(BUILTINS["book_appointment"], args, state)
        assert result.ok and result.data["id"] == 41
        assert "_idempotency_key" not in args
        assert requests[0].headers["X-Veyra-Conversation"] == "9"
        import json
        assert json.loads(requests[0].content)["idempotency_key"] == audit.tool_calls[0]["idempotency_key"]
        retry = await executor.execute(BUILTINS["book_appointment"], args, state)
        assert retry.ok and len(requests) == 1

async def test_uncertain_booking_is_never_described_as_confirmed():
    def app(request):
        return httpx.Response(503, json={"message": "Unavailable"})
    async with AppSdk("http://app.test", "secret", organization_id=7, transport=httpx.MockTransport(app)) as sdk:
        state = SimpleNamespace(sdk=sdk, extra={"conversation_id": 9})
        args = {"provider_id": 1, "location_id": 2, "service_id": 3, "starts_at": "2026-10-12T04:00:00Z", "confirmed": True, "_idempotency_key": "key"}
        result = await BUILTINS["book_appointment"].handler(args, state)
        assert not result.ok and "not confirmed" in result.output.lower()


async def test_http_timeout_remains_unconfirmed_in_the_action_audit():
    def app(request):
        raise httpx.ReadTimeout("response disappeared", request=request)
    async with AppSdk("http://app.test", "secret", organization_id=7, transport=httpx.MockTransport(app)) as sdk:
        audit = FakeSdk()
        executor = ActionExecutor(audit, scope=ExecutionScope(call_id=42, delegation_id=1))
        args = {"provider_id": 1, "location_id": 2, "service_id": 3, "starts_at": "2026-10-12T04:00:00Z", "confirmed": True}
        result = await executor.execute(BUILTINS["book_appointment"], args, SimpleNamespace(sdk=sdk, extra={"conversation_id": 9}))
        assert not result.ok and result.error == "timeout"
        assert audit.tool_calls[0]["status"] == "timeout"
