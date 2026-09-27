"""The AppSdk client.

Design notes, in the order they matter on a phone call:

- **One round trip to say hello.** ``inbound_call`` returns the whole tenant
  bundle with the call, so the talker has its prompt, language and voice from
  one request. Skill bodies and knowledge are fetched later, on demand.
- **Short timeouts, no silent retries on writes.** A read that fails can be
  retried once; a write that fails is reported. The app deduplicates writes
  that carry an idempotency key, so the *caller* decides to retry those, with
  the same key, and gets the earlier record back if it already landed.
- **Errors keep the server's message.** The app says *why* (which side has
  the wrong secret, which invariant a 409 broke). That text reaches the log.
- **Fails loud on a bad tenant.** ``CallContext`` requires the fields that
  decide which organization the call runs as; a truncated body raises.

The client is bound to a tenant after ``inbound_call`` with
``for_organization``; unbound calls to org-scoped routes raise, which is the
one mistake worth making impossible.
"""

from __future__ import annotations

import os
from typing import Any, Literal

import httpx
from pydantic import ValidationError

from .errors import AppSdkError, Conflict, NotFound, Unauthenticated, Unavailable
from .models import (
    AutomationJob,
    CallContext,
    CallSummary,
    ContactLookup,
    ContactRecord,
    DelegationOutcome,
    DelegationRecord,
    HealthStatus,
    KnowledgeResult,
    MessageRecord,
    SkillDocument,
    SkillStub,
    TenantContext,
    TicketRecord,
    ToolCallRecord,
    ToolCallStart,
)

CONTRACT = "v1"

ToolCallStatus = Literal["succeeded", "failed", "timeout", "rejected", "awaiting_approval"]
DelegationStatus = Literal["completed", "failed", "timeout", "aborted"]
CallEventType = Literal["answered", "transferred", "ended", "failed"]


class AppSdk:
    def __init__(
        self,
        base_url: str | None = None,
        secret: str | None = None,
        *,
        organization_id: int | None = None,
        timeout: float = 5.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.base_url = (base_url or os.getenv("APP_LAYER_URL") or "").rstrip("/")
        self.secret = secret or os.getenv("AGENT_SHARED_SECRET") or ""
        if not self.base_url:
            raise AppSdkError("APP_LAYER_URL is not set; the agent layer has no app layer to talk to.")
        if not self.secret:
            raise AppSdkError("AGENT_SHARED_SECRET is not set on the agent layer.")

        self.organization_id = organization_id
        self._timeout = timeout
        self._transport = transport
        self._client = httpx.AsyncClient(
            base_url=f"{self.base_url}/api/agent/{CONTRACT}",
            headers={"Authorization": f"Bearer {self.secret}", "Accept": "application/json"},
            timeout=httpx.Timeout(timeout, connect=min(3.0, timeout)),
            transport=transport,
        )
        self._skills: dict[str, SkillDocument] = {}

    # ── lifecycle ────────────────────────────────────────────────────────

    def for_organization(self, organization_id: int) -> "AppSdk":
        """A client bound to one tenant. Shares the HTTP connection pool."""
        bound = AppSdk.__new__(AppSdk)
        bound.__dict__.update(self.__dict__)
        bound.organization_id = organization_id
        bound._skills = {}
        return bound

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AppSdk":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    # ── unscoped ─────────────────────────────────────────────────────────

    async def health(self) -> HealthStatus:
        return HealthStatus.model_validate(await self._get("/health"))

    async def inbound_call(self, *, to: str, from_: str, provider: str, provider_sid: str, room: str | None = None) -> CallContext:
        """Report an arriving call and get everything needed to answer it.

        Idempotent on ``(provider, provider_sid)``: a restarted worker gets the
        same call back. The returned context names the tenant; bind with
        ``sdk.for_organization(ctx.organization.id)`` before anything else.
        """
        body = await self._post("/calls/inbound", {"to": to, "from": from_, "provider": provider, "provider_sid": provider_sid, "room": room})
        try:
            return CallContext.model_validate(body)
        except ValidationError as e:
            raise AppSdkError(f"inbound call context is not a v1 CallContext: {e}", path="/calls/inbound") from e

    # ── tenant bundle & reads ───────────────────────────────────────────

    async def context(self) -> TenantContext:
        return TenantContext.model_validate(await self._get(self._org("/context")))

    async def skills(self) -> list[SkillStub]:
        body = await self._get(self._org("/skills"))
        return [SkillStub.model_validate(s) for s in body.get("skills", [])]

    async def skill(self, slug: str, *, version: int | None = None) -> SkillDocument:
        """The skill body, read when the model decides it is relevant.

        Cached per client on ``version``: the stub in the prompt carries the
        version, so a body edited in Studio mid-call is re-read on the next
        call and never served stale.
        """
        cached = self._skills.get(slug)
        if cached is not None and (version is None or cached.version == version):
            return cached
        doc = SkillDocument.model_validate(await self._get(self._org(f"/skills/{slug}")))
        self._skills[slug] = doc
        return doc

    async def search_knowledge(self, query: str, *, limit: int = 8) -> KnowledgeResult:
        return KnowledgeResult.model_validate(await self._get(self._org("/knowledge/search"), params={"q": query, "limit": limit}))

    async def lookup_contact(self, *, phone: str | None = None, email: str | None = None, contact_id: int | None = None) -> ContactLookup:
        params = {k: v for k, v in {"phone": phone, "email": email, "contact_id": contact_id}.items() if v is not None}
        return ContactLookup.model_validate(await self._get(self._org("/contacts/lookup"), params=params))

    async def recent_calls(self, *, since: str | None = None, contact_id: int | None = None, status: str | None = None, limit: int = 20) -> list[CallSummary]:
        params = {k: v for k, v in {"since": since, "contact_id": contact_id, "status": status, "limit": limit}.items() if v is not None}
        body = await self._get(self._org("/calls"), params=params)
        return [CallSummary.model_validate(c) for c in body.get("calls", [])]

    async def tickets(self, *, contact_id: int | None = None, conversation_id: int | None = None, limit: int = 10) -> list[TicketRecord]:
        params = {k: v for k, v in {"contact_id": contact_id, "conversation_id": conversation_id, "limit": limit}.items() if v is not None}
        body = await self._get(self._org("/tickets"), params=params)
        return [TicketRecord.model_validate(t) for t in body.get("tickets", [])]

    # ── writes ──────────────────────────────────────────────────────────

    async def create_contact(self, *, name: str, phone: str | None = None, email: str | None = None, company: str | None = None, source: str = "call") -> tuple[ContactRecord, bool]:
        """Returns ``(contact, created)``. ``created`` is False when the identifier already belonged to someone."""
        body = await self._post(self._org("/contacts"), {"name": name, "phone": phone, "email": email, "company": company, "source": source})
        return ContactRecord.model_validate(body["contact"]), bool(body.get("created"))

    async def update_contact(self, contact_id: int, **fields: Any) -> ContactRecord:
        body = await self._patch(self._org(f"/contacts/{contact_id}"), fields)
        return ContactRecord.model_validate(body["contact"])

    async def create_ticket(
        self, *, subject: str, body: str, type: str | None = None, priority: str | None = None,
        contact_id: int | None = None, conversation_id: int | None = None, call_id: int | None = None,
        idempotency_key: str | None = None,
    ) -> tuple[TicketRecord, bool]:
        """The write behind "I've passed this to the team". Returns ``(ticket, created)``.

        Always pass ``idempotency_key`` from a live call: a retry after an
        ambiguous timeout then finds the earlier ticket instead of raising a
        second one for the same sentence.
        """
        payload = {
            "subject": subject, "body": body, "type": type, "priority": priority, "contact_id": contact_id,
            "conversation_id": conversation_id, "call_id": call_id, "idempotency_key": idempotency_key,
        }
        result = await self._post(self._org("/tickets"), payload)
        return TicketRecord.model_validate(result["ticket"]), bool(result.get("created"))

    async def send_message(
        self, *, channel: Literal["sms", "email"], body: str, conversation_id: int | None = None, to: str | None = None,
        subject: str | None = None, idempotency_key: str | None = None,
    ) -> MessageRecord:
        """Queue an outbound message. Queued, not sent: say "I'm sending you a text", not "I've texted you"."""
        result = await self._post(self._org("/messages"), {
            "channel": channel, "body": body, "conversation_id": conversation_id, "to": to, "subject": subject, "idempotency_key": idempotency_key,
        })
        return MessageRecord.model_validate(result["message"])

    async def remember(self, name: str, content: str) -> None:
        await self._post(self._org("/memory"), {"name": name, "content": content})

    # ── call lifecycle ──────────────────────────────────────────────────

    async def call_event(self, call_id: int, type: CallEventType, **fields: Any) -> None:
        await self._post(self._org(f"/calls/{call_id}/events"), {"type": type, **fields})

    async def push_transcript(self, call_id: int, items: list[dict[str, Any]], *, metrics: dict[str, Any] | None = None) -> None:
        """Replace the transcript whole. Replacing, not appending, is what makes a retried push safe."""
        await self._put(self._org(f"/calls/{call_id}/transcript"), {"items": items, "metrics": metrics})

    async def start_delegation(self, call_id: int, *, sequence: int, transcript_delta: str, is_finalization: bool = False) -> DelegationRecord:
        """Open a delegation. A 409 (``Conflict``) means this sequence was already sent: do not retry it."""
        body = await self._post(self._org(f"/calls/{call_id}/delegations"), {"sequence": sequence, "transcript_delta": transcript_delta, "is_finalization": is_finalization})
        return DelegationRecord.model_validate(body)

    async def finish_delegation(self, call_id: int, delegation_id: int, *, status: DelegationStatus, reply: str | None = None, error: str | None = None, duration_ms: int | None = None) -> DelegationOutcome:
        body = await self._patch(self._org(f"/calls/{call_id}/delegations/{delegation_id}"), {"status": status, "reply": reply, "error": error, "duration_ms": duration_ms})
        return DelegationOutcome.model_validate(body)

    # ── tool-call audit ─────────────────────────────────────────────────

    async def start_tool_call(
        self, *, action_slug: str, arguments: dict[str, Any] | None = None, idempotency_key: str | None = None,
        call_id: int | None = None, delegation_id: int | None = None, expert_slug: str | None = None, kind: str | None = None, attempt: int = 1,
    ) -> ToolCallStart:
        """Record a tool call *before* dispatching it.

        For a non-idempotent action pass ``idempotency_key``. If the key was
        seen before the response has ``duplicate=True`` and the earlier record;
        reconcile from its status instead of running the action again.
        """
        body = await self._post(self._org("/tool-calls"), {
            "action_slug": action_slug, "arguments": arguments or {}, "idempotency_key": idempotency_key, "call_id": call_id,
            "delegation_id": delegation_id, "expert_slug": expert_slug, "kind": kind, "attempt": attempt,
        })
        return ToolCallStart.model_validate(body)

    async def finish_tool_call(self, tool_call_id: int, *, status: ToolCallStatus, result: Any = None, error: str | None = None, duration_ms: int | None = None, attempt: int | None = None) -> ToolCallRecord:
        body = await self._patch(self._org(f"/tool-calls/{tool_call_id}"), {"status": status, "result": result, "error": error, "duration_ms": duration_ms, "attempt": attempt})
        return ToolCallRecord.model_validate(body["tool_call"])

    # ── threads & automations ───────────────────────────────────────────

    async def reply_to_thread(self, thread_id: int, content: str, *, external_id: str | None = None, final: bool = True) -> None:
        await self._post(self._org(f"/threads/{thread_id}/messages"), {"content": content, "external_id": external_id, "final": final})

    async def claim_automations(self, *, limit: int = 5) -> list[AutomationJob]:
        body = await self._post(self._org("/automations/claim"), {"limit": limit})
        return [AutomationJob.model_validate(j) for j in body.get("runs", [])]

    async def claim_all_automations(self, *, limit: int = 5) -> list[AutomationJob]:
        """The pull loop's claim across every tenant. Each job carries its ``organization_id``. Unscoped."""
        body = await self._post("/automations/claim", {"limit": limit})
        return [AutomationJob.model_validate(j) for j in body.get("runs", [])]

    async def automation_run(self, run_id: int) -> AutomationJob | None:
        """One queued run by id, marked running: the push path's counterpart to claim. ``None`` when it is not queued."""
        try:
            body = await self._post(self._org(f"/automations/runs/{run_id}/claim"), {})
        except NotFound:
            return None
        return AutomationJob.model_validate(body["run"]) if body.get("run") else None

    async def finish_automation_run(self, run_id: int, *, status: Literal["done", "error"], result: str | None = None, error: str | None = None, steps: list[dict[str, Any]] | None = None, tokens: int | None = None, duration_ms: int | None = None) -> None:
        await self._patch(self._org(f"/automations/runs/{run_id}"), {"status": status, "result": result, "error": error, "steps": steps, "tokens": tokens, "duration_ms": duration_ms})

    # ── transport ───────────────────────────────────────────────────────

    def _org(self, path: str) -> str:
        if self.organization_id is None:
            raise AppSdkError(f"{path} is organization-scoped; bind the client with for_organization() first.", path=path)
        return f"/organizations/{self.organization_id}{path}"

    async def _get(self, path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        # One retry on a transport fault for reads only: reads are safe to repeat.
        for attempt in (1, 2):
            try:
                return await self._send("GET", path, params=params)
            except Unavailable:
                if attempt == 2:
                    raise
        raise AssertionError("unreachable")

    async def _post(self, path: str, json: dict[str, Any]) -> dict[str, Any]:
        return await self._send("POST", path, json=_compact(json))

    async def _patch(self, path: str, json: dict[str, Any]) -> dict[str, Any]:
        return await self._send("PATCH", path, json=_compact(json))

    async def _put(self, path: str, json: dict[str, Any]) -> dict[str, Any]:
        return await self._send("PUT", path, json=_compact(json))

    async def _send(self, method: str, path: str, *, params: dict[str, Any] | None = None, json: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = await self._client.request(method, path, params=params, json=json)
        except httpx.TransportError as e:
            raise Unavailable(f"app layer unreachable: {e}", path=path) from e

        if response.status_code < 300:
            try:
                data = response.json()
            except ValueError as e:
                raise AppSdkError("app layer returned a non-JSON body", status=response.status_code, path=path) from e
            return data if isinstance(data, dict) else {"data": data}

        message, code = _error_text(response)
        kwargs = {"status": response.status_code, "code": code, "path": path}
        if response.status_code == 401:
            raise Unauthenticated(message, **kwargs)
        if response.status_code == 404:
            raise NotFound(message, **kwargs)
        if response.status_code == 409:
            raise Conflict(message, **kwargs)
        if response.status_code >= 500:
            raise Unavailable(message, **kwargs)
        raise AppSdkError(message, **kwargs)


def _compact(payload: dict[str, Any]) -> dict[str, Any]:
    """Drop ``None`` so the app's validation sees absent fields, not nulls."""
    return {k: v for k, v in payload.items() if v is not None}


def _error_text(response: httpx.Response) -> tuple[str, str | None]:
    try:
        body = response.json()
    except ValueError:
        return response.text[:300] or f"HTTP {response.status_code}", None
    if isinstance(body, dict):
        message = body.get("message") or body.get("error") or str(body)[:300]
        if "errors" in body and isinstance(body["errors"], dict):
            details = "; ".join(f"{k}: {', '.join(v)}" for k, v in body["errors"].items())
            message = f"{message} ({details})"
        return str(message), body.get("error") if isinstance(body.get("error"), str) else None
    return str(body)[:300], None
