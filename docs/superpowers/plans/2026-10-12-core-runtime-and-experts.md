# Core Runtime and Optional Experts Implementation Plan

> **For agentic workers:** Execute the approved design in this session. Use test-driven-development for behavior changes and a fresh final review. Independent PHP, Python and Studio write surfaces may run in parallel under fixed interfaces. No commits, pushes or deployment.

**Goal:** Run core conversation and operational agents on shared skills with zero Experts, and execute optional Experts in isolated contexts with shared plus owned-private skills.

**Architecture:** Core runtime configuration lives with AgentConfig, not Expert records. The v1 tenant bundle adds `architecture: "skills-first"` and `core.taker` / `core.worker` runtime definitions. Experts are optional descriptors; their execution definition is fetched through a separately scoped SDK when delegated. Existing Expert records survive migration; built-in profiles cease controlling default runtime selection.

**Tech Stack:** Laravel 13/PHP 8.5, existing Python 3.12 AppSdk/harness/LiveKit gateway, React 19/Inertia 3.

**Spec:** `docs/superpowers/specs/2026-10-12-skills-first-agent-design.md`

## Global constraints

- Shared skill reads retain tenant scoping and exclude private skills.
- No Expert is required, implicitly selected as primary or used to change the core identity.
- Expert execution has its own SDK identity, skill cache, history, gate and executor; no parent transcript/tool history is copied wholesale.
- Reading a skill does not grant an action. Preserve action approval, idempotency, disabled state, customer scoping and dry-run behavior.
- New organizations do not seed taker/worker Expert rows. Preserve historical records and owner-edited settings.
- No dependencies added; no external deployment or live credentials changed.

## Review focus

- Zero Experts and disabled Experts must not stop the core shared skill workflow.
- Forged skill slugs, stale caches, another Expert and cross-tenant IDs must not disclose private instructions.
- A specialist must not gain unassigned actions or weaken automation action limits.
- Cancellation/timeout and awaiting approval must not be reported as a completed write.
- Legacy prompts/tools must remain recoverable without selecting a custom Expert as the new default.

## Contract fixed before parallel execution

`RuntimeDefinition`: `{slug,name,description,runtime,system_prompt,model,reasoning_effort,skills,tools,peers}`; skills/tool schemas retain v1 shapes. Core slugs are `core-taker` and `core-worker`; roles are `talker` and `worker` respectively. Taker has no durable actions. Core worker's enabled explicit grants come from `advanced.core_action_ids`; default safe internal grants come from StarterAgent catalog. Shared skills are always discovered without Expert pivot assignments.

`advanced` settings: `core_taker_prompt`, `core_worker_prompt`, `core_worker_reasoning_effort`, `core_action_ids`, `core_initialized`; existing `talker_model` and `worker_model` remain core model settings. Copy existing built-in profile settings once into core config if no core value exists; keep source records unchanged. Custom profiles are not silently mapped; show preserved legacy profiles in Studio.

Tenant context's `experts` contains enabled non-built-in worker/text descriptors only, with empty tools/skills/prompts; no private metadata. `GET /experts/{expert:slug}/execution` returns `{expert: RuntimeDefinition}` with assigned enabled actions and enabled shared + owned-private skills. `GET /experts/{expert:slug}/skills` and `/skills/{skill:slug}` are separately scoped to that Expert and require it enabled/non-built-in and in the tenant. Generic `/skills` never accepts an Expert argument.

Studio `GET/PATCH /studio/runtime`: props `{runtime:{taker_prompt,worker_prompt,taker_model,worker_model,worker_reasoning_effort,action_ids},all_actions:[{id,name,description,kind,durable}],legacy_profiles:[{id,name,runtime}]}`. Prompts max 20000, model refs max 120 and existing provider:model regex, effort null/low/medium/high; action IDs tenant-bound. New runtime page linked in Studio nav. Experts index props `{experts,runtimes,legacy_experts}` excludes built-in/talker profiles from optional experts and reports no primary.

Private skill test: AppGateway POST `/v1/skills/test` adds optional `expert` slug derived by PHP from the skill owner, never chosen by a customer. TextRunner rejects a private slug on the generic SDK, obtains the owner's definition for an explicit Expert dry run and returns steps/results. Studio removes the Stage 1 execution-pending notice once this path works.

## Task 1: PHP core config and Expert execution boundary

Owner: PHP backend only, including PHP tests and routes; no JavaScript or Python edits.

- [x] RED HTTP tests for no-Expert core context and preserved built-in settings, shared discovery, optional descriptor privacy, correct Expert own/shared reads, denied sibling/private/disabled/built-in/foreign reads, tenant-safe core action settings and private test owner payload.
- [x] Implement core configuration service and Studio runtime controller; stop context-time Expert provisioning, update StarterAgent to create core config/actions without Experts; add fixed contract and separately scoped Expert endpoints.
- [x] Preserve legacy records; update tests whose requirements deliberately changed (Expert-primary/default behavior), retain all other regression coverage.
- [x] Focused PHP tests pass. Defer full suite/build until integration quiescent.

## Task 2: SDK and independent core runtime

Owner: root, Python files and Python tests only.

- [x] RED SDK scope/cache tests and scripted-model zero-Expert shared-skill execution on voice/chat/Ask/automation/test surfaces.
- [x] Add RuntimeDefinition/CoreRuntime models and skills-first context validation while retaining legacy bundle compatibility for old fixtures. Implement SDK `for_expert(slug)`, definition/skill endpoints, identity reset on tenant rebinding and read reauthorization (no stale-cache bypass).
- [x] Assemble exactly one core worker persona with explicit permitted tools and shared catalog. Voice taker uses core profile and shared skill discovery; chat taker delegates to separate core worker. Ask/automation/skill tests retain their surface policies. No `switch_expert` on skills-first runs.
- [x] Verify core runtime works with zero Experts; optional Experts cannot change default prompt/model/actions.

## Task 3: Isolated optional Expert delegation

Owner: root, new harness delegation module, worker/executor hooks and Python tests.

- [x] RED scripted-model integration: specialist receives only task/context, can read shared + own-private skill, has isolated gate/history/cache, cannot read sibling private skill, gets no ungranted tools, cannot recursively delegate, and returns verified results to unchanged core persona.
- [x] Build `delegate_expert` as a bounded isolated child execution; root does not switch personas. Deduplicate identical work within a parent turn; preserve child continuation within its own definition, rebuild on definition/permission changes. Child audit rows retain call/customer/parent delegation and actual Expert identity.
- [x] Aggregate child write-in-flight/progress/token evidence, retain cancellation and dry-run protection, preserve parent write confirmation from child audit results. Automation does not gain specialist tools.
- [x] Enable explicit private skill dry runs through scoped Expert definition and gateway request. Verify timeout/cancel/approval failures do not claim success.

## Task 4: Studio core and optional specialists UX

Owner: Studio frontend only.

- [x] Build readable wide `/studio/runtime` page for taker/worker instructions/models/actions, using fixed Task 1 props/routes; show preserved legacy profiles separately.
- [x] Redesign Experts list/create/detail as optional specialists with their owned-private and shared skills, full descriptions, search/status filters, creation sidebar, clear validation/loading/empty states. No primary-worker claims or required Expert empty-state messages.
- [x] Remove Stage 1 private-execution pending UI; show private skill tests only when owner is enabled and gateway available. Existing ownership, restore and sharing controls remain.
- [x] Typecheck/build passed; browser initialization was attempted and failed with kernel asset path error. Live desktop/mobile visual QA remains unverified.

## Task 5: Integration, review and handoff

- [x] Run all Python tests with existing workspace venv; PHP formatting then full suite with build quiescent; typecheck/build, diff check and fresh focused independent review.
- [x] Fix material review findings with focused RED/GREEN evidence, rerun affected/broad checks as necessary.
- [x] Update architecture/contract and progress ledger with actual verified behavior and remaining lifecycle dashboard work. Keep local preview available. No production-ready/live-voice claims without configured external runs.
