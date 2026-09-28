<?php

namespace App\Http\Resources\V1;

use App\Models\Conversation;
use Illuminate\Http\Request;

/**
 * @mixin Conversation
 *
 * Fetched singly it embeds the latest messages (`withMessages()`), oldest
 * first; the messages endpoint pages through the rest.
 */
class ConversationResource extends ApiResource
{
    public const EMBEDDED_MESSAGES = 50;

    private bool $withMessages = false;

    public function withMessages(): static
    {
        $this->withMessages = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'object' => 'conversation',
            'channel' => $this->channel?->value,
            'status' => $this->status?->value,
            'subject' => $this->subject,
            'contact_id' => $this->contact_id,
            'identifier' => $this->identifier ? ['type' => $this->identifier->type->value, 'value' => $this->identifier->value] : null,
            'unread_count' => (int) $this->unread_count,
            'last_message_at' => self::time($this->last_message_at),
            'snoozed_until' => self::time($this->snoozed_until),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];

        if ($this->withMessages) {
            $latest = $this->messages()->latest('id')->limit(self::EMBEDDED_MESSAGES + 1)->get();
            $data['messages'] = [
                'data' => MessageResource::collection($latest->take(self::EMBEDDED_MESSAGES)->reverse()->values())->resolve($request),
                'has_more' => $latest->count() > self::EMBEDDED_MESSAGES,
            ];
        }

        return $data;
    }
}
