<?php

namespace App\Http\Resources\V1;

use App\Models\Ticket;
use Illuminate\Http\Request;

/** @mixin Ticket */
class TicketResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'ticket',
            'number' => (int) $this->number,
            'reference' => $this->reference(),
            'subject' => $this->subject,
            'body' => $this->body,
            'status' => $this->status?->value,
            'priority' => $this->priority?->value,
            'type' => $this->ticketType ? ['id' => $this->ticketType->id, 'name' => $this->ticketType->name] : null,
            'contact_id' => $this->contact_id,
            'conversation_id' => $this->conversation_id,
            'channel' => $this->channel,
            'created_by_agent' => (bool) $this->created_by_agent,
            'assignee_ids' => $this->assignees->pluck('id')->values()->all(),
            'tags' => $this->tags->pluck('name')->values()->all(),
            'resolved_at' => self::time($this->resolved_at),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
