<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\Agent\ActingFor;
use App\Services\Tickets\TicketDesk;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The write that backs "I've passed this to the team", and the reads and
 * updates a front desk does on tickets afterwards.
 *
 * A ticket row is the evidence behind that sentence, so creating one does the
 * whole job in one transaction: number it, type it, route it to the type's
 * default assignees, log it on the conversation, and notify. Tickets are
 * addressed by their per-tenant number — what customers quote ("#12") — and
 * on a customer conversation only that customer's tickets are visible
 * (ActingFor). Status and priority changes go through TicketDesk's guardrails.
 */
class TicketController extends Controller
{
    public function __construct(private readonly TicketDesk $desk) {}

    public function index(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'contact_id' => ['nullable', 'integer'],
            'conversation_id' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::in(['open', 'all'])],
            'limit' => ['nullable', 'integer', 'between:1,20'],
        ]);
        $scope = ActingFor::from($request);

        $tickets = Ticket::query()->with('assignees:id,name')
            ->when($scope->customerFacing(), fn ($q) => $q->where(fn ($w) => $w
                ->where('conversation_id', $scope->conversation->id)
                ->when($scope->contactId(), fn ($o, $id) => $o->orWhere('contact_id', $id))))
            ->when($validated['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id))
            ->when($validated['conversation_id'] ?? null, fn ($q, $id) => $q->where('conversation_id', $id))
            ->when(($validated['status'] ?? 'all') === 'open', fn ($q) => $q->unresolved())
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
        $scope = ActingFor::from($request);

        if (! empty($validated['idempotency_key'])) {
            $existing = Ticket::query()->where('channel', 'agent:'.$validated['idempotency_key'])->first();
            if ($existing) {
                return response()->json(['created' => false, 'ticket' => $this->row($existing->load('assignees'))]);
            }
        }

        $call = ! empty($validated['call_id']) ? Call::query()->find($validated['call_id']) : null;
        // On a customer conversation the ticket belongs to that conversation
        // and its customer: a ticket "for" someone else is not the agent's to raise.
        $conversationId = $scope->conversation?->id ?? $validated['conversation_id'] ?? $call?->conversation_id;
        $contactId = $validated['contact_id'] ?? null;
        if ($scope->customerFacing()) {
            if ($contactId !== null) {
                $scope->ensureContact(Contact::query()->find($contactId));
            }
            $contactId = $scope->contactId();
        }
        $contactId ??= $call?->contact_id;

        [$type, $typeNote] = $this->desk->resolveType($validated['type'] ?? null);

        $ticket = DB::transaction(function () use ($validated, $call, $conversationId, $contactId, $type, $typeNote) {
            $ticket = Ticket::create([
                'subject' => $validated['subject'],
                'body' => $validated['body'],
                'status' => TicketStatus::Open,
                'priority' => $validated['priority'] ?? TicketPriority::Normal->value,
                'type' => $type?->name ?? ($validated['type'] ?? null),
                'ticket_type_id' => $type?->id,
                'contact_id' => $contactId,
                'conversation_id' => $conversationId,
                'created_by_agent' => true,
                'channel' => ! empty($validated['idempotency_key']) ? 'agent:'.$validated['idempotency_key'] : 'agent',
            ]);

            $assignees = $this->desk->route($ticket, $type);

            Activity::log($ticket, 'created', 'Raised by the agent'.($call ? ' during a call' : ''), actor: 'agent', meta: array_filter(['call_id' => $call?->id, 'type_note' => $typeNote]));
            if ($ticket->conversation) {
                Activity::log($ticket->conversation, 'ticket_raised', "Agent raised ticket {$ticket->reference()}", actor: 'agent', meta: ['ticket_id' => $ticket->id]);
            }
            $this->desk->notify($ticket, $assignees, 'ticket.created', "{$ticket->reference()}: {$ticket->subject}");

            return $ticket;
        });

        return response()->json(['created' => true, 'type_note' => $typeNote, 'ticket' => $this->row($ticket->load('assignees'))], 201);
    }

    /** One ticket by the number customers quote. */
    public function show(Request $request, Organization $organization, int $number): JsonResponse
    {
        $ticket = $this->find($request, $number);

        return response()->json(['ticket' => $this->detail($ticket)]);
    }

    /**
     * What the agent may do to an existing ticket: add what the customer
     * said, move it within the front-desk transitions, raise its priority,
     * re-type one it raised, and route it to its type's team. All optional;
     * all logged; the assignees hear about a reopen or a customer update.
     */
    public function update(Request $request, Organization $organization, int $number): JsonResponse
    {
        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:5000'],
            'status' => ['nullable', Rule::enum(TicketStatus::class)],
            'priority' => ['nullable', Rule::enum(TicketPriority::class)],
            'type' => ['nullable', 'string', 'max:60'],
        ]);
        if (! array_filter($validated, fn ($v) => filled($v))) {
            return response()->json(['error' => 'nothing_to_change', 'message' => 'Give a note, a status, a priority or a type.'], 422);
        }
        $scope = ActingFor::from($request);
        $ticket = $this->find($request, $number);
        $changes = [];
        $typeNote = null;

        DB::transaction(function () use ($validated, $scope, $ticket, &$changes, &$typeNote) {
            $from = $ticket->status;
            if (! empty($validated['status'])) {
                $this->desk->agentTransition($ticket, TicketStatus::from($validated['status']), $scope->conversation?->id);
            }
            if (! empty($validated['priority'])) {
                $this->desk->agentPriority($ticket, TicketPriority::from($validated['priority']));
            }
            $type = null;
            if (! empty($validated['type'])) {
                [$type, $typeNote] = $this->desk->resolveType($validated['type']);
                // Models echo the current values back; only a real change is a re-type.
                if ($type && $type->id !== $ticket->ticket_type_id) {
                    if (! $ticket->created_by_agent) {
                        throw ValidationException::withMessages(['type' => "The team typed {$ticket->reference()}; the agent can only re-type tickets it raised."]);
                    }
                    $ticket->forceFill(['ticket_type_id' => $type->id, 'type' => $type->name]);
                } else {
                    $type = null;
                    $typeNote = null;
                }
            }

            $dirty = array_keys($ticket->getDirty());
            $ticket->save();

            if (in_array('status', $dirty, true)) {
                $changes[] = "status {$from->label()} → {$ticket->status->label()}";
                $this->desk->log($ticket, 'status_changed', "Agent set status to {$ticket->status->label()}", ['from' => $from->value, 'to' => $ticket->status->value]);
            }
            if (in_array('priority', $dirty, true)) {
                $changes[] = "priority {$ticket->priority->label()}";
                $this->desk->log($ticket, 'priority_changed', "Agent set priority to {$ticket->priority->label()}");
            }
            if (in_array('ticket_type_id', $dirty, true)) {
                $changes[] = "type {$ticket->type}";
                $this->desk->log($ticket, 'type_changed', "Agent filed it as {$ticket->type}");
            }

            // Route to the type's team: on a re-type, and whenever nobody has it.
            $added = ($type || $ticket->assignees()->doesntExist())
                ? $this->desk->route($ticket, $type ?? $ticket->ticketType)
                : collect();
            if ($added->isNotEmpty()) {
                $changes[] = 'assigned to '.$added->pluck('name')->join(', ');
                $this->desk->log($ticket, 'assigned', 'Agent routed it to '.$added->pluck('name')->join(', '));
                $this->desk->notify($ticket, $added, 'ticket.assigned', "{$ticket->reference()}: {$ticket->subject}");
            }

            if (! empty($validated['note'])) {
                $ticket->notes()->create(['body' => $validated['note']]);
                $changes[] = 'note added';
                $this->desk->log($ticket, 'note_added', 'Agent added a note'.($scope->customerFacing() ? ' from the customer' : ''));
                $ticket->touch();
            }

            $reopened = in_array('status', $dirty, true) && $ticket->status === TicketStatus::Open;
            if ($reopened || ! empty($validated['note'])) {
                $this->desk->notify($ticket, $ticket->assignees()->get()->reject(fn ($u) => $added->contains('id', $u->id)), $reopened ? 'ticket.reopened' : 'ticket.updated',
                    "{$ticket->reference()} ".($reopened ? 'reopened' : 'updated').": {$ticket->subject}", $validated['note'] ?? null);
            }
            if ($changes && $ticket->conversation && $ticket->conversation_id !== $scope->conversation?->id && $scope->conversation) {
                Activity::log($scope->conversation, 'ticket_updated', "Agent updated {$ticket->reference()}", actor: 'agent', meta: ['ticket_id' => $ticket->id]);
            }
        });

        return response()->json(['changes' => $changes, 'type_note' => $typeNote, 'ticket' => $this->detail($ticket->refresh())]);
    }

    private function find(Request $request, int $number): Ticket
    {
        $ticket = Ticket::query()->where('number', $number)->first();
        if (! $ticket || ! ActingFor::from($request)->allowsTicket($ticket)) {
            // The same answer whether it does not exist or is someone else's:
            // a caller cannot probe other customers' ticket numbers.
            abort(response()->json(['error' => 'not_found', 'message' => "There is no ticket #{$number} on this customer's record."], 404));
        }

        return $ticket;
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

    private function detail(Ticket $t): array
    {
        $t->loadMissing('assignees:id,name');
        $latest = $t->activities()->whereIn('type', ['status_changed', 'note_added', 'assigned', 'created', 'priority_changed'])->first();

        return [
            ...$this->row($t),
            'status_label' => $t->status->label(),
            'created_by_agent' => $t->created_by_agent,
            'updated_at' => $t->updated_at?->toIso8601String(),
            'resolved_at' => $t->resolved_at?->toIso8601String(),
            'last_activity' => $latest ? ['description' => $latest->description, 'at' => $latest->created_at?->toIso8601String()] : null,
        ];
    }
}
