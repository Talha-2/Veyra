<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Services\Healthcare\BookingService;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
use Tests\SchedulingTestCase;

class AppointmentBookingTest extends SchedulingTestCase
{
    public function test_staff_booking_persists_and_repeat_submission_returns_same_record(): void
    {
        $service = app(BookingService::class);
        $appointment = $service->book($this->booking(), $this->owner, 'staff');
        $retry = $service->book($this->booking(), $this->owner, 'staff');
        $this->assertSame($appointment->id, $retry->id);
        $this->assertSame(1, Appointment::count());
        $this->assertSame('booked', $appointment->status);
        $this->assertSame('2026-10-12T04:30:00+00:00', $appointment->ends_at->toIso8601String());
    }

    public function test_stale_slot_and_same_key_different_payload_are_rejected(): void
    {
        $service = app(BookingService::class);
        $service->book($this->booking(), $this->owner, 'staff');
        foreach ([$this->booking('2026-10-12T04:00:00Z', 'second'), $this->booking('2026-10-12T05:00:00Z', 'booking-one')] as $payload) {
            try {
                $service->book($payload, $this->owner, 'staff');
                $this->fail('Expected a booking refusal.');
            } catch (ValidationException) {
                $this->assertSame(1, Appointment::count());
            }
        }
    }

    public function test_cancel_releases_slot_and_is_idempotent(): void
    {
        $service = app(BookingService::class);
        $a = $service->book($this->booking(), $this->owner, 'staff');
        $service->cancel($a, $this->owner);
        $service->cancel($a, $this->owner);
        $new = $service->book($this->booking('2026-10-12T04:00:00Z', 'new'), $this->owner, 'staff');
        $this->assertSame('booked', $new->status);
        $this->assertSame('cancelled', $a->fresh()->status);
    }

    public function test_failed_reschedule_keeps_original_appointment(): void
    {
        $service = app(BookingService::class);
        $a = $service->book($this->booking(), $this->owner, 'staff');
        $service->book($this->booking('2026-10-12T05:00:00Z', 'second'), $this->owner, 'staff');
        try {
            $service->reschedule($a, CarbonImmutable::parse('2026-10-12T05:00:00Z'), $this->owner);
            $this->fail('Expected a conflict.');
        } catch (ValidationException) {
            $this->assertSame('2026-10-12T04:00:00+00:00', $a->fresh()->starts_at->toIso8601String());
        }
    }

    public function test_archived_patient_cannot_be_booked(): void
    {
        $this->patient->update(['status' => 'archived']);
        $this->expectException(ValidationException::class);
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
    }

    public function test_status_transitions_cannot_skip_check_in(): void
    {
        $service = app(BookingService::class);
        $a = $service->book($this->booking(), $this->owner, 'staff');
        try {
            $service->transition($a, 'completed', $this->owner);
            $this->fail('Expected invalid transition.');
        } catch (ValidationException) {
            $this->assertSame('booked', $a->fresh()->status);
        }
        $service->transition($a, 'checked_in', $this->owner);
        $service->transition($a, 'completed', $this->owner);
        $this->assertSame('completed', $a->fresh()->status);
    }
}
