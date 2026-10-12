<?php

namespace App\Services\Healthcare;

use App\Models\Activity;
use App\Models\Appointment;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\Provider;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class BookingService
{
    public function __construct(private AvailabilityService $availability) {}

    public static function rules(): array
    {
        return ['patient_id' => ['required', 'integer'], 'provider_id' => ['required', 'integer'], 'clinic_location_id' => ['required', 'integer'],
            'healthcare_service_id' => ['required', 'integer'], 'starts_at' => ['required', 'date'], 'idempotency_key' => ['required', 'string', 'max:180']];
    }

    public function book(array $attributes, ?User $actor, string $source, ?int $conversationId = null): Appointment
    {
        abort_unless(Organization::currentId(), 404);
        $data = Validator::make($attributes, self::rules())->validate();
        $start = CarbonImmutable::parse($data['starts_at'])->utc();
        $fingerprint = hash('sha256', json_encode([$data['patient_id'], $data['provider_id'], $data['clinic_location_id'], $data['healthcare_service_id'], $start->toIso8601String(), $source, $conversationId]));
        $write = function () use ($data, $start, $fingerprint, $actor, $source, $conversationId) {
            $provider = Provider::query()->lockForUpdate()->findOrFail($data['provider_id']);
            $existing = Appointment::where('idempotency_key', $data['idempotency_key'])->first();
            if ($existing) {
                return $this->replay($existing, $fingerprint);
            }
            $patient = Patient::query()->lockForUpdate()->findOrFail($data['patient_id']);
            if ($patient->status !== 'active' || ! $patient->contact()->exists()) {
                throw ValidationException::withMessages(['patient_id' => 'Choose an active patient.']);
            }
            $location = ClinicLocation::findOrFail($data['clinic_location_id']);
            $service = HealthcareService::findOrFail($data['healthcare_service_id']);
            $slot = $this->availability->assertBookable($provider, $location, $service, $start);
            $appointment = Appointment::create([...$data, ...$slot, 'starts_at' => $start, 'ends_at' => CarbonImmutable::parse($slot['ends_at']),
                'request_fingerprint' => $fingerprint, 'created_by' => $actor?->id, 'source' => $source, 'conversation_id' => $conversationId]);
            Activity::log($appointment, 'appointment.booked', 'Appointment booked', $actor, [], $source === 'agent' ? 'agent' : 'user');

            return $appointment;
        };
        try {
            return DB::transaction($write, 3);
        } catch (QueryException $e) {
            // A key submitted concurrently against different providers is still one request.
            if (in_array((string) $e->getCode(), ['23505', '23000'], true)) {
                $existing = Appointment::where('idempotency_key', $data['idempotency_key'])->first();
                if ($existing) {
                    return $this->replay($existing, $fingerprint);
                }
            }
            throw $e;
        }
    }

    public function reschedule(Appointment $appointment, CarbonImmutable $startsAt, ?User $actor): Appointment
    {
        return $this->mutate($appointment, function ($current, $provider) use ($startsAt, $actor) {
            if ($current->status !== 'booked' || $current->patient->status !== 'active' || $current->starts_at <= CarbonImmutable::now()) {
                throw ValidationException::withMessages(['starts_at' => 'Only a future booked appointment for an active patient can be rescheduled.']);
            }
            $slot = $this->availability->assertBookable($provider, $current->location, $current->service, $startsAt, $current);
            $current->fill([...$slot, 'starts_at' => $startsAt->utc(), 'ends_at' => CarbonImmutable::parse($slot['ends_at'])])->save();
            Activity::log($current, 'appointment.rescheduled', 'Appointment rescheduled', $actor, [], $actor ? 'user' : 'agent');

            return $current;
        });
    }

    public function cancel(Appointment $appointment, ?User $actor, ?string $expectedStatus = null): Appointment
    {
        return $this->mutate($appointment, function ($current) use ($actor, $expectedStatus) {
            if ($current->status === 'cancelled') {
                return $current;
            }
            $this->assertExpectedStatus($current, $expectedStatus);
            if (! in_array($current->status, ['booked', 'checked_in'], true)) {
                throw ValidationException::withMessages(['status' => 'This appointment cannot be cancelled.']);
            }
            $current->update(['status' => 'cancelled']);
            Activity::log($current, 'appointment.cancelled', 'Appointment cancelled', $actor, [], $actor ? 'user' : 'agent');

            return $current;
        });
    }

    public function transition(Appointment $appointment, string $status, User $actor, ?string $expectedStatus = null): Appointment
    {
        if ($status === 'cancelled') {
            return $this->cancel($appointment, $actor, $expectedStatus);
        }

        return $this->mutate($appointment, function ($current) use ($status, $actor, $expectedStatus) {
            if ($current->status === $status) {
                return $current;
            }
            $this->assertExpectedStatus($current, $expectedStatus);
            $allowed = ['booked' => ['checked_in', 'no_show'], 'checked_in' => ['completed']];
            if (! in_array($status, $allowed[$current->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => 'This status change is not available.']);
            }
            $change = ['status' => $status];
            $timestamp = match ($status) {
                'checked_in' => 'checked_in_at', 'completed' => 'completed_at', default => null
            };
            if ($timestamp && ! $current->{$timestamp}) {
                $change[$timestamp] = now();
            }
            $current->forceFill($change)->save();
            Activity::log($current, 'appointment.'.$status, 'Appointment status changed to '.str_replace('_', ' ', $status), $actor);

            return $current;
        });
    }

    private function assertExpectedStatus(Appointment $appointment, ?string $expectedStatus): void
    {
        if ($expectedStatus !== null && $appointment->status !== $expectedStatus) {
            throw ValidationException::withMessages(['expected_status' => 'This visit changed in another window. Refresh before trying again.']);
        }
    }

    private function mutate(Appointment $appointment, callable $write): Appointment
    {
        abort_unless(Organization::currentId() && $appointment->organization_id === Organization::currentId(), 404);

        return DB::transaction(function () use ($appointment, $write) {
            $provider = Provider::query()->lockForUpdate()->findOrFail($appointment->provider_id);
            $current = Appointment::query()->lockForUpdate()->findOrFail($appointment->id);

            return $write($current, $provider);
        }, 3);
    }

    private function replay(Appointment $appointment, string $fingerprint): Appointment
    {
        if (! hash_equals($appointment->request_fingerprint, $fingerprint)) {
            throw ValidationException::withMessages(['idempotency_key' => 'This request key was already used for a different booking. Refresh and try again.']);
        }

        return $appointment;
    }
}
