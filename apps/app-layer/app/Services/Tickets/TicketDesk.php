<?php

namespace App\Services\Tickets;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Activity;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Ticket rules shared by every writer, plus the agent's guardrails.
 *
 * The agent works the front desk, not the back office. It may raise a ticket,
 * add what the customer tells it, reopen one the customer says is not fixed,
 * and mark one as waiting on the customer — but it never closes the team's
 * work, never takes a ticket off someone, and never demotes a priority a
 * person chose. Every change is an Activity row with `actor = agent`, so the
 * ticket's timeline in Desk says who did what.
 */
class TicketDesk
{
    /** Statuses the agent may move a ticket to, keyed by target, valued by the statuses it may come from. */
    private const AGENT_TRANSITIONS = [
        'open' => ['pending', 'resolved'],       // the customer replied, or says it is not fixed
        'pending' => ['open', 'in_progress'],    // waiting on the customer
        'resolved' => ['open', 'pending'],       // only its own ticket, on its own conversation — see agentTransition()
    ];

    /**
     * The enabled type with this name (case-insensitive), or the default type
     * with a note saying the name was not one of the business's.
     *
     * @return array{0: ?TicketType, 1: ?string}
     */
    public function resolveType(?string $name): array
    {
        $types = TicketType::query()->where('enabled', true)->orderBy('position')->orderBy('id')->get();
        if (filled($name)) {
            $match = $types->first(fn (TicketType $t) => mb_strtolower($t->name) === mb_strtolower(trim($name)));
            if ($match) {
                return [$match, null];
            }
            $default = $types->first();

            return [$default, $default
                ? "\"{$name}\" is not one of this business's ticket types, so it was filed as {$default->name}."
                : null];
        }

        return [$types->first(), null];
    }

    /**
     * Give the ticket its type's default team, adding to whoever already has it.
     *
     * @return Collection<int, User> the people newly added
     */
    public function route(Ticket $ticket, ?TicketType $type): Collection
    {
        $ids = collect($type?->default_assignee_ids ?? [])->filter()->map(fn ($id) => (int) $id)->values();
        // Only members of this organization: a stale id on the type must not reach a stranger.
        $users = $ids->isEmpty() ? collect() : $ticket->organization?->members()->whereIn('users.id', $ids)->get() ?? collect();
        $current = $ticket->assignees()->pluck('users.id');
        $new = $users->reject(fn (User $u) => $current->contains($u->id))->values();
        if ($new->isNotEmpty()) {
            $ticket->assignees()->syncWithoutDetaching($new->pluck('id')->all());
        }

        return $new;
    }

    /** A Desk notification for each person, in the shape the bell renders. */
    public function notify(Ticket $ticket, iterable $users, string $type, string $title, ?string $body = null): void
    {
        foreach ($users as $user) {
            $user->notifications()->create([
                'id' => (string) Str::uuid(),
                'type' => $type,
                'data' => [
                    'organization_id' => $ticket->organization_id, 'type' => 'ticket',
                    'title' => $title,
                    'body' => str($body ?? $ticket->body ?? '')->limit(140)->value(),
                    'url' => "/desk/tickets/{$ticket->id}",
                ],
            ]);
        }
    }

    /**
     * Apply a status change the agent asked for, or refuse it in words the
     * agent can repeat to the customer.
     */
    public function agentTransition(Ticket $ticket, TicketStatus $to, ?int $actingConversationId): void
    {
        $from = $ticket->status;
        if ($from === $to) {
            return;
        }

        $allowed = self::AGENT_TRANSITIONS[$to->value] ?? null;
        $refusal = match (true) {
            $to === TicketStatus::Closed => 'Only the team can close a ticket.',
            $to === TicketStatus::InProgress => 'Only the team marks a ticket in progress, when someone starts on it.',
            $from === TicketStatus::Closed => "Ticket {$ticket->reference()} is closed and only the team can reopen it. Raise a new ticket that mentions {$ticket->reference()} instead.",
            $to === TicketStatus::Resolved && ! ($ticket->created_by_agent && $actingConversationId !== null && $ticket->conversation_id === $actingConversationId) => "Only the team can resolve {$ticket->reference()}. The agent may only withdraw a ticket it raised in this same conversation.",
            $allowed === null || ! in_array($from->value, $allowed, true) => "Ticket {$ticket->reference()} is {$from->label()}; the agent cannot move it to {$to->label()}.",
            default => null,
        };
        if ($refusal) {
            throw ValidationException::withMessages(['status' => $refusal]);
        }

        $ticket->status = $to;
        $ticket->resolved_at = $to->isTerminal() ? now() : null;
    }

    /** Raise freely; lower only a priority the agent set itself. */
    public function agentPriority(Ticket $ticket, TicketPriority $to): void
    {
        if ($to->weight() > $ticket->priority->weight() && ! $ticket->created_by_agent) {
            throw ValidationException::withMessages(['priority' => "The team set {$ticket->reference()} to {$ticket->priority->label()}; the agent may raise a priority but not lower one a person chose."]);
        }
        $ticket->priority = $to;
    }

    public function log(Ticket $ticket, string $type, string $description, array $meta = []): void
    {
        Activity::log($ticket, $type, $description, actor: 'agent', meta: $meta);
    }
}
