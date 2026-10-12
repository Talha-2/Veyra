<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\ClinicalEncounter;
use App\Models\MedicationAdministration;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\PatientProblem;
use App\Models\Prescription;
use App\Services\Healthcare\ClinicalCare;
use App\Services\Healthcare\ClinicalRecords;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Inertia\Inertia;
use Inertia\Response;

class ClinicalCareController extends Controller
{
    private function patientRecord(Patient $patient): array
    {
        return ['id' => $patient->id, 'name' => $patient->contact->displayName(), 'mrn' => $patient->mrn, 'status' => $patient->status];
    }

    public function care(Request $request, Patient $patient, ClinicalCare $care, ClinicalRecords $records): Response
    {
        $care->patient($patient, $request->user());
        $provider = $records->provider($request->user());

        return Inertia::render('desk/care', ['patient' => $this->patientRecord($patient), 'problems' => PatientProblem::where('patient_id', $patient->id)->latest()->get(), 'allergies' => PatientAllergy::where('patient_id', $patient->id)->latest()->get(), 'prescriptions' => Prescription::where('patient_id', $patient->id)->where(fn ($q) => $q->whereNotNull('issued_at')->orWhere(fn ($draft) => $draft->where('provider_id', $provider->id)->where('author_user_id', $request->user()->id)))->latest()->limit(30)->get()]);
    }

    public function problem(Request $request, Patient $patient, ClinicalCare $care): RedirectResponse
    {
        $care->add($patient, $request->user(), 'problem', $request->all());

        return back()->with('success', 'Problem recorded.');
    }

    public function allergy(Request $request, Patient $patient, ClinicalCare $care): RedirectResponse
    {
        $care->add($patient, $request->user(), 'allergy', $request->all());

        return back()->with('success', 'Allergy recorded.');
    }

    public function resolve(Request $request, PatientProblem $problem, ClinicalCare $care): RedirectResponse
    {
        $care->close($problem, $request->user(), $request->all());

        return back()->with('success', 'Problem resolved.');
    }

    public function inactivate(Request $request, PatientAllergy $allergy, ClinicalCare $care): RedirectResponse
    {
        $care->close($allergy, $request->user(), $request->all());

        return back()->with('success', 'Allergy marked inactive.');
    }

    public function prescriptions(Request $request, ClinicalRecords $records): Response
    {
        $provider = $records->provider($request->user());
        $request->validate(['patient_id' => ['nullable', 'integer']]);
        $patient = $request->filled('patient_id') ? Patient::findOrFail($request->integer('patient_id')) : null;

        return Inertia::render('desk/prescriptions', ['patient' => $patient ? $this->patientRecord($patient) : null, 'prescriptions' => Prescription::with('patient.contact')->where(fn ($q) => $q->whereNotNull('issued_at')->orWhere(fn ($draft) => $draft->where('provider_id', $provider->id)->where('author_user_id', $request->user()->id)))->when($patient, fn ($q) => $q->where('patient_id', $patient->id))->latest()->paginate(20)->withQueryString(), 'patients' => Patient::with('contact')->where('status', 'active')->limit(100)->get()->map(fn ($p) => $this->patientRecord($p))]);
    }

    public function draft(Request $request, Patient $patient, ClinicalCare $care): RedirectResponse
    {
        $rx = $care->draft($patient, $request->user(), $request->all());

        return redirect('/desk/prescriptions/'.$rx->id);
    }

    public function prescription(Request $request, Prescription $prescription, ClinicalCare $care): Response
    {
        $care->assertRead($prescription, $request->user());

        return Inertia::render('desk/prescription', ['prescription' => $prescription, 'patient' => array_replace($this->patientRecord($prescription->patient), Arr::only($prescription->patient_snapshot ?? [], ['name', 'mrn'])), 'allergies' => PatientAllergy::where('patient_id', $prescription->patient_id)->where('status', 'active')->get(), 'can_edit' => $prescription->author_user_id === $request->user()->id && $prescription->provider_id === app(ClinicalRecords::class)->provider($request->user())->id, 'clinic' => ['name' => $prescription->patient_snapshot['clinic_name'] ?? Organization::current()->name, 'timezone' => $prescription->patient_snapshot['clinic_timezone'] ?? Organization::current()->timezone]]);
    }

    public function update(Request $request, Prescription $prescription, ClinicalCare $care): RedirectResponse
    {
        $care->change($prescription, $request->user(), $request->all(), 'edit');

        return back()->with('success', 'Draft saved.');
    }

    public function issue(Request $request, Prescription $prescription, ClinicalCare $care): RedirectResponse
    {
        $care->change($prescription, $request->user(), $request->all(), 'issue');

        return back()->with('success', 'Prescription issued.');
    }

    public function cancel(Request $request, Prescription $prescription, ClinicalCare $care): RedirectResponse
    {
        $care->change($prescription, $request->user(), $request->all(), 'cancel');

        return back()->with('success', 'Prescription cancelled.');
    }

    public function administrations(Request $request, ClinicalRecords $records): Response
    {
        $records->provider($request->user());
        $request->validate(['patient_id' => ['nullable', 'integer'], 'kind' => ['nullable', 'in:injection,vaccine']]);
        $patient = $request->filled('patient_id') ? Patient::findOrFail($request->integer('patient_id')) : null;

        return Inertia::render('desk/administrations', ['patient' => $patient ? $this->patientRecord($patient) : null, 'records' => MedicationAdministration::with('patient.contact')->when($patient, fn ($q) => $q->where('patient_id', $patient->id))->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->query('kind')))->latest('occurred_at')->paginate(20)->withQueryString(), 'patients' => Patient::with('contact')->where('status', 'active')->limit(100)->get()->map(fn ($p) => $this->patientRecord($p)), 'current_user_id' => $request->user()->id]);
    }

    public function administer(Request $request, Patient $patient, ClinicalCare $care): RedirectResponse
    {
        $care->administer($patient, $request->user(), $request->all());

        return back()->with('success', 'Administration recorded.');
    }

    public function void(Request $request, MedicationAdministration $administration, ClinicalCare $care): RedirectResponse
    {
        $care->close($administration, $request->user(), $request->all());

        return back()->with('success', 'Administration voided; history retained.');
    }

    public function notes(Request $request, ClinicalRecords $records): Response
    {
        $provider = $records->provider($request->user());
        $request->validate(['patient_id' => ['nullable', 'integer']]);
        $patient = $request->filled('patient_id') ? Patient::findOrFail($request->integer('patient_id')) : null;

        return Inertia::render('desk/chart-notes', ['encounters' => ClinicalEncounter::with('patient.contact')->where(fn ($q) => $q->where('status', 'signed')->orWhere(fn ($draft) => $draft->where('provider_id', $provider->id)->where('author_user_id', $request->user()->id)))->when($patient, fn ($q) => $q->where('patient_id', $patient->id))->latest('occurred_at')->paginate(20)->withQueryString()]);
    }

    public function flowsheets(Request $request, ClinicalRecords $records): Response
    {
        $provider = $records->provider($request->user());
        $request->validate(['patient_id' => ['nullable', 'integer']]);
        $patient = $request->filled('patient_id') ? Patient::findOrFail($request->integer('patient_id')) : null;

        return Inertia::render('desk/flowsheets', ['patient' => $patient ? $this->patientRecord($patient) : null, 'patients' => Patient::with('contact')->where('status', 'active')->limit(100)->get()->map(fn ($p) => $this->patientRecord($p)), 'visits' => $patient ? ClinicalEncounter::where('patient_id', $patient->id)->where(fn ($q) => $q->where('status', 'signed')->orWhere(fn ($draft) => $draft->where('provider_id', $provider->id)->where('author_user_id', $request->user()->id)))->latest('occurred_at')->limit(50)->get(['id', 'occurred_at', 'status', 'vitals']) : []]);
    }
}
