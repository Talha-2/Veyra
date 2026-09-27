<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Message;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * An outbound message from the agent: the text-back after a missed call, the
 * confirmation SMS, the follow-up email.
 *
 * The row is created `queued`. Delivery is the app layer's job through the
 * telephony/email providers, and the status becomes `sent` or `failed` when
 * that happens — the agent must not tell a caller "I've texted you" on the
 * strength of this response alone; it says "I'm sending you a text".
 */
class MessageController extends Controller
{
    public function store(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'conversation_id' => ['required_without:to', 'nullable', 'integer'],
            'to' => ['required_without:conversation_id', 'nullable', 'string', 'max:255'],
            'channel' => ['required', Rule::in([Channel::Sms->value, Channel::Email->value])],
            'body' => ['required', 'string', 'max:10000'],
            'subject' => ['nullable', 'string', 'max:200'],
            'idempotency_key' => ['nullable', 'string', 'max:128'],
        ]);

        $channel = Channel::from($validated['channel']);

        if (! empty($validated['idempotency_key'])) {
            $existing = Message::query()->where('provider_sid', 'agent:'.$validated['idempotency_key'])->first();
            if ($existing) {
                return response()->json(['created' => false, 'message' => $this->row($existing)]);
            }
        }

        $conversation = ! empty($validated['conversation_id'])
            ? Conversation::query()->findOrFail($validated['conversation_id'])
            : null;

        if ($conversation && $conversation->channel !== $channel) {
            // A text belongs on the SMS thread even when the request came
            // from the call thread: same identifier, different channel.
            $conversation = $this->threadFor($conversation->identifier, $channel);
        }

        if (! $conversation) {
            $identifier = Identifier::resolve($channel->identifierType(), $validated['to']);
            $conversation = $this->threadFor($identifier, $channel);
        }

        $identifier = $conversation->identifier;
        if ($identifier->isBlocked() || $identifier->isDnd()) {
            return response()->json(['error' => 'not_permitted', 'message' => $identifier->isBlocked() ? 'This contact is blocked.' : 'This contact has do-not-disturb on.'], 422);
        }

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'channel' => $channel,
            'direction' => 'outbound',
            'status' => 'queued',
            'from_agent' => true,
            'body' => $validated['body'],
            'to_address' => $identifier->value,
            'provider_sid' => ! empty($validated['idempotency_key']) ? 'agent:'.$validated['idempotency_key'] : null,
            'meta' => array_filter(['subject' => $validated['subject'] ?? null]),
        ]);

        $conversation->touchLastMessage($message);
        Activity::log($conversation, 'message_queued', 'Agent queued a '.$channel->label(), actor: 'agent', meta: ['message_id' => $message->id]);

        return response()->json(['created' => true, 'message' => $this->row($message)], 201);
    }

    private function threadFor(Identifier $identifier, Channel $channel): Conversation
    {
        return Conversation::query()
            ->where('identifier_id', $identifier->id)->where('channel', $channel)->where('status', ConversationStatus::Open)
            ->latest('last_message_at')->first()
            ?? Conversation::create(['identifier_id' => $identifier->id, 'contact_id' => $identifier->contact_id, 'channel' => $channel, 'status' => ConversationStatus::Open]);
    }

    private function row(Message $m): array
    {
        return ['id' => $m->id, 'conversation_id' => $m->conversation_id, 'channel' => $m->channel->value, 'status' => $m->status, 'to' => $m->to_address];
    }
}
