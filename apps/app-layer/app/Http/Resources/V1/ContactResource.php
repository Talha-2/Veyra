<?php

namespace App\Http\Resources\V1;

use App\Models\Contact;
use Illuminate\Http\Request;

/** @mixin Contact */
class ContactResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'contact',
            'name' => $this->name,
            'display_name' => $this->displayName(),
            'phone' => $this->phone,
            'email' => $this->email,
            'company' => $this->company,
            'stage' => $this->stage?->value,
            'source' => $this->source,
            'value' => (int) $this->value,
            'owner_id' => $this->owner_id,
            'tags' => $this->tags->pluck('name')->values()->all(),
            'last_contact_at' => self::time($this->last_contact_at),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
