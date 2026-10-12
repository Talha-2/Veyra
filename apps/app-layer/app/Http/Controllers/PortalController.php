<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\Contact;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\PatientPortalAccess;
use App\Models\PatientPortalInvitation;
use App\Models\PatientProblem;
use App\Models\PatientQuestionnaire;
use App\Models\Prescription;
use App\Models\QuestionnaireResponse;
use App\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class PortalController extends Controller
{
    /** The grant, never a staff session value, supplies the tenant for portal medical reads. */
    private function scoped(string $model, int $organizationId): Builder
    {
        return $model::withoutGlobalScope(TenantScope::class)->where('organization_id', $organizationId);
    }

    private function grantedPatient(PatientPortalAccess $access): Patient
    {
        abort_unless(Organization::find($access->organization_id), 404);

        return $this->scoped(Patient::class, $access->organization_id)->findOrFail($access->patient_id);
    }

    private function invitationFor(Request $request, string $token, bool $lock = false): PatientPortalInvitation
    {
        abort_unless(preg_match('/^[a-zA-Z0-9]{64}$/', $token), 404);
        $query = PatientPortalInvitation::withoutGlobalScope(TenantScope::class)->where('token_hash', hash('sha256', $token));
        $invitation = ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
        abort_if($invitation->redeemed_at || $invitation->revoked_at || $invitation->expires_at->isPast(), 410, 'This invitation is no longer available. Ask the practice for a new link.');
        abort_unless(mb_strtolower(trim($request->user()->email)) === $invitation->email, 403, 'Sign in with the account email invited by the practice.');
        abort_unless(Organization::find($invitation->organization_id), 410);
        $patient = $this->scoped(Patient::class, $invitation->organization_id)->findOrFail($invitation->patient_id);
        abort_unless($patient->status === 'active', 410, 'This invitation is no longer available. Contact the practice.');

        return $invitation;
    }

    public function index(Request $request): Response
    {
        $accesses = PatientPortalAccess::where('user_id', $request->user()->id)->available()->get()->map(function ($access) {
            $organization = Organization::find($access->organization_id);
            if (! $organization) {
                return null;
            }
            $patient = $this->scoped(Patient::class, $access->organization_id)->find($access->patient_id);
            if (! $patient) {
                return null;
            }
            $contact = $this->scoped(Contact::class, $access->organization_id)->find($patient->contact_id);

            return ['id' => $access->id, 'patient_name' => $contact?->displayName() ?? 'Patient', 'practice_name' => $organization->name];
        })->filter()->values();

        return Inertia::render('portal/index', ['accesses' => $accesses]);
    }

    public function invitation(Request $request, string $token): Response
    {
        $invitation = $this->invitationFor($request, $token);

        return Inertia::render('portal/invitation', ['email' => $request->user()->email, 'practice_name' => Organization::findOrFail($invitation->organization_id)->name, 'share_clinical' => $invitation->share_clinical, 'expires_at' => $invitation->expires_at->toIso8601String(), 'redeem_url' => route('portal.redeem', ['token' => $token])]);
    }

    public function redeem(Request $request, string $token): RedirectResponse
    {
        $access = DB::transaction(function () use ($request, $token) {
            $invitation = $this->invitationFor($request, $token, true);
            $patient = $this->scoped(Patient::class, $invitation->organization_id)->lockForUpdate()->findOrFail($invitation->patient_id);
            abort_unless($patient->status === 'active', 410);
            $access = PatientPortalAccess::updateOrCreate(['organization_id' => $invitation->organization_id, 'patient_id' => $invitation->patient_id, 'user_id' => $request->user()->id], ['share_clinical' => $invitation->share_clinical, 'revoked_at' => null, 'expires_at' => null]);
            $invitation->update(['redeemed_at' => now()]);
            $this->audit($patient, $request, 'portal.redeemed', 'Patient portal invitation redeemed');

            return $access;
        });

        return redirect()->route('portal.patient', ['access' => $access->id])->with('success', 'Patient portal access is ready.');
    }

    private function audit(Patient $patient, Request $request, string $type, string $description): void
    {
        Activity::forceCreate(['organization_id' => $patient->organization_id, 'subject_type' => $patient->getMorphClass(), 'subject_id' => $patient->id, 'user_id' => $request->user()->id, 'actor' => 'user', 'type' => $type, 'description' => $description]);
    }

    public function patient(Request $request, int $access): Response
    {
        $grant = PatientPortalAccess::where('user_id', $request->user()->id)->available()->findOrFail($access);
        $patient = $this->grantedPatient($grant);
        $contact = $this->scoped(Contact::class, $grant->organization_id)->find($patient->contact_id);
        $appointments = $this->scoped(Appointment::class, $grant->organization_id)->where('patient_id', $patient->id)->with([
            'provider' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->where('organization_id', $grant->organization_id),
            'location' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->where('organization_id', $grant->organization_id),
            'service' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->where('organization_id', $grant->organization_id),
        ])->orderByDesc('starts_at')->limit(50)->get()->map(fn ($appointment) => ['id' => $appointment->id, 'starts_at' => $appointment->starts_at->toIso8601String(), 'ends_at' => $appointment->ends_at->toIso8601String(), 'timezone' => $appointment->timezone, 'status' => $appointment->status, 'provider_name' => $appointment->provider?->name, 'location_name' => $appointment->location?->name, 'location_address' => $appointment->location?->address, 'service_name' => $appointment->service?->name]);
        $encounters = [];
        $prescriptions = [];
        $problems = [];
        $allergies = [];
        if ($grant->share_clinical) {
            $problems = $this->scoped(PatientProblem::class, $grant->organization_id)->where('patient_id', $patient->id)->where('status', 'active')->orderBy('name')->get(['id', 'name', 'code', 'onset_date', 'notes']);
            $allergies = $this->scoped(PatientAllergy::class, $grant->organization_id)->where('patient_id', $patient->id)->where('status', 'active')->orderBy('allergen')->get(['id', 'allergen', 'reaction', 'severity', 'notes']);
            $encounters = $this->scoped(ClinicalEncounter::class, $grant->organization_id)->where('patient_id', $patient->id)->where('status', 'signed')->whereNotNull('signed_at')->with(['amendments' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->where('organization_id', $grant->organization_id)])->orderByDesc('signed_at')->limit(50)->get()->map(fn ($encounter) => [...$encounter->only(['id', 'provider_name', 'chief_complaint', 'history', 'subjective', 'objective', 'assessment', 'plan', 'allergy_status', 'allergies', 'vitals']), 'signed_at' => $encounter->signed_at->toIso8601String(), 'amendments' => $encounter->amendments->map(fn ($amendment) => $amendment->only(['id', 'author_name', 'reason', 'content', 'created_at']))]);
            $prescriptions = $this->scoped(Prescription::class, $grant->organization_id)->where('patient_id', $patient->id)->where('status', 'issued')->whereNotNull('issued_at')->orderByDesc('issued_at')->limit(50)->get()->map(fn ($prescription) => [...$prescription->only(['id', 'provider_name', 'registration_number', 'items']), 'issued_at' => $prescription->issued_at->toIso8601String()]);
        }
        $this->audit($patient, $request, 'portal.viewed', 'Patient portal records accessed');

        return Inertia::render('portal/patient', ['practice_name' => Organization::findOrFail($grant->organization_id)->name, 'patient' => ['name' => $contact?->displayName() ?? 'Patient', 'mrn' => $patient->mrn, 'birth_date' => $patient->birth_date?->format('Y-m-d'), 'phone' => $contact?->phone, 'email' => $contact?->email, 'address' => trim(implode(', ', array_filter([$patient->address_line_1, $patient->address_line_2, $patient->city, $patient->province, $patient->postal_code, $patient->country])))], 'access_id' => $grant->id, 'patient_status' => $patient->status, 'questionnaires' => $this->scoped(PatientQuestionnaire::class, $grant->organization_id)->where('active', true)->orderBy('title')->get(['id', 'title', 'questions']), 'questionnaire_responses' => $this->scoped(QuestionnaireResponse::class, $grant->organization_id)->where('patient_id', $patient->id)->where('source', 'patient')->where('recorded_by', $request->user()->id)->latest()->limit(50)->get(['id', 'title', 'questions', 'answers', 'source', 'recorder_name', 'created_at']), 'share_clinical' => $grant->share_clinical, 'appointments' => $appointments, 'encounters' => $encounters, 'prescriptions' => $prescriptions, 'problems' => $problems, 'allergies' => $allergies]);
    }

    public function respond(Request $request, int $access): RedirectResponse
    {
        $destination = route('portal.patient', ['access' => $access]);
        try {
            $data = $request->validate(['questionnaire_id' => ['required', 'integer'], 'expected_title' => ['required', 'string', 'max:255'], 'expected_questions' => ['required', 'array', 'list', 'min:1', 'max:40'], 'expected_questions.*' => ['required', 'string', 'max:500'], 'answers' => ['required', 'array', 'list', 'min:1', 'max:40'], 'answers.*' => ['required', 'string', 'max:10000']]);
            DB::transaction(function () use ($request, $access, $data) {
                $grant = PatientPortalAccess::where('user_id', $request->user()->id)->available()->lockForUpdate()->findOrFail($access);
                $patient = $this->grantedPatient($grant);
                $patient = $this->scoped(Patient::class, $grant->organization_id)->lockForUpdate()->findOrFail($patient->id);
                if ($patient->status !== 'active') {
                    throw ValidationException::withMessages(['patient' => 'Contact the practice before submitting an intake for this archived record.']);
                }
                $questionnaire = $this->scoped(PatientQuestionnaire::class, $grant->organization_id)->where('active', true)->lockForUpdate()->find($data['questionnaire_id']);
                if (! $questionnaire) {
                    throw ValidationException::withMessages(['questionnaire_id' => 'Choose an active questionnaire from your practice.']);
                }
                if ($data['expected_title'] !== $questionnaire->title || $data['expected_questions'] !== $questionnaire->questions) {
                    throw ValidationException::withMessages(['questionnaire_id' => 'This questionnaire changed. Reload before submitting your answers.']);
                }
                if (count($data['answers']) !== count($questionnaire->questions)) {
                    throw ValidationException::withMessages(['answers' => 'Answer every question before submitting.']);
                }
                QuestionnaireResponse::forceCreate(['organization_id' => $grant->organization_id, 'patient_id' => $patient->id, 'patient_questionnaire_id' => $questionnaire->id, 'recorded_by' => $request->user()->id, 'recorder_name' => $request->user()->name, 'source' => 'patient', 'title' => $questionnaire->title, 'questions' => $questionnaire->questions, 'answers' => $data['answers']]);
                $this->audit($patient, $request, 'questionnaire.patient_submitted', 'Patient-reported questionnaire submitted through portal');
            });

        } catch (ValidationException $error) {
            throw $error->redirectTo($destination);
        }

        return redirect($destination)->with('success', 'Your answers were submitted to the practice.');
    }
}
