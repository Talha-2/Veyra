<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\Provider;
use App\Services\Agent\ActingFor;
use App\Services\Healthcare\AppointmentPresenter;
use App\Services\Healthcare\AvailabilityService;
use App\Services\Healthcare\BookingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class SchedulingController extends Controller
{
    public function providers(Request $request)
    {
        ActingFor::from($request);

        return response()->json(['providers' => Provider::where('active', true)->with('locations', 'services')->orderBy('name')->limit(200)->get()->map(fn ($p) => [
            'id' => $p->id, 'name' => $p->name, 'specialty' => $p->specialty,
            'locations' => $p->locations->map(fn ($l) => $l->only('id', 'name', 'timezone')),
            'services' => $p->services->map(fn ($s) => $s->only('id', 'name', 'duration_minutes', 'fee_minor', 'currency')),
        ])]);
    }

    public function slots(Request $request, AvailabilityService $availability)
    {
        $scope = ActingFor::from($request);
        $data = $request->validate(['provider_id' => ['required', 'integer'], 'location_id' => ['required', 'integer'], 'service_id' => ['required', 'integer'], 'from' => ['required', 'date'], 'to' => ['required', 'date', 'after:from'], 'ignore_appointment_id' => ['nullable', 'integer']]);
        $ignore = ! empty($data['ignore_appointment_id']) ? Appointment::findOrFail($data['ignore_appointment_id']) : null;
        abort_if($ignore && (! $scope->allowsAppointment($ignore) || $ignore->provider_id !== (int) $data['provider_id']), 404);

        return response()->json(['slots' => $availability->slots(Provider::findOrFail($data['provider_id']), ClinicLocation::findOrFail($data['location_id']), HealthcareService::findOrFail($data['service_id']), CarbonImmutable::parse($data['from']), CarbonImmutable::parse($data['to']), $ignore)]);
    }

    public function index(Request $request)
    {
        $scope = ActingFor::from($request);
        $query = Appointment::with('patient.contact', 'provider', 'location', 'service')->where('starts_at', '>=', CarbonImmutable::now()->subDay());
        if ($scope->customerFacing()) {
            $query->whereHas('patient', fn ($p) => $p->where('contact_id', $scope->contactId() ?? -1));
        } elseif ($request->filled('patient_id')) {
            $request->validate(['patient_id' => ['integer']]);
            $query->where('patient_id', $request->integer('patient_id'));
        }

        return response()->json(['appointments' => $query->orderBy('starts_at')->limit(50)->get()->map(fn ($a) => AppointmentPresenter::record($a, ! $scope->customerFacing()))]);
    }

    public function store(Request $request, BookingService $service)
    {
        $scope = ActingFor::from($request);
        $patientId = $request->input('patient_id');
        if ($scope->customerFacing()) {
            $patient = $scope->contactId() ? Patient::where('contact_id', $scope->contactId())->where('status', 'active')->first() : null;
            if (! $patient || ($patientId !== null && (int) $patientId !== $patient->id)) {
                return response()->json(['error' => 'not_permitted', 'message' => 'A staff member must register and link this patient before booking. The agent can only book for the patient in this conversation.'], 403);
            }
            $patientId = $patient->id;
        }
        $this->confirmation($request);
        $data = $request->validate(collect(BookingService::rules())->except('patient_id')->all());
        $request->merge(['patient_id' => $patientId]);
        $request->validate(['patient_id' => ['required', 'integer']]);
        $a = $service->book([...$data, 'patient_id' => $patientId], null, 'agent', $scope->conversation?->id);

        return response()->json(['appointment' => AppointmentPresenter::record($a)], 201);
    }

    public function reschedule(Request $request, Organization $organization, Appointment $appointment, BookingService $service)
    {
        abort_unless(ActingFor::from($request)->allowsAppointment($appointment), 404);
        $this->confirmation($request);
        $request->validate(['starts_at' => ['required', 'date']]);
        $a = $service->reschedule($appointment, CarbonImmutable::parse($request->input('starts_at')), null);

        return response()->json(['appointment' => AppointmentPresenter::record($a)]);
    }

    public function cancel(Request $request, Organization $organization, Appointment $appointment, BookingService $service)
    {
        abort_unless(ActingFor::from($request)->allowsAppointment($appointment), 404);
        $this->confirmation($request);

        return response()->json(['appointment' => AppointmentPresenter::record($service->cancel($appointment, null))]);
    }

    private function confirmation(Request $request): void
    {
        $request->validate(['confirmed' => ['required', 'accepted']]);
    }
}
