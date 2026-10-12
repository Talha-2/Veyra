<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Http\Requests\Desk\StorePatientRequest;
use App\Http\Requests\Desk\UpdatePatientRequest;
use App\Models\Activity;
use App\Models\Appointment;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Organization;
use App\Models\Patient;
use App\Services\Healthcare\AppointmentPresenter;
use App\Services\Healthcare\ClinicalRecords;
use App\Services\Healthcare\PatientRegistry;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PatientController extends Controller
{
    public function index(Request $request): Response
    {
        $profile = $request->query('profile') ? Contact::findOrFail($request->query('profile')) : null;
        if (! $profile && $request->query('conversation_id')) {
            $profile = Conversation::findOrFail($request->query('conversation_id'))->contact;
        }
        $search = trim((string) $request->query('search'));
        $status = $request->query('status') === 'archived' ? 'archived' : 'active';
        $patients = Patient::query()->with('contact')->where('status', $status)
            ->when($search !== '', fn ($q) => $q->where(fn ($query) => $query->whereRaw('lower(mrn) like ?', ['%'.mb_strtolower($search).'%'])
                ->orWhereHas('contact', fn ($c) => $c->whereRaw('lower(name) like ?', ['%'.mb_strtolower($search).'%'])
                    ->orWhereRaw('lower(phone) like ?', ['%'.mb_strtolower($search).'%'])->orWhereRaw('lower(email) like ?', ['%'.mb_strtolower($search).'%']))))
            ->latest()->paginate(30)->withQueryString()->through(fn ($p) => $this->record($p));

        return Inertia::render('desk/patients', ['patients' => $patients, 'registration_profile' => $profile?->only(['id', 'name', 'phone', 'email']), 'filters' => ['search' => $search, 'status' => $status]]);
    }

    public function profile(Contact $contact): RedirectResponse
    {
        return $contact->patient ? redirect()->route('desk.patients.show', $contact->patient) : redirect()->route('desk.patients', ['profile' => $contact->id]);
    }

    public function contactOptions(Request $request)
    {
        $search = mb_strtolower(trim((string) $request->query('search')));

        return Contact::query()->whereDoesntHave('patient')
            ->when($search, fn ($q) => $q->where(fn ($c) => $c->whereRaw('lower(name) like ?', ['%'.$search.'%'])->orWhereRaw('lower(phone) like ?', ['%'.$search.'%'])))
            ->orderBy('name')->paginate(20, ['id', 'name', 'phone', 'email'])->withQueryString();
    }

    public function store(StorePatientRequest $request, PatientRegistry $registry)
    {
        $patient = $registry->register($request->validated(), $request->user());

        return redirect()->route('desk.patients.show', $patient)->with('success', 'Patient registered.');
    }

    public function show(Request $request, Patient $patient): Response
    {
        Activity::log($patient, 'patient.viewed', 'Patient profile accessed', $request->user());
        $patient->load('contact', 'activities.user:id,name');
        $now = CarbonImmutable::now()->utc();
        $visits = Appointment::where('patient_id', $patient->id)->with(['provider', 'location', 'service']);

        return Inertia::render('desk/patient', ['patient' => $this->record($patient), 'can_access_clinical' => app(ClinicalRecords::class)->canAccess($request->user()),
            'can_manage_portal' => $request->user()->can('administer-organization') || app(ClinicalRecords::class)->canAccess($request->user()),
            'timezone' => Organization::current()->timezone ?: 'Asia/Karachi',
            'visits' => [
                'upcoming' => (clone $visits)->where('starts_at', '>=', $now)->whereIn('status', ['booked', 'checked_in'])->orderBy('starts_at')->orderBy('id')->limit(5)->get()->map(fn ($visit) => AppointmentPresenter::record($visit)),
                'recent' => (clone $visits)->where('starts_at', '<', $now)->orderByDesc('starts_at')->orderByDesc('id')->limit(8)->get()->map(fn ($visit) => AppointmentPresenter::record($visit)),
            ],
            'conversations' => $patient->contact->conversations()->orderByDesc('last_message_at')->limit(20)->get()->map(fn ($c) => ['id' => $c->id, 'subject' => $c->subject, 'channel' => $c->channel->value, 'status' => $c->status->value]),
            'activities' => $patient->activities()->with('user:id,name')->limit(30)->get()->map(fn ($a) => [
                'id' => $a->id, 'description' => $a->description, 'actor' => $a->actorLabel(), 'at' => $a->created_at->toIso8601String(),
            ])]);
    }

    public function update(UpdatePatientRequest $request, Patient $patient, PatientRegistry $registry)
    {
        $registry->update($patient, $request->validated(), $request->user());

        return back()->with('success', 'Patient details saved.');
    }

    public function archive(Request $request, Patient $patient, PatientRegistry $registry)
    {
        $registry->archive($patient, $request->user());

        return back()->with('success', 'Patient archived.');
    }

    public function restore(Request $request, Patient $patient, PatientRegistry $registry)
    {
        $registry->restore($patient, $request->user());

        return back()->with('success', 'Patient restored.');
    }

    private function record(Patient $patient): array
    {
        return [...$patient->only(array_keys(PatientRegistry::demographicRules())), 'id' => $patient->id, 'mrn' => $patient->mrn,
            'birth_date' => $patient->birth_date?->format('Y-m-d'), 'age' => $patient->birth_date ? (int) $patient->birth_date->diffInYears(now()) : null,
            'status' => $patient->status, 'created_at' => $patient->created_at->toIso8601String(),
            'contact' => ['id' => $patient->contact_id, 'name' => $patient->contact?->displayName() ?? 'Unavailable contact',
                'phone' => $patient->contact?->phone, 'email' => $patient->contact?->email]];
    }
}
