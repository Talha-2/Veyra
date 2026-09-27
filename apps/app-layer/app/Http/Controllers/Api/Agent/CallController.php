<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Enums\IdentifierType;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Call;
use App\Models\CallTranscript;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Organization;
use App\Models\PhoneNumber;
use App\Services\Agent\CallContextBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The call lifecycle as the agent layer reports it.
 *
 * `inbound` is the one route on the contract that resolves its own tenant: the
 * agent knows the dialled number and nothing else. Everything after that is
 * organization-scoped.
 */
class CallController extends Controller
{
    /**
     * A call has arrived. Find whose line it is, open the conversation, and
     * hand back everything the talker needs to say hello.
     *
     * Idempotent on (provider, provider_sid): a voice worker that restarts
     * mid-setup re-sends this, and must get the same call back rather than a
     * second one.
     */
    public function inbound(Request $request, CallContextBuilder $builder): JsonResponse
    {
        $validated = $request->validate([
            'to' => ['required', 'string', 'max:32'],
            'from' => ['required', 'string', 'max:32'],
            'provider' => ['required', 'string', 'max:32'],
            'provider_sid' => ['required', 'string', 'max:128'],
            'room' => ['nullable', 'string', 'max:128'],
        ]);

        $to = IdentifierType::Phone->normalize($validated['to']);

        // The one cross-tenant query on the contract, and it is by the
        // dialled number, which is unique across tenants.
        $line = PhoneNumber::withoutGlobalScopes()->where('e164', $to)->first();
        if (! $line) {
            return response()->json(['error' => 'unknown_number', 'message' => "No organization owns {$to}."], 404);
        }

        $organization = Organization::find($line->organization_id);
        Organization::setCurrent($organization);

        try {
            $result = DB::transaction(function () use ($validated, $line, $builder) {
                $existing = Call::query()->where('provider', $validated['provider'])->where('provider_sid', $validated['provider_sid'])->first();

                $identifier = Identifier::resolve(IdentifierType::Phone, $validated['from']);

                if ($existing) {
                    return ['call' => $existing, 'identifier' => $identifier, 'created' => false];
                }

                // One conversation per caller per channel while it is open;
                // a second call the same afternoon belongs on the same thread.
                $conversation = Conversation::query()
                    ->where('identifier_id', $identifier->id)
                    ->where('channel', Channel::Call)
                    ->where('status', ConversationStatus::Open)
                    ->latest('last_message_at')
                    ->first()
                    ?? Conversation::create([
                        'identifier_id' => $identifier->id,
                        'contact_id' => $identifier->contact_id,
                        'channel' => Channel::Call,
                        'status' => ConversationStatus::Open,
                    ]);

                $call = Call::create([
                    'conversation_id' => $conversation->id,
                    'phone_number_id' => $line->id,
                    'contact_id' => $identifier->contact_id,
                    'direction' => 'inbound',
                    'from_number' => $identifier->value,
                    'to_number' => $line->e164,
                    'provider' => $validated['provider'],
                    'provider_sid' => $validated['provider_sid'],
                    'room' => $validated['room'] ?? null,
                    'status' => 'in-progress',
                    'language' => $line->effectiveLanguage(),
                ]);

                $conversation->forceFill(['last_message_at' => now()])->save();
                Activity::log($conversation, 'call_started', 'Inbound call answered by the agent', actor: 'agent', meta: ['call_id' => $call->id]);

                return ['call' => $call, 'identifier' => $identifier, 'created' => true];
            });

            $bundle = $builder->forCall($result['call'], $line, $result['identifier']);

            return response()->json($bundle, $result['created'] ? 201 : 200);
        } finally {
            Organization::setCurrent(null);
        }
    }

    /**
     * Recent calls, with their summaries: what a digest automation reads,
     * and what the worker reads to know a returning caller's history beyond
     * the three the bundle carries.
     */
    public function index(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'since' => ['nullable', 'date'],
            'contact_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'string', 'max:20'],
            'limit' => ['nullable', 'integer', 'between:1,100'],
        ]);

        $calls = Call::query()
            ->with(['contact:id,name,phone', 'transcript:id,call_id,summary'])
            // Parsed, not passed through: SQLite compares datetimes as text,
            // and an ISO "T" sorts after the stored space.
            ->when($validated['since'] ?? null, fn ($q, $since) => $q->where('created_at', '>=', \Illuminate\Support\Carbon::parse($since)))
            ->when($validated['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id))
            ->when($validated['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->latest()
            ->limit((int) ($validated['limit'] ?? 20))
            ->get();

        return response()->json([
            'calls' => $calls->map(fn (Call $c) => [
                'id' => $c->id,
                'at' => $c->created_at?->toIso8601String(),
                'direction' => $c->direction,
                'from' => $c->from_number,
                'to' => $c->to_number,
                'status' => $c->status,
                'duration' => $c->formattedDuration(),
                'duration_sec' => $c->duration_sec,
                'language' => $c->language,
                'contact_id' => $c->contact_id,
                'contact' => $c->contact?->name ?? $c->contact?->phone,
                'summary' => $c->transcript?->summary,
                'conversation_id' => $c->conversation_id,
            ])->all(),
        ]);
    }

    /**
     * A state change on a live call. One route, typed by `type`, because the
     * agent reports them in order and the app wants them in one audit stream.
     */
    public function event(Request $request, Organization $organization, Call $call): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['answered', 'transferred', 'ended', 'failed'])],
            'duration_sec' => ['nullable', 'integer', 'min:0'],
            'recording_url' => ['nullable', 'url', 'max:1000'],
            'summary' => ['nullable', 'string', 'max:5000'],
            'error' => ['nullable', 'string', 'max:2000'],
            'transferred_to' => ['nullable', 'string', 'max:64'],
            'metrics' => ['nullable', 'array'],
        ]);

        match ($validated['type']) {
            'answered' => $call->forceFill(['status' => 'in-progress'])->save(),
            'transferred' => $call->forceFill(['status' => 'transferred', 'transferred' => true])->save(),
            'ended' => $this->ended($call, $validated),
            'failed' => $call->forceFill(['status' => 'failed', 'error' => $validated['error'] ?? 'unknown', 'duration_sec' => $validated['duration_sec'] ?? $call->duration_sec])->save(),
        };

        if ($call->conversation) {
            Activity::log($call->conversation, 'call_'.$validated['type'], match ($validated['type']) {
                'ended' => 'Call ended after '.$call->formattedDuration(),
                'failed' => 'Call failed: '.($validated['error'] ?? 'unknown'),
                'transferred' => 'Call transferred'.(isset($validated['transferred_to']) ? " to {$validated['transferred_to']}" : ''),
                default => 'Call answered',
            }, actor: 'agent', meta: ['call_id' => $call->id]);
        }

        return response()->json(['id' => $call->id, 'status' => $call->status]);
    }

    private function ended(Call $call, array $v): void
    {
        $call->forceFill([
            'status' => 'completed',
            'duration_sec' => $v['duration_sec'] ?? $call->duration_sec,
            'recording_url' => $v['recording_url'] ?? $call->recording_url,
        ])->save();

        if (isset($v['summary']) || isset($v['metrics'])) {
            $transcript = CallTranscript::query()->firstOrNew(['call_id' => $call->id]);
            $transcript->fill(['call_id' => $call->id]);
            if (isset($v['summary'])) {
                $transcript->summary = $v['summary'];
            }
            if (isset($v['metrics'])) {
                $transcript->metrics = [...($transcript->metrics ?? []), ...$v['metrics']];
            }
            $transcript->items ??= [];
            $transcript->save();
        }

        $call->conversation?->forceFill(['last_message_at' => now()])->save();
    }

    /**
     * The transcript so far, replaced whole. The talker owns the full
     * caller-facing history and re-sends it on every push; replacing beats
     * appending because a retried push cannot then duplicate a turn.
     */
    public function transcript(Request $request, Organization $organization, Call $call): JsonResponse
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'max:2000'],
            'items.*.role' => ['required', Rule::in(['agent', 'caller', 'system'])],
            'items.*.text' => ['required', 'string', 'max:5000'],
            'items.*.at' => ['nullable', 'string'],
            'items.*.lang' => ['nullable', 'string', 'max:8'],
            'metrics' => ['nullable', 'array'],
        ]);

        $transcript = CallTranscript::query()->firstOrNew(['call_id' => $call->id]);
        $transcript->fill(['call_id' => $call->id, 'items' => $validated['items']]);
        if (isset($validated['metrics'])) {
            $transcript->metrics = [...($transcript->metrics ?? []), ...$validated['metrics']];
        }
        $transcript->save();

        return response()->json(['call_id' => $call->id, 'items' => count($validated['items'])]);
    }
}
