# Execution ledger — plan: 2026-10-11-healthcare-first-release.md

Execution: native, approved 2026-10-11. Workspace: codex/healthcare-desk.
Original checkout and its user-owned edits are preserved.

Pre-flight: Tasks 1/2 share PatientRegistry; Tasks 3/4/5 share Provider and
AvailabilityService; Tasks 5/6/7 share BookingService. Interface order is coherent.
Ruling: use the native managed worktree and portable PHP if Docker cannot start.
Ruling: no commits, pushes or deployments; preserve changes for review.
Ruling: testing fixtures use synthetic records in isolated databases.

Task 1: in progress — preparing runtime and patient registration tests.
Task 1: registration RED (missing PatientRegistry) -> GREEN (9 tests, 19 assertions).
Baseline: existing TenancyTest passed 7 tests after setting an isolated APP_KEY.
Ruling: use withoutVite for healthcare HTTP tests; asset build verified separately.
Task 2: RED missing routes verified; patient directory/profile implemented; verification in progress.
Tasks 1–7: implemented. Healthcare behavior suite: 46 passing tests.
Task 8: integrated verification in progress.
Full Laravel suite: 201 tests passed (isolated APP_KEY and SQLite environment).
PostgreSQL: 3 independent-process race tests passed, 15 assertions.
Frontend: type check and Vite build passed.
Ruling: activate scheduling built-ins only when healthcare_enabled is true;
preserves non-healthcare experts' existing tool sets and action isolation.
Ruling: provider rule changes are conservatively refused while future bookings
exist; names and qualifications remain editable.
UI first inspection: corrected existing button/field class names and widened
week columns. Mobile agenda and booking form remain responsive.
Independent review: 8 Important findings, 2 Minor findings. One fix pass.
Final: fixed approval origin loss — trusted conversation persisted in audit
records, separately dispatched to the gateway, stable approval idempotency key;
PHP and gateway approval regression tests RED -> GREEN.
Final: fixed uncertain HTTP write classification — read timeout now remains
timeout/unconfirmed in the audit; regression RED -> GREEN.
Final: fixed fallback and automatic-tool policy bypasses — healthcare capability,
disabled actions and global scheduling approval policy applied consistently;
assembly regressions RED -> GREEN.
Final: fixed empty-country validation — field error replaces DB constraint
failure; regression RED -> GREEN.
Final: fixed notice/horizon being applied to existing bookings on hours edits;
regression RED -> GREEN.
Final: fixed partial-range long-service conflict envelope; regression RED -> GREEN.
Final: fixed cross-location calendar weekday/time conversion into display
timezone; regression RED -> GREEN.
Final: Ruling: re-grade unnamed-contact patient registration as Important,
because the spec requires patient name; refuse until staff records the name.
Regression RED -> GREEN.
Final: minor (deferred): equivalent integer/string ID representations with one
idempotency key are conservatively rejected; ordinary same-payload retry works.
Final review gaps: root separately verified PostgreSQL races and browser
booking/rescheduling; live voice/provider operation was not tested.
Final suites: Laravel 208 passed; Python 171 passed; PostgreSQL race tests
3 passed / 15 assertions. Type check and frontend build passed.
Task 8: complete. Keep this branch and native worktree for review; no commits,
pushes, merges or deployments.

Clinical increment (2026-10-11): implemented clinical chart and walk-in /
appointment-linked encounters. Active provider account required; own drafts,
shared signed visits, author-only signing and amendments. Captures visit history,
allergy review, vital signs, assessment and plan. Notes are locked after signing;
append-only amendments preserve original content and author name snapshots.
Version checks reject stale edits; appointment row uniqueness and patient/visit
locks prevent duplicate appointment encounters. Audit events exclude note content.
Independent scoped review: fixed Important in-flight edit-loss issue by disabling
note/amendment fieldsets during submission. Added distinct-author, ambiguous
provider-link, wrong-provider appointment and cross-tenant mutation coverage.
Focused suite: 13 tests / 79 assertions passed. Frontend types/build passed.
Browser: synthetic consultation created, saved, signed, then amended; persisted
read-only original and separate amendment verified after reload. Preview fixture
upgrade is guarded to local isolated healthcare.sqlite only.
Clinical PostgreSQL race tests were not run. Longitudinal structured allergy /
problem lists, prescriptions, orders/results and billing remain future increments.

Healthcare UI redesign (2026-10-11): removed Contacts and Leads from Desk nav,
replaced the CRM dashboard with the clinic Today page. Patient/provider detail
screens use summaries plus editing sidebars. New native dialog Sidebar provides
full-height right panels, scrollable body, fixed heading/close, explicit focus
cycling, Escape dismissal/focus return, responsive width and reduced motion.
Registration, provider creation/editing, availability, clinic/service creation,
booking/rescheduling, appointment cancel/no-show, patient archive/restore,
consultation signing and ticket creation use sidebars. Legacy CRM storage/API
contracts remain; normal inbox/call/ticket profile links resolve to patients or
patient registration and do not lead to Contacts/Leads screens.
Patient identity fields update through the patient endpoint with tenant locks,
normalized identifiers, duplicate/historical-owner checks and content-free audit.
Patient profiles directly list their conversation links. Unnamed conversation
profiles can receive a validated full name within patient registration.
Review: both Important findings fixed (unnamed registration and CRM profile
link detours). Full Laravel suite 228 passed; types/build passed. Browser checked
right sidebar, mobile full-width layout, focus wrap and Escape focus restoration;
patient sidebar save exercised with synthetic data. Original main checkout intact.
User changed next priority: internal team chat after the UI redesign. Chat is
not implemented in this increment. Clinical problem/allergy lists and prescribing
remain on the EHR roadmap, after the user's team collaboration priority.

Provider calendar upgrade (2026-10-11): user reprioritized the calendar before
team chat. Dedicated-provider day/week time grids now align visits against a
shared time axis, working hours, multi-day leave and current-time marker.
Month view covers complete Monday-Sunday weeks; agenda covers seven days from
the chosen date. Overlapping visits use separate lanes; status colors and
appointment details expose patient record and existing visit actions. Booking,
rescheduling and availability management use full-height right sidebars.
Working-hour shading does not imply a free slot: exact slots still come from
the authoritative availability endpoint and bookings retain conflict checks.
Booking form fields and dismissal are protected during submission.
Validation: full Laravel suite 230 tests / 1811 assertions passed, frontend types
and build passed. Calendar detector returned no findings. Browser verified
month/day/week views, mobile width, rescheduling slot lookup and a synthetic
Tuesday booking that appeared on the schedule after successful submission.
Independent calendar review: ship, no material findings; focused tests independently passed 5 / 51 assertions. Opaque event backgrounds prevent working-hour labels showing through visits. Preview remains local;
no commit, merge or external deployment performed. Team chat remains next.


Provider UX and internal staff chat (2026-10-11): provider directory now has
Care team / Locations / Services sections, local name-specialty-clinic search,
status and location filters, direct calendar actions, and setup guidance from
real availability counts. Creation exposes clinic staff account linking. Mobile
provider rows put actions below the provider's details rather than shrinking text.
Staff chat adds tenant-scoped rooms, participants and messages; private channels
with selected Desk staff and canonical two-person direct rooms. Fresh membership
checks protect reads, writes and invitations; removed members lose access.
Message sends use client references and room locks for safe same-body retries;
changed-body reference reuse fails. Rate limits, plain-text length validation,
keyset history pages and monotonic room-bound read markers are included.
Account deletion retains messages with a former-member label and unread counts.
The frontend polls visible pages every five seconds, supports search, drafts,
load-older history, creation/member sidebars and mobile list/thread navigation.
Read markers advance through the fetched feed cursor, including after local sends;
auto-scroll runs after message rendering, and older-history readers see a jump
control rather than being scrolled away from their position.
Verification: full Laravel suite 240 tests / 1871 assertions passed; final types,
build and PHP formatting passed. UI detector returned no findings on provider/chat
pages. Browser exercised provider filters, channel creation, direct-room reuse,
message send, reload persistence and incoming update polling with synthetic data.
Desktop/mobile screenshots saved; mobile composer and provider actions verified.
Independent review: unread deleted-author issue and fetched-cursor read-marker
issue fixed; focused 19 tests / 125 assertions independently passed. PostgreSQL
chat concurrency was not executed; locking reviewed statically. No attachments,
voice/video, typing presence or channel member editing in this first chat increment.
Original main checkout remains intact; no commit/merge/deployment performed.

Core EHR and practice operations expansion (2026-10-11): clinic workspace now
links problems/allergies, chart notes, prescriptions, injections/vaccines,
longitudinal vitals, lab/imaging orders and results, private patient documents,
referrals, billing/receipts, stock batches and movements, care tasks/recalls,
analytics, practice templates and questionnaires, and patient portal access.
These are persisted local/manual workflows. Issued clinical/billing documents
retain identity snapshots; clinical drafts stay private; transitions use versions
and locks. Portal grants have explicit sharing, expiry/revocation, one-time
invitations and distinct patient-reported intake provenance. Patient-only account
registration/login resumes portal access without creating a staff organization.
Payments record manual receipts; no payment is captured externally. User has no
integration provider list, so pharmacy delivery, lab feeds, SMS and video service
connections remain pending. No external integration or deployment is claimed.
Calendar and team chat use full-height workspaces, larger readable content and
mobile controls/composer. Calendar half-hour cells have focused regression tests.
Desk navigation is consistently 64px icons across every Desk layout, expanding
as a 248px overlay on pointer hover or keyboard focus. Content stays at x=64;
nav targets retain their positions, and pointer clicks do not pin the menu open.
Mobile navigation retains its existing drawer. Studio navigation is unchanged.
Verification: fresh full Laravel suite 303 tests / 2630 assertions passed;
frontend type check, production build, PHP formatting and 2 calendar tests passed.
Existing font optimization/resolution and large Talk chunk build warnings remain.
Browser checked synthetic clinical/operations/portal intake journeys, desktop and
mobile calendar/chat, provider navigation, sidebar default/collapse/focus and
account menu. Screenshot desk-sidebar-expanded.png records the overlay. Independent
clinical and operations reviews were completed and reported issues addressed.
PHP upload limits are 12MB/16MB in Docker configuration and local preview to support
10MB documents; large-file transport was not exercised. PostgreSQL concurrency and
external delivery/payment/video workflows were not verified in this increment.
Work stays in the attached healthcare worktree; main checkout preserved.
No commit, merge, push or deployment performed.

Skills-first architecture Stage 1 (2026-10-12): approved design and first-stage
plan saved under docs/superpowers. Existing skills remain shared; new optional
private_expert_id owns private skills. Core API index/direct reads, tenant context
and legacy Expert catalogs exclude private skills. Studio validates tenant-local
non-built-in owners, prunes incompatible grants transactionally and prevents
another Expert attaching a private skill. Owner deletion preserves privacy;
deleted private skills can be restored from the owner page, reassigned, and then
the old owner deleted. No private execution is exposed to legacy persona switching.
Studio Skills now uses a wider readable list/editor, audience filtering, visible
ownership, multiline descriptions, creation sidebar and owner selection; Expert
detail distinguishes shared/private skills and surfaces deletion recovery/errors.
Fresh review identified a deleted-private recovery trap; it was fixed and the
full restore/reassign/delete journey independently passed. Final Laravel suite:
313 tests / 2729 assertions; ownership suite independently 10 / 99; frontend types,
build, formatting and diff check passed. Existing font/chunk build warnings remain.
Live visual QA unavailable: browser automation failed initialization even after
reset; screenshots and interactive mobile verification are not claimed.
Pending: core taker/worker independence, isolated Expert runtime and authorized
private reads, task progress supervision, complete Experts redesign and further
Desk workflows. No commits/pushes/deployment; main checkout preserved.

Core taker/worker and optional Expert stages (2026-10-12): core runtime now has
independent taker/worker profiles in AgentConfig, shares enabled public skills,
and does not require or seed Experts. Stock builtin settings and grants copy
once without deleting historical profiles. Optional Experts remain company
specialists and never select the core defaults. Chat taker delegates to a separate
worker; voice retains delegation/check-progress and follows core model choices.
Dedicated Expert executions have isolated SDK identity, history, gate and scope,
with shared plus owned-private skills and only assigned actions. Parent transcript
is not copied. Disabled/sibling/private reads fail closed; SDK reads and gate step
advances reauthorize and revoke cached state. Same-turn tasks deduplicate; role
changes/recreated Expert IDs rebuild isolated history. Cancellation, customer
scope, dry runs, approval and write-in-flight tracking retained. Partial failures
preserve confirmed writes and no longer claim nothing happened. Core audit has
no Expert identity; specialists audit under their actual identity. Expert model
choice is independent of core overrides, and child setup runs off the audio loop.
Studio adds Core runtime settings, optional specialists list/search/status and
creation sidebar, readable shared/private detail, private dry-run testing, and
separate preserved profiles. Independent review's 3 material findings fixed with
RED/GREEN tests and independently confirmed. Fresh final Python 196 passed;
Laravel 320 tests/2842 assertions passed; typecheck, build, formatting and diff
check pass. Existing font/chunk warnings remain. Browser tool initialization
failed; live visual/provider/voice and PostgreSQL concurrency checks unverified.
Preview restarted at port 8092; user browser is on /studio/runtime. Full persisted
task lifecycle/dashboard and broader Desk improvements remain later work.
No commit, push, merge or deployment; original main checkout preserved.

Clinic worklist and patient overview increment (2026-10-12): Today now provides
clinic-day/provider/location/search/stage filtering, 25-row pagination, real stage
counts, check-in, preparation/start/resume, checkout, cancellation and no-show
workflows. Nullable arrival/start/departure timestamps preserve historical unknowns
and retries; checkout never signs a note. Expected-status checks reject stale
transitions and stale preparation/start requests under the appointment lock.
Reception receives operational metadata without clinical note IDs or summary data.
Patient overview adds upcoming/recent appointment history and timezone-aware
calendar links. Clinical chart adds active problems/allergies, distinctly labeled
historical signed allergy review and latest recorded signed vitals, issued Rx,
visible results awaiting review and own unsigned visits; amendment-source notices
link back to the signed note. Empty allergy lists never assert no known allergies.
Patient clinical navigation groups primary pages and accessible More options;
confirmation/edit sidebars protect in-progress submissions. No new dependencies.
Independent review found stale preparation and PostgreSQL case-sensitive search;
both fixed and source-reviewed, with focused RED/GREEN stale-start regression.
Fresh Laravel full suite: 335 tests / 3173 assertions; focused combined workflow
46 / 494 before final review fixes, post-fix focused summary/worklist/encounter
29 / 415. Frontend typecheck, build, Pint and diff whitespace checks pass.
Build retains existing font resolution/optional fallback and large Talk chunk
warnings. Browser automation remains unavailable (kernel-assets path error), so
live visual/mobile QA is not claimed. PostgreSQL concurrency and external clinic
connections remain unverified; this increment uses tested local/manual workflows.
Timestamp migration applied only to isolated preview SQLite; Today preview open
was queued at http://127.0.0.1:8092/desk/dashboard. No commit/push/merge/deployment.

Consultation completion stage (2026-10-12): consultation page now uses a wide
sectioned editor with inline field errors, patient context alongside, note anchors,
saved/unsaved status, templates, timezone-aware dates and current-note preview in
the review sidebar. Explicit confirmation submits all current note fields to the
new complete endpoint; save and sign occur atomically, and failures roll back
content/version/activity. Legacy save/sign remain compatible. Patient-before-note
locking serializes signing with existing allergy add/inactivation transactions.
Saved-note readiness uses the same server checks as signing. Signing preserves
the original; amendments stay explicit; checkout is a separate confirmed status
transition with expected_status. Archived patients' existing drafts remain finishable.
Clinical chart places unsigned visits and start/resume near the top, retaining full
summary and adding private-visibility-scoped search/status filters and pagination.
Stale draft errors preserve local edits and original version; explicit replacement
loads current saved data. Remotely signed conflicts preserve a copyable local note;
dirty navigation/reload protection remains active without granting write access.
Independent backend/frontend review found allergy race and loss of dirty navigation
protection after remote signing; both corrected and source-confirmed.
Fresh full Laravel suite after final PHP changes: 342 tests / 3295 assertions.
Focused completion tests: 7 / 122; combined completion/encounter/summary/worklist:
36 / 537 before lock improvement; completion/encounter/care 31 / 255 after locks.
Final frontend typecheck/build, Pint and whitespace diff checks pass. Build retains
existing optional font fallback/font resolution and large Talk chunk warnings.
Local preview health /up returns 200. No schema change/dependencies added; no
commit/push/merge/deployment. Browser visual/mobile walkthrough and concurrent
PostgreSQL execution remain unverified. Broader live clinical integrations still
require the clinic's chosen providers; this stage is tested local/manual workflow.

Studio UI consistency and Desk motion pass (2026-10-12): standard Studio pages
now share the same1440/1640 frame and settings content no longer has an880px cap.
Full-screen chat/voice consoles retain their intentional viewport layout. Shared
Studio sections use compact consistent spacing, responsive headers and content-sized
panels. Overview, actions, catalog, memory and runtime remove stretched empty card
space; taker/worker prompt editors start smaller and grow with actual text.
Knowledge, telephony, team, memory, automation creation, pipelines, ticket types,
catalog connection and MCP/HTTP action editors use native task Sidebars, preserving
existing APIs, permission restrictions, reset behavior and validation. Busy saves,
deletes/uploads/connection tests guard closing/cancellation and duplicate requests.
Desk retains64px icon-rail reservation with stable248px navigation DOM, clipped
reveal and label fade for hover/keyboard focus without moving page content. Reduced
motion disables movement. Account/product menus portal outside the clipped rail
with viewport anchoring, outside-click/Escape handling and keyboard movement.
EditorWell refits on content/width/hidden-to-visible changes, skipping height-only
ResizeObserver changes. Source peer review found no material issues in the shared
frames, reveal/menu behavior or editor resizing. Fresh final TypeScript/build and
whitespace checks pass; scoped layout detector returns no findings. Existing font
fallback/resolution and large Talk chunk warnings remain. No backend/schema changes,
dependencies, commits/pushes/deployment. Browser walkthrough/performance and mobile
visual checks remain unverified because browser automation is unavailable.

Desk consistency and result-follow-up stage (2026-10-12): all standard DeskPage
width options now use the shared1440/1640 frame with32px section spacing and
content-sized panels. Documents, referrals, prescriptions/detail, billing/invoices,
inventory and care tasks use readable records and guarded Sidebar forms; portal,
practice and questionnaires remove narrow inner page caps and use responsive
sections. PrescriptionEditor adds duplicate-submit guard. Existing permissions,
signed/issued immutability, portal/token handling and APIs preserved.
Lab/imaging worklists now expose scoped search/status/flag/mine filters and real
queue counts; pending review is critical-first then abnormal with oldest result
first. Compact rows open full detail/report in a Sidebar available to authorized
readers; transitions remain author-only. Review records historical patient-contact
disposition and can explicitly create an assigned dated administrative recall.
Generic title 'Arrange provider follow-up' carries no result/review text to staff;
review/task/link commit atomically under existing author/version/member/patient
checks. Invalid current-clinic assignee/date or stale submission rolls everything
back. Archived results remain reviewable without creating new recalls. Completed
staff recall status is reflected on the clinical order through scoped relation.
No actual outbound notification/lab connection is claimed; existing manual process
remains. Additive migration defaults legacy contact status to not_recorded and links
optional recall with a restrictive FK. Applied only to isolated local SQLite.
RED/GREEN follow-up tests and fresh combined journey/ancillary/operations suite:
31 tests /511 assertions. Final full Laravel suite348 tests /3397 assertions.
Final TypeScript/build/Pint/whitespace checks pass; scoped layout scans return[].
Independent source review found no material backend or UI/DTO mismatch. Existing
font/chunk build warnings remain. Browser visual/mobile walkthrough and actual
PostgreSQL concurrency execution remain unverified. No dependencies, commits,
pushes, merges or deployment; original checkout preserved.

Referral coordination and flat Desk sections (2026-10-12): shared Desk Panel now
uses a transparent flat section treatment with no rounded outerbox/shadow, keeping
explicit danger borders. Referral worklist is compact rows with issued coordination
queues and patient/search/owner/state filters; a proper referral detail page shows
the original letter, patient context and complete chronological update history.
Author-only Sidebars preserve draft edit/issue/revoke and add scheduled/rescheduled,
completed and declined coordination. New patient_referrals fields default legacy
coordination to pending ('No outcome recorded'), with no invented appointment date.
ReferralUpdate rows append status/date/note and actor-name snapshots; issued letter,
recipient and reason remain unchanged. Patient-before-referral locks recheck author,
version and issued state; stale updates fail; terminal outcomes cannot reopen.
Clinic-local future/current date required only for new scheduling; archived patients
can record a historical outcome/decline without scheduling. Private linked encounter
restrictions apply to list counts/history and detail reads; cross-tenant records fail.
Administration compact rows reveal existing complete/void history in Sidebar;
flowsheets keep zero/null semantics and source links, chart notes use readable rows,
clinic workspace uses grouped plain navigation, analytics are flat period/all-time
sections. Existing API/data/permissions preserved, no invented integrations.
RED/GREEN referral suite6 tests /93 assertions; combined ancillary/journey19 /352
before added private-history case. Final full Laravel357 tests /3535 assertions.
Final frontend types/build/Pint/whitespace checks pass; scoped layout scans return[].
Source peer review backend/UI found no material issue. Migration applied only to
isolated preview SQLite. Existing font/chunk warnings remain. Browser visual/mobile
and real PostgreSQL concurrency execution remain unverified. No dependencies,
commit/push/merge/deployment. Broader EHR is still staged; full vendor parity and
live external clinical integrations are not claimed.

Clinic home and graphical dashboard (2026-10-12): /desk now redirects to
/desk/modules. Clinic workspace is the first sidebar entry and acts as a
standalone Desk landing page without desktop rail or mobile drawer; product and
account controls remain available in a top header. Any working module restores
the normal sidebar. Account menu supports downward placement in the home header
while retaining upward placement in the rail footer. Existing surface access and
Studio switching remain unchanged. Home exposes real tenant-scoped active patient/
provider, clinic-day appointment and pending/overdue administrative task counts.
Module launch links retain clinical gating and all existing routes.
Dashboard adds a seven-day clinic-local stacked visit chart with exact-count table,
current-day visit stage bars, provider visit workload bars/text and measured
arrival-to-consultation wait/sample count. Data is bounded to the seven-day window
and selected provider/location/patient search, independent of stage filtering;
existing worklist filters, pagination, mutations/privacy and expected-status guards
stay intact. Empty days show zero, absent wait is Unknown; no inferred timestamps,
capacity, revenue or clinical outcomes. Peer review caught upward account menu at
header and it was corrected/source-confirmed; graphical/worklist integration review
otherwise clean. Updated prior surface-root assertion to authorized home behavior.
Fresh full Laravel suite360 tests /3615 assertions; focused home/worklist/workspace
21 /388. Final typecheck/build/Pint/whitespace checks pass, scoped layout scan[].
Existing font/chunk build warnings remain; no schema/dependency/commit/push/deploy.
Browser visual/mobile walkthrough remains unavailable; graph/performance and menu
geometry evidence is source review plus checks, not rendered observation.
