<?php

namespace App\Http\ViewModels\Desk;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Models\Activity;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\Membership;
use App\Models\Message;
use App\Models\Organization;
use App\Models\Reminder;
use App\Models\Ticket;
use App\Models\ToolCall;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The Desk dashboard: Z360's four sections, with the AI section reframed.
 *
 * Z360 reports "value delivered" and "time saved" — figures that need a cost
 * model nobody has agreed. PRODUCT.md forbids inventing numbers, so the AI
 * section here reports only what is countable: conversations the agent handled
 * alone, tickets it raised, and how many of its actions need checking. Those
 * are true, and a business can put its own price on them.
 */
class DashboardViewModel
{
    private Carbon $since;
    private Carbon $previousSince;

    public function __construct(private readonly int $days = 7, private readonly ?User $user = null)
    {
        $this->since = now()->subDays($days)->startOfDay();
        $this->previousSince = now()->subDays($days * 2)->startOfDay();
    }

    public function toArray(): array
    {
        return [
            'window_days' => $this->days,
            'topline' => $this->topline(),
            'support' => $this->support(),
            'ai' => $this->ai(),
            'channels' => $this->channels(),
            'volume_trend' => $this->volumeTrend(),
            'needs_you' => $this->needsYou(),
            'agent_activity' => $this->agentActivity(),
            'workload' => $this->workload(),
        ];
    }

    /**
     * The operator's own queue: what is assigned to them, what is unread in
     * it, and what has gone past its time. The morning question is "what is
     * mine", so this is scoped to the signed-in person and nobody else.
     */
    private function needsYou(): array
    {
        $empty = ['counts' => ['assigned' => 0, 'unread' => 0, 'overdue' => 0, 'tickets' => 0], 'conversations' => [], 'tickets' => [], 'overdue' => []];

        if (! $this->user) {
            return $empty;
        }

        $mine = fn () => Conversation::query()->inbox()->assignedTo($this->user);

        $conversations = $mine()
            ->with(['contact:id,name,phone,email,company', 'identifier:id,type,value', 'messages' => fn ($q) => $q->latest()->limit(1)])
            ->orderByDesc('unread_count')
            ->orderByDesc('last_message_at')
            ->limit(8)
            ->get()
            ->map(fn (Conversation $c) => [
                'id' => $c->id,
                'title' => $c->title(),
                'initials' => $c->contact?->initials() ?? '?',
                'company' => $c->contact?->company,
                'channel' => $c->channel->value,
                'unread' => (int) $c->unread_count,
                'preview' => ($m = $c->messages->first()) ? str($m->body ?? '')->limit(110)->value() : null,
                'last_message_at' => $c->last_message_at?->toIso8601String(),
            ])
            ->all();

        $tickets = Ticket::query()->unresolved()->assignedTo($this->user)
            ->latest()
            ->limit(20)
            ->get()
            ->sortBy(fn (Ticket $t) => [$t->priority->weight(), -$t->created_at?->getTimestamp()])
            ->take(8)
            ->map(fn (Ticket $t) => [
                'id' => $t->id,
                'reference' => $t->reference(),
                'subject' => $t->subject,
                'status_label' => $t->status->label(),
                'status_tone' => $t->status->tone(),
                'priority_label' => $t->priority->label(),
                'priority_tone' => $t->priority->tone(),
                'created_by_agent' => (bool) $t->created_by_agent,
                'at' => $t->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $reminders = Reminder::query()->due()->where('user_id', $this->user->getKey())
            ->with('remindable')
            ->orderBy('due_at')
            ->limit(8)
            ->get()
            ->map(fn (Reminder $r) => [
                'key' => "reminder-{$r->id}",
                'kind' => 'reminder',
                'title' => $r->text,
                'subtitle' => $r->remindable instanceof Conversation ? $r->remindable->title() : ($r->remindable instanceof Contact ? $r->remindable->displayName() : null),
                'href' => match (true) {
                    $r->remindable instanceof Conversation => "/desk/inbox/{$r->remindable->id}",
                    $r->remindable instanceof Contact => "/desk/contacts/{$r->remindable->id}",
                    default => null,
                },
                'due_at' => $r->due_at?->toIso8601String(),
            ]);

        $leads = Lead::query()
            ->whereHas('assignees', fn ($q) => $q->whereKey($this->user->getKey()))
            ->whereNotNull('next_response_at')
            ->where('next_response_at', '<', now())
            ->with('contact:id,name,phone,email,company')
            ->orderBy('next_response_at')
            ->limit(8)
            ->get()
            ->map(fn (Lead $l) => [
                'key' => "lead-{$l->id}",
                'kind' => 'lead',
                'title' => $l->contact ? "Follow up with {$l->contact->displayName()}" : 'Follow up on a lead',
                'subtitle' => $l->outreach_note ?: $l->contact?->company,
                'href' => $l->contact ? "/desk/contacts/{$l->contact->id}" : '/desk/leads',
                'due_at' => $l->next_response_at?->toIso8601String(),
            ]);

        $overdue = $reminders->concat($leads)->sortBy('due_at')->values()->all();

        return [
            'counts' => [
                'assigned' => $mine()->count(),
                'unread' => $mine()->unread()->count(),
                'overdue' => count($overdue),
                'tickets' => Ticket::query()->unresolved()->assignedTo($this->user)->count(),
            ],
            'conversations' => $conversations,
            'tickets' => $tickets,
            'overdue' => $overdue,
        ];
    }

    /** What the agent did most recently, from the same activity log a timeline reads. */
    private function agentActivity(): array
    {
        return Activity::query()
            ->where('actor', 'agent')
            ->with('subject')
            ->latest()
            ->limit(8)
            ->get()
            ->map(function (Activity $a) {
                $subject = $a->subject;

                return [
                    'id' => $a->id,
                    'type' => $a->type,
                    'description' => $a->description,
                    'subject' => match (true) {
                        $subject instanceof Contact => $subject->displayName(),
                        $subject instanceof Ticket => "{$subject->reference()} {$subject->subject}",
                        $subject instanceof Conversation => $subject->title(),
                        default => null,
                    },
                    'href' => match (true) {
                        $subject instanceof Contact => "/desk/contacts/{$subject->id}",
                        $subject instanceof Ticket => "/desk/tickets/{$subject->id}",
                        $subject instanceof Conversation => "/desk/inbox/{$subject->id}",
                        $subject instanceof Lead => '/desk/leads',
                        default => null,
                    },
                    'at' => $a->created_at?->toIso8601String(),
                ];
            })
            ->all();
    }

    /** Who is carrying what, for the shift lead deciding where the next one goes. */
    private function workload(): array
    {
        $organization = Organization::current();

        if (! $organization) {
            return [];
        }

        return Membership::query()
            ->where('organization_id', $organization->getKey())
            ->with('user:id,name')
            ->get()
            ->filter(fn (Membership $m) => $m->user !== null)
            ->map(fn (Membership $m) => [
                'id' => $m->user->id,
                'name' => $m->user->name,
                'role' => $m->role->label(),
                'open_conversations' => $m->user->assignedConversationCount(),
                'open_tickets' => $m->user->openTicketCount(),
                'is_you' => $this->user?->getKey() === $m->user->id,
            ])
            ->sortByDesc(fn ($m) => $m['open_conversations'] + $m['open_tickets'])
            ->values()
            ->all();
    }

    /** A number for now and for the previous window, so a delta can be shown. */
    private function pair(callable $count): array
    {
        $now = $count($this->since, now());
        $before = $count($this->previousSince, $this->since);

        return [
            'value' => $now,
            'previous' => $before,
            'delta_pct' => $before > 0 ? (int) round(($now - $before) / $before * 100) : null,
        ];
    }

    private function topline(): array
    {
        $agentHandled = fn ($from, $to) => Conversation::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereHas('messages', fn ($q) => $q->where('from_agent', true))
            ->whereDoesntHave('messages', fn ($q) => $q->where('direction', 'outbound')->where('from_agent', false))
            ->count();

        $busiest = Call::query()
            ->where('created_at', '>=', $this->since)
            ->selectRaw('to_number, count(*) as n')
            ->groupBy('to_number')
            ->orderByDesc('n')
            ->first();

        return [
            'ai_handled' => $this->pair($agentHandled),
            'support_volume' => $this->pair(fn ($f, $t) => Conversation::query()->whereBetween('created_at', [$f, $t])->count()),
            'most_active_number' => $busiest ? ['number' => $busiest->to_number, 'calls' => $busiest->n] : null,
            'leads' => $this->pair(fn ($f, $t) => Lead::query()->whereBetween('created_at', [$f, $t])->count()),
        ];
    }

    private function support(): array
    {
        $open = Ticket::query()->unresolved();

        return [
            'new_contacts' => $this->pair(fn ($f, $t) => Contact::query()->whereBetween('created_at', [$f, $t])->count()),
            'new_conversations' => $this->pair(fn ($f, $t) => Conversation::query()->whereBetween('created_at', [$f, $t])->count()),
            'tickets_created' => $this->pair(fn ($f, $t) => Ticket::query()->whereBetween('created_at', [$f, $t])->count()),
            'open_tickets' => (clone $open)->count(),
            'unassigned_conversations' => Conversation::query()->inbox()->unassigned()->count(),
            // Pipeline health: how the open tickets split by status.
            'ticket_pipeline' => (clone $open)
                ->selectRaw('status, count(*) as n')
                ->groupBy('status')
                ->pluck('n', 'status')
                ->all(),
            'by_priority' => (clone $open)
                ->selectRaw('priority, count(*) as n')
                ->groupBy('priority')
                ->pluck('n', 'priority')
                ->all(),
        ];
    }

    private function ai(): array
    {
        $agentOnly = Conversation::query()
            ->where('created_at', '>=', $this->since)
            ->whereHas('messages', fn ($q) => $q->where('from_agent', true))
            ->whereDoesntHave('messages', fn ($q) => $q->where('direction', 'outbound')->where('from_agent', false))
            ->count();

        $teamTouched = Conversation::query()
            ->where('created_at', '>=', $this->since)
            ->whereHas('messages', fn ($q) => $q->where('direction', 'outbound')->where('from_agent', false))
            ->count();

        $calls = Call::query()->where('created_at', '>=', $this->since);

        return [
            'conversations_agent_only' => $agentOnly,
            'conversations_team_touched' => $teamTouched,
            'calls_answered' => (clone $calls)->count(),
            'calls_transferred' => (clone $calls)->where('transferred', true)->count(),
            'call_minutes' => (int) round((clone $calls)->sum('duration_sec') / 60),
            'tickets_raised_by_agent' => Ticket::query()->where('created_at', '>=', $this->since)->raisedByAgent()->count(),
            'contacts_in_ai_conversations' => Conversation::query()
                ->where('created_at', '>=', $this->since)
                ->whereHas('messages', fn ($q) => $q->where('from_agent', true))
                ->whereNotNull('contact_id')
                ->distinct('contact_id')
                ->count('contact_id'),
            // The honest denominator for "is it behaving": how many of its
            // actions cannot be confirmed either way.
            'actions_needing_review' => ToolCall::query()
                ->where('created_at', '>=', $this->since)
                ->where('status', 'timeout')
                ->whereHas('action', fn ($q) => $q->where('is_idempotent', false))
                ->count(),
            'feedback' => [
                'up' => \App\Models\MessageFeedback::query()->where('created_at', '>=', $this->since)->where('rating', 'up')->count(),
                'down' => \App\Models\MessageFeedback::query()->where('created_at', '>=', $this->since)->where('rating', 'down')->count(),
            ],
        ];
    }

    private function channels(): array
    {
        $byChannel = Conversation::query()
            ->where('created_at', '>=', $this->since)
            ->selectRaw('channel, count(*) as n')
            ->groupBy('channel')
            ->pluck('n', 'channel');

        return collect(Channel::cases())->map(fn (Channel $c) => [
            'channel' => $c->value,
            'label' => $c->label(),
            'conversations' => (int) ($byChannel[$c->value] ?? 0),
        ])->all();
    }

    /** Daily counts for the sparkline — contacts, conversations, tickets. */
    private function volumeTrend(): array
    {
        $days = collect(range($this->days - 1, 0))->map(fn ($i) => now()->subDays($i)->toDateString());

        $bucket = fn (string $model) => $model::query()
            ->where('created_at', '>=', $this->since)
            ->selectRaw('date(created_at) as d, count(*) as n')
            ->groupBy('d')
            ->pluck('n', 'd');

        $contacts = $bucket(Contact::class);
        $conversations = $bucket(Conversation::class);
        $tickets = $bucket(Ticket::class);
        $calls = $bucket(Call::class);
        $leads = $bucket(Lead::class);

        return $days->map(fn ($d) => [
            'date' => $d,
            'contacts' => (int) ($contacts[$d] ?? 0),
            'conversations' => (int) ($conversations[$d] ?? 0),
            'tickets' => (int) ($tickets[$d] ?? 0),
            'calls' => (int) ($calls[$d] ?? 0),
            'leads' => (int) ($leads[$d] ?? 0),
        ])->all();
    }
}
