<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Leads: contacts moving through a pipeline. Z360 calls these Inquiries.
 */
class LeadController extends Controller
{
    public const SOURCES = ['manual', 'call', 'sms', 'form', 'meta_ads', 'google_ads', 'website', 'referral', 'import'];

    public function index(Request $request): Response
    {
        $pipelines = Pipeline::query()->with('stages')->orderByDesc('is_default')->orderBy('name')->get();
        $pipeline = $pipelines->firstWhere('id', (int) $request->query('pipeline')) ?? $pipelines->first();
        $view = in_array($request->query('view'), ['kanban', 'list'], true) ? $request->query('view') : 'kanban';

        $leads = Lead::query()
            ->when($pipeline, fn ($q) => $q->where('pipeline_id', $pipeline->id))
            ->with(['contact:id,name,phone,email,company', 'stage:id,name,color', 'assignees:id,name'])
            ->when($request->query('search'), fn ($q, $s) => $q->whereHas('contact', fn ($c) => $c
                ->where('name', 'ilike', "%{$s}%")->orWhere('company', 'ilike', "%{$s}%")->orWhere('phone', 'ilike', "%{$s}%")))
            ->when($request->query('source'), fn ($q, $s) => $q->where('source', $s))
            ->when($request->query('mine'), fn ($q) => $q->whereHas('assignees', fn ($a) => $a->whereKey($request->user()->getKey())))
            ->orderBy('position')
            ->orderByDesc('updated_at')
            ->limit(400)
            ->get()
            ->map(fn (Lead $l) => [
                'id' => $l->id,
                'contact' => $l->contact ? [
                    'id' => $l->contact->id, 'name' => $l->contact->displayName(), 'initials' => $l->contact->initials(),
                    'company' => $l->contact->company, 'phone' => $l->contact->phone,
                ] : null,
                'stage_id' => $l->pipeline_stage_id,
                'source' => $l->source,
                'value' => $l->value,
                'position' => $l->position,
                'next_response_at' => $l->next_response_at?->toIso8601String(),
                'overdue' => $l->next_response_at?->isPast() ?? false,
                'outreach_note' => $l->outreach_note,
                'assignees' => $l->assignees->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->all(),
                'updated_at' => $l->updated_at?->toIso8601String(),
            ]);

        return Inertia::render('desk/leads', [
            'view' => $view,
            'pipeline' => $pipeline ? [
                'id' => $pipeline->id, 'name' => $pipeline->name,
                'stages' => $pipeline->stages->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'color' => $s->color])->all(),
            ] : null,
            'pipelines' => $pipelines->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->all(),
            'leads' => $leads,
            'filters' => ['search' => $request->query('search'), 'source' => $request->query('source'), 'mine' => (bool) $request->query('mine')],
            'sources' => self::SOURCES,
            'team' => User::whereHas('memberships')->get(['id', 'name'])->all(),
            'totals' => [
                'count' => $leads->count(),
                'value' => $leads->sum('value'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id'],
            'name' => ['required_without:contact_id', 'nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'pipeline_id' => ['required', 'integer', 'exists:pipelines,id'],
            'pipeline_stage_id' => ['nullable', 'integer', 'exists:pipeline_stages,id'],
            'source' => ['required', Rule::in(self::SOURCES)],
            'value' => ['nullable', 'integer', 'min:0'],
            'assignee_ids' => ['array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $contact = isset($validated['contact_id'])
            ? Contact::findOrFail($validated['contact_id'])
            : Contact::create([
                'name' => $validated['name'], 'phone' => $validated['phone'] ?? null,
                'email' => $validated['email'] ?? null, 'company' => $validated['company'] ?? null,
                'source' => $validated['source'],
            ]);

        $pipeline = Pipeline::with('stages')->findOrFail($validated['pipeline_id']);
        $stageId = $validated['pipeline_stage_id'] ?? $pipeline->stages->first()?->id;

        $lead = Lead::create([
            'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $stageId,
            'source' => $validated['source'],
            'value' => $validated['value'] ?? 0,
            'position' => Lead::query()->where('pipeline_stage_id', $stageId)->max('position') + 1,
        ]);
        $lead->assignees()->sync($validated['assignee_ids'] ?? []);

        Activity::log($lead, 'created', 'Lead created', $request->user());
        Activity::log($contact, 'lead_created', "Added to pipeline {$pipeline->name}", $request->user());

        return back()->with('success', 'Lead added.');
    }

    /** Move between stages (kanban drop) and reorder within one. */
    public function move(Request $request, Lead $lead): RedirectResponse
    {
        $validated = $request->validate([
            'pipeline_stage_id' => ['required', 'integer', 'exists:pipeline_stages,id'],
            'position' => ['required', 'integer', 'min:0'],
        ]);

        $from = $lead->stage;
        $to = PipelineStage::findOrFail($validated['pipeline_stage_id']);

        $lead->update(['pipeline_stage_id' => $to->id, 'position' => $validated['position']]);

        if ($from?->id !== $to->id) {
            Activity::log($lead, 'stage_changed', "Moved from {$from?->name} to {$to->name}", $request->user(),
                ['from' => $from?->id, 'to' => $to->id]);
        }

        return back();
    }

    public function update(Request $request, Lead $lead): RedirectResponse
    {
        $validated = $request->validate([
            'value' => ['sometimes', 'integer', 'min:0'],
            'source' => ['sometimes', Rule::in(self::SOURCES)],
            'next_response_at' => ['sometimes', 'nullable', 'date'],
            'outreach_note' => ['sometimes', 'nullable', 'string', 'max:500'],
            'assignee_ids' => ['sometimes', 'array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $lead->fill(collect($validated)->except('assignee_ids')->all())->save();

        if (array_key_exists('assignee_ids', $validated)) {
            $lead->assignees()->sync($validated['assignee_ids']);
            Activity::log($lead, 'assigned', 'Assignment changed', $request->user());
        }

        return back();
    }

    public function destroy(Request $request, Lead $lead): RedirectResponse
    {
        $lead->delete();

        return back()->with('success', 'Lead removed from pipeline. The contact is kept.');
    }

    /**
     * CSV import. The file is parsed here; each row becomes a contact (matched
     * by phone or email first, so re-importing does not duplicate) and a lead.
     */
    public function import(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
            'pipeline_id' => ['required', 'integer', 'exists:pipelines,id'],
            'mapping' => ['required', 'array'],
            'mapping.name' => ['nullable', 'string'],
            'mapping.phone' => ['nullable', 'string'],
            'mapping.email' => ['nullable', 'string'],
            'mapping.company' => ['nullable', 'string'],
            'mapping.value' => ['nullable', 'string'],
        ]);

        $pipeline = Pipeline::with('stages')->findOrFail($validated['pipeline_id']);
        $stageId = $pipeline->stages->first()?->id;

        $handle = fopen($validated['file']->getRealPath(), 'r');
        $header = array_map('trim', fgetcsv($handle) ?: []);
        $map = $validated['mapping'];
        $col = fn (string $field) => isset($map[$field]) ? array_search($map[$field], $header, true) : false;

        $created = 0;
        $matched = 0;
        $skipped = 0;

        while (($row = fgetcsv($handle)) !== false) {
            $get = fn (string $field) => ($i = $col($field)) !== false ? trim($row[$i] ?? '') : '';
            $phone = $get('phone') ?: null;
            $email = $get('email') ? mb_strtolower($get('email')) : null;
            $name = $get('name') ?: null;

            if (! $phone && ! $email && ! $name) {
                $skipped++;
                continue;
            }

            $contact = Contact::query()
                ->when($phone, fn ($q) => $q->orWhere('phone', $phone))
                ->when($email, fn ($q) => $q->orWhere('email', $email))
                ->first();

            if ($contact) {
                $matched++;
            } else {
                $contact = Contact::create([
                    'name' => $name, 'phone' => $phone, 'email' => $email,
                    'company' => $get('company') ?: null, 'source' => 'import',
                ]);
                $created++;
            }

            if (! Lead::query()->where('contact_id', $contact->id)->where('pipeline_id', $pipeline->id)->exists()) {
                Lead::create([
                    'contact_id' => $contact->id, 'pipeline_id' => $pipeline->id,
                    'pipeline_stage_id' => $stageId, 'source' => 'import',
                    'value' => (int) preg_replace('/\D/', '', $get('value')) ?: 0,
                ]);
            }
        }
        fclose($handle);

        return back()->with('success', "Imported: {$created} new contacts, {$matched} matched, {$skipped} skipped.");
    }
}
