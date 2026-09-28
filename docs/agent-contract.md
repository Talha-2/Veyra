# The app ⇄ agent contract, v1

Everything that crosses between the Laravel app layer and the Python agent
layer. Two clients, one on each side, and nothing else:

| Direction | Client | Lives at |
|---|---|---|
| agent → app | `AppSdk` (Python) | `apps/agent-layer/packages/common/app_sdk/` |
| app → agent | `AgentGateway` (PHP) | `apps/app-layer/app/Services/Agent/AgentGateway.php` |

The rules that keep the seam honest (ARCHITECTURE.md §2.1): the agent never
opens a database connection to the app; every agent→app call goes through
`AppSdk`, every app→agent call through `AgentGateway`; the version is in the
path and a breaking change ships as `/v2` beside `/v1`.

Both sides are tested against this document:
`apps/app-layer/tests/Feature/AgentApiTest.php` exercises every route with the
payloads the SDK sends; `apps/agent-layer/packages/common/app_sdk/tests/`
exercises the SDK against those responses.

---

## Authentication

One shared secret, `AGENT_SHARED_SECRET`, set on both sides. Sent as
`Authorization: Bearer <secret>`; compared in constant time.

A 401 body says which side is misconfigured:

```json
{"error": "unauthenticated", "message": "AGENT_SHARED_SECRET is not set on the app layer."}
{"error": "unauthenticated", "message": "Bearer token does not match AGENT_SHARED_SECRET."}
```

**Tenancy.** The credential is for the agent layer as a whole. The tenant is
named in the path — `/organizations/{id}/…` — never inferred, and every query
under that prefix is scoped to it. A record that exists in another tenant is a
404, not a 403: the path does not admit that it exists.

The one exception is `POST /calls/inbound`, which resolves the tenant itself
from the dialled number, because at that moment the agent knows nothing else.

**Rate limit.** 1,200 requests/minute per tenant. One live call is many
requests (transcript pushes, tool-call records, delegations); this is sized
for that, not for a browser.

---

## Routes

Base: `{APP_LAYER_URL}/api/agent/v1`. All bodies JSON. Validation failures are
422 with Laravel's `{message, errors: {field: [..]}}` shape.

### Unscoped

| Route | Purpose |
|---|---|
| `GET /health` | `{ok, contract: "v1", app, time}`. A mismatched deploy is visible here. |
| `POST /calls/inbound` | A call arrived. Resolves the tenant, opens the conversation, returns the **call context** (below). |
| `POST /calls/web` | `{room}` — a browser voice session (Studio Talk) in a room named `web-…` that the app created. The room name resolves the tenant and the waiting call (created in the last 15 minutes); the first claim moves it to `in-progress` (201), a retry gets the same call (200). Returns the same call context, with `line.e164 = "web"` and a `web_session` caller. |
| `POST /automations/claim` | The gateway's pull loop: claim due and queued automation runs across **every** tenant, exactly once. Each run carries `organization_id`. |

`POST /calls/inbound` takes `{to, from, provider, provider_sid, room?}`.
Idempotent on `(provider, provider_sid)`: a restarted worker re-sending it gets
the same call back (200 rather than 201). Unknown `to` → 404 `unknown_number`.

### Organization-scoped: `/organizations/{organization}/…`

| Route | Purpose |
|---|---|
| `GET /context` | The tenant bundle without a call, for text runs and automations. |
| `GET /skills` | Skill stubs: slug, name, description, version, execution mode. |
| `GET /skills/{slug}` | One skill body as markdown (frontmatter + prose), plus `steps` when gated. **Read on demand, never in the prompt.** |
| `GET /knowledge/search?q=&limit=` | Chunks matching a query, with an excerpt centred on the hit and the full chunk. |
| `GET /contacts/lookup?phone=\|email=\|contact_id=` | Who this is, with open tickets and recent conversations. `found: false` with an `identifier` means "we have seen this number, not this person". |
| `POST /contacts` | Create a contact and link its identifiers, bringing anonymous history along. Returns `created: false` and the existing contact if an identifier already belongs to someone. |
| `PATCH /contacts/{id}` | Correct details on the call. |
| `GET /tickets?contact_id=\|conversation_id=` | Recent tickets. |
| `POST /tickets` | Raise a ticket. Numbered, typed, routed to the type's default assignees, logged on the conversation, notified. Takes `idempotency_key`. |
| `POST /messages` | Queue an outbound SMS/email. 422 `not_permitted` when the identifier is blocked or on DND. Takes `idempotency_key`. |
| `GET /calls?since=&contact_id=&status=&limit=` | Recent calls with contact, duration and the post-call summary. What a digest automation reads. |
| `POST /calls/{call}/events` | `{type: answered\|transferred\|ended\|failed, duration_sec?, recording_url?, summary?, error?, metrics?}` |
| `PUT /calls/{call}/transcript` | The caller-facing transcript so far, **replaced whole**. |
| `POST /calls/{call}/delegations` | Open a `delegate()` handoff: `{sequence, transcript_delta, is_finalization?}`. **409 `duplicate_sequence`** if that sequence exists. |
| `PATCH /calls/{call}/delegations/{id}` | Close it: `{status: completed\|failed\|timeout\|aborted, reply?, error?, duration_ms?}`. Returns `failed` and `completed_durable_write`. |
| `POST /tool-calls` | Record a tool call **before dispatch**. Returns `{duplicate, tool_call}`. |
| `PATCH /tool-calls/{id}` | Close it: `{status: succeeded\|failed\|timeout\|rejected\|awaiting_approval, result?, error?, duration_ms?, attempt?}`. |
| `POST /memory` | `{name, content}` — upsert by name. Shown on Studio › Memory. |
| `POST /threads/{thread}/messages` | The agent's reply on an Ask thread. Replaces the pending placeholder. `{content, external_id?, final?}` |
| `POST /automations/claim` | Take due and queued automation runs for this tenant, exactly once (locked). Returns each run with its automation's goal, prompt and tool schemas. |
| `POST /automations/runs/{id}/claim` | The push path's counterpart: claim one queued run by id. 404 `not_queued` if it was already claimed or finished, so push and pull cannot both run it. |
| `PATCH /automations/runs/{id}` | `{status: done\|error, result?, error?, steps?, tokens?, duration_ms?}` |

---

## The call context

What `POST /calls/inbound` returns, and what the talker needs to say hello.
One round trip on the greeting path, by design. Everything read progressively
— skill bodies, knowledge, deeper history — is fetched afterwards.

```jsonc
{
  "contract": "v1",
  "organization": {"id": 7, "slug": "northwind", "name": "Northwind", "timezone": "America/Chicago"},
  "business":     {"name", "description", "industry", "timezone", "website", "address", "hours", "holidays"},
  "agent": {
    "display_name": "Nora", "persona": "…", "greeting": "…", "primary_language": "en",
    "languages": [ {"code": "en", "label": "English", "rtl": false, "stt": "nova-3", "stt_multi": true,
                    "tts_low_latency": true, "tts_provider": "elevenlabs-flash", "semantic_turns": true, "caveats": []},
                   {"code": "ur", "…": "…", "stt": "nova-3-ur", "stt_multi": false, "tts_low_latency": false,
                    "tts_provider": "azure-ur-pk", "semantic_turns": false, "caveats": ["…"]} ],
    "voice": {"provider": "elevenlabs", "id": "…", "model": "flash"},
    "turn":  {"min_endpointing_ms": 400, "min_interruption_ms": 550, "allow_interruptions": true, "semantic_turn_detection": true},
    "max_call_seconds": 1800, "record_calls": true, "advanced": {}
  },
  "experts": [
    {
      "slug": "scheduling", "name": "Scheduling", "description": "Books and moves appointments.",
      "runtime": "worker",                       // talker | worker | text
      "system_prompt": "…", "model": null, "reasoning_effort": null,
      "skills": [ {"slug": "reschedule", "name": "Reschedule", "description": "…",
                   "path": "/skills/org/reschedule/SKILL.md", "version": 3, "execution_mode": "prose"} ],
      "tools":  [ {"name": "book_appointment", "description": "…", "input_schema": {…},
                   "kind": "composio", "is_idempotent": false, "is_durable_write": true,
                   "requires_approval": false, "timeout_ms": 15000, "max_retries": 2, "config": {…}} ],
      "peers":  ["billing: Handles invoices and refunds."]   // one routing line per sibling on the same runtime
    }
  ],
  "skills":       [ {"slug", "name", "description", "version", "scope"} ],
  "ticket_types": [ {"id": 1, "name": "Billing", "description": null} ],
  "memory":       [ {"name": "Scheduling rules", "content": "No installs on Fridays."} ],

  "call":   {"id": 42, "conversation_id": 9, "direction": "inbound", "from": "+1773…", "to": "+1312…",
             "room": "…", "provider": "twilio", "provider_sid": "CA…",
             "language": "ur",                    // per LINE, not per tenant — Urdu STT is monolingual
             "capabilities": { …the "ur" entry above… }},
  "line":   {"id": 1, "e164": "+1312…", "friendly_name": "Main line", "language": "ur", "ivr": null, "answered_by_agent": true},
  "caller": {
    "identifier":   {"id": 3, "type": "phone", "value": "+1773…", "blocked": false, "dnd": false},
    "contact":      {"id", "name", "display_name", "phone", "email", "company", "stage"} | null,
    "open_tickets": [ {"reference", "subject", "status", "created_at"} ],
    "recent_calls": [ {"at", "duration", "summary"} ]
  }
}
```

`GET /context` is the same object without `call`, `line` and `caller`.

The SDK's `CallContext` requires `organization`, `call`, `line` and `caller`
with no defaults. A truncated body raises rather than hydrating into a context
that silently points at the wrong tenant. Everything else is tolerant: the app
may add fields without a contract bump.

---

## Reliability semantics

These are the contract's half of ARCHITECTURE.md §5.4. Each is enforced on
the server and mirrored in the SDK.

**Tool calls are recorded before they run.** `POST /tool-calls` first, with an
`idempotency_key` for any non-idempotent action, then dispatch, then `PATCH`
with the outcome. If the same key arrives again the app returns the earlier
record with `duplicate: true`. The worker then reconciles from that record's
`status` — it does not run the action again. A `timeout` on a non-idempotent
action is returned with `needs_reconciliation: true`; it is never
`confirmed_complete`.

**A delegation sequence is sent once.** The talker's cursor advances when a
delegation begins; if a retry re-sends a sequence the app answers 409 and the
SDK raises `Conflict`, which the talker treats as "already sent", never as
"try again".

**The app decides what the talker may claim.** Closing a delegation returns
`failed` (timeout, error, aborted, or an empty reply) and
`completed_durable_write` (a `succeeded` tool call on an action flagged
`is_durable_write` under this delegation). The talker confirms a booking or a
ticket only when the second is true. This is computed on the server from the
audit trail so the Python side cannot drift from it.

**Writes carry idempotency keys; the SDK does not retry them.** A read that
hits a transport fault is retried once. A write is reported to the caller,
who retries with the same key if that is right, and gets the earlier record
back if it already landed (`tickets`, `messages`, `tool-calls`).

**Messages are queued, not sent.** `POST /messages` answers `status: queued`.
The talker says "I'm sending you a text", not "I've texted you".

**Transcripts are replaced, not appended.** A retried push cannot duplicate a
turn.

---

## App → agent: `AgentGateway`

`AGENT_GATEWAY_URL` + the same secret. Routes on the Python gateway:

| Route | Purpose |
|---|---|
| `GET /v1/health` | Reachability. Cached 30 s on the app side. |
| `POST /v1/runs` | `{kind: thread, organization_id, thread_id, external_id?, message}` — start or continue an Ask run. `{kind: automation, organization_id, run_id, automation_id}` — start a queued run now. |
| `POST /v1/chat/stream` | `{organization_id, conversation_id, message, history, context}` — one live-chat turn with the **customer-facing** agent (Studio Talk's chat; later the public chat API). `context` is the conversation bundle (tenant bundle + `caller`), sent by the app so no second fetch precedes the reply. Same event stream as Ask. The worker runs with the chat prompt (the front desk's voice and the worker's tools and rules in one text agent). |
| `POST /v1/threads/stream` | `{organization_id, thread_id, message, history: [{role, content}]}` — one Ask turn as server-sent events, one JSON object per `data:` line: `status` `{text}`, `delta` `{text}`, `tool` `{id, name, status: running\|done\|error, label, detail, summary?, ms?}`, then `done` `{content, tokens, model}` or `error` `{message}`. `history` seeds a fresh worker, so a restarted gateway continues the thread. The app relays every event to the browser and saves the finished turn (text and tool steps in order) itself. |
| `POST /v1/skills/test` | `{organization_id, skill, version, scenario}` — run a skill without a caller. |
| `POST /v1/calls/outbound` | `{organization_id, to, from, goal, context}` — place a call. |

Push is for immediacy; pull is for robustness. An automation run is written
`queued` first and pushed second, so a push that fails (the gateway is down)
leaves a row the agent's `POST /automations/claim` loop picks up later, and
the person who pressed the button is told which of the two happened. An Ask
message that cannot be pushed is saved with an honest placeholder — never a
canned answer that looks real.

---

## Environment

| Variable | App layer | Agent layer |
|---|---|---|
| `AGENT_SHARED_SECRET` | required | required |
| `AGENT_GATEWAY_URL` | the Python gateway, e.g. `http://agent:8100` | — |
| `APP_LAYER_URL` | — | the Laravel app, e.g. `http://app:8080` |

---

## Changing the contract

- **Adding a field** to a response: fine, no version bump. Add it to the PHP
  builder, the Python model (with a default), and this file.
- **Adding a route**: fine. Add it to `routes/api.php`, `AppSdk`, both test
  files, and the table above.
- **Renaming, removing or re-typing** anything a consumer reads: `/v2`. Both
  versions run until every agent process has moved.
