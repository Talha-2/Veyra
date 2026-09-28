<?php

namespace App\Http\Controllers\Desk;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class TicketController extends Controller
{
    /** Filters on which tickets are shown. `view` used to carry these, so it still does for old links. */
    private const SCOPES = ['open', 'mine', 'agent', 'resolved'];

    /** How they are shown: `?view=board|list|table`. */
    private const LAYOUTS = ['board', 'list', 'table'];

    /** Table columns that sort on the server (the table is paginated). */
    private const SORTS = ['reference', 'subject', 'priority', 'status', 'updated'];

    private const PRIORITY_ORDER = "case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end";

    private const STATUS_ORDER = "case status when 'open' then 0 when 'in_progress' then 1 when 'pending' then 2 when 'resolved' then 3 else 4 end";

    public function index(Request $request): Response
    {
        $param = $request->query('view');
        $layout = in_array($param, self::LAYOUTS, true)
            ? $param
            : match ($request->query('layout')) { 'kanban' => 'board', 'list' => 'table', default => 'list' };
        $scope = in_array($request->query('scope'), self::SCOPES, true)
            ? $request->query('scope')
            : (in_array($param, self::SCOPES, true) ? $param : 'open');

        $sort = in_array($request->query('sort'), self::SORTS, true) ? $request->query('sort') : null;
        $dir = $request->query('dir') === 'desc' ? 'desc' : 'asc';

        $query = Ticket::query()
            ->with(['contact:id,name,phone,email', 'assignees:id,name', 'ticketType:id,name,color'])
            ->when($scope === 'open', fn ($q) => $q->unresolved())
            ->when($scope === 'mine', fn ($q) => $q->unresolved()->assignedTo($request->user()))
            ->when($scope === 'agent', fn ($q) => $q->unresolved()->raisedByAgent())
            ->when($scope === 'resolved', fn ($q) => $q->whereIn('status', [TicketStatus::Resolved, TicketStatus::Closed]))
            ->when($request->query('search'), fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('subject', 'ilike', "%{$s}%")
                ->orWhereHas('contact', fn ($c) => $c->where('name', 'ilike', "%{$s}%"))))
            ->when($request->query('type'), fn ($q, $t) => $q->where('ticket_type_id', $t))
            ->when($request->query('priority'), fn ($q, $p) => $q->where('priority', $p));

        // The board and the grouped list show every ticket in scope at once (a
        // column or a group must add up); the table is paginated and sorts on
        // the server so the order holds across pages.
        if ($layout === 'table') {
            match ($sort) {
                'reference' => $query->orderBy('number', $dir),
                'subject' => $query->orderBy('subject', $dir),
                'priority' => $query->orderByRaw(self::PRIORITY_ORDER.' '.$dir),
                'status' => $query->orderByRaw(self::STATUS_ORDER.' '.$dir),
                'updated' => $query->orderBy('updated_at', $dir),
                default => $query->orderByRaw(self::PRIORITY_ORDER)->orderByDesc('updated_at'),
            };
            $tickets = $query->orderByDesc('id')->paginate(50)->withQueryString();
        } elseif ($layout === 'board') {
            $tickets = $query->orderBy('position')->orderByDesc('updated_at')->limit(400)->get();
        } else {
            $tickets = $query->orderByRaw(self::PRIORITY_ORDER)->orderByDesc('updated_at')->limit(400)->get();
        }

        $shape = fn (Ticket $t) => [
            'id' => $t->id,
            'reference' => $t->reference(),
            'subject' => $t->subject,
            'status' => $t->status->value,
            'status_label' => $t->status->label(),
            'status_tone' => $t->status->tone(),
            'priority' => $t->priority->value,
            'priority_label' => $t->priority->label(),
            'priority_tone' => $t->priority->tone(),
            'position' => $t->position,
            'type' => $t->ticketType ? ['id' => $t->ticketType->id, 'name' => $t->ticketType->name, 'color' => $t->ticketType->color] : null,
            'created_by_agent' => $t->created_by_agent,
            'contact' => $t->contact ? ['id' => $t->contact->id, 'name' => $t->contact->displayName()] : null,
            'assignees' => $t->assignees->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->all(),
            'created_at' => $t->created_at?->toIso8601String(),
            'updated_at' => $t->updated_at?->toIso8601String(),
        ];

        return Inertia::render('desk/tickets', [
            'tickets' => $layout === 'table' ? $tickets->through($shape) : ['data' => $tickets->map($shape)->all()],
            'scope' => $scope,
            // Kept for anything that still reads the old name: it is the scope.
            'view' => $scope,
            'layout' => $layout,
            'sort' => ['key' => $sort, 'dir' => $dir],
            'filters' => ['search' => $request->query('search'), 'type' => $request->query('type'), 'priority' => $request->query('priority')],
            'counts' => [
                'open' => Ticket::query()->unresolved()->count(),
                'mine' => Ticket::query()->unresolved()->assignedTo($request->user())->count(),
                'agent' => Ticket::query()->unresolved()->raisedByAgent()->count(),
                // Tickets carry no due date, so "overdue" is not knowable; urgent
                // is the nearest honest signal of what needs doing first.
                'urgent' => Ticket::query()->unresolved()->where('priority', TicketPriority::Urgent)->count(),
            ],
            'statuses' => collect(TicketStatus::cases())->map(fn ($s) => ['value' => $s->value, 'label' => $s->label(), 'tone' => $s->tone()])->all(),
            'priorities' => collect(TicketPriority::cases())->map(fn ($p) => ['value' => $p->value, 'label' => $p->label(), 'tone' => $p->tone()])->all(),
            'types' => TicketType::query()->where('enabled', true)->orderBy('position')->get(['id', 'name', 'color'])->all(),
            'team' => User::whereHas('memberships')->get(['id', 'name'])->all(),
        ]);
    }

    public function show(Ticket $ticket): Response
    {
        $ticket->load(['contact', 'conversation', 'assignees:id,name', 'ticketType', 'createdBy:id,name', 'notes.author:id,name', 'activities.user:id,name', 'tags']);

        return Inertia::render('desk/ticket', [
            'ticket' => [
                'id' => $ticket->id,
                'reference' => $ticket->reference(),
                'subject' => $ticket->subject,
                'body' => $ticket->body,
                'status' => $ticket->status->value,
                'priority' => $ticket->priority->value,
                'ticket_type_id' => $ticket->ticket_type_id,
                'channel' => $ticket->channel,
                'created_by' => $ticket->created_by_agent ? 'Agent' : ($ticket->createdBy?->name ?? '—'),
                'created_by_agent' => $ticket->created_by_agent,
                'created_at' => $ticket->created_at?->toIso8601String(),
                'resolved_at' => $ticket->resolved_at?->toIso8601String(),
                'conversation_id' => $ticket->conversation_id,
                'updated_at' => $ticket->updated_at?->toIso8601String(),
                'contact' => $ticket->contact ? [
                    'id' => $ticket->contact->id, 'name' => $ticket->contact->displayName(), 'initials' => $ticket->contact->initials(),
                    'phone' => $ticket->contact->phone, 'email' => $ticket->contact->email, 'company' => $ticket->contact->company,
                ] : null,
                // The thread the ticket was raised from, for the inspector's link card.
                'conversation' => $ticket->conversation ? [
                    'id' => $ticket->conversation->id,
                    'title' => $ticket->conversation->title(),
                    'channel' => $ticket->conversation->channel->value,
                    'channel_label' => $ticket->conversation->channel->label(),
                    'status' => $ticket->conversation->status->value,
                    'last_message_at' => $ticket->conversation->last_message_at?->toIso8601String(),
                ] : null,
                'assignee_ids' => $ticket->assignees->pluck('id')->all(),
                'tags' => $ticket->tags->pluck('name')->all(),
                'notes' => $ticket->notes->map(fn ($n) => ['id' => $n->id, 'body' => $n->body, 'author' => $n->author?->name ?? 'Agent', 'at' => $n->created_at?->toIso8601String(), 'by_agent' => $n->author_id === null])->all(),
                'activities' => $ticket->activities->map(fn ($a) => ['id' => $a->id, 'actor' => $a->actorLabel(), 'is_agent' => $a->actor === 'agent', 'description' => $a->description, 'at' => $a->created_at?->toIso8601String()])->all(),
            ],
            'statuses' => collect(TicketStatus::cases())->map(fn ($s) => ['value' => $s->value, 'label' => $s->label(), 'tone' => $s->tone()])->all(),
            'priorities' => collect(TicketPriority::cases())->map(fn ($p) => ['value' => $p->value, 'label' => $p->label(), 'tone' => $p->tone()])->all(),
            'types' => TicketType::query()->where('enabled', true)->orderBy('position')->get(['id', 'name', 'color'])->all(),
            'team' => User::whereHas('memberships')->get(['id', 'name'])->all(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['nullable', 'string', 'max:10000'],
            'priority' => ['required', Rule::enum(TicketPriority::class)],
            // Set when the ticket is added from a board column or a list group.
            'status' => ['nullable', Rule::enum(TicketStatus::class)],
            'ticket_type_id' => ['nullable', 'integer', 'exists:ticket_types,id'],
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id'],
            'assignee_ids' => ['array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $type = isset($validated['ticket_type_id']) ? TicketType::find($validated['ticket_type_id']) : null;
        $status = isset($validated['status']) ? TicketStatus::from($validated['status']) : TicketStatus::Open;

        $ticket = Ticket::create([
            ...collect($validated)->except(['assignee_ids', 'status'])->all(),
            'status' => $status,
            'channel' => 'manual',
            'created_by_id' => $request->user()->getKey(),
        ]);
        if ($status->isTerminal()) {
            $ticket->forceFill(['resolved_at' => now()])->save();
        }
        $ticket->assignees()->sync(($validated['assignee_ids'] ?? []) ?: ($type?->default_assignee_ids ?? []));
        Activity::log($ticket, 'created', 'Ticket created', $request->user());

        return redirect()->route('desk.tickets.show', $ticket)->with('success', "Ticket {$ticket->reference()} created.");
    }

    public function update(Request $request, Ticket $ticket): RedirectResponse
    {
        $validated = $request->validate([
            'subject' => ['sometimes', 'string', 'max:255'],
            'body' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'status' => ['sometimes', Rule::enum(TicketStatus::class)],
            'priority' => ['sometimes', Rule::enum(TicketPriority::class)],
            'ticket_type_id' => ['sometimes', 'nullable', 'integer', 'exists:ticket_types,id'],
            'position' => ['sometimes', 'integer', 'min:0'],
            'assignee_ids' => ['sometimes', 'array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
            'tags' => ['sometimes', 'array'],
        ]);

        $this->apply($ticket, $validated, $request->user());

        return back();
    }

    /**
     * The same change on many tickets at once, from the table's selection.
     * Each ticket goes through the single-ticket path, so every one logs its
     * own activity and stamps its own resolution time.
     */
    public function bulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
            'status' => ['sometimes', Rule::enum(TicketStatus::class)],
            'priority' => ['sometimes', Rule::enum(TicketPriority::class)],
            'assignee_ids' => ['sometimes', 'array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $changes = collect($validated)->except('ids')->all();
        $tickets = Ticket::query()->whereIn('id', $validated['ids'])->get();

        foreach ($tickets as $ticket) {
            $this->apply($ticket, $changes, $request->user());
        }

        $n = $tickets->count();

        return back()->with('success', $n === 1 ? '1 ticket updated.' : "{$n} tickets updated.");
    }

    private function apply(Ticket $ticket, array $validated, User $user): void
    {
        $ticket->fill(collect($validated)->except(['assignee_ids', 'tags'])->all());

        if ($ticket->isDirty('status')) {
            $ticket->resolved_at = $ticket->status->isTerminal() ? now() : null;
            Activity::log($ticket, 'status_changed', "Status set to {$ticket->status->label()}", $user);
        }
        if ($ticket->isDirty('priority')) {
            Activity::log($ticket, 'priority_changed', "Priority set to {$ticket->priority->label()}", $user);
        }

        $ticket->save();

        if (array_key_exists('assignee_ids', $validated)) {
            $ticket->assignees()->sync($validated['assignee_ids']);
            Activity::log($ticket, 'assigned', 'Assignment changed', $user);
        }
        if (array_key_exists('tags', $validated)) {
            $ticket->syncTags($validated['tags']);
        }
    }

    public function storeNote(Request $request, Ticket $ticket): RedirectResponse
    {
        $validated = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $ticket->notes()->create([
            'organization_id' => $ticket->organization_id,
            'body' => $validated['body'],
            'author_id' => $request->user()->getKey(),
        ]);

        return back();
    }
}
