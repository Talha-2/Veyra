<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\ClinicalTemplate;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientQuestionnaire;
use App\Models\QuestionnaireResponse;
use App\Services\Healthcare\ClinicalRecords;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class PracticeSettingsController extends Controller
{
    public function index(Request $request, ClinicalRecords $clinical): Response
    {
        $admin = $request->user()->can('administer-organization');
        $clinicalAccess = $clinical->canAccess($request->user());

        return Inertia::render('desk/practice', ['organization' => Organization::current()->only(['name', 'timezone']), 'can_manage' => $admin, 'can_read_templates' => $admin || $clinicalAccess,
            'templates' => $admin || $clinicalAccess ? ClinicalTemplate::orderBy('name')->get() : [], 'questionnaires' => $admin || $clinicalAccess ? PatientQuestionnaire::orderBy('title')->get() : []]);
    }

    public function organization(Request $request): RedirectResponse
    {
        Organization::current()->update($request->validate(['name' => ['required', 'string', 'max:255'], 'timezone' => ['required', 'timezone']]));

        return back()->with('success', 'Practice details saved.');
    }

    public function options(Request $request, ClinicalRecords $clinical): JsonResponse
    {
        abort_unless($request->user()->can('administer-organization') || $clinical->canAccess($request->user()), 403);

        return response()->json(['templates' => ClinicalTemplate::where('active', true)->orderBy('name')->get(['id', 'name', 'kind', 'history', 'subjective', 'objective', 'assessment', 'plan'])]);
    }

    private function templateData(Request $request): array
    {
        $rules = ['name' => ['required', 'string', 'max:255'], 'kind' => ['required', Rule::in(['note', 'quick_text'])], 'active' => ['required', 'boolean']];
        foreach (['history', 'subjective', 'objective', 'assessment', 'plan'] as $field) {
            $rules[$field] = ['nullable', 'string', 'max:20000'];
        }

        return array_replace(array_fill_keys(['history', 'subjective', 'objective', 'assessment', 'plan'], null), $request->validate($rules));
    }

    public function storeTemplate(Request $request): RedirectResponse
    {
        ClinicalTemplate::create($this->templateData($request));

        return back()->with('success', 'Template created.');
    }

    public function updateTemplate(Request $request, ClinicalTemplate $template): RedirectResponse
    {
        $template->update($this->templateData($request));

        return back()->with('success', 'Template saved.');
    }

    public function destroyTemplate(ClinicalTemplate $template): RedirectResponse
    {
        $template->delete();

        return back()->with('success', 'Template deleted.');
    }

    private function questionnaireData(Request $request): array
    {
        return $request->validate(['title' => ['required', 'string', 'max:255'], 'active' => ['required', 'boolean'], 'questions' => ['required', 'array', 'list', 'min:1', 'max:40'], 'questions.*' => ['required', 'string', 'max:500', 'distinct']]);
    }

    public function storeQuestionnaire(Request $request): RedirectResponse
    {
        PatientQuestionnaire::create($this->questionnaireData($request));

        return back()->with('success', 'Questionnaire created.');
    }

    public function updateQuestionnaire(Request $request, PatientQuestionnaire $questionnaire): RedirectResponse
    {
        $questionnaire->update($this->questionnaireData($request));

        return back()->with('success', 'Questionnaire saved.');
    }

    public function destroyQuestionnaire(PatientQuestionnaire $questionnaire): RedirectResponse
    {
        $questionnaire->delete();

        return back()->with('success', 'Questionnaire deleted. Existing responses remain available.');
    }

    public function patient(Request $request, Patient $patient, ClinicalRecords $clinical): Response
    {
        $clinical->provider($request->user());
        Activity::log($patient, 'questionnaire.viewed', 'Patient questionnaires accessed', $request->user());

        return Inertia::render('desk/practice-questionnaires', ['patient' => ['id' => $patient->id, 'name' => $patient->contact?->displayName(), 'mrn' => $patient->mrn, 'status' => $patient->status],
            'questionnaires' => PatientQuestionnaire::where('active', true)->orderBy('title')->get(),
            'responses' => QuestionnaireResponse::where('patient_id', $patient->id)->latest()->paginate(20)->withQueryString()]);
    }

    public function respond(Request $request, Patient $patient, ClinicalRecords $clinical): RedirectResponse
    {
        $clinical->provider($request->user());
        $data = $request->validate(['questionnaire_id' => ['required', 'integer'], 'expected_questions' => ['required', 'array', 'list', 'max:40'], 'expected_questions.*' => ['required', 'string', 'max:500'], 'expected_title' => ['required', 'string', 'max:255'], 'answers' => ['required', 'array', 'list', 'max:40'], 'answers.*' => ['required', 'string', 'max:10000']]);
        DB::transaction(function () use ($data, $request, $patient) {
            $lockedPatient = Patient::lockForUpdate()->findOrFail($patient->id);
            if ($lockedPatient->status !== 'active') {
                throw ValidationException::withMessages(['patient' => 'Restore this patient before recording a questionnaire.']);
            }
            $questionnaire = PatientQuestionnaire::where('active', true)->lockForUpdate()->find($data['questionnaire_id']);
            if (! $questionnaire) {
                throw ValidationException::withMessages(['questionnaire_id' => 'Choose an active questionnaire from this practice.']);
            }
            if ($data['expected_questions'] !== $questionnaire->questions || $data['expected_title'] !== $questionnaire->title) {
                throw ValidationException::withMessages(['questionnaire_id' => 'This questionnaire changed. Reload before recording answers.']);
            }
            if (count($data['answers']) !== count($questionnaire->questions)) {
                throw ValidationException::withMessages(['answers' => 'Answer every question. Reload if this questionnaire changed.']);
            }
            QuestionnaireResponse::create(['patient_id' => $patient->id, 'patient_questionnaire_id' => $questionnaire->id, 'recorded_by' => $request->user()->id, 'recorder_name' => $request->user()->name, 'title' => $questionnaire->title, 'questions' => $questionnaire->questions, 'answers' => $data['answers'], 'source' => 'clinician']);
            Activity::log($patient, 'questionnaire.recorded', 'Patient questionnaire recorded', $request->user());
        });

        return back()->with('success', 'Questionnaire response recorded.');
    }
}
