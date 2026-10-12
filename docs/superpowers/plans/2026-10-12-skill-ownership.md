# Skill Ownership Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. User explicitly authorized writing and executing the plan. A fresh reviewer checks this stage at the end.

**Goal:** Deliver the first architecture stage: tenant-safe shared/private skill ownership and readable Studio authoring without exposing private skills to the legacy runtime.

**Architecture:** Add a nullable Expert owner to skills, retain all existing skills as shared, and enforce the distinction at API and assignment boundaries. The legacy runtime receives shared skills only until dedicated Expert execution is implemented.

**Tech Stack:** Laravel 13/PHP 8.5, Inertia 3/React 19, existing Python AppSdk/harness unchanged in this stage.

**Spec:** `docs/superpowers/specs/2026-10-12-skills-first-agent-design.md`

## Global Constraints

- No commits, pushes or deployment are requested.
- All existing skills remain shared during migration.
- Built-in taker/worker rows cannot own new private skills.
- Private execution explicitly unavailable on the legacy runtime.
- Existing permissions, customer scoping, approvals, write idempotency and tenant separation remain authoritative.
- No dependencies added; preserve the attached worktree and original checkout.

## Review Focus

- A guessed private slug must return 404, including disabled/deleted owners and different tenants.
- Forged owner/skill IDs must not cross tenants or let another Expert gain access.
- A private skill converted from shared must remove earlier incompatible pivot grants atomically.
- Deleting an Expert must not implicitly make retained private skills shared.
- Filtered empty states and validation errors must remain usable on small screens.

### Task 1: Ownership and core runtime read boundary

**Files:** migration adding `skills.private_expert_id`; `Models/Skill.php`; `Api/Agent/SkillController.php`; `Services/Agent/CallContextBuilder.php`; `tests/Feature/SkillOwnershipTest.php`.

**Interfaces:** `Skill::scopeShared(Builder $query): void`; `Skill::privateExpert(): BelongsTo`; `private_expert_id: int|null`. Core APIs and tenant context contain shared skills only. Legacy Expert catalog also excludes private skills.

- [x] Write HTTP regression tests for existing shared reads, private index/context exclusion, guessed direct read 404 and other-tenant isolation. Reproduce disclosure by requesting a private owner through the existing Studio API: the owner was ignored and the core index exposed the new skill.
- [x] Run focused test and inspect expected failing private exclusion.
- [x] Generate migration with Artisan; add restrictive owner FK, fillable/casts/relation/shared scope and apply scope to core reads/context and legacy Expert catalog.
- [x] Run focused tests and confirm all pass.

### Task 2: Tenant-safe Studio ownership lifecycle

**Files:** `Studio/SkillController.php`; `Studio/ExpertController.php`; `tests/Feature/SkillOwnershipTest.php`.

**Interfaces:** Studio store/update accepts `private_expert_id: int|null`; index/show exposes `private_expert: {id,name}|null`; `private_experts` lists only current-tenant non-built-in Experts. Expert assignment accepts shared skills or its own private skills. Expert deletion returns a useful validation error while owned skills exist, including trashed skills.

- [x] Add failing tests: foreign/built-in owner rejected; private creation persisted; converting shared removes other grants; wrong Expert assignment rejected; owner deletion refused; sharing clears owner and enables core read.
- [x] Run focused tests and confirm expected failures.
- [x] Implement request validation with explicitly tenant-bound exists rules; transactionally update ownership/pivots; filter attachable skills; block owner deletion. Add tenant-safe restore recovery for deleted private skills after review identified an inaccessible ownership trap.
- [x] Run focused and existing Experts/skill tests; inspect results.

### Task 3: Readable Studio skills authoring

**Files:** `resources/js/pages/studio/skills.tsx`; `skill.tsx`; existing SideBar and StudioLayout components reused.

**Interfaces:** consume Task 2 ownership props; preserve current execution modes, versioning, saved skill test and form behavior. Audience filter values `all`, `shared`, `private`.

- [x] Inspect existing layout, token and editor patterns; implement wider list/detail layouts, readable descriptions and audience badges/filter, meaningful no-match state, side-panel creation and owner selection.
- [x] Show explicit legacy-runtime private-execution notice on private skills. Save ownership changes through the existing form and display validation errors; prevent dismissal during submission.
- [x] Run `npx tsc --noEmit`, `npm run build`, PHP formatting, full `artisan test --compact` and `git diff --check`. Final full suite: 313 tests / 2729 assertions passed with builds quiescent. Existing optional-font/font-resolution and Talk chunk build warnings remain.
- [ ] Browser check desktop/mobile list, audience filtering, private creation and ownership save. Browser tooling cannot initialize (kernel asset path failure, including after reset); live visual verification remains pending. Direct core-read denial and ownership journeys are covered by HTTP tests. Fresh stage review completed and its lifecycle finding fixed and independently verified.
- [x] Record verified results and remaining runtime stages. Do not claim the complete architecture is implemented.

## Following plans

Stage 2 will implement core runtime independence; Stage 3 isolated Expert execution and private reads; Stage 4 lifecycle supervision and Studio Experts redesign. They consume `private_expert_id` and the shared scope from this stage. Keep those stages pending until their implementation and tests are complete.
