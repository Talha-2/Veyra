<?php

namespace App\Services\Agent;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Message;

/**
 * Live chat with the customer-facing agent: one implementation behind Studio
 * Talk's chat and the public `/api/v1/chat` endpoints, so what the team tests
 * is exactly what a customer's website gets.
 *
 * A chat is an ordinary web-chat conversation in Desk: the customer's message
 * and the agent's reply are Message rows (the reply carries the steps the
 * agent took in `meta.steps`), so the inbox, webhooks and the API all see it
 * like any other conversation. The reply streams from the agent gateway,
 * which runs the same worker, skills, knowledge, memory and actions as a
 * phone call. Callers must have the tenant set.
 */
class LiveChat
{
    public function __construct(private AgentGateway $gateway, private CallContextBuilder $builder) {}

    /** The visitor's open web chat, or a new one. */
    public function conversationFor(Identifier $identifier, string $subject = 'Web chat'): Conversation
    {
        return Conversation::query()
            ->where('identifier_id', $identifier->id)
            ->where('channel', Channel::WebChat)
            ->where('status', ConversationStatus::Open)
            ->latest('last_message_at')
            ->first()
            ?? Conversation::create([
                'identifier_id' => $identifier->id,
                'contact_id' => $identifier->contact_id,
                'channel' => Channel::WebChat,
                'status' => ConversationStatus::Open,
                'subject' => $subject,
            ]);
    }

    /**
     * Record the customer's message, stream the agent's reply through
     * `$send` (every gateway event, in order), and record the reply.
     *
     * @param  callable(array<string, mixed>): void  $send
     * @return array{turn: StreamedTurn, inbound: Message, reply: ?Message}
     */
    public function reply(Conversation $conversation, string $text, callable $send, ?string $from = null): array
    {
        // What the agent continues from: the conversation so far, oldest
        // first, including anything a person on the team wrote in Desk.
        $history = $conversation->messages()->orderByDesc('id')->limit(30)->get()->reverse()
            ->filter(fn (Message $m) => filled($m->body))
            ->map(fn (Message $m) => ['role' => $m->isInbound() ? 'user' : 'assistant', 'content' => $m->body])
            ->values()->all();

        $inbound = Message::create([
            'conversation_id' => $conversation->id,
            'channel' => Channel::WebChat,
            'direction' => 'inbound',
            'status' => 'received',
            'from_agent' => false,
            'body' => $text,
            'from_address' => $from ?? $conversation->identifier?->value,
        ]);
        $conversation->touchLastMessage($inbound);
        if ($history === []) {
            Activity::log($conversation, 'chat_started', 'Web chat started', actor: 'system');
        }

        $turn = new StreamedTurn;
        try {
            $body = $this->gateway->streamChat($conversation, $text, $history, $this->builder->forConversation($conversation));
            $turn->relay($body, $send);
        } catch (AgentUnavailable) {
            $turn->fail('The agent is not available right now. Your message is saved and the team can see it.');
            $send(['type' => 'error', 'message' => $turn->error]);
        }

        $reply = null;
        if (filled($turn->text())) {
            $reply = Message::create([
                'conversation_id' => $conversation->id,
                'channel' => Channel::WebChat,
                'direction' => 'outbound',
                'status' => 'sent',
                'from_agent' => true,
                'body' => $turn->text(),
                'meta' => array_filter(['steps' => $turn->steps(), 'model' => $turn->model, 'tokens' => $turn->tokens ?: null]),
            ]);
            $conversation->touchLastMessage($reply);
        }

        return ['turn' => $turn, 'inbound' => $inbound, 'reply' => $reply];
    }
}
