<?php

namespace App\Services\Healthcare;

use App\Models\Action;

class HealthcareActions
{
    public const SLUGS = ['list_providers', 'available_slots', 'list_appointments', 'book_appointment', 'reschedule_appointment', 'cancel_appointment'];

    public static function sync(): void
    {
        $integer = ['type' => 'integer'];
        $string = ['type' => 'string'];
        $confirmed = ['type' => 'boolean', 'description' => 'Only after explicit patient confirmation.'];
        $catalog = [
            'list_providers' => ['List providers', 'List active clinicians, services and clinic locations.', [], [], false],
            'available_slots' => ['Check provider availability', 'Check real free slots, without exposing other patients.',
                ['provider_id' => $integer, 'location_id' => $integer, 'service_id' => $integer, 'from' => $string, 'to' => $string, 'ignore_appointment_id' => $integer], ['provider_id', 'location_id', 'service_id', 'from', 'to'], false],
            'list_appointments' => ['List appointments', 'Customer conversations see only their own upcoming appointments.', ['patient_id' => $integer], [], false],
            'book_appointment' => ['Book appointment', 'Book a real calendar slot after confirming the provider, service and exact local date/time.',
                ['provider_id' => $integer, 'location_id' => $integer, 'service_id' => $integer, 'starts_at' => $string, 'patient_id' => $integer, 'confirmed' => $confirmed], ['provider_id', 'location_id', 'service_id', 'starts_at', 'confirmed'], true],
            'reschedule_appointment' => ['Reschedule appointment', 'Move an existing booking only after the patient confirms the new time.',
                ['appointment_id' => $integer, 'starts_at' => $string, 'confirmed' => $confirmed], ['appointment_id', 'starts_at', 'confirmed'], true],
            'cancel_appointment' => ['Cancel appointment', 'Cancel only after the patient explicitly confirms the selected appointment.',
                ['appointment_id' => $integer, 'confirmed' => $confirmed], ['appointment_id', 'confirmed'], true],
        ];
        foreach ($catalog as $slug => [$name, $description, $properties, $required, $write]) {
            Action::firstOrCreate(['slug' => $slug], ['kind' => 'internal', 'name' => $name, 'description' => $description,
                'parameters' => ['type' => 'object', 'properties' => $properties ?: new \stdClass, 'required' => $required],
                'is_durable_write' => $write, 'is_idempotent' => ! $write]);
        }
    }
}
