<?php

namespace App\Services\Healthcare;

use App\Models\Appointment;

class AppointmentPresenter
{
    public static function record(Appointment $appointment, bool $withPatient = false): array
    {
        $data = ['id' => $appointment->id, 'status' => $appointment->status, 'starts_at' => $appointment->starts_at->toIso8601String(),
            'checked_in_at' => $appointment->checked_in_at?->toIso8601String(), 'consultation_started_at' => $appointment->consultation_started_at?->toIso8601String(), 'completed_at' => $appointment->completed_at?->toIso8601String(),
            'ends_at' => $appointment->ends_at->toIso8601String(), 'timezone' => $appointment->timezone,
            'provider_id' => $appointment->provider_id, 'clinic_location_id' => $appointment->clinic_location_id, 'healthcare_service_id' => $appointment->healthcare_service_id,
            'provider' => $appointment->provider->name, 'location' => $appointment->location->name, 'service' => $appointment->service->name];
        if ($withPatient) {
            $data['patient'] = ['id' => $appointment->patient_id, 'name' => $appointment->patient->contact?->displayName() ?? 'Unavailable contact', 'mrn' => $appointment->patient->mrn, 'status' => $appointment->patient->status];
        }

        return $data;
    }
}
