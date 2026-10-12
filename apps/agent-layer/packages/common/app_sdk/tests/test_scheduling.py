import json
import httpx
import pytest
from app_sdk import AppSdk

APPOINTMENT = {"id": 41, "status": "booked", "starts_at": "2026-10-12T04:00:00+00:00", "ends_at": "2026-10-12T04:30:00+00:00", "timezone": "Asia/Karachi", "provider_id": 1, "clinic_location_id": 2, "healthcare_service_id": 3, "provider": "Dr Ayesha", "location": "Lahore", "service": "Consultation"}

async def test_booking_sdk_sends_scope_confirmation_and_key_and_returns_typed_record():
    requests = []
    def app(request):
        requests.append(request)
        return httpx.Response(201, json={"appointment": APPOINTMENT})
    async with AppSdk("http://app.test", "secret", organization_id=7, transport=httpx.MockTransport(app)) as sdk:
        result = await sdk.book_appointment(provider_id=1, location_id=2, service_id=3, starts_at="2026-10-12T04:00:00Z", confirmed=True, idempotency_key="one", acting_for=9)
        assert result.id == 41 and result.status == "booked"
    assert requests[0].url.path == "/api/agent/v1/organizations/7/scheduling/appointments"
    assert requests[0].headers["X-Veyra-Conversation"] == "9"
    assert json.loads(requests[0].content)["idempotency_key"] == "one"
    assert json.loads(requests[0].content)["confirmed"] is True
    assert "patient_id" not in json.loads(requests[0].content)

async def test_availability_sdk_keeps_offset_and_returns_only_slots():
    def app(request):
        assert request.url.params["from"] == "2026-10-12T00:00:00+05:00"
        return httpx.Response(200, json={"slots": [{"starts_at": APPOINTMENT["starts_at"], "ends_at": APPOINTMENT["ends_at"], "timezone": "Asia/Karachi"}]})
    async with AppSdk("http://app.test", "secret", organization_id=7, transport=httpx.MockTransport(app)) as sdk:
        slots = await sdk.scheduling_slots(provider_id=1, location_id=2, service_id=3, from_="2026-10-12T00:00:00+05:00", to="2026-10-13T00:00:00+05:00", acting_for=9)
        assert slots[0].timezone == "Asia/Karachi"
        assert not hasattr(slots[0], "patient_id")
