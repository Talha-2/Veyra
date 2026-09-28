<?php

namespace App\Http\Resources\V1;

use App\Models\Conversation;
use App\Models\Note;
use App\Models\Ticket;
use Illuminate\Http\Request;

/** @mixin Note */
class NoteResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $parent = match ($this->notable_type) {
            (new Ticket)->getMorphClass() => 'ticket',
            (new Conversation)->getMorphClass() => 'conversation',
            default => 'contact',
        };

        return [
            'id' => $this->id,
            'object' => 'note',
            'parent' => ['object' => $parent, 'id' => $this->notable_id],
            'body' => $this->body,
            // Null when the note came through the API rather than a person.
            'author' => $this->author ? ['id' => $this->author->id, 'name' => $this->author->name] : null,
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
