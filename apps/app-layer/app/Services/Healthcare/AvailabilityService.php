<?php

namespace App\Services\Healthcare;

use App\Models\Appointment;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\Provider;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class AvailabilityService
{
    public function slots(Provider $provider, ClinicLocation $location, HealthcareService $service, CarbonImmutable $from, CarbonImmutable $to, ?Appointment $ignore = null, bool $forExistingAppointment = false): array
    {
        $this->validateEntities($provider, $location, $service);
        if ($to <= $from || $from->diffInSeconds($to) > 31 * 86400) {
            throw ValidationException::withMessages(['from' => 'Choose a date range of up to 31 days.']);
        }
        if (! $provider->active) {
            return [];
        }
        $zone = $location->timezone;
        $firstDay = $from->setTimezone($zone)->startOfDay();
        $lastDay = $to->setTimezone($zone)->startOfDay();
        $rules = $provider->availability()->where('clinic_location_id', $location->id)->get();
        $duration = (int) $service->duration_minutes;
        $before = (int) $provider->buffer_before_minutes;
        $after = (int) $provider->buffer_after_minutes;
        $occupiedFrom = $from->subMinutes($before);
        $occupiedTo = $to->addMinutes($duration + $after);
        $bookings = $provider->appointments()->where('status', '!=', 'cancelled')
            ->when($ignore, fn ($q) => $q->whereKeyNot($ignore->id))
            ->where('ends_at', '>=', $occupiedFrom->subMinutes(120)->utc())->where('starts_at', '<=', $occupiedTo->addMinutes(120)->utc())->get();
        $blocks = $provider->blocks()->where('ends_at', '>', $occupiedFrom->utc())->where('starts_at', '<', $occupiedTo->utc())->get();
        $notice = CarbonImmutable::now('UTC')->addMinutes($provider->minimum_notice_minutes);
        $horizon = CarbonImmutable::now($zone)->addDays($provider->booking_horizon_days)->endOfDay()->utc();
        $duration = (int) $service->duration_minutes;
        $before = (int) $provider->buffer_before_minutes;
        $after = (int) $provider->buffer_after_minutes;
        $slots = [];
        for ($day = $firstDay; $day <= $lastDay; $day = $day->addDay()) {
            foreach ($rules->where('weekday', $day->isoWeekday()) as $rule) {
                $workStart = CarbonImmutable::parse($day->format('Y-m-d').' '.$rule->start_time, $zone);
                $workEnd = CarbonImmutable::parse($day->format('Y-m-d').' '.$rule->end_time, $zone);
                for ($start = $workStart->addMinutes($before); $start->addMinutes($duration + $after) <= $workEnd; $start = $start->addMinutes(5)) {
                    $utc = $start->utc();
                    $end = $utc->addMinutes($duration);
                    if ($utc < $from || $utc >= $to || (! $forExistingAppointment && ($utc < $notice || $utc <= CarbonImmutable::now('UTC') || $utc > $horizon))) {
                        continue;
                    }
                    $occupiedStart = $utc->subMinutes($before);
                    $occupiedEnd = $end->addMinutes($after);
                    $conflict = $bookings->contains(fn ($a) => $this->overlaps($occupiedStart, $occupiedEnd, $a->starts_at->subMinutes($a->buffer_before_minutes), $a->ends_at->addMinutes($a->buffer_after_minutes)))
                        || $blocks->contains(fn ($b) => $this->overlaps($occupiedStart, $occupiedEnd, $b->starts_at, $b->ends_at));
                    if (! $conflict) {
                        $slots[$utc->toIso8601String()] = ['starts_at' => $utc->toIso8601String(), 'ends_at' => $end->toIso8601String(), 'timezone' => $zone,
                            'duration_minutes' => $duration, 'buffer_before_minutes' => $before, 'buffer_after_minutes' => $after];
                    }
                }
            }
        }
        ksort($slots);

        return array_values($slots);
    }

    public function assertBookable(Provider $provider, ClinicLocation $location, HealthcareService $service, CarbonImmutable $startsAt, ?Appointment $ignore = null, bool $forExistingAppointment = false): array
    {
        $day = $startsAt->setTimezone($location->timezone)->startOfDay();
        foreach ($this->slots($provider, $location, $service, $day, $day->addDay(), $ignore, $forExistingAppointment) as $slot) {
            if (CarbonImmutable::parse($slot['starts_at'])->equalTo($startsAt)) {
                return $slot;
            }
        }
        throw ValidationException::withMessages(['starts_at' => 'This slot is no longer available. Choose another time.']);
    }

    public function overlaps(CarbonImmutable $start, CarbonImmutable $end, CarbonImmutable $otherStart, CarbonImmutable $otherEnd): bool
    {
        return $start < $otherEnd && $end > $otherStart;
    }

    private function validateEntities(Provider $provider, ClinicLocation $location, HealthcareService $service): void
    {
        $tenant = Organization::currentId();
        abort_unless($tenant && $provider->organization_id === $tenant && $location->organization_id === $tenant && $service->organization_id === $tenant, 404);
        if (! $provider->locations()->whereKey($location->id)->exists() || ! $provider->services()->whereKey($service->id)->exists()) {
            throw ValidationException::withMessages(['provider_id' => 'This provider does not offer that service at the selected location.']);
        }
    }
}
