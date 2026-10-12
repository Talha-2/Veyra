export type ClinicalTemplate = { id: number; name: string; kind: 'note' | 'quick_text'; active: boolean; history: string | null; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null };
export type PatientQuestionnaire = { id: number; title: string; questions: string[]; active: boolean; updated_at: string };
export type QuestionnaireResponse = { id: number; title: string; questions: string[]; answers: string[]; source: 'patient' | 'clinician'; recorder_name: string; created_at: string };
