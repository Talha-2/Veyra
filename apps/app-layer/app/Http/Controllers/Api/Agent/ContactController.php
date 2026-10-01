<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\IdentifierType;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Message;
use App\Models\Note;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\Agent\ActingFor;
use App\Services\Agent\CallContextBuilder;
use App\Services\Contacts\ContactDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Contacts, as the worker sees them: look someone up by how they reached us
 * or by name, create them once we know who they are, keep their details
 * right, note what matters, and read their history.
 *
 * On a call or chat (`X-Veyra-Conversation`, see ActingFor) everything here is
 * limited to the person in that conversation. A lookup may still find someone
 * else — that is how a caller on a new number is matched to their record —
 * but it comes back masked and without history until the conversation is
 * linked to them, which takes the phone or email on file.
 */
class ContactController extends Controller
{
    public function __construct(private readonly CallContextBuilder $builder, private readonly ContactDirectory $directory) {}

    public function lookup(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required_without_all:email,contact_id,name', 'nullable', 'string', 'max:32'],
            'email' => ['required_without_all:phone,contact_id,name', 'nullable', 'email', 'max:255'],
            'contact_id' => ['required_without_all:phone,email,name', 'nullable', 'integer'],
            'name' => ['required_without_all:phone,email,contact_id', 'nullable', 'string', 'min:2', 'max:160'],
        ]);
        $scope = ActingFor::from($request);

        $identifier = null;
        $contact = null;
        $matches = collect();
        $matchedBy = null;

        if (! empty($validated['contact_id'])) {
            $contact = Contact::query()->find($validated['contact_id']);
            if ($contact && ! $scope->allowsContact($contact)) {
                // By id is not a way to reach a stranger's record from a customer conversation.
                $contact = null;
            }
            $matchedBy = 'id';
        } elseif (! empty($validated['phone']) || ! empty($validated['email'])) {
            $type = ! empty($validated['phone']) ? IdentifierType::Phone : IdentifierType::Email;
            $value = $type->normalize($validated['phone'] ?? $validated['email']);
            $identifier = Identifier::query()->where('type', $type)->where('value', $value)->first();
            $contact = $identifier?->contact ?? $this->directory->findByPhoneOrEmail($validated['phone'] ?? null, $validated['email'] ?? null);
            $matchedBy = $type->value;
        } else {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower(trim($validated['name']))).'%';
            $matches = Contact::query()->whereRaw('lower(name) like ?', [$like])->orderByDesc('last_contact_at')->orderByDesc('id')->limit(5)->get();
            $contact = $matches->count() === 1 ? $matches->first() : null;
            $matchedBy = 'name';
        }

        if (! $contact && ! $identifier && $matches->isEmpty()) {
            return response()->json(['found' => false, 'contact' => null, 'identifier' => null, 'matches' => [], 'matched_by' => $matchedBy]);
        }

        $visible = $contact && $scope->allowsContact($contact);

        return response()->json([
            'found' => (bool) $contact,
            'matched_by' => $matchedBy,
            // On a customer conversation: whether this record is the person in it.
            'linked' => $scope->customerFacing() ? ($contact !== null && $visible) : null,
            'masked' => $contact !== null && ! $visible,
            'identifier' => $identifier ? [
                'id' => $identifier->id, 'type' => $identifier->type->value, 'value' => $identifier->value,
                'blocked' => $identifier->isBlocked(), 'dnd' => $identifier->isDnd(),
            ] : null,
            'contact' => $contact ? ($visible ? $this->builder->contact($contact) : $this->masked($contact)) : null,
            'matches' => $matches->count() > 1
                ? $matches->map(fn (Contact $c) => $scope->allowsContact($c) ? $this->builder->contact($c) : $this->masked($c))->values()->all()
                : [],
            'open_tickets' => $visible
                ? Ticket::query()->where('contact_id', $contact->id)->unresolved()->latest()->limit(5)->get()
                    ->map(fn (Ticket $t) => ['id' => $t->id, 'reference' => $t->reference(), 'subject' => $t->subject, 'status' => $t->status->value])->all()
                : [],
            'conversations' => $visible
                ? Conversation::query()->where('contact_id', $contact->id)->latest('last_message_at')->limit(5)->get()
                    ->map(fn (Conversation $c) => ['id' => $c->id, 'channel' => $c->channel->value, 'status' => $c->status->value, 'last_message_at' => $c->last_message_at?->toIso8601String()])->all()
                : [],
        ]);
    }

    /**
     * Create a contact and link the identifiers we know, bringing any
     * anonymous history along.
     *
     * Never a duplicate: if the phone or email already belongs to someone,
     * that contact is returned (`created: false`) — the agent said "I'll take
     * your name" to a person we already had. On a customer conversation the
     * conversation is linked to the contact either way, and when it already
     * is someone's, that person is returned rather than a second record made
     * from a name alone.
     */
    public function store(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required_without_all:phone,email', 'nullable', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/\d{3,}/'],
            'email' => ['nullable', 'email', 'max:255'],
            'company' => ['nullable', 'string', 'max:160'],
            'source' => ['nullable', 'string', 'max:40'],
        ], ['name.required_without_all' => 'Give a name, a phone number or an email address.', 'phone.regex' => 'That does not look like a phone number.']);
        $scope = ActingFor::from($request);
        $attributes = $this->directory->normalize($validated);

        $result = DB::transaction(function () use ($attributes, $scope) {
            $existing = $this->directory->findByPhoneOrEmail($attributes['phone'] ?? null, $attributes['email'] ?? null);
            $reason = $existing ? 'matched' : null;

            if (! $existing) {
                // A returning person whose record was deleted still holds the
                // phone or email (they are unique): bring that record back.
                $existing = Contact::onlyTrashed()->where(fn ($q) => $q
                    ->when($attributes['phone'] ?? null, fn ($w, $p) => $w->orWhere('phone', $p))
                    ->when($attributes['email'] ?? null, fn ($w, $e) => $w->orWhere('email', $e)))
                    ->when(empty($attributes['phone']) && empty($attributes['email']), fn ($q) => $q->whereRaw('1 = 0'))
                    ->first();
                if ($existing) {
                    $existing->restore();
                    $reason = 'restored';
                }
            }

            if (! $existing && $scope->contactId() !== null && empty($attributes['phone']) && empty($attributes['email'])) {
                $existing = Contact::query()->find($scope->contactId());
                $reason = 'already_linked';
            }

            if ($existing) {
                // Fill what the record is missing; never overwrite what is there.
                $blanks = collect(['name', 'company'])->filter(fn ($f) => blank($existing->{$f}) && filled($attributes[$f] ?? null))
                    ->mapWithKeys(fn ($f) => [$f => $attributes[$f]])->all();
                if ($blanks) {
                    $existing->update($blanks);
                    Activity::log($existing, 'updated', 'Details added by the agent: '.implode(', ', array_keys($blanks)), actor: 'agent');
                }
                $linked = $scope->customerFacing() ? $this->directory->attachConversation($scope->conversation, $existing) : null;

                return ['contact' => $existing, 'created' => false, 'reason' => $reason, 'linked' => $linked];
            }

            $contact = Contact::create([
                'name' => $attributes['name'] ?? null,
                'phone' => $attributes['phone'] ?? null,
                'email' => $attributes['email'] ?? null,
                'company' => $attributes['company'] ?? null,
                'source' => $attributes['source'] ?? ($scope->conversation?->channel->value ?? 'agent'),
            ]);
            $this->directory->linkIdentifiers($contact);
            $linked = $scope->customerFacing() ? $this->directory->attachConversation($scope->conversation, $contact) : null;
            Activity::log($contact, 'created', 'Contact created by the agent'.($scope->customerFacing() ? ' during a '.mb_strtolower($scope->conversation->channel->label()) : ''), actor: 'agent');

            return ['contact' => $contact, 'created' => true, 'reason' => null, 'linked' => $linked];
        });

        return response()->json([
            'created' => $result['created'],
            'reason' => $result['reason'],
            'conversation_linked' => $result['linked'] !== null,
            'contact' => $this->builder->contact($result['contact']->refresh()),
        ], $result['created'] ? 201 : 200);
    }

    /** Correct details. On a customer conversation, only the person in it. */
    public function update(Request $request, Organization $organization, Contact $contact): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:1', 'max:160'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/\d{3,}/'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'company' => ['sometimes', 'nullable', 'string', 'max:160'],
        ], ['phone.regex' => 'That does not look like a phone number.', 'email.email' => 'That does not look like an email address.']);
        ActingFor::from($request)->ensureContact($contact);

        $attributes = $this->directory->normalize($validated);
        $conflicts = $this->directory->conflicts($attributes, $contact);
        if ($conflicts) {
            // Said aloud by the agent, so it names the problem and not the other person.
            throw ValidationException::withMessages(collect($conflicts)->map(fn ($_, $field) => "That {$field} is already on another customer's record, so it was not changed. The team can merge the records.")->all());
        }

        DB::transaction(function () use ($contact, $attributes) {
            $contact->update($attributes);
            $this->directory->linkIdentifiers($contact);
            if ($contact->wasChanged()) {
                Activity::log($contact, 'updated', 'Details updated by the agent: '.implode(', ', array_keys(collect($contact->getChanges())->except('updated_at')->all())), actor: 'agent');
            }
        });

        return response()->json(['contact' => $this->builder->contact($contact->refresh())]);
    }

    public function storeNote(Request $request, Organization $organization, Contact $contact): JsonResponse
    {
        $validated = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        ActingFor::from($request)->ensureContact($contact);

        $note = $contact->notes()->create(['body' => $validated['body']]);
        Activity::log($contact, 'note_added', 'Agent added a note', actor: 'agent', meta: ['note_id' => $note->id]);

        return response()->json(['note' => ['id' => $note->id, 'subject' => 'contact', 'subject_id' => $contact->id, 'body' => $note->body, 'created_at' => $note->created_at?->toIso8601String()]], 201);
    }

    /**
     * What has happened with this person, across channels: their threads
     * with the latest messages, calls with their summaries, and tickets.
     * Internal notes only for staff runs — never read out to the customer.
     */
    public function history(Request $request, Organization $organization, Contact $contact): JsonResponse
    {
        $validated = $request->validate(['limit' => ['nullable', 'integer', 'between:1,10']]);
        $scope = ActingFor::from($request);
        if (! $scope->allowsContact($contact)) {
            return response()->json(['error' => 'not_found', 'message' => 'No history for that contact in this conversation.'], 404);
        }
        $limit = (int) ($validated['limit'] ?? 5);

        $conversations = Conversation::query()->where('contact_id', $contact->id)->latest('last_message_at')->limit($limit)->get();
        $messages = Message::query()->whereIn('conversation_id', $conversations->pluck('id'))->whereNotNull('body')
            ->orderByDesc('id')->limit($limit * 4)->get()->groupBy('conversation_id');

        return response()->json([
            'contact' => $this->builder->contact($contact),
            'conversations' => $conversations->map(fn (Conversation $c) => [
                'id' => $c->id, 'channel' => $c->channel->value, 'status' => $c->status->value,
                'current' => $scope->conversation?->id === $c->id,
                'last_message_at' => $c->last_message_at?->toIso8601String(),
                'messages' => ($messages->get($c->id) ?? collect())->take(3)->reverse()->values()->map(fn (Message $m) => [
                    'from' => $m->isInbound() ? 'customer' : ($m->from_agent ? 'agent' : 'team'),
                    'body' => str($m->body)->squish()->limit(200)->value(),
                    'at' => $m->created_at?->toIso8601String(),
                ])->all(),
            ])->all(),
            'calls' => Call::query()->where('contact_id', $contact->id)->with('transcript:id,call_id,summary')->latest()->limit($limit)->get()
                ->map(fn (Call $c) => ['at' => $c->created_at?->toIso8601String(), 'direction' => $c->direction, 'status' => $c->status, 'duration' => $c->formattedDuration(), 'summary' => $c->transcript?->summary])->all(),
            'tickets' => Ticket::query()->where('contact_id', $contact->id)->latest('updated_at')->limit($limit)->get()
                ->map(fn (Ticket $t) => ['reference' => $t->reference(), 'subject' => $t->subject, 'status' => $t->status->value, 'updated_at' => $t->updated_at?->toIso8601String()])->all(),
            'notes' => $scope->customerFacing() ? [] : Note::query()->where('notable_type', $contact->getMorphClass())->where('notable_id', $contact->id)->latest()->limit($limit)->get()
                ->map(fn (Note $n) => ['body' => $n->body, 'at' => $n->created_at?->toIso8601String()])->all(),
        ]);
    }

    /** Enough to recognise a record without handing its details to someone who has not proved they own it. */
    private function masked(Contact $contact): array
    {
        return [
            'id' => $contact->id,
            'name' => $contact->name,
            'display_name' => $contact->name ?: 'Unnamed contact',
            'phone' => ContactDirectory::mask($contact->phone),
            'email' => ContactDirectory::mask($contact->email),
            'company' => null,
            'stage' => null,
        ];
    }
}
