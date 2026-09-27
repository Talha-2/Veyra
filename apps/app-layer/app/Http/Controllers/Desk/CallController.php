<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Call;
use App\Models\Delegation;
use App\Models\Ticket;
use App\Models\ToolCall;
use App\Support\LanguageCapabilities;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Calls, and the evidence behind each one.
 *
 * The list answers "what happened on the phone today"; the detail answers
 * "what did the agent actually do" — the transcript, every talker → worker
 * handoff, every tool call with its status, and the ones that timed out on
 * a non-idempotent action, which are the calls a person must look at. This
 * is the page the reliability rules in ARCHITECTURE.md §5.4 exist to make
 * possible: a promise the agent made is checkable against a row here.
 */
class CallController extends Controller
{
    public function index(Request $request): Response
    {
        $view = $request->query('view', 'all');
        $search = trim((string) $request->query('search')) ?: null;

        $needsReview = fn ($q) => $q->whereHas('toolCalls', fn ($t) => $t->where('status', 'timeout')->whereHas('action', fn ($a) => $a->where('is_idempotent', false)));

        $calls = Call::query()
            ->with(['contact:id,name,phone', 'transcript:id,call_id,summary,metrics', 'phoneNumber:id,friendly_name,e164'])
            ->withCount(['delegations', 'toolCalls'])
            ->when($view === 'review', $needsReview)
            ->when($view === 'today', fn ($q) => $q->where('created_at', '>=', now()->startOfDay()))
            ->when($view === 'live', fn ($q) => $q->whereIn('status', ['ringing', 'in-progress']))
            ->when($search, fn ($q) => $q->where(fn ($w) => $w->where('from_number', 'like', "%{$search}%")->orWhere('to_number', 'like', "%{$search}%")->orWhereHas('contact', fn ($c) => $c->where('name', 'like', "%{$search}%"))))
            ->latest()
            ->paginate(50)
            ->withQueryString();

        $reviewIds = ToolCall::query()->where('status', 'timeout')->whereHas('action', fn ($a) => $a->where('is_idempotent', false))->whereNotNull('call_id')->pluck('call_id')->unique();

        return Inertia::render('desk/calls', [
            'calls' => $calls->through(fn (Call $c) => [
                'id' => $c->id,
                'at' => $c->created_at?->toIso8601String(),
                'direction' => $c->direction,
                'from' => $c->from_number,
                'to' => $c->to_number,
                'line' => $c->phoneNumber?->friendly_name,
                'contact' => $c->contact ? ['id' => $c->contact->id, 'name' => $c->contact->name ?: $c->contact->phone] : null,
                'status' => $c->status,
                'live' => $c->isLive(),
                'duration' => $c->formattedDuration(),
                'language' => $c->language,
                'summary' => $c->transcript?->summary,
                'p95' => data_get($c->transcript?->metrics, 'voice_to_voice.p95'),
                'delegations' => $c->delegations_count,
                'tool_calls' => $c->tool_calls_count,
                'needs_review' => $reviewIds->contains($c->id),
            ]),
            'view' => $view,
            'filters' => ['search' => $search],
            'counts' => [
                'all' => Call::query()->count(),
                'today' => Call::query()->where('created_at', '>=', now()->startOfDay())->count(),
                'review' => $reviewIds->count(),
                'live' => Call::query()->whereIn('status', ['ringing', 'in-progress'])->count(),
            ],
        ]);
    }

    public function show(Call $call): Response
    {
        $call->load(['contact', 'conversation', 'transcript', 'phoneNumber', 'transferredTo:id,name', 'delegations.toolCalls.action']);

        $tickets = $call->conversation_id
            ? Ticket::query()->where('conversation_id', $call->conversation_id)->where('created_at', '>=', $call->created_at->subMinute())->get()
            : collect();

        return Inertia::render('desk/call', [
            'call' => [
                'id' => $call->id,
                'at' => $call->created_at?->toIso8601String(),
                'direction' => $call->direction,
                'from' => $call->from_number,
                'to' => $call->to_number,
                'line' => $call->phoneNumber?->friendly_name,
                'status' => $call->status,
                'live' => $call->isLive(),
                'duration' => $call->formattedDuration(),
                'language' => $call->language,
                'language_label' => LanguageCapabilities::for($call->language ?? 'en')['label'] ?? $call->language,
                'recording_url' => $call->recording_url,
                'transferred_to' => $call->transferredTo?->name,
                'error' => $call->error,
                'conversation_id' => $call->conversation_id,
                'contact' => $call->contact ? ['id' => $call->contact->id, 'name' => $call->contact->displayName(), 'initials' => $call->contact->initials()] : null,
                'summary' => $call->transcript?->summary,
                'metrics' => $call->transcript?->metrics ?? [],
                'transcript' => $call->transcript?->items ?? [],
                'delegations' => $call->delegations->map(fn (Delegation $d) => [
                    'id' => $d->id,
                    'sequence' => $d->sequence,
                    'transcript_delta' => $d->transcript_delta,
                    'reply' => $d->reply,
                    'status' => $d->status,
                    'failed' => $d->failed(),
                    'durable' => $d->completedADurableWrite(),
                    'is_finalization' => $d->is_finalization,
                    'duration_ms' => $d->duration_ms,
                    'error' => $d->error,
                    'started_at' => $d->started_at?->toIso8601String(),
                    'tool_calls' => $d->toolCalls->map(fn (ToolCall $t) => $this->toolCall($t))->all(),
                ])->all(),
                // Tool calls outside any delegation (the talker's own, or unrecorded delegations).
                'loose_tool_calls' => $call->toolCalls()->whereNull('delegation_id')->with('action')->get()->map(fn (ToolCall $t) => $this->toolCall($t))->all(),
                'tickets' => $tickets->map(fn (Ticket $t) => ['id' => $t->id, 'reference' => $t->reference(), 'subject' => $t->subject, 'status' => $t->status->value])->all(),
            ],
        ]);
    }

    private function toolCall(ToolCall $t): array
    {
        return [
            'id' => $t->id,
            'action' => $t->action_slug,
            'kind' => $t->kind->value,
            'status' => $t->status->value,
            'status_label' => $t->status->label(),
            'tone' => $t->status->tone(),
            'arguments' => $t->arguments,
            'result' => $t->result,
            'error' => $t->error,
            'attempt' => $t->attempt,
            'duration_ms' => $t->duration_ms,
            'durable' => (bool) $t->action?->is_durable_write,
            'needs_reconciliation' => $t->needsReconciliation(),
            'at' => $t->created_at?->toIso8601String(),
        ];
    }
}
