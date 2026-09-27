<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'display_name', 'persona', 'greeting', 'primary_language', 'additional_languages',
    'voice_id', 'voice_provider', 'min_endpointing_ms', 'min_interruption_ms',
    'allow_interruptions', 'semantic_turn_detection', 'max_call_seconds',
    'record_calls', 'advanced',
])]
class AgentConfig extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'additional_languages' => 'array',
            'advanced' => 'array',
            'allow_interruptions' => 'boolean',
            'semantic_turn_detection' => 'boolean',
            'record_calls' => 'boolean',
        ];
    }

    /** Every language this agent will accept, primary first. */
    public function languages(): array
    {
        return array_values(array_unique(array_filter([
            $this->primary_language ?? 'en',
            ...($this->additional_languages ?? []),
        ])));
    }
}
