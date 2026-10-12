export interface PatientRecord {
    id: number; mrn: string; status: 'active' | 'archived'; birth_date: string | null; age: number | null; created_at: string;
    contact: { id: number; name: string; phone: string | null; email: string | null };
    administrative_sex?: string | null; preferred_language?: string | null;
    address_line_1?: string | null; address_line_2?: string | null; city?: string | null; province?: string | null;
    postal_code?: string | null; country?: string | null; emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null; emergency_contact_phone?: string | null;
}
export interface PageResult<T> { data: T[]; total: number; links: { url: string | null; label: string; active: boolean }[] }
export interface ClinicLocation { id: number; name: string; timezone: string; address?: string | null }
export interface HealthcareService { id: number; name: string; duration_minutes: number; fee_minor?: number | null; currency: string }
export interface WorkingInterval { id?: number; clinic_location_id: number; weekday: number; start_time: string; end_time: string }
export interface ProviderRecord {
    id: number; name: string; specialty: string | null; active: boolean; registration_number?: string | null; qualifications?: string | null; user_id?: number | null;
    buffer_before_minutes: number; buffer_after_minutes: number; minimum_notice_minutes: number; booking_horizon_days: number;
    locations: ClinicLocation[]; services: HealthcareService[]; availability?: WorkingInterval[]; blocks?: { id: number; starts_at: string; ends_at: string; label: string | null }[];
}
export interface AppointmentRecord {
    id: number; status: string; starts_at: string; ends_at: string; timezone: string; patient: { id: number; name: string; mrn: string };
    provider_id: number; clinic_location_id: number; healthcare_service_id: number; provider: string; location: string; service: string;
}
export interface AvailableSlot { starts_at: string; ends_at: string; timezone: string }
