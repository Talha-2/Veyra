# Veyra Desk: healthcare EHR + AI CRM

Date: 2026-10-11
Status: first release implemented and verified in codex/healthcare-desk; later EHR phases remain on the roadmap.
Market: Pakistan, confirmed by the owner.

## Product intent

The owner wants Desk to focus exclusively on healthcare and to deliver the
existing CRM capabilities together with EHR capabilities, built sequentially.
Desk becomes the workspace for patient relationships, clinic operations and
clinical records. Studio continues to configure the AI agents that support it.

Working assumption: begin with outpatient clinics, then extend the common
foundation to specialty practices and inpatient hospital workflows. The owner
has not selected a specialty or requested a hospital-first release.

Success is an integrated patient journey: inquiry, registration, appointment,
visit, clinician-approved documentation, billing and follow-up. Each phase must
deliver usable behavior and verified data boundaries before the next begins.

## Architecture decisions

- Implement in `apps/app-layer` and `apps/agent-layer`. The retained legacy
  FastAPI server and old Next.js Desk are not the implementation target.
- Laravel owns patient and clinical data. Python runs AI through the versioned
  contract. AI receives only the context authorized for the task.
- A Patient is a dedicated tenant-owned record linked one-to-one with a Contact.
  Contacts remain the communication identity for patients, guardians, referral
  partners and other people. A Contact is not automatically a Patient.
- Preserve existing conversation/contact links, CRM routes and API shapes.
  Introduce patient functionality additively rather than rewriting contact IDs.
- Demographics, clinical facts and CRM notes are separate concepts. Clinical
  records will not be stored as ordinary contact notes or agent memory.
- Clinical authorization is independent of organization administration and
  Studio access. Later clinical phases introduce explicit clinical permissions;
  an owner role alone must not authorize signing a clinical record.
- Existing data stays intact. Patient conversion is explicit; there is no mass
  conversion of old CRM contacts or reinterpretation of old notes.

## Delivery sequence

| Phase | Deliverable | Dependency / completion boundary |
| --- | --- | --- |
| 1 | Patient foundation | Registration, directory, demographic profile, contact linkage, tenant isolation and change audit |
| 2 | Practice and appointments | Locations, practitioners, services, availability, conflict-safe booking, check-in, queue and cancellations |
| 3 | Clinical chart and encounters | Clinical roles, encounters, vitals, histories, allergies, diagnoses, draft notes, signatures and amendments |
| 4 | Medications, orders and results | Medication records, reviewed prescriptions, lab/imaging orders, results and clinician review queues |
| 5 | Billing and payments | PKR invoices, service charges, payments, refunds, outstanding balances and receipts; payer workflows separately specified |
| 6 | Healthcare CRM workflows | Referrals, inquiry pipelines, care tasks, recalls, outreach consent and follow-ups; preserve inbox and assignments |
| 7 | Patient access | Patient identity verification, appointment requests, intake, permitted records/results access and guardian authorization |
| 8 | Healthcare AI | Receptionist and booking tools, structured intake, draft visit summaries, clinical drafts for review and operational automations |
| 9 | External interoperability | Validated integration contracts for labs, pharmacies, messaging, payers and record exchange; actual provider connections |
| 10 | Specialty and hospital extensions | Specialty templates, admissions, beds, nursing workflows, inpatient medication administration and discharge |

Auditability and access control accompany every phase. They are not postponed
to the final phase. Each phase receives its own detailed design and verification
criteria. This sequence is a roadmap, not a claim that every module is already
specified or supported.

## Phase 1: patient foundation

### User workflows

1. A Desk member opens Patients, searches the directory, and opens a profile.
2. Staff registers a new patient or explicitly registers an existing Contact as
   a patient. Existing conversations remain linked through the same Contact.
3. Staff edits demographic details with validation and sees the change history.
4. Staff opens the patient's existing contact view to work conversations,
   tickets, calls and relationship history. Clinical sections are added only
   when their backing workflows ship.
5. Staff archives a patient. The record and communication history remain;
   archived records are visible through a separate filter and can be restored.

### Patient data

- Internal ID and organization ID.
- Required contact ID, unique per organization, with tenant validation.
- Immutable system-generated medical record number (MRN), unique per
  organization. Generate a collision-resistant value backed by a database
  unique constraint, not a count-based sequence.
- Required patient name held on the linked Contact.
- Date of birth, optional; reject future dates. Display age only when known.
- Administrative sex, optional, including an unknown value; do not infer it.
- Status: active or archived; archive never deletes a Contact.
- Address as structured address lines, city, province/region, postal code and
  country. Country defaults to Pakistan but remains editable.
- Optional preferred language, initially English or Urdu.
- Optional emergency contact name, relationship and phone. It is demographic
  information, not authorization to view records or make clinical decisions.
- Created/updated timestamps and staff attribution through audit records.

CNIC, insurance membership, guardian access and clinical facts are deferred to
their dedicated designs. Registration must work without a phone, email or CNIC,
including for children and patients sharing a household phone.

### Identity and linking rules

- Never merge patients or reuse a Contact merely because a name or shared phone
  matches. Search can suggest possible existing records; staff chooses an
  existing record explicitly.
- Registering an existing Contact reuses it and rejects a duplicate Patient
  registration. Reject cross-organization Contact IDs before writing.
- New registration creates Contact and Patient in one database transaction.
- Contact methods use the existing ContactDirectory/Identifier conventions;
  conflicts are shown clearly rather than silently relinking an identifier.
- The first patient form reads existing contact methods but does not edit them;
  it links to the existing CRM contact management flow. New contact creation
  respects existing ownership checks. Shared reach details must not falsely
  establish patient identity or overwrite an existing contact's identifier.

### Routes and UI

Add a Desk Patients route group with directory, registration, profile, update,
archive and restore actions. Place Patients prominently in Desk navigation and
the command palette. Preserve Contacts as the CRM directory for all people.

The directory is paginated and searchable by MRN, patient name, phone and email.
Filter by active/archived state. Show name, MRN, age when known, contact method,
status and registration date. Use portable database queries for PostgreSQL and
the existing SQLite test environment.

The profile shows demographics, emergency contact, change history and a link to
the existing CRM contact. Forms support field errors, keyboard operation,
mobile layouts, empty states and clear save outcomes using existing Desk UI
components. Do not show working-looking clinical tabs without functionality.

### Authorization and audit

Phase 1 has demographic functionality only, accessible to authenticated members
with Desk access in the current organization. Every route and relationship is
tenant-scoped; another organization's Patient or Contact returns no record.

Record registration, demographic updates, profile access, archival and restore
with actor, timestamp and patient reference. Update events identify changed
field names without copying demographic values into general activity logs.
No clinical data, public patient endpoint or AI patient tool is introduced here.
Profile-access audit must be written before a successful profile response;
mutation audits share the mutation transaction so neither can succeed alone.

### Expected implementation surface

- New patient migration and model using the existing tenant scope.
- Patient/contact relationship on Contact.
- Patient registration/update Form Requests and a patient service for atomic
  linking, demographic updates, archival and audit.
- Desk PatientController and `routes/desk/patients.php`.
- Patient directory, profile and registration/edit components under
  `resources/js/pages/desk/`, with patient-specific types.
- Desk navigation entries and meaningful patient feature/tenancy tests.

### Acceptance criteria

- A new patient registers and persists with an MRN and linked Contact.
- An existing Contact can be registered without losing CRM history.
- Repeat registration of the same Contact is refused, including concurrent
  requests protected by a database unique constraint.
- Demographic updates persist; invalid dates and malformed fields are refused.
- MRNs cannot be changed via form payloads.
- Search and pagination preserve filters and work in SQLite and PostgreSQL.
- Tenant-isolation checks cover reads, registration/linking, updates, archive
  and restore. Missing tenant context fails closed.
- Archive/restore retain the record, MRN, Contact and communication history.
- Registration, reads and changes produce correctly attributed audit events.
- Existing contacts, inbox, surface access and public API tests remain green.
- Type checking and frontend build pass; inspect directory/form/profile at
  desktop and mobile sizes.

## Pakistan defaults and later decisions

Use Asia/Karachi for new healthcare scheduling defaults and PKR for the billing
phase. Persist appointment instants with explicit timezones and represent date
of birth as a calendar date. Preserve Urdu text; full localized/RTL UI is a
separate scoped deliverable.

Before prescriptions, external clinical exchange or production clinical use,
research the applicable Pakistan requirements and chosen vendors against
current primary sources. No certification, regulatory compliance or existing
provider connection is asserted by this design.

## Implementation environment and preserved work

The repository currently has user-owned edits in AgentGateway.php,
studio/agent.tsx and apps/web/tsconfig.tsbuildinfo, plus untracked pitch assets.
Keep them intact and outside phase 1.

The existing Python agent suite passed 159 tests during repository exploration.
That is baseline evidence, not verification of healthcare functionality.
Host PHP/Composer were unavailable and Docker Desktop's engine was unreachable
during inspection. Resolve the local Laravel verification environment before
claiming phase 1 is tested; do not run destructive database resets against the
development database. Existing app tests are intended to use in-memory SQLite.

## Approved first-release extension: provider calendars

The owner explicitly confirmed built-in calendars dedicated to each provider,
with availability lookup for the team and agent, and instructed implementation
to start. The first usable release includes phases 1 and 2 in sequence.

Providers have a name, specialty, optional registration/qualification details,
active status and an optional linked staff account. Provider identity and login
access are separate. Locations have a name, address and timezone (default
Asia/Karachi). Services define duration in minutes and an optional PKR fee.
Only explicitly assigned services and locations may be booked for a provider.

Each provider has weekly working intervals per location, breaks represented by
separate working intervals, and dated blocked intervals for leave or exceptions.
Availability rules include five-minute slot increments, service duration,
before/after buffers, minimum notice and a maximum advance-booking horizon.
Defaults: zero buffers, zero minimum notice, 90-day horizon. Staff can configure
these; booking still rejects past start times. Provider schedule edits cannot
silently invalidate future appointments: refuse conflicting edits and show why.

Appointments connect a Patient, Provider, Location and Service, with UTC start
and end instants, local timezone, duration/buffer snapshots, booking source and
an idempotency key. States: booked, checked_in, completed, cancelled, no_show.
Cancelled appointments release availability; all other states reserve their
original interval. A completed appointment is not yet a clinical encounter.

Use half-open intervals [start,end): adjacent unbuffered bookings are allowed.
Prevent provider overlaps across locations, not just on the selected calendar.
Booking and rescheduling recheck availability atomically while holding the
provider row lock. Blocking time and changing availability use the same lock.
For rescheduling, the original booking remains intact if the new slot conflicts.
Search results are offers, not reservations. Duplicate submission of the same
idempotency key returns the existing appointment; different payloads with the
same key are rejected. Use an isolated PostgreSQL concurrency test to prove
locking; SQLite tests alone cannot establish this property.

Desk offers provider and practice settings, a provider-selectable day/week
calendar, date navigation, a compact agenda on mobile, appointment creation,
rescheduling, cancellation, check-in and status actions. Staff can manage time
blocks. Show working hours, bookings and blocks distinctly, plus available slots
for a chosen service. All booking fields have labels, validation and accessible
keyboard controls. Drag-and-drop is not required for the first release.

Staff with Desk access can view calendars and book patients. Owner/admin
membership is required to change providers, practice settings or availability.
Calendar reads and changes are audited without copying medical details into
activity logs. Existing staff grants are preserved.

The agent receives provider/service/location choices and free slots without
other patients' names, appointment reasons or calendar-event contents. All
tools use AppSdk and the versioned app contract, with the same BookingService
as staff. Customer-facing mutations require an active patient linked to the
current conversation's Contact, never an arbitrary caller-supplied patient ID.
Until this linkage exists, the agent routes registration to staff. Staff Ask
runs remain tenant-scoped. The agent requests patient confirmation before
booking, rescheduling or cancelling and requires a confirmation flag; this is
a conversation guard, not proof of identity. No clinical chart is exposed.

Initial tools: list providers/services/locations, list available slots, book,
list own appointments, reschedule and cancel. Scheduling actions are recorded
durable writes; uncertain results must not be described as confirmed bookings.
Implementations honor Studio action restrictions and executor idempotency.

Appointment reminders require the separately planned real SMS/email delivery
integration. This release must not label queued records as delivered reminders.
External Google/Outlook calendars, recurring bookings, waitlists, live waiting
queues and hospital/resource scheduling follow as separately specified increments.

## Next review boundary

Review the concrete first-release implementation plan and select its execution
method. The product direction and built-in provider calendar are already
approved; this review concerns the implementation steps and verification.
