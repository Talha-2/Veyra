# Skills-first agent architecture

Approved direction: user requested specification, plan, then staged implementation on 2026-10-12. Execute inline without additional design approval. No commits, pushes or deployment are requested.

## Outcome

The platform must handle conversations through a built-in taker and worker even when a company has no Experts. Shared skills supply the procedures. Experts are optional company-created dedicated agents, with private skills that the main architecture cannot read. An Expert can also use enabled shared skills.

## Boundaries

- Taker: owns customer conversation, collects missing information, delegates, checks progress, and reports verified outcomes. It does not become an Expert.
- Worker: executes shared skills and permitted actions, returns questions and results, and can delegate a specialist task. It does not depend on an Expert row or change its identity to obtain private skills.
- Expert: separate bounded execution with its own prompt, tools, model, history and skill gate. Receives the task and necessary context, not the parent's entire private history. Its results return to the worker. Experts cannot recursively delegate in the first release.
- Shared skill: existing skill document, enabled state, version and prose/step-gated execution. All existing skills remain shared during migration.
- Private skill: one explicit Expert owner. Its body and catalog metadata are inaccessible through core runtime skill endpoints. Ownership is enforced by the application API and worker tool binding, not prompt instructions.
- Actions: existing permissions, customer scoping, approvals, write idempotency and tenant separation remain authoritative. Reading a skill never grants extra action permissions.

## Skill ownership and lifecycle

Add `skills.private_expert_id`, nullable, with a restrictive foreign key. Null means shared. An owner must belong to the current organization and be a company-created Expert. Built-in taker/worker rows cannot own new private skills.

Studio displays the audience and owner on lists and detail pages. Creating a private skill requires choosing its owner. Changing ownership or sharing is explicit; when private, remove incompatible Expert pivot grants in one transaction and attach its owner. Reject another Expert attaching that skill, including forged IDs. An Expert with retained private skills cannot be deleted until those skills are reassigned or made shared. Soft-deleted private skills still retain an owner, preventing accidental disclosure after restoration. The owner page lists deleted private skills and offers tenant-safe restoration, so the team can recover them and resolve ownership before deleting an Expert.

The core `/skills` index, `/skills/{slug}` read and tenant context shared skill catalog exclude private skills. They return 404 for guessed private slugs. Dedicated Expert endpoints later expose enabled shared skills plus that Expert's own enabled private skills; a caller-provided prompt or tool argument cannot set execution identity.

## Runtime migration

Implementation status (2026-10-12): the app now emits `architecture: "skills-first"` with independent `core.taker` / `core.worker` definitions. Existing built-in prompts, models and grants are copied once into AgentConfig without deleting the source profiles. Custom Experts remain optional and do not select default roles. SDK/harness retain support for unflagged legacy bundles; deploy the updated app and agent layer together when rolling out the new architecture.

Keep the current v1 contract during the first ownership stage. Do not expose private skills to the legacy persona-switching harness: its shared history and gate do not meet the new isolation contract. Studio may author private skills now, with a clear explanation that execution awaits the dedicated Expert runtime stage.

Migration rule: keep old Expert records, skill documents and run history intact. Copy known built-in role settings once, including owner edits, without rewriting their source profiles. Preserve custom configurations as optional Experts or legacy profiles rather than silently mapping them to a core role. Default worker selection must not depend on Expert order. New organizations must not need seeded Expert rows.

The following approved stages are now implemented: core shared-skill voice/Ask/automation/skill execution without Experts; a chat taker that delegates to a separate core worker; optional specialist delegation using separate SDK/history/gate/executor; Expert-owned private skill reads and dry-run tests; Studio runtime configuration and optional Expert authoring. Skill reads and gated advances recheck current access; changed/revoked gates are invalidated. Core audit Expert identity is null, avoiding collisions with company slugs. Failed outcomes retain confirmed-write evidence. Full persistent task lifecycle/dashboard work remains a later stage.

Voice keeps LiveKit turn taking and existing delegate/check-progress behavior. Chat, Ask, automation and skill tests use the same shared-skill access rules. Specialist tasks use a separate execution context; a private skill cannot be accessed by the main worker through a guessed slug, cached document or persona switch.

## Delegation and supervision

Task lifecycle: queued, running, waiting for information, waiting for approval, completed, failed, timed out, cancelled. Task ID, parent ID, runtime role, optional Expert identity, executed skill version, confirmed actions and timestamps accompany progress. Duplicate delegation is coalesced; writes retain idempotency. Cancellation must not announce rollback of a completed write. Taker reports results only after confirmation, and can explain a blocked task without fabricating completion.

## Studio experience

Skills list: readable full descriptions, search, execution-mode and audience filters, explicit enabled state and ownership; meaningful filtered empty state. Creation uses a side panel with audience/owner selection. Detail editor uses wider reading space, visible audience, version and test context. Experts list becomes optional specialists, with core configuration separate once migrated. Its detail page distinguishes shared skills from owned private skills and permitted actions; no misleading primary-worker designation after migration.

## Delivery sequence

1. Skill ownership and Studio visibility: independently tested additive migration, core API exclusions, tenant-safe assignment and readable authoring. Private execution explicitly unavailable on the legacy runtime.
2. Core taker/worker contract and configuration: no Experts required; shared skill execution on voice/chat/Ask/automation/tests, migration compatibility and no regressions in approvals.
3. Dedicated Expert delegation: isolated history/gate/SDK, authorized shared-plus-owned-private reads, bounded specialist execution and cancellation.
4. Progress supervision and Studio runtime UI: recorded lifecycle and taker progress checks, optional specialist authoring, meaningful run evidence.
5. Desk workflow improvements: prioritize complete patient journeys; no decorative features without persisted behavior and usable next actions.

## Verification

Stage 1: existing data stays shared; core indexes, context and direct reads deny private content; cross-tenant owners rejected; other Experts cannot attach; deletion preserves private ownership; Studio ownership creation/update persists and is readable on desktop/mobile. Run Laravel suite, PHP formatting, frontend types/build and browser checks.

Later stages: run with zero Experts, verified shared skill actions, independent specialist history/gate/cache, guessed-private denial on all surfaces, approval and retry handling, structured progress, timeout/cancellation and migration fixtures. No live voice/model/provider claim without an actual configured integration run.
