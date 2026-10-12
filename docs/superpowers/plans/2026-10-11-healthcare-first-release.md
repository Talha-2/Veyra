# Healthcare patient and provider-calendar implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship patient registration and built-in provider calendars that staff and AI agents use through shared availability and booking rules.

**Architecture:** Extend Laravel's tenant-scoped Desk with dedicated healthcare records and one transactional scheduling service. Extend AppSdk and the common Python worker tools for booking; preserve existing contacts and conversations. Implement patient foundation first, scheduling second, agent tools third.

**Tech Stack:** Existing Laravel 13, PostgreSQL, Inertia/React 19, TypeScript, Tailwind and Python/httpx/Pydantic/pytest. Use existing UI components and PHP date handling; no new calendar dependency required.

**Spec:** `docs/superpowers/specs/2026-10-11-healthcare-desk-design.md`, including its approved provider-calendar extension.

## Global constraints

- Market: Pakistan. Location timezone default Asia/Karachi; service fees PKR.
- Implement in apps/app-layer and apps/agent-layer, not legacy Desk/server.
- Preserve user changes in AgentGateway.php, studio/agent.tsx and tsconfig.tsbuildinfo and untracked pitch assets.
- Patient is a dedicated tenant-owned record linked one-to-one with Contact.
- Do not convert old Contacts en masse or change existing public API payloads.
- Five-minute slot increments; zero buffer/notice defaults; 90-day booking horizon.
- Calendar offers are not reservations. Saving rechecks availability atomically.
- Agent calendar lookup exposes free slots, never other patients' event contents.
- Customer-facing booking requires a registered Patient linked to ActingFor's Contact.
- No clinical chart, prescription or delivered-reminder claims in this release.
- Do not reset development data or commit unrelated work. Commit only when requested by the owner.

## Review focus

1. A child may have no unique phone/email: registration works with name only (Task 1).
2. A shared household contact method must not merge patient identities (Task 1).
3. An interval crossing local midnight must not create an incorrect-day slot (Task 4).
4. A provider working at two locations cannot be booked in both at the same time (Task 4).
5. A timed-out booking retried by an agent must not create a second appointment (Tasks 5 and 7).

## Task 1: patient persistence and registration

**Create:** apps/app-layer/database/migrations/2026_10_11_000100_create_patients_table.php; app/Models/Patient.php; app/Services/Healthcare/PatientRegistry.php; app/Http/Requests/Desk/StorePatientRequest.php; app/Http/Requests/Desk/UpdatePatientRequest.php; tests/Feature/PatientRegistryTest.php (all under apps/app-layer).
**Modify:** apps/app-layer/app/Models/Contact.php.

**Interfaces:** Patient uses BelongsToTenant and belongsTo Contact; Contact hasOne Patient. PatientRegistry::register(array $attributes, User $actor): Patient; update(Patient $patient, array $attributes, User $actor): Patient; archive(Patient $patient, User $actor): void; restore(Patient $patient, User $actor): void.

- [ ] Establish a working PHP 8.3+ and Composer runtime or existing Docker app environment. Read applicable app-layer AGENTS instructions. Do not install framework tooling during design review; at execution follow applicable setup instructions and isolate their changes from the feature. Confirm vendor dependencies and in-memory SQLite PHPUnit configuration before running tests.
- [ ] Write tests: test_name_only_registration_creates_patient_and_contact (MRN nonempty, linked contact name); test_existing_contact_preserves_conversations; test_cross_tenant_contact_is_rejected; test_repeated_registration_is_rejected; test_future_birth_date_is_rejected; test_mrn_payload_cannot_change_record; test_shared_phone_is_not_silently_merged; test_archive_restore_preserves_identity; test_audit_failure_rolls_back_write.
- [ ] Run `php artisan test --filter=PatientRegistryTest` from apps/app-layer; verify failures are missing feature behavior, not environment errors.
- [ ] Implement schema from the spec with unique (organization_id, contact_id) and (organization_id, mrn), a collision-resistant immutable MRN, active/archived state, optional demographics and emergency contact. Use ContactDirectory normalization/conflict checks and identifier linkage for new Contacts inside the transaction. Existing-contact registration reads contact methods; demographic updates do not edit them. Audit through Activity, storing changed field names and actor, not values.
- [ ] Re-run focused tests; add cross-tenant update/archive/restore and no-current-tenant tests. Confirm all pass.

## Task 2: patient Desk screens

**Create:** apps/app-layer/routes/desk/patients.php; app/Http/Controllers/Desk/PatientController.php; resources/js/types/healthcare.ts; resources/js/pages/desk/patients.tsx; resources/js/pages/desk/patient.tsx; resources/js/components/healthcare/patient-form.tsx; tests/Feature/PatientDeskTest.php (under apps/app-layer).
**Modify:** apps/app-layer/resources/js/components/shell/nav.ts.

**Interfaces:** GET /desk/patients (search/status/page); POST /desk/patients; GET/PATCH /desk/patients/{patient}; POST /desk/patients/{patient}/archive and /restore. Controller delegates writes to PatientRegistry. Inertia patient rows contain id, mrn, contact summary, birth_date, status and created_at; detail adds demographics and audit history. Existing-contact choices are paginated tenant-scoped Contacts.

- [ ] Write HTTP tests for registration/update/archival, directory search by MRN/name/reach, pagination/filter persistence, cross-tenant 404s, unauthenticated redirect and Studio-only access refusal.
- [ ] Run `php artisan test --filter=PatientDeskTest`; confirm relevant failures.
- [ ] Implement controller/Form Request integration and portable lower()/LIKE search. Add Patients navigation and desktop/mobile directory, registration and profile using kit.tsx, primitives.tsx, dialog.tsx and page.tsx. Link profiles to /desk/contacts/{contact}; log profile reads before responding. Do not add clinical placeholders.
- [ ] Run focused tests, `npx tsc --noEmit`, and `npm run build` in app-layer. Inspect keyboard focus, field errors, empty states and narrow-screen rendering once the local app is available.

## Task 3: providers and practice setup

**Create:** apps/app-layer/database/migrations/2026_10_11_000200_create_scheduling_tables.php; app/Models/Provider.php; app/Models/ClinicLocation.php; app/Models/HealthcareService.php; app/Models/ProviderAvailability.php; app/Models/ProviderTimeBlock.php; app/Models/Appointment.php; app/Services/Healthcare/ProviderDirectory.php; app/Http/Controllers/Desk/ProviderController.php; app/Http/Requests/Desk/StoreProviderRequest.php; app/Http/Requests/Desk/UpdateProviderRequest.php; routes/desk/scheduling.php; resources/js/pages/desk/providers.tsx; resources/js/pages/desk/provider.tsx; tests/Feature/ProviderDirectoryTest.php.
**Modify:** healthcare.ts and shell/nav.ts from Task 2.

**Interfaces:** ProviderDirectory::save(?Provider $provider, array $attributes, User $actor): Provider. GET/POST /desk/providers; GET/PATCH /desk/providers/{provider}; POST /desk/locations; POST /desk/services. Owner/admin writes require administer-organization; Desk members can read operational provider records.

- [ ] Write tests for provider independent of login, linked account must belong to organization, tenant-scoped service/location assignment, inactive provider, invalid timezone/duration, unauthorized settings edits and cross-tenant references.
- [ ] Run `php artisan test --filter=ProviderDirectoryTest`; confirm intended failures.
- [ ] Implement tenant-owned schema. Provider has specialty/credentials fields, active flag, optional user_id and booking-rule settings. Locations store timezone. Services store duration and optional fee_minor integer/currency PKR. Provider/service/location assignments constrain availability. ProviderAvailability stores ISO weekday 1..7 and local same-day start/end times. Time blocks store UTC start/end and optional label. Appointment stores patient/provider/location/service references, status/source, starts_at/ends_at UTC, timezone, duration and buffer snapshots, created_by, conversation_id and idempotency_key. Preserve audit references on archival; do not cascade-delete appointments through routine UI actions.
- [ ] Implement provider forms and practice setup with existing components; validate service duration 5..480 minutes, a multiple of five; buffers 0..120 minutes in multiples of five; notice 0..10080 minutes; booking horizon 1..365 days. Same-day availability intervals cannot overlap across locations. Default settings match spec.
- [ ] Run focused tests and frontend checks.

## Task 4: availability engine and rule management

**Create:** apps/app-layer/app/Services/Healthcare/AvailabilityService.php; app/Http/Controllers/Desk/AvailabilityController.php; app/Http/Requests/Desk/UpdateAvailabilityRequest.php; app/Http/Requests/Desk/StoreTimeBlockRequest.php; tests/Feature/ProviderAvailabilityTest.php.
**Modify:** routes/desk/scheduling.php; provider.tsx.

**Interfaces:** AvailabilityService::slots(Provider $provider, ClinicLocation $location, HealthcareService $service, CarbonImmutable $from, CarbonImmutable $to, ?Appointment $ignore = null): array; assertBookable(...same provider/location/service..., CarbonImmutable $startsAt, ?Appointment $ignore = null): array (UTC starts_at/ends_at, timezone and buffer snapshots). PUT /desk/providers/{provider}/availability; POST/DELETE /desk/providers/{provider}/blocks[/{block}]; GET /desk/providers/{provider}/slots?location_id=&service_id=&from=&to=.

- [ ] Write frozen-clock tests for breaks, leave, booked/buffered intervals, adjacency, minimum notice, horizon, inactive provider/patient-independent slot lookup, service/location permissions, midnight and non-Karachi timezone boundaries, cross-location bookings and edits invalidating future appointments.
- [ ] Run `php artisan test --filter=ProviderAvailabilityTest`; confirm failures.
- [ ] Generate slots from local dated weekly intervals; convert to UTC, account for entire buffered intervals, subtract provider appointments across every location and blocks. Require the complete buffered interval inside working hours. Limit lookup ranges to 31 days and return an error for malformed ranges. Reject past starts and mismatched service/location. Cancelled appointments are excluded; rescheduling ignores only the supplied original appointment.
- [ ] Availability changes and block writes lock the Provider row inside a transaction, then refuse invalidation of active future appointments. Audit successful changes. Adjacent half-open intervals do not overlap; comparison is start < other_end AND end > other_start.
- [ ] Re-run tests. Verify query bounds and no patient identity in slots responses.

## Task 5: atomic booking lifecycle

**Create:** apps/app-layer/app/Services/Healthcare/BookingService.php; app/Http/Controllers/Desk/AppointmentController.php; app/Http/Requests/Desk/BookAppointmentRequest.php; app/Http/Requests/Desk/RescheduleAppointmentRequest.php; tests/Feature/AppointmentBookingTest.php; tests/Integration/AppointmentConcurrencyTest.php.
**Modify:** routes/desk/scheduling.php.

**Interfaces:** BookingService::book(array $attributes, ?User $actor, string $source, ?int $conversationId = null): Appointment; reschedule(Appointment $appointment, CarbonImmutable $startsAt, ?User $actor): Appointment; cancel(Appointment $appointment, ?User $actor): Appointment; transition(Appointment $appointment, string $status, User $actor): Appointment. POST /desk/appointments; PATCH /desk/appointments/{appointment}/reschedule; POST /desk/appointments/{appointment}/cancel and /status.

- [ ] Write tests for stale offer rejection, repeat idempotency returning the existing row, same key/different payload rejection, archived patient rejection, cross-tenant references, cancellation freeing slot, failure preserving original reschedule, buffer snapshots, and valid/invalid state transitions.
- [ ] Run `php artisan test --filter=AppointmentBookingTest`; verify intended failures.
- [ ] Lock provider first, then existing appointment when mutating. Re-read status/active entities and call assertBookable inside the transaction. Enforce unique organization/idempotency key and provider-wide overlap checks. Do not permit provider changes during rescheduling in v1, avoiding two-provider lock ordering. Actor/source and mutation audit are atomic with booking. Accept booked -> checked_in/cancelled/no_show; checked_in -> completed/cancelled; terminal records cannot be rescheduled. Double cancellation is an idempotent no-op.
- [ ] Test true concurrent requests on a disposable PostgreSQL database, never the development database. Integration test launches independent processes/connections for two overlapping bookings: exactly one succeeds and one conflicts; repeat with a block racing booking and a reschedule racing booking. Keep integration tests outside the default SQLite suite and document an explicit isolated PG invocation.
- [ ] Run focused tests and record both SQLite behavior evidence and PostgreSQL concurrency evidence. Do not claim race prevention based only on sequential tests.

## Task 6: provider calendar UI

**Create:** apps/app-layer/app/Http/Controllers/Desk/CalendarController.php; resources/js/pages/desk/calendar.tsx; resources/js/components/healthcare/appointment-form.tsx; resources/js/components/healthcare/calendar-agenda.tsx; tests/Feature/ProviderCalendarTest.php.
**Modify:** scheduling.php, nav.ts, healthcare.ts and provider.tsx.

**Interfaces:** GET /desk/calendar?provider_id=&date=&view=day|week. Return tenant-scoped provider choices, selected calendar, appointments, working intervals and blocks over the requested bounded period. Only staff UI receives patient display names; no clinical notes. Appointment form obtains service-specific free slots from Task 4 and posts to Task 5.

- [ ] Write tests for provider-specific date range, cross-location overlap visibility, tenant isolation, permission enforcement and query bounds.
- [ ] Run `php artisan test --filter=ProviderCalendarTest`; confirm intended failures.
- [ ] Implement day/week calendar, provider/date navigation and mobile agenda. Display unavailable time, blocks, booked time and chosen-service available slots distinctly. Booking form selects active patient, provider, service, location and returned slot, carries one persistent submission key until successful, and handles stale-slot conflict by refreshing availability without losing patient selection. Add reschedule/cancel/check-in/status actions and owner/admin block controls; all actions use backend services.
- [ ] Inspect desktop/mobile, keyboard navigation, labels, busy/error states and conflict recovery. Run type checking, build and feature tests.

## Task 7: shared agent scheduling tools

**Create:** apps/app-layer/app/Http/Controllers/Api/Agent/SchedulingController.php; apps/app-layer/tests/Feature/AgentSchedulingTest.php; apps/agent-layer/packages/common/veyra_harness/scheduling_tools.py; apps/agent-layer/packages/common/app_sdk/tests/test_scheduling.py; apps/agent-layer/packages/common/veyra_harness/tests/test_scheduling_tools.py.
**Modify:** apps/app-layer/routes/api.php; app/Services/Agent/ActingFor.php; apps/agent-layer/packages/common/app_sdk/client.py and models.py; veyra_harness/actions.py; docs/agent-contract.md. Resolve exact internal slug naming from existing action registration before adding matching scheduling built-ins.

**Interfaces:** Organization-scoped GET /scheduling/providers, /scheduling/slots, /scheduling/appointments; POST /scheduling/appointments; PATCH /scheduling/appointments/{appointment}/reschedule; POST /scheduling/appointments/{appointment}/cancel. AppSdk adds scheduling_providers(), scheduling_slots(provider_id, location_id, service_id, from_, to), appointments(acting_for=None), book_appointment(..., confirmed, idempotency_key, acting_for=None), reschedule_appointment(...), cancel_appointment(...). Pydantic results carry appointment id, status, provider/service/location labels, local timezone and UTC timestamps. Customer list responses omit medical reasons and other patients.

- [ ] Write contract tests: free slots contain no patient name; wrong tenant and wrong customer rejected; anonymous conversation booking refused; confirmation required; staff scoped correctly; retry returns one appointment; stale slot conflict has an actionable message; cancelled or archived-patient appointment cannot be rescheduled.
- [ ] Run `php artisan test --filter=AgentSchedulingTest` and `.venv/Scripts/python.exe -m pytest` from agent-layer with the repo-root interpreter path; confirm relevant failures.
- [ ] Route PHP calls through BookingService/AvailabilityService. Resolve customer patient server-side from ActingFor contact, validate conversation on every mutation, never trust arbitrary patient IDs. Add SDK calls with acting_for header and typed responses; use existing executor-generated durable-write idempotency keys and do not invent a separate unsafe retry loop. Extend ActingFor with narrowly scoped appointment checks.
- [ ] Register list_providers, available_slots, list_appointments, book_appointment, reschedule_appointment and cancel_appointment built-ins. Reads are read-only; mutations are durable writes and honor action restrictions/approval settings. Tool descriptions instruct confirming selected provider/date/time before mutation. Return factual success only from an app-confirmed appointment response. Pass executor scope key through the handler using the established state/scope mechanism; if needed introduce an explicit scoped handler context with tests rather than mutable global state.
- [ ] Run full Python suite, PHP contract tests and executor regression tests; verify the tools assemble for voice/chat/Ask through the existing build_worker path. No real provider network traffic in tests.

## Task 8: integrated verification and delivery

**Modify:** apps/app-layer/README.md and docs/agent-contract.md only for actual delivered behavior. Add synthetic fixtures to test code; do not automatically seed patient data into existing workspaces.

- [ ] Run the complete app feature/unit suite on verified in-memory SQLite, then isolated PostgreSQL scheduling/concurrency tests.
- [ ] Run `npx tsc --noEmit` and `npm run build` in app-layer; run the full Python agent suite.
- [ ] Exercise register patient -> create provider/service/location -> set working hours -> staff book -> agent lookup sees slot gone -> reschedule -> cancel -> slot returns. Confirm clinical records and delivery reminders are not implied by the UI.
- [ ] Review final diff against spec, tenant boundaries, existing user changes and both staff/customer booking paths. Check migration reversibility on a disposable database; never migrate/reset the owner's database without the appropriate execution context.
- [ ] Report actual delivered features, exact test results and any unverified live voice/provider behavior. Link resulting files and leave a phase-by-phase continuation list. No deployment, external writes or commit/push unless explicitly requested.

## Execution handoff

The product direction and built-in provider calendar are approved. This plan is
ready for review before implementation. Native execution in this chat is
recommended because the patient, calendar and agent tasks share interfaces and
depend on sequential verification. Subagent-driven execution is available if
the owner prefers independent implementation/review gates per task.
