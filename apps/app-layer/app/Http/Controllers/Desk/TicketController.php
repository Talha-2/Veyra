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
    public function index(Request $request): Response
    {
        $view = $request->query('view', 'open');
        $layout = in_array($request->query('layout'), ['list', 'kanban'], true) ? $request->query('layout') : 'list';

        $query = Ticket::query()
            ->with(['contact:id,name,phone,email', 'assignees:id,name', 'ticketType:id,name,color'])
            ->when($view === 'open', fn ($q) => $q->unresolved())
            ->when($view === 'mine', fn ($q) => $q->unresolved()->assignedTo($request->user()))
            ->when($view === 'agent', fn ($q) => $q->unresolved()->raisedByAgent())
            ->when($view === 'resolved', fn ($q) => $q->whereIn('status', [TicketStatus::Resolved, TicketStatus::Closed]))
            ->when($request->query('search'), fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('subject', 'ilike', "%{$s}%")
                ->orWhereHas('contact', fn ($c) => $c->where('name', 'ilike', "%{$s}%"))))
            ->when($request->query('type'), fn ($q, $t) => $q->where('ticket_type_id', $t))
            ->when($request->query('priority'), fn ($q, $p) => $q->where('priority', $p));

        // Kanban wants every open ticket ordered by column position; the list
        // wants priority-first and paginated.
        $tickets = $layout === 'kanban'
            ? $query->orderBy('position')->orderByDesc('updated_at')->limit(400)->get()
            : $query->orderByRaw("case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end")
                ->orderByDesc('updated_at')->paginate(40)->withQueryString();

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
            'updated_at' => $t->updated_at?->toIso8601String(),
        ];

        return Inertia::render('desk/tickets', [
            'tickets' => $layout === 'kanban' ? ['data' => $tickets->map($shape)->all()] : $tickets->through($shape),
            'view' => $view,
            'layout' => $layout,
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
                'notes' => $ticket->notes->map(fn ($n) => ['id' => $n->id, 'body' => $n->body, 'author' => $n->author?->name ?? 'Agent', 'at' => $n->created_at?->toIso8601String()])->all(),
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
            'ticket_type_id' => ['nullable', 'integer', 'exists:ticket_types,id'],
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id'],
            'assignee_ids' => ['array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $type = isset($validated['ticket_type_id']) ? TicketType::find($validated['ticket_type_id']) : null;

        $ticket = Ticket::create([
            ...collect($validated)->except('assignee_ids')->all(),
            'status' => TicketStatus::Open,
            'channel' => 'manual',
            'created_by_id' => $request->user()->getKey(),
        ]);
        $ticket->assignees()->sync($validated['assignee_ids'] ?: ($type?->default_assignee_ids ?? []));
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

        $ticket->fill(collect($validated)->except(['assignee_ids', 'tags'])->all());

        if ($ticket->isDirty('status')) {
            $ticket->resolved_at = $ticket->status->isTerminal() ? now() : null;
            Activity::log($ticket, 'status_changed', "Status set to {$ticket->status->label()}", $request->user());
        }
        if ($ticket->isDirty('priority')) {
            Activity::log($ticket, 'priority_changed', "Priority set to {$ticket->priority->label()}", $request->user());
        }

        $ticket->save();

        if (array_key_exists('assignee_ids', $validated)) {
            $ticket->assignees()->sync($validated['assignee_ids']);
            Activity::log($ticket, 'assigned', 'Assignment changed', $request->user());
        }
        if (array_key_exists('tags', $validated)) {
            $ticket->syncTags($validated['tags']);
        }

        return back();
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
