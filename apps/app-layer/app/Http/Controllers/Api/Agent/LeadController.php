<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Note;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Services\Agent\ActingFor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A new prospect, put in the sales pipeline by the front desk.
 *
 * Create-or-advance in one route, so a retry or a second mention never makes
 * a second lead: a contact has at most one live lead per pipeline. The agent
 * moves a lead forward only, and never into the pipeline's last stage —
 * winning (or losing) a deal is the team's call.
 */
class LeadController extends Controller
{
    public function store(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'contact_id' => ['nullable', 'integer'],
            'stage' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string', 'max:2000'],
            'value' => ['nullable', 'integer', 'min:0'],
        ]);
        $scope = ActingFor::from($request);

        $contact = ! empty($validated['contact_id']) ? Contact::query()->find($validated['contact_id']) : null;
        if ($scope->customerFacing()) {
            $contact ??= $scope->contactId() ? Contact::query()->find($scope->contactId()) : null;
            $scope->ensureContact($contact);
        }
        if (! $contact) {
            throw ValidationException::withMessages(['contact_id' => 'Register the customer first: a lead needs a contact.']);
        }

        $pipeline = Pipeline::query()->with('stages')->where('is_default', true)->first() ?? Pipeline::query()->with('stages')->oldest('id')->first();
        if (! $pipeline || $pipeline->stages->isEmpty()) {
            throw ValidationException::withMessages(['stage' => 'This business has no sales pipeline set up, so no lead was created.']);
        }
        $stages = $pipeline->stages->values();
        $last = $stages->count() > 1 ? $stages->last() : null;

        $target = null;
        if (! empty($validated['stage'])) {
            $target = $stages->first(fn (PipelineStage $s) => mb_strtolower($s->name) === mb_strtolower(trim($validated['stage'])));
            if (! $target) {
                throw ValidationException::withMessages(['stage' => "There is no \"{$validated['stage']}\" stage. The stages are: ".$stages->pluck('name')->join(', ').'.']);
            }
            if ($last && $target->id === $last->id) {
                throw ValidationException::withMessages(['stage' => "Only the team moves a lead to {$last->name}."]);
            }
        }

        $result = DB::transaction(function () use ($validated, $scope, $contact, $pipeline, $stages, $target) {
            $lead = Lead::query()->with('stage')->where('contact_id', $contact->id)->where('pipeline_id', $pipeline->id)->first();
            $note = null;

            if ($lead) {
                $current = $lead->stage;
                $moved = false;
                if ($target && (! $current || $target->position > $current->position)) {
                    $lead->update(['pipeline_stage_id' => $target->id, 'position' => (int) Lead::query()->where('pipeline_stage_id', $target->id)->max('position') + 1]);
                    Activity::log($lead, 'stage_changed', "Agent moved it from {$current?->name} to {$target->name}", actor: 'agent', meta: ['from' => $current?->id, 'to' => $target->id]);
                    $moved = true;
                } elseif ($target && $current && $target->id !== $current->id) {
                    $note = "The lead is already at {$current->name}; the agent only moves leads forward.";
                }
                if (! empty($validated['note'])) {
                    $this->note($lead, $validated['note']);
                }

                return ['lead' => $lead, 'created' => false, 'moved' => $moved, 'note' => $note];
            }

            $stage = $target ?? $stages->first();
            $lead = Lead::create([
                'contact_id' => $contact->id,
                'pipeline_id' => $pipeline->id,
                'pipeline_stage_id' => $stage->id,
                'position' => (int) Lead::query()->where('pipeline_stage_id', $stage->id)->max('position') + 1,
                'source' => $scope->conversation?->channel->value ?? 'agent',
                'value' => (int) ($validated['value'] ?? 0),
                'outreach_note' => $validated['note'] ?? null,
            ]);
            Activity::log($lead, 'created', 'Lead created by the agent', actor: 'agent');
            Activity::log($contact, 'lead_created', "Agent added them to {$pipeline->name} at {$stage->name}", actor: 'agent');

            return ['lead' => $lead, 'created' => true, 'moved' => false, 'note' => null];
        });

        $lead = $result['lead']->refresh()->load('stage');

        return response()->json([
            'created' => $result['created'],
            'moved' => $result['moved'],
            'note' => $result['note'],
            'lead' => ['id' => $lead->id, 'contact_id' => $lead->contact_id, 'pipeline' => $pipeline->name, 'stage' => $lead->stage?->name, 'value' => $lead->value],
        ], $result['created'] ? 201 : 200);
    }

    private function note(Lead $lead, string $body): void
    {
        $note = new Note(['body' => $body]);
        $note->notable()->associate($lead);
        $note->save();
        Activity::log($lead, 'note_added', 'Agent added a note', actor: 'agent', meta: ['note_id' => $note->id]);
    }
}
