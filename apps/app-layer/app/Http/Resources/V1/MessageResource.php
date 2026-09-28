<?php

namespace App\Http\Resources\V1;

use App\Models\Message;
use Illuminate\Http\Request;

/** @mixin Message */
class MessageResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'message',
            'conversation_id' => $this->conversation_id,
            'channel' => $this->channel?->value,
            'direction' => $this->direction,
            // inbound: received. outbound: queued until a channel provider
            // sends it — no provider is connected yet, so it stays queued.
            'status' => $this->status,
            'subject' => $this->meta['subject'] ?? null,
            'body' => $this->body,
            'from' => $this->from_address,
            'to' => $this->to_address,
            'from_agent' => (bool) $this->from_agent,
            'sent_by_user_id' => $this->sent_by_id,
            'read_at' => self::time($this->read_at),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
