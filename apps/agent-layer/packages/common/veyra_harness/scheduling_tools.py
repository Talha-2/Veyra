"""Provider availability and appointments, always through the app's booking service."""
from __future__ import annotations
from typing import Any
from app_sdk.errors import AppSdkError, Unavailable
from .desk_tools import acting_for
from .tools import Tool, ToolResult


async def _result(coro, *, write: bool = False):
    try:
        value = await coro
        data = [item.model_dump() for item in value] if isinstance(value, list) else value.model_dump()
        return ToolResult.success(data)
    except Unavailable:
        if write:
            return ToolResult(output="This booking change is not confirmed. Do not say it was done; ask the team to check.", ok=False, error="timeout", data={"unconfirmed": True})
        return ToolResult.failure("Availability could not be checked. Try again or ask the team.")
    except AppSdkError as error:
        return ToolResult.failure(str(error))


async def list_providers(args: dict[str, Any], state: Any):
    return await _result(state.sdk.scheduling_providers(acting_for=acting_for(state)))


async def available_slots(args: dict[str, Any], state: Any):
    return await _result(state.sdk.scheduling_slots(provider_id=int(args["provider_id"]), location_id=int(args["location_id"]), service_id=int(args["service_id"]),
        from_=args["from"], to=args["to"], ignore_appointment_id=args.get("ignore_appointment_id"), acting_for=acting_for(state)))


async def list_appointments(args: dict[str, Any], state: Any):
    return await _result(state.sdk.appointments(patient_id=args.get("patient_id"), acting_for=acting_for(state)))


async def book_appointment(args: dict[str, Any], state: Any):
    if args.get("confirmed") is not True:
        return ToolResult.failure("Ask the patient to confirm the provider, service and exact date/time before booking.")
    if not args.get("_idempotency_key"):
        return ToolResult.failure("This booking must run through the recorded action executor. Nothing was booked.")
    return await _result(state.sdk.book_appointment(provider_id=int(args["provider_id"]), location_id=int(args["location_id"]), service_id=int(args["service_id"]),
        starts_at=args["starts_at"], confirmed=True, idempotency_key=args["_idempotency_key"], patient_id=args.get("patient_id"), acting_for=acting_for(state)), write=True)


async def reschedule_appointment(args: dict[str, Any], state: Any):
    if args.get("confirmed") is not True:
        return ToolResult.failure("Ask the patient to confirm the new date/time before rescheduling.")
    return await _result(state.sdk.reschedule_appointment(int(args["appointment_id"]), starts_at=args["starts_at"], confirmed=True, acting_for=acting_for(state)), write=True)


async def cancel_appointment(args: dict[str, Any], state: Any):
    if args.get("confirmed") is not True:
        return ToolResult.failure("Ask the patient to confirm which appointment to cancel.")
    return await _result(state.sdk.cancel_appointment(int(args["appointment_id"]), confirmed=True, acting_for=acting_for(state)), write=True)


_I = {"type": "integer"}
_S = {"type": "string"}
_CONFIRM = {"type": "boolean", "description": "True only after the patient explicitly confirms this change."}


def _tool(name, handler, description, properties, required=(), *, write=False, booking=False):
    return Tool(name=name, handler=handler, description=description, input_schema={"type": "object", "properties": properties, "required": list(required)},
        is_durable_write=write, is_idempotent=not write, inject_idempotency_key=booking, timeout_ms=10000)


SCHEDULING_TOOLS = {
    "list_providers": _tool("list_providers", list_providers, "List active clinicians and the services/locations they offer. Use these real IDs to check calendar availability.", {}),
    "available_slots": _tool("available_slots", available_slots, "Check free slots for one provider, location and service. Use timezone-offset dates and a range of at most 31 days. Returned times are offers, not reservations. For rescheduling pass the customer's own appointment as ignore_appointment_id.", {"provider_id": _I, "location_id": _I, "service_id": _I, "from": _S, "to": _S, "ignore_appointment_id": _I}, ("provider_id", "location_id", "service_id", "from", "to")),
    "list_appointments": _tool("list_appointments", list_appointments, "List upcoming appointments. Customer conversations see only this patient's bookings. Staff may filter by patient_id.", {"patient_id": _I}),
    "book_appointment": _tool("book_appointment", book_appointment, "Book a returned slot only after the patient confirms provider, service and exact local date/time. Pass the slot's starts_at unchanged. Customer patient identity comes from the conversation; unregistered patients need staff. Staff must supply patient_id. Say booked only when the app returns a confirmed booking.", {"provider_id": _I, "location_id": _I, "service_id": _I, "starts_at": _S, "patient_id": _I, "confirmed": _CONFIRM}, ("provider_id", "location_id", "service_id", "starts_at", "confirmed"), write=True, booking=True),
    "reschedule_appointment": _tool("reschedule_appointment", reschedule_appointment, "Move a patient's own future booking to a returned free slot after explicit confirmation. The original booking remains if the new slot is unavailable.", {"appointment_id": _I, "starts_at": _S, "confirmed": _CONFIRM}, ("appointment_id", "starts_at", "confirmed"), write=True),
    "cancel_appointment": _tool("cancel_appointment", cancel_appointment, "Cancel the selected appointment only after explicit patient confirmation. This releases its slot.", {"appointment_id": _I, "confirmed": _CONFIRM}, ("appointment_id", "confirmed"), write=True),
}
