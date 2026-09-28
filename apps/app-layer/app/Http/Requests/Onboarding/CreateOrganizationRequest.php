<?php

namespace App\Http\Requests\Onboarding;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class CreateOrganizationRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'timezone' => ['required', 'string', 'timezone'],
        ];
    }

    /**
     * Derive the slug here rather than in an observer.
     *
     * The slug is the agent layer's identifier for this tenant, so it has to be
     * unique and stable. Generating it at the point of validation means the
     * uniqueness check and the value that gets saved cannot drift apart.
     */
    public function slug(): string
    {
        return \App\Models\Organization::uniqueSlug($this->string('name'));
    }
}
