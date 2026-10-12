# Clinic Worklist and Patient Overview

User authorized continued EHR feature/UI development within the approved complete-patient-journey direction. This increment refines existing Today, patient profile and clinical chart workflows. No commits, push, deployment, dependencies or external connections.

## Outcome and invariants

Reception can find and check in appointments, see operational progress, and check out visits. A linked active provider can start or resume the right consultation and see a clinical patient summary. Reception must never receive clinical draft IDs/content, allergies, problems, prescriptions or results in its dashboard payload. Signed/issued records and historical notes keep their existing access rules. Appointment statuses remain booked/checked_in/completed/cancelled/no_show so scheduling conflicts, calendar and agent contracts stay compatible.

Record nullable checked_in_at, consultation_started_at and completed_at on appointments. Do not invent timestamps for historical rows. Check-in/checkout retries preserve the first recorded time and do not duplicate activity. Worklist mutations send expected_status; stale transitions fail rather than silently changing a moved visit. ClinicalRecords.start sets consultation_started_at only for checked-in appointments, after encounter read/author eligibility is checked. Preparing a booked visit never means a consultation started. Starting the same linked visit resumes the existing note. Checkout does not sign notes; unsigned notes remain in the clinician's worklist.

## Fixed integration contracts

Dashboard GET `/desk/dashboard` filters: date (clinic ISO date, default today), provider_id, location_id, stage (active default, all, scheduled, waiting, in_consultation, ready_checkout, completed, cancelled, no_show), search. Date bounds use Organization timezone; display scheduled/operational times explicitly in appointment timezone. Validate tenant-local filters. Search name/MRN/phone. Paginate 25; no lost rows after 50 appointments.

Dashboard props: clinic_date, today_date, timezone, as_of, filters (strings), providers [{id,name,active}], locations [{id,name,timezone,active}], counts {total,scheduled,waiting,in_consultation,ready_checkout,completed,cancelled,no_show,patients,providers}, appointments paginator {data,prev_page_url,next_page_url,from,to,total,current_page,last_page}, can_access_clinical, messages_waiting, attention null or {unsigned_count,unsigned_visits:[{id,patient_id,patient_name,mrn,occurred_at}],pending_results_count}. Attention is clinician-only; unsigned notes belong to current provider+author, results use existing ClinicalAncillary visibility.

WorklistVisit extends existing AppointmentPresenter record including patient {id,name,mrn,status}, timestamps checked_in_at/consultation_started_at/completed_at, visit_stage, waiting_minutes, can_start, encounter null or {id,status}. Only readable signed or own draft encounter IDs reach a linked clinician; reception receives encounter=null and can_start=false. waiting_minutes is elapsed recorded arrival -> started time when known, or arrival -> as_of while waiting; unknown times stay null. Stage scheduled for booked; checked_in with no start is waiting; started checked_in is in_consultation unless linked note signed, then ready_checkout; completed/cancelled/no_show retain stage. An existing prepared draft alone never implies in_consultation.

Patient profile adds timezone and visits {upcoming: AppointmentRecord[], recent: AppointmentRecord[]} with timestamps, no clinical note payload. Upcoming: future booked/checked_in max 5. Recent: starts before now, all states, latest 8. Existing record/communication/history and permissions remain.

Clinical chart adds timezone and summary:
- problems {data:[{id,name,code,onset_date}],total} active, max 8.
- allergies {data:[{id,allergen,reaction,severity}],total} active, max 8.
- allergy_review null or {status,at,encounter_id}: latest signed note's historical review, distinctly labeled from current structured list; empty list never asserts no known allergies.
- latest_vitals null or {encounter_id,recorded_at,provider_name,values}: latest signed note containing non-empty recorded values (zero preserved), stream signed observations until the latest actual recorded values are found; no other provider drafts.
- recent_prescriptions [{id,provider_name,issued_at,medicines:string[],item_count}] issued_at present and status issued, max 3; label recent issued prescriptions, not reconciled active medications.
- pending_results {data:[{id,kind,name,result_flag,resulted_at}],total}: resulted orders with ordered_at, existing ClinicalAncillary visibility; max 5. No draft or linked-private-encounter leakage.
- unsigned_visits {data:[{id,chief_complaint,occurred_at}],total}: current patient's drafts owned by current provider+author, max 5.

## Task 1 — Clinic workflow backend (parallel owner)

- [x] RED tests: arrival/start/checkout timestamps and retry preservation; stale status rejection; pre-charting does not start; private drafts never leak to reception/other doctors; own draft resume; clinic-day timezone edges; scoped filters/search/pagination including >50 visits.
- [x] Artisan migration + Appointment casts/relation; BookingService transition expected status/idempotence/timestamps; ClinicalRecords.start timestamp update only after authorization; DashboardController/worklist service with fixed props and clinician attention.
- [x] Focused tests pass. Preserve existing booking/scheduling/clinical tests. No full suite concurrently with builds.

## Task 2 — Clinical summary and patient overview (root)

- [x] RED tests: authorized signed/issued summary, no other clinician draft/restricted order leakage, empty allergy list distinguished from old review, signed vitals with zero values, patient visit timeline timezone/scope/archival.
- [x] Clinical summary service + ClinicalChartController props, PatientController visit metadata only; reuse existing ClinicalAncillary visibility.
- [x] Focused tests pass with existing chart/patient coverage.

## Task 3 — Workflow UI (parallel frontend owner)

- [x] Rewrite Today into a wide readable worklist: date/provider/location/search/stage filters, real counts, arrival/started/waiting info, check-in/start/resume/check-out/no-show/cancel actions, confirmation sidebars, stale errors, busy protection, pagination/refresh. No decorative placeholder counters.
- [x] Improve patient profile with useful visit timeline and direct calendar links. Improve chart with clinician summary above readable visit history; distinguish recorded/current/historical data and retain private draft behavior. Group long clinical module nav into primary links + accessible more menu with active location.
- [x] Typecheck; root builds after writers quiescent. Browser desktop/mobile verification unavailable because tool initialization fails (kernel assets path). No visual QA claimed.

## Task 4 — Integrated verification/review

- [x] PHP formatting/full suite, types/build, diff check; targeted fresh review for clinical privacy, stale mutations and timezone/query boundaries; fix material findings.
- [x] Apply migration only to isolated local preview and leave Today page available. Update progress with fresh results, local/manual mode and external/provider/visual limits.
