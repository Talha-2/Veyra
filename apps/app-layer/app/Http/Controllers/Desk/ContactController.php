<?php

namespace App\Http\Controllers\Desk;

use App\Enums\ContactStage;
use App\Enums\TicketPriority;
use App\Models\TicketType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Desk\StoreContactRequest;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ContactController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->query('search'));
        $stage = $request->query('stage');
        $layout = in_array($request->query('layout'), ['table', 'cards'], true) ? $request->query('layout') : 'table';

        $contacts = Contact::query()
            ->with('owner:id,name')
            ->withCount('conversations')
            ->when($request->query('favorites'), fn ($q) => $q->where('is_favorite', true))
            ->when($search, fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'ilike', "%{$search}%")
                ->orWhere('phone', 'ilike', "%{$search}%")
                ->orWhere('email', 'ilike', "%{$search}%")
                ->orWhere('company', 'ilike', "%{$search}%")))
            ->when($stage, fn ($q) => $q->where('stage', $stage))
            // Recency of contact, not creation. A CRM list sorted by created_at
            // buries everyone you actually spoke to this week.
            ->orderByRaw('last_contact_at desc nulls last')
            ->paginate(40)
            ->withQueryString();

        // Which channels each person on this page has actually used: one query
        // for the page, not one per row.
        $channels = Conversation::query()
            ->whereIn('contact_id', $contacts->getCollection()->pluck('id'))
            ->select('contact_id', 'channel')
            ->distinct()
            ->get()
            ->groupBy('contact_id')
            ->map(fn ($rows) => $rows->map(fn ($r) => $r->channel->value)->values()->all());

        $contacts = $contacts
            ->through(fn (Contact $c) => [
                'channels' => $channels[$c->id] ?? [],
                'id' => $c->id,
                'name' => $c->displayName(),
                'initials' => $c->initials(),
                'is_favorite' => $c->is_favorite,
                'phone' => $c->phone,
                'email' => $c->email,
                'company' => $c->company,
                'stage' => $c->stage->value,
                'stage_label' => $c->stage->label(),
                'stage_tone' => $c->stage->tone(),
                'owner' => $c->owner?->name,
                'conversations_count' => $c->conversations_count,
                'last_contact_at' => $c->last_contact_at?->toIso8601String(),
            ]);

        return Inertia::render('desk/contacts', [
            'contacts' => $contacts,
            'layout' => $layout,
            'filters' => ['search' => $search ?: null, 'stage' => $stage, 'favorites' => (bool) $request->query('favorites')],
            'stages' => collect(ContactStage::cases())
                ->map(fn ($s) => ['value' => $s->value, 'label' => $s->label(), 'tone' => $s->tone()])
                ->all(),
        ]);
    }

    /**
     * Create a contact, optionally adopting an anonymous conversation.
     *
     * The second case is the common one: an operator is looking at a thread from
     * an unknown number and wants a person behind it. Linking the identifier is
     * what carries the history across — creating a bare contact and leaving the
     * conversation attached to a nameless identifier would look like it worked
     * and lose everything.
     */
    public function store(StoreContactRequest $request): RedirectResponse
    {
        $conversation = $request->conversation();

        $contact = Contact::create($request->contactAttributes());

        if ($conversation) {
            $conversation->identifier->linkTo($contact);
        }

        return back()->with('success', 'Contact created.');
    }

    public function show(Contact $contact): Response
    {
        $contact->load([
            'owner:id,name',
            'tags',
            'notes.author:id,name',
            'tickets' => fn ($q) => $q->latest()->limit(20),
            'conversations' => fn ($q) => $q->latest('last_message_at')->limit(20),
            'conversations.messages' => fn ($q) => $q->latest()->limit(1),
            'reminders' => fn ($q) => $q->outstanding(),
            'activities.user:id,name',
            'leads.stage:id,name,color',
            'leads.pipeline:id,name',
            'identifiers',
        ]);

        return Inertia::render('desk/contact', [
            'contact' => [
                'id' => $contact->id,
                'name' => $contact->displayName(),
                'initials' => $contact->initials(),
                'phone' => $contact->phone,
                'email' => $contact->email,
                'company' => $contact->company,
                'stage' => $contact->stage->value,
                'stage_label' => $contact->stage->label(),
                'stage_tone' => $contact->stage->tone(),
                'source' => $contact->source,
                'value' => $contact->value,
                'owner' => $contact->owner?->name,
                'last_contact_at' => $contact->last_contact_at?->toIso8601String(),
                'is_favorite' => $contact->is_favorite,
                'created_at' => $contact->created_at?->toIso8601String(),
                'tags' => $contact->tags->map(fn ($t) => $t->name)->all(),
                // Every way of reaching them, with block/DND state — a contact
                // can have three numbers and one of them blocked.
                'identifiers' => $contact->identifiers->map(fn ($i) => [
                    'id' => $i->id, 'type' => $i->type->value, 'label' => $i->type->label(), 'value' => $i->value,
                    'blocked' => $i->isBlocked(), 'dnd' => $i->isDnd(),
                ])->all(),
            ],
            'leads' => $contact->leads->map(fn ($l) => [
                'id' => $l->id, 'pipeline' => $l->pipeline?->name, 'stage' => $l->stage?->name, 'stage_color' => $l->stage?->color,
                'value' => $l->value, 'source' => $l->source,
            ])->all(),
            'activities' => $contact->activities->take(40)->map(fn ($a) => [
                'id' => $a->id, 'actor' => $a->actorLabel(), 'is_agent' => $a->actor === 'agent',
                'description' => $a->description, 'at' => $a->created_at?->toIso8601String(),
            ])->all(),
            'conversations' => $contact->conversations->map(fn (Conversation $c) => [
                'id' => $c->id,
                'channel' => $c->channel->value,
                'status' => $c->status->value,
                'last_message_at' => $c->last_message_at?->toIso8601String(),
                'unread' => (int) $c->unread_count,
                'preview' => ($m = $c->messages->first()) ? str($m->body ?? '')->limit(140)->value() : null,
                'last_from_agent' => (bool) $c->messages->first()?->from_agent,
            ])->all(),
            'tickets' => $contact->tickets->map(fn ($t) => [
                'id' => $t->id,
                'reference' => $t->reference(),
                'subject' => $t->subject,
                'status' => $t->status->value,
                'status_label' => $t->status->label(),
                'status_tone' => $t->status->tone(),
                'priority' => $t->priority->value,
                'priority_label' => $t->priority->label(),
                'priority_tone' => $t->priority->tone(),
                'created_by_agent' => $t->created_by_agent,
                'at' => $t->created_at?->toIso8601String(),
            ])->all(),
            'notes' => $contact->notes->map(fn ($n) => [
                'id' => $n->id,
                'body' => $n->body,
                'author' => $n->author?->name ?? 'Agent',
                'at' => $n->created_at?->toIso8601String(),
            ])->all(),
            'stages' => collect(ContactStage::cases())
                ->map(fn ($s) => ['value' => $s->value, 'label' => $s->label()])
                ->all(),
            'team' => User::whereHas('memberships', fn ($q) => $q
                ->where('organization_id', $contact->organization_id))
                ->get(['id', 'name'])
                ->all(),
            // For raising a ticket straight from the profile.
            'ticket_types' => TicketType::query()->where('enabled', true)->orderBy('position')->get(['id', 'name', 'color'])->all(),
            'priorities' => collect(TicketPriority::cases())
                ->map(fn ($p) => ['value' => $p->value, 'label' => $p->label()])
                ->all(),
        ]);
    }

    public function update(Request $request, Contact $contact): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'company' => ['sometimes', 'nullable', 'string', 'max:255'],
            'stage' => ['sometimes', 'string'],
            'owner_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'value' => ['sometimes', 'integer', 'min:0'],
            'tags' => ['sometimes', 'array'],
        ]);

        $contact->fill(collect($validated)->except('tags')->all())->save();

        if (array_key_exists('tags', $validated)) {
            $contact->syncTags($validated['tags']);
        }

        return back();
    }

    public function favorite(Contact $contact): RedirectResponse
    {
        $contact->update(['is_favorite' => ! $contact->is_favorite]);

        return back();
    }

    /**
     * CSV export of the current list. Streams rather than builds, so a
     * ten-thousand-contact export does not sit in memory.
     */
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $search = trim((string) $request->query('search'));
        $stage = $request->query('stage');

        $query = Contact::query()
            ->with('owner:id,name')
            ->when($search, fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'ilike', "%{$search}%")->orWhere('phone', 'ilike', "%{$search}%")
                ->orWhere('email', 'ilike', "%{$search}%")->orWhere('company', 'ilike', "%{$search}%")))
            ->when($stage, fn ($q) => $q->where('stage', $stage))
            ->orderBy('name');

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Name', 'Phone', 'Email', 'Company', 'Stage', 'Source', 'Owner', 'Value', 'Last contact', 'Created']);
            $query->chunk(500, function ($contacts) use ($out) {
                foreach ($contacts as $c) {
                    fputcsv($out, [
                        $c->name, $c->phone, $c->email, $c->company, $c->stage->value, $c->source,
                        $c->owner?->name, $c->value, $c->last_contact_at?->toDateTimeString(), $c->created_at?->toDateTimeString(),
                    ]);
                }
            });
            fclose($out);
        }, 'contacts-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function storeNote(Request $request, Contact $contact): RedirectResponse
    {
        $validated = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $contact->notes()->create([
            'organization_id' => $contact->organization_id,
            'body' => $validated['body'],
            'author_id' => $request->user()->getKey(),
        ]);

        return back();
    }
}
