<?php

namespace App\Http\Requests\Desk;

use App\Services\Healthcare\PatientRegistry;
use Illuminate\Foundation\Http\FormRequest;

class StorePatientRequest extends FormRequest
{
    public function rules(): array
    {
        return [...PatientRegistry::demographicRules(), 'contact_id' => ['nullable', 'integer'],
            'name' => ['required_without:contact_id', 'nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'], 'email' => ['nullable', 'email', 'max:255']];
    }
}
