<?php

namespace App\Services\Agent;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Ticket;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

/**
 * Who the agent is acting for on this request.
 *
 * Two modes, decided by one header so no route can forget it:
 *
 * - **Customer-facing** (`X-Veyra-Conversation: {id}`): the agent is talking
 *   to a customer on a call or a chat. Reads and writes on contacts, tickets
 *   and calls are limited to the person in that conversation, so a caller
 *   cannot get the agent to read out, or change, someone else's record by
 *   naming them.
 * - **Staff** (no header): Ask threads and automations, where the person on
 *   the other end works for the business. Anything in the tenant.
 *
 * The conversation is re-read on every request: it gains a contact the moment
 * the agent registers or links the caller, and the scope widens with it.
 */
final class ActingFor
{
    public const HEADER = 'X-Veyra-Conversation';

    private function __construct(public readonly ?Conversation $conversation) {}

    public static function from(Request $request): self
    {
        $id = $request->header(self::HEADER);
        if ($id === null || $id === '') {
            return new self(null);
        }

        // Tenant-scoped: a conversation of another organization is unknown here.
        $conversation = ctype_digit((string) $id) ? Conversation::query()->find((int) $id) : null;
        if (! $conversation) {
            throw new HttpResponseException(response()->json([
                'error' => 'unknown_conversation',
                'message' => "Conversation {$id} does not exist in this organization.",
            ], 404));
        }

        return new self($conversation);
    }

    public function customerFacing(): bool
    {
        return $this->conversation !== null;
    }

    public function contactId(): ?int
    {
        return $this->conversation?->contact_id;
    }

    /** Whether this contact is the person the agent is talking to (always true for staff). */
    public function allowsContact(?Contact $contact): bool
    {
        if (! $this->customerFacing()) {
            return true;
        }

        return $contact !== null && $this->contactId() !== null && $contact->id === $this->contactId();
    }

    /** A customer may see their own tickets and anything raised on this conversation. */
    public function allowsTicket(Ticket $ticket): bool
    {
        if (! $this->customerFacing()) {
            return true;
        }

        return $ticket->conversation_id === $this->conversation->id
            || ($ticket->contact_id !== null && $ticket->contact_id === $this->contactId());
    }

    /** Refuse a write on someone other than the person in the conversation. */
    public function ensureContact(?Contact $contact): void
    {
        if (! $this->allowsContact($contact)) {
            throw new HttpResponseException(response()->json([
                'error' => 'not_permitted',
                'message' => $this->contactId() === null
                    ? 'The customer in this conversation is not identified yet. Register them or link them to their record first.'
                    : 'That record belongs to someone other than the customer in this conversation, so it was not changed.',
            ], 403));
        }
    }

    /** A route that names a conversation in its path may only act on the one it is acting for. */
    public function ensureConversation(Conversation $conversation): void
    {
        if ($this->customerFacing() && $this->conversation->id !== $conversation->id) {
            throw new HttpResponseException(response()->json([
                'error' => 'not_permitted',
                'message' => 'The agent can only act on the conversation it is having.',
            ], 403));
        }
    }
}
