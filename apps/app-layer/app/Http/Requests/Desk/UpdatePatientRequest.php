<?php

namespace App\Http\Requests\Desk;

use App\Services\Healthcare\PatientRegistry;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePatientRequest extends FormRequest
{
    public function rules(): array
    {
        return PatientRegistry::updateRules();
    }
}
