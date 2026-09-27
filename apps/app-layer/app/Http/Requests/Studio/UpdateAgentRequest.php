<?php

namespace App\Http\Requests\Studio;

use App\Support\LanguageCapabilities;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAgentRequest extends FormRequest
{
    public function rules(): array
    {
        $codes = array_keys(LanguageCapabilities::all());

        return [
            'display_name' => ['required', 'string', 'max:60'],
            'persona' => ['nullable', 'string', 'max:2000'],
            'greeting' => ['nullable', 'string', 'max:500'],
            'primary_language' => ['required', Rule::in($codes)],
            'additional_languages' => ['array'],
            'additional_languages.*' => [Rule::in($codes)],
            'voice_provider' => ['nullable', 'string', 'max:40'],
            'voice_id' => ['nullable', 'string', 'max:120'],
            // "provider:model", e.g. openai:gpt-4.1-mini. Validated as a shape
            // here; whether the provider has a key is the agent layer's call.
            'talker_model' => ['nullable', 'string', 'max:120', 'regex:/^[a-z0-9_-]+:[A-Za-z0-9._\/-]+$/'],
            'worker_model' => ['nullable', 'string', 'max:120', 'regex:/^[a-z0-9_-]+:[A-Za-z0-9._\/-]+$/'],

            // Bounds come from VOICE.md's latency budget. Below 200ms the
            // agent cuts people off mid-thought; above 1500ms it feels dead.
            'min_endpointing_ms' => ['required', 'integer', 'between:200,1500'],
            'min_interruption_ms' => ['required', 'integer', 'between:200,2000'],
            'allow_interruptions' => ['boolean'],
            'semantic_turn_detection' => ['boolean'],
            'max_call_seconds' => ['required', 'integer', 'between:60,7200'],
            'record_calls' => ['boolean'],

            'profile.name' => ['nullable', 'string', 'max:120'],
            'profile.description' => ['nullable', 'string', 'max:2000'],
            'profile.industry' => ['nullable', 'string', 'max:80'],
            'profile.timezone' => ['required', 'timezone'],
            'profile.website' => ['nullable', 'url', 'max:255'],
            'profile.address' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function agentAttributes(): array
    {
        $attributes = $this->safe()->except('profile');

        // The primary language is never also an "additional" one.
        $attributes['additional_languages'] = array_values(array_diff(
            $attributes['additional_languages'] ?? [],
            [$attributes['primary_language']],
        ));

        return $attributes;
    }

    public function profileAttributes(): array
    {
        return $this->validated('profile') ?? [];
    }
}
