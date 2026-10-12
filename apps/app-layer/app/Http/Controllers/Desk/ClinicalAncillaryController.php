<?php

namespace App\Http\Controllers\Desk;

use App\Enums\Surface;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientDocument;
use App\Models\PatientReferral;
use App\Services\Healthcare\ClinicalAncillary;
use App\Services\Healthcare\ClinicalRecords;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ClinicalAncillaryController extends Controller
{
    private function context(Request $request, ClinicalRecords $records): array
    {
        $provider = $records->provider($request->user());
        $data = $request->validate(['patient_id' => ['nullable', 'integer'], 'q' => ['nullable', 'string', 'max:100']]);
        $selected = ! empty($data['patient_id']) ? Patient::with('contact')->findOrFail($data['patient_id']) : null;
        $patients = Patient::with('contact')->where('status', 'active')
            ->when($data['q'] ?? null, fn (Builder $query, string $search) => $query->where(fn (Builder $q) => $q->where('mrn', 'like', '%'.$search.'%')->orWhereHas('contact', fn (Builder $c) => $c->where('name', 'like', '%'.$search.'%'))))
            ->orderByDesc('id')->limit($selected ? 99 : 100)->get();
        if ($selected && ! $patients->contains('id', $selected->id)) {
            $patients->prepend($selected);
        }

        Activity::log($selected ?? $provider, 'clinical.ancillary_viewed', 'Clinical records accessed', $request->user(), ['module' => $request->route()->getName()]);

        return ['patient' => $selected ? $this->patient($selected) : null, 'patients' => $patients->map(fn (Patient $patient) => $this->patient($patient)), 'q' => $data['q'] ?? '',
            'encounters' => $selected ? ClinicalEncounter::where('patient_id', $selected->id)->where(fn (Builder $q) => $q->where('status', 'signed')->orWhere(fn (Builder $d) => $d->where('provider_id', $provider->id)->where('author_user_id', $request->user()->id)))->latest('occurred_at')->limit(50)->get(['id', 'chief_complaint', 'status', 'occurred_at']) : [], 'provider_name' => $provider->name, 'provider_id' => $provider->id, 'actor_id' => $request->user()->id];
    }

    private function patient(Patient $patient): array
    {
        return ['id' => $patient->id, 'name' => $patient->contact?->displayName(), 'mrn' => $patient->mrn, 'status' => $patient->status];
    }

    private function enrich(array $context, Builder $query): array
    {
        $diagnostic = $query->getModel() instanceof DiagnosticOrder;
        if ($diagnostic) {
            $query->with('followUpTask');
        }
        if ($query->getModel() instanceof PatientReferral) {
            $query->with(['updates' => fn ($updates) => $updates->reorder('id', 'desc')->limit(20)]);
        }
        $records = $query->when($context['patient'], fn (Builder $q, array $patient) => $q->where('patient_id', $patient['id']))->with('patient.contact')->latest('id')->paginate(20)->withQueryString();
        $records->through(function ($record) use ($context, $diagnostic) {
            $data = [...$record->attributesToArray(), 'patient' => $this->patient($record->patient), 'can_edit' => $record->provider_id === $context['provider_id'] && $record->author_user_id === $context['actor_id']];
            if ($diagnostic) {
                $task = $record->followUpTask;
                $data['follow_up_task'] = $task ? ['id' => $task->id, 'status' => $task->status, 'due_on' => $task->due_on->format('Y-m-d'), 'assigned_user_id' => $task->assigned_user_id] : null;
            }
            if ($record instanceof PatientReferral) {
                $data = [...$data, ...$this->referralData($record)];
            }

            return $data;
        });

        return [...collect($context)->except(['provider_id', 'actor_id'])->all(), 'records' => $records];
    }

    public function diagnostics(Request $request, ClinicalRecords $records, ClinicalAncillary $clinical): Response
    {
        $kind = $request->route()->getName() === 'desk.images.index' ? 'imaging' : 'lab';
        $context = $this->context($request, $records);
        $query = $clinical->visible(DiagnosticOrder::where('kind', $kind), $request->user());
        $data = $request->validate(['status' => ['nullable', 'in:draft,ordered,resulted,reviewed,cancelled'], 'flag' => ['nullable', 'in:normal,abnormal,critical,not_applicable'], 'search' => ['nullable', 'string', 'max:200'], 'mine' => ['nullable', 'in:1']]);
        $filters = ['status' => $data['status'] ?? '', 'flag' => $data['flag'] ?? '', 'search' => trim($data['search'] ?? ''), 'mine' => $data['mine'] ?? ''];
        $query->when($context['patient'], fn (Builder $q, array $p) => $q->where('patient_id', $p['id']))
            ->when($filters['mine'] !== '', fn (Builder $q) => $q->where('provider_id', $context['provider_id'])->where('author_user_id', $request->user()->id));
        if ($filters['search'] !== '') {
            $term = '%'.mb_strtolower($filters['search']).'%';
            $query->where(fn (Builder $q) => $q->whereRaw('lower(name) like ?', [$term])->orWhereRaw('lower(indication) like ?', [$term])->orWhereHas('patient', fn (Builder $p) => $p->whereRaw('lower(mrn) like ?', [$term])->orWhereHas('contact', fn (Builder $c) => $c->whereRaw('lower(name) like ?', [$term]))));
        }
        $awaiting = (clone $query)->where('status', 'resulted')->whereNotNull('ordered_at');
        $counts = ['awaiting_review' => (clone $awaiting)->count(), 'critical' => (clone $awaiting)->where('result_flag', 'critical')->count(), 'abnormal' => (clone $awaiting)->where('result_flag', 'abnormal')->count(), 'ordered' => (clone $query)->where('status', 'ordered')->count()];
        $query->when($filters['status'] !== '', fn (Builder $q) => $q->where('status', $filters['status']))->when($filters['flag'] !== '', fn (Builder $q) => $q->where('result_flag', $filters['flag']));
        if ($filters['status'] === 'resulted') {
            $query->orderByRaw("case result_flag when 'critical' then 0 when 'abnormal' then 1 else 2 end")->orderBy('resulted_at');
        }
        $timezone = Organization::current()->timezone ?: 'Asia/Karachi';

        return Inertia::render('desk/diagnostics', [...$this->enrich($context, $query), 'kind' => $kind, 'status' => $filters['status'], 'filters' => $filters, 'counts' => $counts, 'timezone' => $timezone, 'clinic_date' => CarbonImmutable::now($timezone)->format('Y-m-d'), 'actor_id' => $request->user()->id,
            'members' => Organization::current()->members()->get()->filter(fn ($member) => $member->pivot->canAccess(Surface::Desk))->map(fn ($member) => $member->only(['id', 'name']))->values()]);
    }

    public function storeOrder(Request $request, ClinicalAncillary $clinical): RedirectResponse
    {
        $order = $clinical->createOrder($request->all(), $request->user());

        return redirect()->route($order->kind === 'lab' ? 'desk.labs.index' : 'desk.images.index', ['patient_id' => $order->patient_id])->with('success', 'Diagnostic draft created.');
    }

    public function updateOrder(Request $request, DiagnosticOrder $order, ClinicalAncillary $clinical): RedirectResponse
    {
        $clinical->saveDraft($order, $request->all(), $request->user());

        return back()->with('success', 'Diagnostic draft saved.');
    }

    public function updateReferral(Request $request, PatientReferral $referral, ClinicalAncillary $clinical): RedirectResponse
    {
        $clinical->saveDraft($referral, $request->all(), $request->user());

        return back()->with('success', 'Referral draft saved.');
    }

    public function transitionOrder(Request $request, DiagnosticOrder $order, ClinicalAncillary $clinical): RedirectResponse
    {
        $clinical->transitionOrder($order, $request->all(), $request->user());

        return back()->with('success', 'Diagnostic record updated.');
    }

    public function documents(Request $request, ClinicalRecords $records): Response
    {
        $context = $this->context($request, $records);
        $query = PatientDocument::query()->where(fn (Builder $q) => $q->whereNull('clinical_encounter_id')->orWhereHas('encounter', fn (Builder $e) => $e->where('status', 'signed')->orWhere(fn (Builder $own) => $own->where('provider_id', $context['provider_id'])->where('author_user_id', $context['actor_id']))));

        return Inertia::render('desk/documents', $this->enrich($context, $query));
    }

    public function upload(Request $request, ClinicalAncillary $clinical): RedirectResponse
    {
        $document = $clinical->upload($request->all(), $request->user());

        return redirect()->route('desk.patient-documents.index', ['patient_id' => $document->patient_id])->with('success', 'Patient document uploaded.');
    }

    public function download(Request $request, PatientDocument $document, ClinicalAncillary $clinical): StreamedResponse
    {
        $clinical->assertRead($document, $request->user());
        abort_unless(Storage::disk('local')->exists($document->storage_path), 404);
        Activity::log($document, 'clinical.document_downloaded', 'Patient document downloaded', $request->user());

        return Storage::disk('local')->download($document->storage_path, $document->original_name, ['Content-Type' => $document->mime_type, 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store']);
    }

    public function referrals(Request $request, ClinicalRecords $records, ClinicalAncillary $clinical): Response
    {
        $context = $this->context($request, $records);
        $data = $request->validate(['status' => ['nullable', 'in:draft,issued,revoked'], 'coordination' => ['nullable', 'in:pending,scheduled,completed,declined'], 'search' => ['nullable', 'string', 'max:200'], 'mine' => ['nullable', 'in:1']]);
        $filters = ['status' => $data['status'] ?? '', 'coordination' => $data['coordination'] ?? '', 'search' => trim($data['search'] ?? ''), 'mine' => $data['mine'] ?? ''];
        $query = $clinical->visible(PatientReferral::query(), $request->user())
            ->when($context['patient'], fn (Builder $q, array $p) => $q->where('patient_id', $p['id']))
            ->when($filters['mine'] !== '', fn (Builder $q) => $q->where('provider_id', $context['provider_id'])->where('author_user_id', $request->user()->id));
        if ($filters['search'] !== '') {
            $term = '%'.mb_strtolower($filters['search']).'%';
            $query->where(fn (Builder $q) => $q->whereRaw('lower(recipient) like ?', [$term])->orWhereRaw('lower(reason) like ?', [$term])->orWhereHas('patient', fn (Builder $p) => $p->whereRaw('lower(mrn) like ?', [$term])->orWhereHas('contact', fn (Builder $c) => $c->whereRaw('lower(name) like ?', [$term]))));
        }
        $counts = [];
        foreach (['pending', 'scheduled', 'completed', 'declined'] as $stage) {
            $counts[$stage] = (clone $query)->where('status', 'issued')->where('coordination_status', $stage)->count();
        }
        $query->when($filters['status'] !== '', fn (Builder $q) => $q->where('status', $filters['status']))->when($filters['coordination'] !== '', fn (Builder $q) => $q->where('status', 'issued')->where('coordination_status', $filters['coordination']));
        $timezone = Organization::current()->timezone ?: 'Asia/Karachi';

        return Inertia::render('desk/referrals', [...$this->enrich($context, $query), 'filters' => $filters, 'counts' => $counts, 'timezone' => $timezone, 'clinic_date' => CarbonImmutable::now($timezone)->format('Y-m-d')]);
    }

    private function referralData(PatientReferral $referral): array
    {
        return ['scheduled_on' => $referral->scheduled_on?->format('Y-m-d'), 'updates' => $referral->updates->sortBy('id')->values()->map(fn ($update) => ['id' => $update->id, 'status' => $update->status, 'scheduled_on' => $update->scheduled_on?->format('Y-m-d'), 'note' => $update->note, 'recorded_by_name' => $update->recorded_by_name, 'created_at' => $update->created_at->toIso8601String()])];
    }

    public function showReferral(Request $request, PatientReferral $referral, ClinicalAncillary $clinical, ClinicalRecords $records): Response
    {
        $clinical->assertRead($referral, $request->user());
        $provider = $records->provider($request->user());
        $patient = $this->patient($referral->patient);
        Activity::log($referral, 'clinical.referral_viewed', 'Referral record accessed', $request->user());
        $timezone = Organization::current()->timezone ?: 'Asia/Karachi';

        return Inertia::render('desk/referral', ['referral' => [...$referral->attributesToArray(), ...$this->referralData($referral->load('updates')), 'patient' => $patient, 'can_edit' => $referral->provider_id === $provider->id && $referral->author_user_id === $request->user()->id], 'patient' => $patient, 'timezone' => $timezone, 'clinic_date' => CarbonImmutable::now($timezone)->format('Y-m-d')]);
    }

    public function coordinateReferral(Request $request, PatientReferral $referral, ClinicalAncillary $clinical): RedirectResponse
    {
        $clinical->coordinateReferral($referral, $request->all(), $request->user());

        return back()->with('success', 'Referral coordination recorded.');
    }

    public function storeReferral(Request $request, ClinicalAncillary $clinical): RedirectResponse
    {
        $referral = $clinical->createReferral($request->all(), $request->user());

        return redirect()->route('desk.referrals.index', ['patient_id' => $referral->patient_id])->with('success', 'Referral draft created.');
    }

    public function transitionReferral(Request $request, PatientReferral $referral, ClinicalAncillary $clinical): RedirectResponse
    {
        $clinical->transitionReferral($referral, $request->all(), $request->user());

        return back()->with('success', 'Referral updated.');
    }
}
