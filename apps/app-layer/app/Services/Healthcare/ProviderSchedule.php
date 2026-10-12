<?php

namespace App\Services\Healthcare;

use App\Models\Activity;
use App\Models\Provider;
use App\Models\ProviderTimeBlock;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProviderSchedule
{
    public function __construct(private AvailabilityService $availability) {}

    public function replace(Provider $provider, array $intervals, User $actor): void
    {
        DB::transaction(function () use ($provider, $intervals, $actor) {
            $provider = Provider::query()->lockForUpdate()->findOrFail($provider->id);
            $locations = $provider->locations()->get()->keyBy('id');
            foreach ($intervals as $interval) {
                if (! $locations->has($interval['clinic_location_id']) || $interval['end_time'] <= $interval['start_time']
                    || ((int) substr($interval['start_time'], 3)) % 5 || ((int) substr($interval['end_time'], 3)) % 5) {
                    throw ValidationException::withMessages(['intervals' => 'Use assigned locations, same-day intervals and times in five-minute increments.']);
                }
            }
            // Compare real dated instants so differing location timezones cannot overlap.
            $windows = [];
            $today = CarbonImmutable::now('UTC')->startOfDay();
            foreach ($intervals as $interval) {
                $zone = $locations[$interval['clinic_location_id']]->timezone;
                for ($day = $today->setTimezone($zone)->startOfDay(); $day < $today->addDays($provider->booking_horizon_days + 7); $day = $day->addDay()) {
                    if ($day->isoWeekday() !== (int) $interval['weekday']) {
                        continue;
                    }
                    $start = CarbonImmutable::parse($day->format('Y-m-d').' '.$interval['start_time'], $zone)->utc();
                    $end = CarbonImmutable::parse($day->format('Y-m-d').' '.$interval['end_time'], $zone)->utc();
                    $windows[] = [$start, $end];
                }
            }
            usort($windows, fn ($a, $b) => $a[0] <=> $b[0]);
            for ($i = 1; $i < count($windows); $i++) {
                if ($windows[$i][0] < $windows[$i - 1][1]) {
                    throw ValidationException::withMessages(['intervals' => 'Working intervals overlap, possibly across locations.']);
                }
            }
            $provider->availability()->delete();
            foreach ($intervals as $interval) {
                $provider->availability()->create($interval);
            }
            foreach ($provider->appointments()->where('status', '!=', 'cancelled')->where('starts_at', '>', CarbonImmutable::now())->with('location', 'service')->get() as $appointment) {
                try {
                    $this->availability->assertBookable($provider, $appointment->location, $appointment->service, $appointment->starts_at, $appointment, true);
                } catch (ValidationException) {
                    throw ValidationException::withMessages(['intervals' => 'These hours would invalidate a future appointment. Reschedule it first.']);
                }
            }
            Activity::log($provider, 'provider.availability_updated', 'Provider working hours saved', $actor);
        });
    }

    public function block(Provider $provider, array $data, User $actor): ProviderTimeBlock
    {
        return DB::transaction(function () use ($provider, $data, $actor) {
            $provider = Provider::query()->lockForUpdate()->findOrFail($provider->id);
            $start = CarbonImmutable::parse($data['starts_at'])->utc();
            $end = CarbonImmutable::parse($data['ends_at'])->utc();
            foreach ($provider->appointments()->where('status', '!=', 'cancelled')->where('ends_at', '>=', $start->subMinutes(120))->where('starts_at', '<=', $end->addMinutes(120))->get() as $a) {
                if ($this->availability->overlaps($start, $end, $a->starts_at->subMinutes($a->buffer_before_minutes), $a->ends_at->addMinutes($a->buffer_after_minutes))) {
                    throw ValidationException::withMessages(['starts_at' => 'This block overlaps an appointment. Reschedule or cancel the appointment first.']);
                }
            }
            $block = $provider->blocks()->create([...$data, 'starts_at' => $start, 'ends_at' => $end]);
            Activity::log($provider, 'provider.time_blocked', 'Provider time blocked', $actor);

            return $block;
        });
    }

    public function unblock(Provider $provider, ProviderTimeBlock $block, User $actor): void
    {
        DB::transaction(function () use ($provider, $block, $actor) {
            $provider = Provider::query()->lockForUpdate()->findOrFail($provider->id);
            abort_unless($block->provider_id === $provider->id, 404);
            $block->delete();
            Activity::log($provider, 'provider.block_removed', 'Provider time block removed', $actor);
        });
    }
}
