export type ClinicalPatient = { id: number; name: string; mrn: string; status: string; birth_date: string | null };
export type Encounter = {
    id: number; status: 'draft' | 'signed'; version: number; provider_name: string; author_name: string;
    occurred_at: string; signed_at: string | null; appointment_id: number | null;
    chief_complaint: string | null; history: string | null; allergy_status: 'not_reviewed' | 'unknown' | 'none_known' | 'known'; allergies: string | null;
    subjective: string | null; objective: string | null; assessment: string | null; plan: string | null;
    vitals: Record<string, number | null> | null;
    amendments: { id: number; author_name: string; reason: string; content: string; created_at: string }[];
};
export const allergyLabels = { not_reviewed: 'Not yet reviewed', unknown: 'Unknown after review', none_known: 'No known allergies', known: 'Known allergies' };
export const vitalFields = [
    ['temperature_c', 'Temperature (°C)'], ['pulse_bpm', 'Pulse (beats/min)'], ['respiratory_rate', 'Respiratory rate (breaths/min)'],
    ['oxygen_percent', 'Oxygen saturation (%)'], ['systolic_mmhg', 'Systolic BP (mmHg)'], ['diastolic_mmhg', 'Diastolic BP (mmHg)'],
    ['weight_kg', 'Weight (kg)'], ['height_cm', 'Height (cm)'],
] as const;
