<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\IdentifierType;
use App\Http\Resources\V1\LeadResource;
use App\Http\Resources\V1\PipelineResource;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LeadController extends ApiController
{
    private const WITH = ['contact', 'stage', 'assignees:id'];

    public function index(Request $request): JsonResponse
    {
        $f = $this->check($request, [
            'pipeline_id' => ['sometimes', 'integer'],
            'stage_id' => ['sometimes', 'integer'],
            'contact_id' => ['sometimes', 'integer'],
        ]);

        $query = Lead::query()->with(self::WITH)
            ->when($f['pipeline_id'] ?? null, fn ($q, $id) => $q->where('pipeline_id', $id))
            ->when($f['stage_id'] ?? null, fn ($q, $id) => $q->where('pipeline_stage_id', $id))
            ->when($f['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id));

        return $this->list($request, $query, LeadResource::class);
    }

    public function pipelines(Request $request): JsonResponse
    {
        return $this->list($request, Pipeline::query()->with('stages'), PipelineResource::class);
    }

    public function show(Lead $lead): JsonResponse
    {
        return response()->json(new LeadResource($lead->load(self::WITH)));
    }

    /**
     * Put a contact in a pipeline — an existing one by `contact_id`, or a new
     * one described inline, matched first by phone or email so a form that
     * submits twice does not make two people.
     */
    public function store(Request $request): JsonResponse
    {
        $v = $this->check($request, [
            'contact_id' => ['required_without:contact', 'nullable', 'integer', $this->ours('contacts', softDeletes: true)],
            'contact' => ['required_without:contact_id', 'nullable', 'array'],
            'contact.name' => ['nullable', 'string', 'max:255'],
            'contact.phone' => ['nullable', 'string', 'max:32', 'regex:/\d{3,}/'],
            'contact.email' => ['nullable', 'email', 'max:255'],
            'contact.company' => ['nullable', 'string', 'max:255'],
            'pipeline_id' => ['nullable', 'integer', $this->ours('pipelines')],
            'stage_id' => ['nullable', 'integer', $this->ours('pipeline_stages')],
            ...$this->rules(),
        ]);

        $pipeline = isset($v['pipeline_id'])
            ? Pipeline::with('stages')->find($v['pipeline_id'])
            : (Pipeline::with('stages')->where('is_default', true)->first() ?? Pipeline::with('stages')->oldest('id')->first());
        if (! $pipeline) {
            throw ValidationException::withMessages(['pipeline_id' => 'This organization has no pipelines yet. Create one in Studio › Settings › Pipelines.']);
        }

        $stage = isset($v['stage_id']) ? $pipeline->stages->firstWhere('id', $v['stage_id']) : $pipeline->stages->first();
        if (isset($v['stage_id']) && ! $stage) {
            throw ValidationException::withMessages(['stage_id' => "Stage {$v['stage_id']} is not in pipeline {$pipeline->id}."]);
        }

        $lead = DB::transaction(function () use ($v, $pipeline, $stage) {
            $contact = isset($v['contact_id']) ? Contact::findOrFail($v['contact_id']) : $this->contactFor($v['contact'], $v['source'] ?? 'api');

            $lead = Lead::create([
                ...collect($v)->only(['source', 'value', 'next_response_at', 'outreach_note'])->all(),
                'source' => $v['source'] ?? 'api',
                'contact_id' => $contact->id,
                'pipeline_id' => $pipeline->id,
                'pipeline_stage_id' => $stage?->id,
                'position' => (int) Lead::query()->where('pipeline_stage_id', $stage?->id)->max('position') + 1,
            ]);
            Activity::log($lead, 'created', 'Lead created through the API', actor: 'api');
            Activity::log($contact, 'lead_created', "Added to pipeline {$pipeline->name} through the API", actor: 'api');

            return $lead;
        });

        return response()->json(new LeadResource($lead->refresh()->load(self::WITH)), 201);
    }

    public function update(Request $request, Lead $lead): JsonResponse
    {
        $v = $this->check($request, collect($this->rules())->map(fn ($r) => ['sometimes', ...$r])->all());

        $lead->update($v);

        return response()->json(new LeadResource($lead->refresh()->load(self::WITH)));
    }

    /** Move to another stage — in this pipeline or another; the lead follows the stage's pipeline. */
    public function move(Request $request, Lead $lead): JsonResponse
    {
        $v = $this->check($request, ['stage_id' => ['required', 'integer', $this->ours('pipeline_stages')]]);

        $from = $lead->stage;
        $to = PipelineStage::findOrFail($v['stage_id']);

        if ($from?->id !== $to->id) {
            DB::transaction(function () use ($lead, $from, $to) {
                $lead->update([
                    'pipeline_id' => $to->pipeline_id,
                    'pipeline_stage_id' => $to->id,
                    'position' => (int) Lead::query()->where('pipeline_stage_id', $to->id)->max('position') + 1,
                ]);
                Activity::log($lead, 'stage_changed', "Moved from {$from?->name} to {$to->name} through the API", actor: 'api', meta: ['from' => $from?->id, 'to' => $to->id]);
            });
        }

        return response()->json(new LeadResource($lead->refresh()->load(self::WITH)));
    }

    private function rules(): array
    {
        return [
            'source' => ['nullable', 'string', 'max:40'],
            'value' => ['integer', 'min:0'],
            'next_response_at' => ['nullable', 'date'],
            'outreach_note' => ['nullable', 'string', 'max:5000'],
        ];
    }

    private function contactFor(array $given, string $source): Contact
    {
        $phone = ! empty($given['phone']) ? IdentifierType::Phone->normalize($given['phone']) : null;
        $email = ! empty($given['email']) ? IdentifierType::Email->normalize($given['email']) : null;

        if (! $phone && ! $email && blank($given['name'] ?? null)) {
            throw ValidationException::withMessages(['contact' => 'Give the contact a name, a phone number or an email address.']);
        }

        // withTrashed: phone and email stay unique after a delete, so a
        // returning person is the old contact brought back, not a new row.
        $existing = Contact::withTrashed()
            ->where(fn ($q) => $q->when($phone, fn ($w) => $w->orWhere('phone', $phone))->when($email, fn ($w) => $w->orWhere('email', $email)))
            ->when(! $phone && ! $email, fn ($q) => $q->whereRaw('1 = 0'))
            ->first();
        if ($existing?->trashed()) {
            $existing->restore();
        }

        return $existing ?? Contact::create([
            'name' => $given['name'] ?? null, 'phone' => $phone, 'email' => $email,
            'company' => $given['company'] ?? null, 'source' => $source,
        ]);
    }
}
