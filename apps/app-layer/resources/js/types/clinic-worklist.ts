import type { AppointmentRecord } from './healthcare';
export type VisitStage = 'scheduled' | 'waiting' | 'in_consultation' | 'ready_checkout' | 'completed' | 'cancelled' | 'no_show';
export const visitStageLabels: Record<VisitStage, string> = { scheduled: 'Scheduled', waiting: 'Waiting', in_consultation: 'In consultation', ready_checkout: 'Ready for checkout', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' };
export type RecordedVisit = AppointmentRecord & { checked_in_at: string | null; consultation_started_at: string | null; completed_at: string | null };
export type WorklistVisit = RecordedVisit & { patient: AppointmentRecord['patient'] & { status: string }; visit_stage: VisitStage; waiting_minutes: number | null; can_start: boolean; encounter: { id: number; status: string } | null };
export function dateTimeInZone(instant: string, timezone: string): string { return new Date(instant).toLocaleString(undefined, { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
export type ClinicalSummary = {
    problems: { data: { id: number; name: string; code: string | null; onset_date: string | null }[]; total: number };
    allergies: { data: { id: number; allergen: string; reaction: string | null; severity: string | null }[]; total: number };
    allergy_review: { status: string; at: string; encounter_id: number; amended?: boolean } | null;
    latest_vitals: { encounter_id: number; recorded_at: string; provider_name: string; values: Record<string, number | null>; amended?: boolean } | null;
    recent_prescriptions: { id: number; provider_name: string; issued_at: string; medicines: string[]; item_count: number }[];
    pending_results: { data: { id: number; kind: string; name: string; result_flag: string | null; resulted_at: string }[]; total: number };
    unsigned_visits: { data: { id: number; chief_complaint: string | null; occurred_at: string }[]; total: number };
};
