# Architecture Pivot — One Agent Harness, API-First Studio, Optional CRM

August 2026 · Decision record + build sequence · Written against a three-way code audit (agent runtimes, Studio↔Desk coupling, model config)

## Why

Two forcing functions. First, the product is applying to incubation programs (NSTP / NIC) — evaluators must be able to *interact* with it: text a number and watch an agent work, chat with it in a browser, see it operate the CRM. Second, the founder's product thesis has sharpened: **agents are prompt + description + goal, woken by product events** — not visual node graphs — and **Studio must stand alone as a developer platform** (create agents, use them in your own product via API), with the native CRM as the tightly-integrated option, not a requirement.

## What the audit found (the short version)

The target architecture half-exists, in disconnected pieces:

- **The unified agent record already exists.** `Expert` (apps/server/app/experts/models.py) is already `system_prompt + description + goal + allowed_tools + triggers + status`, with run history, a scheduler, external webhook triggers, Composio app-event triggers, and a public `/v1/agents` surface that already calls it an agent.
- **The LangGraph harness already exists** (`deep_agent/builder.py` on `deepagents`: subagents, todos, approval interrupts, SSE streaming with a polished UI) — but it only serves the Studio builder copilot, with hardcoded `openai:gpt-4.1` and a non-durable `MemorySaver`.
- **Five separate agent runtimes** run in parallel (experts loop, deepagents, a dead legacy harness, the LiveKit voice worker, eval simulators). Only voice and the builder are strong; every *triggered* run lands in the weakest one.
- **There is no internal event bus.** Inbound SMS/email/calls can notify third-party webhooks but cannot wake an agent. The one existing trigger→agent path (Composio app events) is the template to generalize.
- **Studio is already ~90% Desk-independent** — the agent core has zero Desk imports. Three couplings remain: `TeamMember` for call transfer targets, an unconditional Desk write on the app-event path, and demo CRM data force-seeded on every boot.
- **Not ship-ready for external developers**: studio `/api/*` routes have no server-side auth (anyone reaching the server can mint an API key), `/v1` ignores scopes and workspaces (hard single-tenant), `/v1/calls` can't select an agent, and the "live chat" channel claimed on the marketing site does not exist in the product.
- **Model-agnostic in one place only**: the Studio LLM picker affects phone calls; four duplicated server-side resolvers and two hardcoded consumers ignore it. Provider API keys round-trip to the browser in plaintext.
- **An MCP server already exists** (`apps/mcp/server.py`, ~40 tools over the whole platform) — unauthenticated, pointed at internal routes.

## The decisions

**D1 — `Expert` is the one agent.** No new model. Voice, chat, and triggered work all describe themselves as an Expert (prompt, description, goal, tools, triggers, reasoning depth). The name shown to users can become "Agent"; the table stays.

**D2 — One execution harness: LangGraph/deepagents.** `deep_agent/builder.py` becomes a *factory*: `build_agent(expert) → compiled graph` (prompt/goal/tools from the Expert record), with a Postgres checkpointer (the `DATABASE_URL` groundwork is already live). All five entry points (manual run, cron, external webhook, app events, `/v1` runs — and the new event triggers) converge on it. The hand-rolled experts loop and the dead legacy harness retire. The builder copilot becomes just one specially-configured agent on the same harness.

**D3 — Voice unifies by contract, not by execution.** Real-time turn-taking stays in the LiveKit worker. The worker consumes a **compiled agent definition** endpoint (prompt + tool manifest + guardrails compiled from the same Expert) instead of today's five-fetch string concatenation. One agent definition, two runtimes.

**D4 — Internal event bus, and triggers become the product's spine.** A single `events.publish(type, payload)` seam: every product moment (message received, email received, call ended, lead created, ticket created, fax received) publishes once and fans out twice — to outbound developer webhooks (existing, unchanged) and to **subscribed agents** (new). Agents subscribe via their existing trigger config (`trigger_meta_json` carries the event-type list). `run.*` events never wake agents (loop safety). The toolless 160-token SMS `_autoreply` retires in favor of a real triggered agent with tools and thread memory.

**D5 — Workflow node graphs are demoted, not deleted.** The prompt+goal+trigger agent becomes the primary authoring model. But Abilities carry safety machinery agents lack — versioning + rollback, deploy gates on compile errors, per-flow tool scoping (which is what keeps voice calls inside token budget), verbatim scripted lines, structured variable extraction. Those port onto the unified agent (versioned agent snapshots, a pre-flight check, declared tool sets) **before** the canvas is retired from the primary path; until then it remains as the "advanced" mode.

**D6 — Studio stands alone; Desk is the first-party consumer.** The three couplings get cut: transfer targets move behind a routing interface with a Desk-backed implementation, the app-event Desk write becomes subscription-driven, and demo seeding goes behind `SEED_DEMO` (default on for now — the demo matters — off for developer deployments). Desk itself becomes the flagship *subscriber* of the event bus: the CRM where you watch agents work.

**D7 — Developer platform hardening order**: server-side auth on studio routes → scope + workspace enforcement on `/v1` → agent-bound calls (`POST /v1/calls {agent_id}`) → `/v1` chat endpoint + embeddable widget (the publishable `z360_pk_live_` key with its reserved `widget` scope finally gets a consumer) → real multi-tenancy (the largest single work item; `workspace` columns exist, zero queries filter on them). Full tenancy is post-demo, pre-external-customers.

**D8 — Model-agnostic through one resolver.** One config-first model resolver (DB → env → default) used by *every* LLM consumer; the four duplicates collapse. A per-surface model matrix (voice / builder / triggered agents / judge) replaces the single global blob. Provider keys move to a write-only credential store — never returned to the browser again. Anthropic gets a first-class adapter (everything today assumes OpenAI-compatible `/chat/completions`; LangChain gives this nearly free on the unified harness).

**D9 — The product chatbot is the same stack eating itself.** The existing SSE protocol + the studio chat renderer + an Expert running on the unified harness + the widget key = the site chatbot and the embeddable developer widget are one artifact. Web chat becomes a real inbox channel (a `webchat` timeline kind keyed by visitor session) so the demo closes the loop: visitor chats on the site → agent answers → thread appears in Desk.

## Build sequence (each phase ends demoable)

| Phase | Delivers | Why this order |
|---|---|---|
| **1. Event bus + triggers** | `events.py`, emit points at every product moment, agents subscribed by event type, Studio trigger UI, SMS autoreply → triggered agent | The pivot's spine; the strongest instant demo ("text this number, watch the agent work the CRM") |
| **2. Unified harness** | `build_agent(expert)` factory on deepagents, Postgres checkpointer, all entry points repointed, single model resolver (D8) | Makes every triggered run as capable as the builder copilot; model-agnostic falls out |
| **3. Chat channel + chatbot** | `/v1` chat endpoint (pk key), embeddable widget, `webchat` inbox channel, site chatbot | Judges interact in the browser; kills the biggest marketing-vs-product gap |
| **4. Studio hardening** | Studio route auth, scope/workspace enforcement, agent-bound `/v1/calls`, SEED flag, coupling cuts (D6) | Required before any external developer; after 1–3 because the demo comes first |
| **5. Voice contract** | Compiled agent-definition endpoint; worker consumes it | Voice joins the unified model without a risky rewrite |
| **6. Tenancy** | Workspace scoping everywhere | The "developers on their own platforms" unlock; biggest item, last |

## Fix-now list (small, found during audit)

- `deep_agent/builder.py:174` sends `{"message": …}` to an endpoint expecting `{"input": …}` — every builder test-run executes the expert with empty input, silently.
- `EVENT_TYPES` in `routers/developer.py` disagrees with reality in both directions (three emitted events unsubscribable, one advertised event never emitted) — becomes the single catalog in `events.py`.
- `full_access: bool = True` auto-approves `ability_deploy` in the builder — flip the default when the approval UI is verified.
- `langgraph` is imported directly but only pinned transitively via `deepagents`.
- Expert tool kind `"mcp"` is documented but unimplemented in `_build_tools`.
- Dead `deep_agent/agent.py` harness (`/api/deep-agent/chat`, no callers) — retire after `evals/simulator.py` stops importing from its tools module.
