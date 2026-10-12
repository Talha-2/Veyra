<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Services\Healthcare\AppointmentPresenter;
use App\Services\Healthcare\ClinicalRecords;
use App\Services\Healthcare\ClinicalSummary;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ClinicalChartController extends Controller
{
    public function index(Request $request, Patient $patient, ClinicalRecords $records, ClinicalSummary $summary): Response
    {
        $provider = $records->provider($request->user());
        Activity::log($patient, 'clinical.chart_viewed', 'Clinical chart accessed', $request->user());
        $data = $request->validate(['status' => ['nullable', Rule::in(['all', 'draft', 'signed'])], 'search' => ['nullable', 'string', 'max:200']]);
        $filters = ['status' => $data['status'] ?? 'all', 'search' => trim($data['search'] ?? '')];
        $encounters = ClinicalEncounter::where('patient_id', $patient->id)
            ->where(fn ($q) => $q->where('status', 'signed')->orWhere(fn ($draft) => $draft->where('provider_id', $provider->id)->where('author_user_id', $request->user()->id)))
            ->when($filters['status'] !== 'all', fn ($q) => $q->where('status', $filters['status']))
            ->when($filters['search'] !== '', fn ($q) => $q->where(fn ($match) => $match->whereRaw('lower(chief_complaint) like ?', ['%'.mb_strtolower($filters['search']).'%'])->orWhereRaw('lower(assessment) like ?', ['%'.mb_strtolower($filters['search']).'%'])))
            ->orderByDesc('occurred_at')->orderByDesc('id')->paginate(20)->withQueryString();

        return Inertia::render('desk/clinical-chart', ['patient' => $this->patient($patient), 'encounters' => $encounters,
            'filters' => $filters,
            'appointments' => Appointment::where('patient_id', $patient->id)->where('provider_id', $provider->id)
                ->whereIn('status', ['booked', 'checked_in', 'completed'])->orderByDesc('starts_at')->limit(50)->get(['id', 'starts_at', 'status', 'timezone']),
            'timezone' => Organization::current()->timezone ?: 'Asia/Karachi',
            'summary' => $summary->forPatient($patient, $request->user()),
            'provider_name' => $provider->name]);
    }

    public function store(Request $request, Patient $patient, ClinicalRecords $records): RedirectResponse
    {
        $encounter = $records->start($patient, $request->all(), $request->user());

        return redirect()->route('desk.encounters.show', $encounter);
    }

    public function show(Request $request, ClinicalEncounter $encounter, ClinicalRecords $records, ClinicalSummary $summary): Response
    {
        $provider = $records->assertRead($encounter, $request->user());
        Activity::log($encounter, 'encounter.viewed', 'Clinical encounter accessed', $request->user());
        $appointment = $encounter->appointment_id ? Appointment::with(['provider', 'location', 'service'])->find($encounter->appointment_id) : null;

        return Inertia::render('desk/encounter', ['encounter' => $encounter->load('amendments'), 'patient' => $this->patient($encounter->patient),
            'timezone' => Organization::current()->timezone ?: 'Asia/Karachi',
            'summary' => $summary->forPatient($encounter->patient, $request->user()),
            'appointment' => $appointment ? AppointmentPresenter::record($appointment) : null,
            'readiness' => $records->readiness($encounter, $request->user()),
            'current_allergies' => PatientAllergy::where('patient_id', $encounter->patient_id)->where('status', 'active')->get(['id', 'allergen', 'reaction', 'severity']),
            'can_edit' => $encounter->provider_id === $provider->id && $encounter->author_user_id === $request->user()->id]);
    }

    public function update(Request $request, ClinicalEncounter $encounter, ClinicalRecords $records): RedirectResponse
    {
        $records->save($encounter, $request->all(), $request->user());

        return back()->with('success', 'Consultation draft saved.');
    }

    public function sign(Request $request, ClinicalEncounter $encounter, ClinicalRecords $records): RedirectResponse
    {
        $records->sign($encounter, $request->all(), $request->user());

        return back()->with('success', 'Consultation signed.');
    }

    public function complete(Request $request, ClinicalEncounter $encounter, ClinicalRecords $records): RedirectResponse
    {
        $records->complete($encounter, $request->all(), $request->user());

        return back()->with('success', 'Consultation saved and signed.');
    }

    public function amend(Request $request, ClinicalEncounter $encounter, ClinicalRecords $records): RedirectResponse
    {
        $records->amend($encounter, $request->all(), $request->user());

        return back()->with('success', 'Amendment added. Original note preserved.');
    }

    private function patient(Patient $patient): array
    {
        return ['id' => $patient->id, 'name' => $patient->contact?->displayName(), 'mrn' => $patient->mrn, 'status' => $patient->status,
            'birth_date' => $patient->birth_date?->format('Y-m-d')];
    }
}
