<?php

namespace App\Http\Resources\V1;

use App\Models\Lead;
use Illuminate\Http\Request;

/** @mixin Lead */
class LeadResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'lead',
            'contact_id' => $this->contact_id,
            'contact' => $this->contact ? [
                'id' => $this->contact->id, 'name' => $this->contact->name,
                'phone' => $this->contact->phone, 'email' => $this->contact->email, 'company' => $this->contact->company,
            ] : null,
            'pipeline_id' => $this->pipeline_id,
            'stage' => $this->stage ? ['id' => $this->stage->id, 'name' => $this->stage->name] : null,
            'source' => $this->source,
            'value' => (int) $this->value,
            'next_response_at' => self::time($this->next_response_at),
            'outreach_note' => $this->outreach_note,
            'assignee_ids' => $this->assignees->pluck('id')->values()->all(),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
