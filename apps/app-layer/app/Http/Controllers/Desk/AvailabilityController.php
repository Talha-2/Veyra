<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Http\Requests\Desk\StoreTimeBlockRequest;
use App\Http\Requests\Desk\UpdateAvailabilityRequest;
use App\Models\Appointment;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Provider;
use App\Models\ProviderTimeBlock;
use App\Services\Healthcare\AvailabilityService;
use App\Services\Healthcare\ProviderSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class AvailabilityController extends Controller
{
    public function slots(Request $request, Provider $provider, AvailabilityService $service)
    {
        $data = $request->validate(['location_id' => ['required', 'integer'], 'service_id' => ['required', 'integer'], 'from' => ['required', 'date'], 'to' => ['required', 'date', 'after:from'], 'ignore_appointment_id' => ['nullable', 'integer']]);
        $ignore = ! empty($data['ignore_appointment_id']) ? Appointment::findOrFail($data['ignore_appointment_id']) : null;
        abort_if($ignore && $ignore->provider_id !== $provider->id, 404);

        return response()->json(['slots' => $service->slots($provider, ClinicLocation::findOrFail($data['location_id']), HealthcareService::findOrFail($data['service_id']), CarbonImmutable::parse($data['from']), CarbonImmutable::parse($data['to']), $ignore)]);
    }

    public function update(UpdateAvailabilityRequest $request, Provider $provider, ProviderSchedule $schedule)
    {
        $schedule->replace($provider, $request->validated('intervals'), $request->user());

        return back()->with('success', 'Working hours saved.');
    }

    public function block(StoreTimeBlockRequest $request, Provider $provider, ProviderSchedule $schedule)
    {
        $schedule->block($provider, $request->validated(), $request->user());

        return back()->with('success', 'Time blocked.');
    }

    public function unblock(Request $request, Provider $provider, ProviderTimeBlock $block, ProviderSchedule $schedule)
    {
        $schedule->unblock($provider, $block, $request->user());

        return back()->with('success', 'Time block removed.');
    }
}
