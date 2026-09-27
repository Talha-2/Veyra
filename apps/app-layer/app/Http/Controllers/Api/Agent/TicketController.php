<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Call;
use App\Models\Organization;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The write that backs "I've passed this to the team".
 *
 * A ticket row is the evidence behind that sentence, so this route does the
 * whole job in one transaction: number it, type it, route it to the type's
 * default assignees, log it on the conversation, and notify. The agent gets
 * back a reference it can read to the caller.
 */
class TicketController extends Controller
{
    public function index(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'contact_id' => ['nullable', 'integer'],
            'conversation_id' => ['nullable', 'integer'],
            'limit' => ['nullable', 'integer', 'between:1,20'],
        ]);

        $tickets = Ticket::query()
            ->when($validated['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id))
            ->when($validated['conversation_id'] ?? null, fn ($q, $id) => $q->where('conversation_id', $id))
            ->latest()->limit((int) ($validated['limit'] ?? 10))->get();

        return response()->json(['tickets' => $tickets->map(fn (Ticket $t) => $this->row($t))->all()]);
    }

    public function store(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:20000'],
            'type' => ['nullable', 'string', 'max:60'],
            'priority' => ['nullable', Rule::enum(TicketPriority::class)],
            'contact_id' => ['nullable', 'integer'],
            'conversation_id' => ['nullable', 'integer'],
            'call_id' => ['nullable', 'integer'],
            // Lets a retried create find its earlier self instead of raising
            // a second ticket for the same caller sentence.
            'idempotency_key' => ['nullable', 'string', 'max:128'],
        ]);

        if (! empty($validated['idempotency_key'])) {
            $existing = Ticket::query()->where('channel', 'agent:'.$validated['idempotency_key'])->first();
            if ($existing) {
                return response()->json(['created' => false, 'ticket' => $this->row($existing)]);
            }
        }

        $ticket = DB::transaction(function () use ($validated) {
            $call = ! empty($validated['call_id']) ? Call::query()->find($validated['call_id']) : null;
            $type = ! empty($validated['type'])
                ? TicketType::query()->where('enabled', true)->whereRaw('lower(name) = ?', [mb_strtolower($validated['type'])])->first()
                : null;

            $ticket = Ticket::create([
                'subject' => $validated['subject'],
                'body' => $validated['body'],
                'status' => TicketStatus::Open,
                'priority' => $validated['priority'] ?? TicketPriority::Normal->value,
                'type' => $type?->name ?? ($validated['type'] ?? null),
                'ticket_type_id' => $type?->id,
                'contact_id' => $validated['contact_id'] ?? $call?->contact_id,
                'conversation_id' => $validated['conversation_id'] ?? $call?->conversation_id,
                'created_by_agent' => true,
                'channel' => ! empty($validated['idempotency_key']) ? 'agent:'.$validated['idempotency_key'] : 'agent',
            ]);

            $assignees = collect($type?->default_assignee_ids ?? [])->filter()->values();
            if ($assignees->isNotEmpty()) {
                $ticket->assignees()->sync($assignees->all());
            }

            Activity::log($ticket, 'created', 'Raised by the agent'.($call ? ' during a call' : ''), actor: 'agent', meta: ['call_id' => $call?->id]);
            if ($ticket->conversation) {
                Activity::log($ticket->conversation, 'ticket_raised', "Agent raised ticket {$ticket->reference()}", actor: 'agent', meta: ['ticket_id' => $ticket->id]);
            }

            foreach (User::query()->whereIn('id', $assignees)->get() as $user) {
                $user->notifications()->create([
                    'id' => (string) Str::uuid(),
                    'type' => 'ticket.created',
                    'data' => [
                        'organization_id' => $ticket->organization_id, 'type' => 'ticket',
                        'title' => "{$ticket->reference()}: {$ticket->subject}",
                        'body' => str($ticket->body)->limit(140)->value(),
                        'url' => "/desk/tickets/{$ticket->id}",
                    ],
                ]);
            }

            return $ticket;
        });

        return response()->json(['created' => true, 'ticket' => $this->row($ticket->load('assignees'))], 201);
    }

    private function row(Ticket $t): array
    {
        return [
            'id' => $t->id,
            'number' => $t->number,
            'reference' => $t->reference(),
            'subject' => $t->subject,
            'status' => $t->status->value,
            'priority' => $t->priority->value,
            'type' => $t->type,
            'assignees' => $t->assignees->pluck('name')->all(),
            'created_at' => $t->created_at?->toIso8601String(),
        ];
    }
}
