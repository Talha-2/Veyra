# Architecture

> Status: **target architecture**, agreed 2026-09-26. This document describes where
> the system is going, not everywhere it is today. Sections marked **(today)**
> describe current code that this plan replaces.

Veyra is two layers and one rule between them:

**The app layer owns all data and never runs AI. The agent layer runs all AI and
owns no data.** Everything that crosses between them goes through one typed HTTP
contract. This is the single load-bearing decision in this document; most of the
rest follows from it.

---

## 1. Why this change

The system today **(today)** is a Next.js app (`apps/web`) covering marketing,
Desk and Studio, a FastAPI server (`apps/server`) that owns the database *and*
the AI, and a single 39 KB LiveKit script (`apps/agent/agent.py`) that is the
whole voice agent. Three problems made this worth rebuilding rather than
extending:

1. **No multitenancy.** All 23 tables in `apps/server/app/db.py` are
   single-tenant — no organization, no ownership, no scoping. Every feature
   built on top of that schema inherits the flaw, and retrofitting tenancy into
   23 tables plus every query is most of a rewrite anyway.
2. **The AI and the data live in the same process.** `apps/server` owns Postgres
   *and* the deep agent *and* telephony. There is no seam to test either side
   against, and the voice agent reaches around the API to read the database.
3. **One agent does the talking and the working.** A single LiveKit agent both
   speaks to the caller and executes workflows. Every tool call is silence on
   the line. This is the problem the talker/worker split exists to solve.

---

## 2. The two layers

```
                                   ┌───────────────────────────────┐
  browser ──────────────────────▶  │   APP LAYER  (PHP / Laravel)  │
                                   │                               │
                                   │   Veyra Desk    Veyra Studio  │
                                   │   ───────────   ───────────   │
                                   │   owns: Postgres, auth,       │
                                   │   tenancy, contacts, inbox,   │
                                   │   tickets, config, billing    │
                                   └───────────────┬───────────────┘
                                                   │  HTTP  (AppSdk contract)
                                                   │  config out · results in
                                   ┌───────────────▼───────────────┐
  PSTN / SIP ──▶ LiveKit ───────▶  │  AGENT LAYER  (Python)        │
                                   │                               │
                                   │   Gateway (FastAPI)           │
                                   │   Voice worker (LiveKit)      │
                                   │     talker ──delegate──▶ worker│
                                   │                               │
                                   │   owns: NO customer data      │
                                   └───────────────────────────────┘
```

**Why this split and not a monolith.** The voice worker is a long-lived process
that must hold a 1.2 s voice-to-voice budget (see [VOICE.md](VOICE.md)); the app
layer is a request/response web app that must hold tenant isolation and an audit
trail. They have opposite failure modes, opposite scaling curves, and opposite
deploy cadences. Sharing a process means the slow one sets the rules.

**The cost, stated plainly.** Two languages, two deploys, and every new field the
agent needs is a change in two repos plus a contract version. That is a real tax.
It is paid because the alternative — a Laravel process trying to hold a WebRTC
session — is not a trade, it is a defect.

### 2.1 The contract

One typed client on each side of one HTTP boundary:

| Direction | Mechanism | Carries |
|---|---|---|
| agent → app | `AppSdk` (Python client, `agent-layer/packages/common/app_sdk/`) | business config, experts, skills, contact lookup, ticket writes, transcripts |
| app → agent | `AgentGateway` (PHP service, `app/Services/Agent/`) | start a call, start a chat run, test a skill, stream a reply |

The full route list, payloads and reliability semantics are in
[docs/agent-contract.md](docs/agent-contract.md).

Rules that keep the seam honest:

- The agent layer **never** opens a database connection to the app layer's
  Postgres. It has its own (threads, checkpoints, run state) and nothing else.
- Every agent-layer call to the app goes through `AppSdk` — never a raw HTTP
  call. This is the rule that makes the contract greppable.
- Every app-layer call to the agent goes through `AgentGateway` — never
  `Http::post()` in a controller.
- The contract is versioned. A breaking change ships as a new route version, not
  as a coordinated deploy.

---

## 3. Repo topology

```
veyra/
├── apps/
│   ├── app-layer/          Laravel 13 + Inertia + React 19 + Postgres   [NEW]
│   │   ├── app/            Models, Controllers, ViewModels, Services
│   │   ├── resources/js/   pages/desk/**  pages/studio/**  components/ui/**
│   │   ├── routes/
│   │   │   ├── desk/       desk route group
│   │   │   └── studio/     studio route group
│   │   └── database/
│   │
│   ├── agent-layer/        Python                                       [EVOLVED]
│   │   ├── gateway/        FastAPI — the front door for the app layer
│   │   ├── agents/voice/   LiveKit worker: talker + worker + harness
│   │   └── packages/common/
│   │       ├── app_sdk/    the ONLY way to reach the app layer
│   │       └── harness/    experts, skills, backends, memory
│   │
│   └── web/                Next.js — marketing site only                [KEPT]
│       └── app/(site)/     landing, platform, pricing, solutions, …
│
├── ARCHITECTURE.md   ← this file
├── PRODUCT.md        product truth: users, positioning, claims
├── DESIGN.md         visual system
└── VOICE.md          the latency/audio/interruption opinions
```

**`apps/web` keeps only `(site)`.** The company site stays on Next.js. On
2026-09-27 the owner replaced the August "neon spectrogram" direction with an
Apple-grade, scroll-animated site in Poppins (DESIGN.md, "The company site";
code in `app/(site)/` and `components/mk/`). Its sign-in and sign-up buttons go
to the Laravel app (`NEXT_PUBLIC_APP_URL`), and its contact and demo forms post
to the app layer's public `POST /api/site/inquiries`. The site no longer calls
`apps/server` at all. `apps/web/app/desk/**` and `apps/web/app/studio/**` are
deleted once their Laravel replacements ship — not before.

**`apps/server` is retired.** Its 19 routers migrate into the app layer as
controllers/services, except the AI pieces (`deep_agent/`, `experts/`, `rag/`),
which migrate into the agent layer. Nothing is deleted until its replacement
passes tests.

---

## 4. App layer — Laravel

Stack, matched to Z360 so the two products share conventions and people:
**Laravel 13 · React 19 · TypeScript · Inertia.js SPA · PostgreSQL · Docker**,
with ShadCN UI restyled to Veyra tokens and Reverb for websockets.

**One divergence, on purpose.** Z360 is on Laravel 12; this app scaffolded on
**13.17**, the current stable. The conventions that matter here — controllers,
Form Requests, Eloquent, observers, Inertia — are unchanged between the two, so
the shared-conventions argument survives, and starting a greenfield app a major
version behind buys nothing. Pin to `^12` instead if cross-repo package parity
turns out to matter more than currency.

### 4.1 Desk and Studio are separate surfaces

This is a requirement, and it is a deliberate divergence from Z360 — there, AI
Studio sits *under Settings* as one more settings page. Here they are two
products in one codebase:

| | **Veyra Desk** | **Veyra Studio** |
|---|---|---|
| Who | agents, support leads, ops | owners, admins, builders |
| Job | work the conversations | build and supervise the agent |
| Route prefix | `/desk/*` | `/studio/*` |
| Routes | `routes/desk/*.php` | `routes/studio/*.php` |
| Pages | `resources/js/pages/desk/**` | `resources/js/pages/studio/**` |
| Layout | `layouts/desk-layout.tsx` | `layouts/studio-layout.tsx` |
| Nav | its own sidebar, its own IA | its own sidebar, its own IA |
| Gate | `access-desk` | `access-studio` |

What "separate" concretely buys and costs:

- A user can hold **one without the other**. A support agent gets Desk and never
  sees Studio; an owner gets both and switches explicitly.
- Neither sidebar ever lists the other's pages. The **only** crossing point is an
  app switcher in the header — one component, `components/app-switcher.tsx`.
- Each surface owns its own density and layout language. Desk is an operator
  tool: dense, keyboard-first, four-pane. Studio is a builder tool: roomier,
  form- and canvas-led.
- They share **primitives, not layouts**: `components/ui/**` (ShadCN, Veyra
  tokens), the design tokens, auth, tenancy, and the models underneath.
- The cost is real — two navs to keep coherent, two layouts to keep in sync, and
  a standing temptation to leak a Studio page into Desk because it was
  convenient. The gate is what prevents that from being silent.

### 4.2 The shared spine

Underneath both surfaces, one core neither owns:

```
app/
├── Models/              Organization, User, Contact, Conversation, …
├── Traits/              BelongsToTenant, HasAvatar, Taggable
├── Scopes/              TenantScope
├── Services/
│   ├── Agent/           AgentGateway — the one door to the agent layer
│   ├── Telephony/       Twilio/Telnyx/LiveKit SIP
│   └── Channels/        email, sms, chat, fax ingestion
└── Enums/
```

`Contact` is the foundational model, as it is in Z360: every conversation,
ticket, call and lead hangs off it, and both surfaces read it.

### 4.3 Multitenancy — new, and the reason the schema is rebuilt

Adopted wholesale from Z360 because it is proven there:

- Every tenant-owned model uses the `BelongsToTenant` trait; `TenantScope`
  filters every query automatically.
- Migrations declare the FK with an `$table->organization()` macro.
- Current tenant: `Organization::current()`. Switching: `$organization->switchTo()`,
  session-based.
- Admin escape hatch is explicit and greppable:
  `Model::withoutGlobalScope(TenantScope::class)`.

Because scoping is a global scope rather than a convention, "forgot to filter by
org" stops being a class of bug that code review has to catch.

### 4.4 Data model migration

The 23 SQLModel tables in `apps/server/app/db.py` map as follows. Every one gains
an `organization_id`.

**Shared spine** — `Organization` *(new)*, `User` *(new, replaces implicit auth)*,
`TeamMember`, `Contact`

**Desk** — `Conversation`, `Call`, `CallTranscript`, `SmsMessage`,
`WebChatMessage`, `EmailMessage`, `FaxMessage`, `Ticket`, `Pipeline`, `Lead`,
`Note`, `Reminder`

**Studio** — `AgentConfig`, `BusinessProfile`, `Folder`, `Document` (knowledge),
`Workflow`, `TelephonyConfig`, `PhoneNumber`, `EvalRun`, `DeepAgentThread`

**New, required by the target agent architecture:**

| Model | Surface | Why |
|---|---|---|
| `Organization` | spine | multitenancy; does not exist today |
| `User` | spine | real accounts with roles and gates |
| `Expert` | Studio | an expert is a *data record* (prompt, tools, skills, model), per the deep-agent harness |
| `Skill` | Studio | replaces `Workflow`/ability; a skill is markdown + optional structure |
| `Delegation` | Desk | one talker→worker handoff, so a call is auditable turn by turn |

`Workflow` and the ability compiler (`apps/server/app/abilities/`) are superseded
by `Skill`. They are kept read-only through one migration cycle so existing
flows can be converted, then dropped.

### 4.5 Conventions

Adopted from Z360's `CLAUDE.md` verbatim, because a shared convention across two
products is worth more than a marginally better one in each:

- **Controllers orchestrate, they don't implement.** Validation in Form Requests
  (`app/Http/Requests/{Feature}/`); complex creation logic in Observers, reached
  through temp properties (`$model->_tags`); index-page queries in ViewModels
  (`app/Http/ViewModels/`).
- **Server state is Inertia props, never `useState`.** `useState` is for modal
  visibility and in-progress form input only. Forms use Inertia's `useForm`.
  Modals are server routes via `@inertiaui/modal-react`.
- **Database logic lives in models and traits**, not controllers.
- **ShadCN first** — install and modify, don't rebuild.

---

## 5. Agent layer — the talker and the worker

One call, two agents, one tool between them. This is ported from the Z360 Voice
V2 front-desk protocol as designed.

```
      caller
        │  speech
        ▼
  ┌───────────────┐   delegate()          ┌──────────────────────────┐
  │    TALKER     │  ── transcript ─────▶ │         WORKER           │
  │  (FrontAgent) │      delta only       │                          │
  │               │                       │   deep-agent harness     │
  │ owns EVERY    │ ◀── plain assistant ──│   experts · skills · MCP │
  │ word the      │      text             │                          │
  │ caller hears  │                       │   owns skills, lookups,  │
  │               │   check_progress()    │   tickets, durable writes│
  │ small fast    │  ──────────────────▶  │                          │
  │ model         │                       │   never speaks           │
  └───────────────┘                       └──────────────────────────┘
```

### 5.1 The split

**The talker** owns every word the caller hears, and nothing else. It runs on a
small fast model because voice answers are three sentences and TTFT is the
budget. It answers from its prompt and the knowledge base directly — only a
request that needs something *done* (booked, written, changed, submitted) is
delegated.

**The worker** owns skills, lookups, tickets, actions and every durable write. It
never renders TTS and never speaks. It returns plain assistant text, which is
**private operational guidance** — the talker speaks naturally from it rather
than reading it out.

**Why the split exists.** In a single agent, every tool call is dead air on the
line. Splitting them means the conversation continues while work happens. The
delegation tool is non-blocking, and that is the whole point.

### 5.2 The `delegate()` protocol

`delegate()` takes **no model-provided arguments**. On invocation it serializes
only the caller-facing conversation since the last delegation:

```
AI: Hello, how can I help?
Human: I need to move my appointment.
```

- System prompts, tools, tool outputs, blank turns and already-delivered turns
  are excluded.
- The cursor advances **when the delegation begins**, so a retry cannot send the
  same caller segment twice.
- The worker keeps its own private history for the call, so each delta *continues*
  the current skill rather than restarting it.
- The worker has no `ask` or `finish` control tools. It runs tools until it
  reaches a caller-visible point, then returns normal text.

**Busy-worker invariant.** After calling `delegate()`, the talker must not call it
again until that call returns. While work is active it may call `check_progress`,
which reports verified steps only — and stays silent if nothing has changed, so a
progress check cannot buy itself another turn. There is deliberately **no queue**
in this first slice; call evidence, not speculation, is what would justify one.

### 5.3 The harness — the worker's brain

The worker is a deep-agent harness, LiveKit-native. Three facts about it that are
easy to get wrong:

1. **An expert is a data record, not an agent.** It carries a system prompt, a
   tool list, skill names, a model and an approval policy. Routing to an expert
   means swapping the prompt and bound tools on the same loop — not spinning up a
   subgraph.
2. **A skill is a markdown file.** YAML frontmatter (`name`, `description`) plus
   imperative prose. Discovery is **progressive disclosure**: the active expert's
   skills appear in the prompt as *name + description + read-hint*, and the model
   reads the body only when it becomes relevant. This is what keeps the context
   small on a per-call budget.
3. **The storage layer is a framework-agnostic seam.** One composite backend
   routes path prefixes to sub-backends — system skills from disk (read-only),
   org skills from S3 (read/write), memory from Postgres, docs from GitHub.
   The voice worker's backend is **read-mostly**: it consumes skills, it does not
   author them.

**No LangGraph inside the voice worker.** No graph, no `LLMAdapter`, no
`get_store()`/`get_runtime()` from the runtime. Those add latency and coupling to
a process whose entire job is to not add latency. Backends are instantiated with
explicit `store=` and `namespace=` arguments, built **once at process level** so
per-call setup never lands on the greeting path.

### 5.4 Reliability invariants

These are not style preferences; each one is a failure that has already happened
on a real call somewhere:

- The worker uses known transcript facts, records and business lookups **before**
  asking the caller for anything.
- The talker **never** promises a ticket, message, callback, booking or team
  follow-up without a completed, worker-confirmed action.
- The worker must *perform* the ticket/message action before reporting the issue
  was handed to the team.
- Worker timeouts, empty responses, tool failures and step-limit exhaustion
  become the talker's safe fallback. They never become a success claim.
- `hangup_call` waits only for a **durable write** in flight — never for ordinary
  reads. A read left running costs nothing once the line is down; refusing to
  hang up on one strands the caller.
- Tool result strings state facts and stop. They never end in an instruction —
  a tool result is recent and answers what the model just did, so it beats the
  system prompt and becomes the behaviour.

### 5.5 Post-call finalization

At shutdown each call gets **one** silent worker pass. It resumes the same private
history, receives only the transcript since the last live delegation, never
speaks, and never creates another delegation.

It may complete a durable action **only** where the caller's values,
verification, prerequisites and explicit consent were already established on the
call. It must not infer what is missing or ask someone who has hung up. A
meaningful unfinished matter instead becomes **one** ticket recording the work
done, the blocked piece, and the team's next action. Purely informational calls
produce nothing.

---

## 6. What is retired

| Retired **(today)** | Replaced by |
|---|---|
| `apps/server/` (FastAPI, owns DB + AI) | app layer (data) + agent layer (AI) |
| `apps/agent/agent.py` (39 KB, one agent) | talker + worker + harness |
| `apps/agent/workflow_engine.py` | skills through the harness |
| `apps/server/app/abilities/` | `Skill` model + markdown skills |
| `apps/web/app/desk/**`, `apps/web/app/studio/**` | Laravel + Inertia pages |
| `db.py` single-tenant schema | Laravel migrations with `BelongsToTenant` |

Nothing is deleted before its replacement passes tests against it.

---

## 7. Build sequence

Ordered so that each phase is independently verifiable and nothing is deleted
early.

| # | Phase | Delivers | Done when |
|---|---|---|---|
| 1 ✅ | **App-layer skeleton** | Laravel 13 + Inertia + Postgres in Docker; `Organization`, `User`, `Membership`, tenancy, auth, gates, both shells | a user signs in, switches org, hits a gated Desk and Studio stub |
| 2 ✅ | **Schema + design system** | all migrations from §4.4; Veyra tokens; 33 models; demo seed | `migrate:fresh --seed` gives a working tenant; both shells render |
| 3 ✅ | **Desk** | inbox (4-pane), contacts, tickets, team | an operator can work a conversation end to end |
| 4 ✅ | **Studio** | overview, ask, identity & languages, voice, experts, skills, automations, knowledge (folders, upload, scrape, search test, chunk viewer), memory, integrations (catalog, MCP, custom HTTP actions), telephony, evals, developer (API keys, webhooks), settings (organization, team & access, ticket types, pipelines, profile, sessions) | an owner can configure an agent and publish a skill |
| 5 ✅ | **Contract** | `AppSdk` (Python) + `AgentGateway` (PHP), versioned — [docs/agent-contract.md](docs/agent-contract.md) | agent layer reads config and writes a ticket, with no DB access |
| 6 ◐ | **Talker/worker** | `FrontAgent`, `Worker`, `delegate()`, `check_progress`, harness, gateway — [apps/agent-layer/README.md](apps/agent-layer/README.md) | a live call delegates, reports progress, and never over-promises |
| 7 | **Finalization + cutover** | post-call pass; `apps/server` and old UI deleted | old surfaces removed, tests green |

Phases 3 and 4 are independent and can run in parallel. Phase 6 depends only on
phase 5, not on Desk or Studio being finished.

**Phases 1–4 are complete** (2026-09-27). Everything lives in `apps/app-layer/`
— see its [README](apps/app-layer/README.md) for how to run it, the seeded
accounts, and the environment traps that cost real time. 37 feature tests cover
tenancy, surface access and every Studio write path; every Desk and Studio page
(39 routes) renders clean in a browser sweep with no console errors or failed
requests.

Two things the Studio tests caught that the browser sweep could not, both now
fixed and both worth knowing about:

- **Route-model binding ran before the tenant middleware.** `SubstituteBindings`
  is in the `web` group; `tenant` is a route middleware, so it ran later. On the
  first request after sign-in a bound `{document}` was resolved with no tenant
  set. `bootstrap/app.php` now puts `tenant` and `surface` ahead of
  `SubstituteBindings` in the middleware priority list.
- **`TenantScope` did not fail closed under PHPUnit** (the test runner is a
  console process), so a cross-tenant read looked like a pass. It now fails
  closed whenever `runningUnitTests()` is true.

**Phase 5 is complete** (2026-09-27). The contract is 22 routes under
`/api/agent/v1` ([docs/agent-contract.md](docs/agent-contract.md)), a Python
`AppSdk` in `apps/agent-layer/packages/common/app_sdk/`, and a PHP
`AgentGateway`. Proven three ways: 19 PHP feature tests against the routes, 18
Python tests against a fake app with the same payloads, and a live probe that
ran the whole call lifecycle through the real SDK against the dev container —
inbound call, skill read, knowledge search, delegation, tool call with an
idempotency key, ticket, transcript, hang-up. Two things the live probe caught
that neither test suite could: PHP encodes an empty map as a JSON list (fixed
on both sides), and the greeting-path route took 6 s on this machine because
of per-file stats over the bind mount (fixed in `docker/php.ini`; see the
app-layer README).

The reliability rules of §5.4 now have server-side teeth. A tool call is
recorded *before* it runs; a retry with the same idempotency key gets the
earlier record back and reconciles instead of re-running. A delegation sequence
sent twice is a 409. Closing a delegation returns `completed_durable_write`,
computed from the audit trail, and that is what the talker is allowed to
confirm from. Ask and Automations now go through `AgentGateway` and say
honestly when no agent layer is connected; queued automation runs are claimed
by the agent's pull loop so a failed push loses nothing.

**Phase 6 is built and proven on text; the live LiveKit call is the one
thing not yet exercised** (2026-09-27). The harness in
`apps/agent-layer/packages/common/veyra_harness/` is the Z360 front-desk
worker ported onto Veyra's seams: a `ChatModel` protocol instead of a LiveKit
LLM, `Tool` objects whose reliability flags come from Studio instead of a
name heuristic, and an `ActionExecutor` that records every call through the
contract before it runs. The worker is a plain loop, so the same code serves
a call, an Ask thread and an automation; the gateway (`veyra_gateway`) hosts
the last two plus the claim loop. The talker (`veyra_voice.front_desk`) is the
LiveKit `Agent` with `delegate` / `check_progress` / `hangup_call`, and
`veyra_voice.pipeline` decides STT, TTS and turn detection per language from
the capability table — Urdu gets monolingual Nova-3, Azure ur-PK and VAD-only
endpointing, exactly as Studio warned it would.

69 Python tests cover it without the network. Two live runs through the real
app, gateway and OpenAI proved the text hosts end to end (see the agent-layer
README), and found two things no test could: the digest automation had no
tool to list calls (added `GET /calls` and `recent_calls`), and one provider
rejects `reasoning_effort` (the client now adapts). Studio gained a "Try it"
panel on every skill that runs a dry run through the gateway.

**Providers wired to the real keys** (2026-09-27, later the same day). The
root `.env` was probed: Composio, Cartesia, Deepgram, Groq, OpenAI, Langfuse
and LiveKit answer; xAI and ElevenLabs reject their keys; LiveKit has no SIP
trunk yet. What that produced: Studio › Voice lists Cartesia's 329 usable
voices with real, cached previews in the agent's language; Studio ›
Integrations browses Composio's live catalog, mirrors the chosen tools as
actions and runs the OAuth link (proven live to the sign-in page and back);
Studio › Identity has a Models section fed by the gateway, which verifies
each key; the agent layer executes Composio tools and traces to Langfuse;
Desk gained a Calls page whose "Needs review" view lists calls where a
durable action timed out, with the transcript, every handoff and every tool
call underneath. One finding corrected a hope: Cartesia lists Urdu voices but
rejects Urdu synthesis, so Urdu stays on Azure ([docs/urdu-support.md](docs/urdu-support.md)).

Decision taken: **port `front_desk/`**, not evolve `apps/agent/agent.py`,
as recommended. What carried over from the old agent is only the pipeline
plumbing (SIP number detection, metrics publishing, the TTS scrubber).

**What was rebuilt from the old FastAPI server, and what changed.** The old
server's "Experts" were scheduled/webhook/manual jobs; those are now
**Automations** (`/studio/automations`), and "Expert" means the harness
talker/worker record. Composio integrations, MCP servers and custom HTTP actions
are all under `/studio/integrations`; the catalog is a curated stub until
`COMPOSIO_API_KEY` is set, and the page says so. Knowledge chunking is one
definition on `Document::reindex()` used by the controller and the seeders, so
the search test shows what the demo data actually has.

---

## 8. Open risks

1. **Contract churn.** Phases 3–4 and 6 will both want to change the contract.
   Mitigation: version it from the first commit; never coordinate deploys.
2. **Skill execution model.** Freeform markdown skills are what the harness
   assumes, but a small fast voice model in an ungated loop has a documented
   history of degenerating — repetition, out-of-step tool calls, empty
   completions. The worker runs on a larger model than the talker, which removes
   most of that exposure; if a skill still needs step-gating, it carries
   structure and runs gated. Decide **per skill**, not globally.
3. **Migrating existing workflows to skills.** No automated path exists. Budget
   conversion as real work in phase 4.
4. **Two navs drifting.** The app switcher and the gates are the only things
   holding Desk and Studio apart. Review any change that adds a cross-surface
   link.
5. **Urdu is not a translation task.** Each layer of the voice pipeline answers
   differently, and one of them — semantic turn detection — has no Urdu answer
   at all. [docs/urdu-support.md](docs/urdu-support.md) is the matrix and the
   consequences; the short version is that Urdu costs a different TTS vendor, a
   monolingual STT model that breaks on Urdu–English code-switching, and a
   degraded endpointing experience until a transliteration experiment says
   otherwise. It must not be marketed under the published "42+ languages" figure.
