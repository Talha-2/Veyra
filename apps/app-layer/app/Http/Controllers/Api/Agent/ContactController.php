<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\IdentifierType;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Organization;
use App\Models\Ticket;
use App\Services\Agent\CallContextBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Contacts, as the worker sees them: look someone up by how they reached us,
 * create them once we know who they are, and correct details on the call.
 */
class ContactController extends Controller
{
    public function lookup(Request $request, Organization $organization, CallContextBuilder $builder): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required_without_all:email,contact_id', 'nullable', 'string', 'max:32'],
            'email' => ['required_without_all:phone,contact_id', 'nullable', 'email', 'max:255'],
            'contact_id' => ['required_without_all:phone,email', 'nullable', 'integer'],
        ]);

        $identifier = null;
        $contact = null;

        if (! empty($validated['contact_id'])) {
            $contact = Contact::query()->find($validated['contact_id']);
        } else {
            $type = ! empty($validated['phone']) ? IdentifierType::Phone : IdentifierType::Email;
            $value = $type->normalize($validated['phone'] ?? $validated['email']);
            $identifier = Identifier::query()->where('type', $type)->where('value', $value)->first();
            $contact = $identifier?->contact;
        }

        if (! $contact && ! $identifier) {
            return response()->json(['found' => false, 'contact' => null, 'identifier' => null]);
        }

        return response()->json([
            'found' => (bool) $contact,
            'identifier' => $identifier ? [
                'id' => $identifier->id, 'type' => $identifier->type->value, 'value' => $identifier->value,
                'blocked' => $identifier->isBlocked(), 'dnd' => $identifier->isDnd(),
            ] : null,
            'contact' => $contact ? $builder->contact($contact) : null,
            'open_tickets' => $contact
                ? Ticket::query()->where('contact_id', $contact->id)->unresolved()->latest()->limit(5)->get()
                    ->map(fn (Ticket $t) => ['id' => $t->id, 'reference' => $t->reference(), 'subject' => $t->subject, 'status' => $t->status->value])->all()
                : [],
            'conversations' => $contact
                ? Conversation::query()->where('contact_id', $contact->id)->latest('last_message_at')->limit(5)->get()
                    ->map(fn (Conversation $c) => ['id' => $c->id, 'channel' => $c->channel->value, 'status' => $c->status->value, 'last_message_at' => $c->last_message_at?->toIso8601String()])->all()
                : [],
        ]);
    }

    /**
     * Create a contact and link the identifiers we know, bringing any
     * anonymous history along. If an identifier already belongs to someone,
     * that contact is returned instead: the agent said "I'll take your name"
     * to a person we already had, and must not create a duplicate.
     */
    public function store(Request $request, Organization $organization, CallContextBuilder $builder): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:255'],
            'company' => ['nullable', 'string', 'max:160'],
            'source' => ['nullable', 'string', 'max:40'],
        ]);

        $result = DB::transaction(function () use ($validated, $builder) {
            $identifiers = collect([
                IdentifierType::Phone->value => $validated['phone'] ?? null,
                IdentifierType::Email->value => $validated['email'] ?? null,
            ])->filter()->map(fn ($value, $type) => Identifier::resolve(IdentifierType::from($type), $value));

            $owned = $identifiers->first(fn (Identifier $i) => $i->contact_id !== null);
            if ($owned) {
                return ['contact' => $owned->contact, 'created' => false];
            }

            $contact = Contact::create([
                'name' => $validated['name'],
                'phone' => isset($validated['phone']) ? IdentifierType::Phone->normalize($validated['phone']) : null,
                'email' => isset($validated['email']) ? IdentifierType::Email->normalize($validated['email']) : null,
                'company' => $validated['company'] ?? null,
                'source' => $validated['source'] ?? 'call',
            ]);

            $identifiers->each(fn (Identifier $i) => $i->linkTo($contact));
            Activity::log($contact, 'created', 'Contact created by the agent during a call', actor: 'agent');

            return ['contact' => $contact, 'created' => true];
        });

        return response()->json(['created' => $result['created'], 'contact' => $builder->contact($result['contact'])], $result['created'] ? 201 : 200);
    }

    public function update(Request $request, Organization $organization, Contact $contact, CallContextBuilder $builder): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'company' => ['sometimes', 'nullable', 'string', 'max:160'],
        ]);

        $contact->update($validated);

        if (isset($validated['email'])) {
            Identifier::resolve(IdentifierType::Email, $validated['email'])->linkTo($contact);
        }

        Activity::log($contact, 'updated', 'Details updated by the agent: '.implode(', ', array_keys($validated)), actor: 'agent');

        return response()->json(['contact' => $builder->contact($contact->refresh())]);
    }
}
