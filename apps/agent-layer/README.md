# Veyra agent layer

The Python half of the product: everything that runs a model, and nothing that
owns customer data. It reaches the app layer through one typed client and the
contract in [docs/agent-contract.md](../../docs/agent-contract.md).

```
apps/agent-layer/
├── packages/common/
│   ├── app_sdk/          AppSdk — the only way to reach the app layer
│   └── veyra_harness/    the worker's brain: model seam, tools, executor, worker loop, prompts
├── gateway/veyra_gateway/   FastAPI — the app layer's front door; Ask threads, automations, skill tests
└── agents/voice/veyra_voice/  LiveKit worker: talker (FrontAgent) + the harness Worker, per call
```

## What runs where

**One worker loop, three hosts.** `veyra_harness.Worker` is a plain tool loop
over a `ChatModel` — not a LiveKit Agent — so the same code runs a live call's
delegations, an Ask thread and an automation. What differs is what is absent:
a text run has no delegation rows (there is no call) and no talker.

| Host | Entry | What it does |
|---|---|---|
| Voice worker | `python -m veyra_voice dev` | Answers a LiveKit room: `inbound_call` (one round trip), builds the pipeline from the call's language, runs the talker with the worker behind it, pushes the transcript, runs the silent post-call pass, reports the call ended. |
| Gateway | `python -m veyra_gateway`, or the `agent` service in `apps/app-layer/docker-compose.yml` | Serves `/v1/health`, `/v1/runs`, `/v1/threads/stream` (Ask, token by token), `/v1/skills/test`, `/v1/calls/outbound` (501, honestly) on `:8100`, and a claim loop that pulls queued automation runs across tenants every `GATEWAY_CLAIM_INTERVAL` seconds. |

## Reliability, in code

The rules in ARCHITECTURE.md §5.4 are enforced, not hoped for:

- `executor.py` records every tool call **before** dispatch. A non-idempotent
  action carries an idempotency key; a retry gets the earlier record back and
  reconciles from its status instead of running again. A timed-out write is
  closed as `timeout` and is never `confirmed_complete`.
- `worker.py` opens a delegation row per transcript delta and closes it with
  the reply. The app answers `completed_durable_write` from the audit trail,
  and `front_desk.guard_reply` appends an explicit "nothing durable was
  confirmed" line when the worker's prose claims a write the app did not see.
- `hangup_call` refuses only while a durable write is in flight (by Studio's
  flag, not a name heuristic). A read left running costs nothing.
- `delegate()` advances its transcript cursor when the delegation *begins*, so
  a retry cannot send the same segment twice; the app 409s if one does.
- A voicemail or a dead worker becomes the talker's fallback line, which
  claims nothing.
- `desk_tools.py` holds the front-desk tools (contacts, tickets, the
  conversation, leads). On a call or chat every request names the
  conversation it acts for (`X-Veyra-Conversation`), and the app limits it to
  that customer; refusals come back as sentences the agent can say. A run
  without a call scopes its idempotency keys to its own executor, so two chats
  can never collide. `send_message` is not offered until SMS and email are
  delivered.

## Run the tests

```powershell
# from apps/agent-layer, with the repo .venv (httpx, pydantic, openai, fastapi, pytest, livekit-agents)
..\..\.venv\Scripts\python.exe -m pytest -q
```

69 tests: the SDK against a fake app with the PHP contract's payloads; the
executor's idempotency and timeout promises; the worker loop driven by a
scripted model (parallel reads, serialized writes, the synchronous claim,
progress digests, stall detection, finalization classified from records);
prompt assembly; pipeline selection per language; the gateway end to end with
its claim loop. Nothing in the suite touches the network.

## Running it with the app (docker compose)

The gateway is a service in the app layer's compose stack, built from this
directory's `Dockerfile` (gateway dependencies only; the LiveKit voice worker
is a separate, heavier image):

```bash
cd apps/app-layer
docker compose up -d agent        # builds veyra-agent-gateway:dev the first time
```

It reads provider keys from the repo-root `.env`, takes `AGENT_SHARED_SECRET`
from `apps/app-layer/.env`, reaches the app as `http://app:8000`, and is
reached as `http://agent:8100` (`AGENT_GATEWAY_URL` in the app's `.env`).
`packages/common` and `gateway` are bind-mounted, so a Python edit needs
`docker compose restart agent`, not a rebuild. Its port is also published on
`:8100` for curl.

## Ask streaming

`POST /v1/threads/stream` runs one Ask turn and streams it as server-sent
events: `status`, then `tool` (running → done, with a human label such as
"Searching knowledge" and a one-line result) and `delta` tokens in the order
they happen, then `done` or `error`. The worker's `emit` callback produces
them; `OpenAIChatModel.complete_stream` assembles streamed tool-call
fragments. Laravel relays the stream (it must read it with Guzzle's
`StreamHandler` over HTTP/1.0: the default curl handler buffers the whole
body, and PHP's dechunk filter holds 8 KB) and saves the finished turn.

## Voice mode and live chat (Studio Talk)

Talk is the customer-facing agent, tried from Studio: one chat, with a voice
button in the message box that opens voice mode, as in Claude.

- **Voice** runs on the LiveKit voice worker, the same one that answers the
  phone. Studio creates a waiting call and a room named `web-…`, signs a
  LiveKit token for the browser, and LiveKit dispatches the worker into the
  room. The worker claims the call with `POST /calls/web` (patiently: 25 s,
  one retry), then runs the identical pipeline: talker + worker, skills,
  knowledge, memory, experts and actions. The worker publishes its tool
  steps (and the front desk's knowledge lookups) on the `agent_activity`
  data topic; the browser reads state from `lk.agent.state` and captions from
  the `lk.transcription` text streams. The call lands in Desk with its
  transcript and summary.
- **Chat** runs through the gateway's `POST /v1/chat/stream`: the first worker
  expert with the customer-facing `chat.txt` prompt, streamed like Ask, saved
  in Desk as a web-chat conversation.

Run the voice worker locally (it needs LIVEKIT_*, DEEPGRAM_API_KEY, a TTS key
such as CARTESIA_API_KEY, an LLM key, APP_LAYER_URL and AGENT_SHARED_SECRET):

```bash
python -m veyra_voice download-files   # once: VAD + turn-detector weights
python -m veyra_voice dev
```

LiveKit plugins must be imported at worker start (`entrypoint.py` does it):
importing one inside a job fails with "Plugins must be registered on the main
thread". The worker is too heavy for Render's free plan; host it on LiveKit
Cloud agents or any machine with ~2 GB RAM. Laravel needs LIVEKIT_URL,
LIVEKIT_API_KEY and LIVEKIT_API_SECRET to sign browser tokens.

In production it runs from `agents/voice/Dockerfile` (arm64 and x86; model
weights baked in, no inbound port). `deploy/voice-worker/setup.sh` installs
or updates it on an Ubuntu VM such as an Oracle Always Free Ampere instance,
with its settings in `/opt/veyra/voice.env` (template alongside the script).

## Proven live (2026-09-27)

With the gateway on the host (`AGENT_GATEWAY_URL=http://host.docker.internal:8100`
on the app), OpenAI `gpt-4o-mini`, and the seeded tenant:

- **Ask**: a Studio message → app push → gateway → the worker searched the
  knowledge base twice in one batch → the model answered from the seeded
  documents → the reply landed on the thread through the contract. 13 s.
- **Automation**: "Run now" on the digest → queued → the claim loop took it
  (the push then got a clean 404: no double run) → `recent_calls`, two
  contact lookups → a real overnight summary on the run's row. 22 s, 3,111
  tokens, steps recorded.
- The first live automation run found a product gap — no tool listed recent
  calls — and a provider difference (`gpt-4o-mini` rejects `reasoning_effort`).
  Both fixed: `GET /calls` + the `recent_calls` built-in, and a model client
  that drops the parameter a provider names in a 400.

Not yet run live: a LiveKit call. The voice worker imports and its pure parts
are tested; a real room needs the LiveKit and Deepgram/ElevenLabs credentials
from the root `.env` and a SIP trunk pointed at a seeded line.

## Environment

| Variable | Meaning |
|---|---|
| `APP_LAYER_URL` | The Laravel app, e.g. `http://app:8080`. |
| `AGENT_SHARED_SECRET` | Same value as on the app layer. |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Any OpenAI-compatible endpoint; else `XAI_API_KEY` and Grok. Per-expert `model` in Studio overrides the worker's. |
| `TALKER_MODEL`, `WORKER_MODEL` | Defaults `grok-3-mini` / `grok-4`. |
| `VOICE_TURN_DETECTOR` | `audio` (default: LiveKit's local `v1-mini` end-of-turn model, in-process) or `text` (the older multilingual transcript model). |
| `VOICE_PREEMPTIVE_TTS` | `1` also synthesises the preemptive draft before the turn is confirmed (faster first audio; discarded drafts are billed). Default off. |
| `GATEWAY_CLAIM_INTERVAL` | Seconds between automation claims; `0` disables the loop. |
| `LIVEKIT_*`, `DEEPGRAM_API_KEY`, `ELEVEN_API_KEY`, `AZURE_SPEECH_KEY/REGION` | Voice only. Azure is used for Urdu, where ElevenLabs Flash has no voice. |

The repo `.env`'s `LLM_MODEL=llama-3.3-70b-versatile` no longer exists at
Groq (404 `model_not_found` on the first live run). Point `LLM_*` somewhere
current.

## Models, providers, tracing

`veyra_harness.models` is the one place a ``provider:model`` reference
(``openai:gpt-4.1-mini``, ``groq:openai/gpt-oss-120b``) becomes a base URL
and a key. Studio stores references on the agent config (`talker_model`,
`worker_model`; an expert's own `model` beats the worker one); the gateway's
`GET /v1/capabilities` reports which providers have keys **and whether the
key works** (a live `/models` call, cached ten minutes), so a dead key shows
as "rejected" in Studio instead of as a call that cannot start. Defaults are
OpenAI `gpt-4o-mini` (talker) and `gpt-4.1-mini` (worker).

Composio actions execute here: the app mirrors a toolkit's tools as actions
carrying `tool_slug` and the `connected_account_id`, and
`veyra_harness.actions.composio_handler` posts to Composio's v3 execute
endpoint with `COMPOSIO_API_KEY` from this layer's env.

Langfuse: set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (and `LANGFUSE_HOST`)
and every delegation and tool call becomes a span, with LiveKit's own spans
joining the same trace on a call.

## Known gaps

- MCP actions answer honestly that they are not connected; the executor is
  the next slice.
- One worker expert per call. Peer routing between several workers is wired
  in the prompt (`peers`) but not in the loop.
- Outbound calling is a 501.
- No Langfuse tracing yet; logs only.

## Voice latency

Every reply logs one line, from LiveKit's per-message metrics:
`voice.turn call=33 turn=2 total=2096ms eou=569 stt=566 llm=890 tts=406`
(end-of-turn decision, transcript, talker time to first token, TTS time to
first audio, and the measured voice-to-voice gap). The same record goes to
the room on the `agent_metrics` topic, and the call's p50/p95 to the app with
`ended`. Measured on 2026-10-02 (laptop in Pakistan, LiveKit India South,
OpenAI and ElevenLabs public APIs): a plain turn is ~1.7–2.3 s, and the floor
is the transcript (~0.5 s) plus OpenAI's first token (~0.7–0.9 s for
gpt-4o-mini, 4.1-mini and 4.1-nano alike) plus first audio (~0.3–0.5 s). A
turn that needs the app (knowledge, a delegation) adds a round trip to it.

Nothing on a call blocks the event loop: model weights, the turn detector's
first load and the TLS context are prepared in `prewarm`; HTTP clients are
built in threads; turn options use 1.8's `turn_handling` (the deprecated
keywords cost a ~0.7 s warning lookup per call).
