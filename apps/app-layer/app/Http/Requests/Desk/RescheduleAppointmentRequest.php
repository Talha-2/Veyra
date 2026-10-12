<?php

namespace App\Http\Requests\Desk;

use Illuminate\Foundation\Http\FormRequest;

class RescheduleAppointmentRequest extends FormRequest
{
    public function rules(): array
    {
        return ['starts_at' => ['required', 'date']];
    }
}
