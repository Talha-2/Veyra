<?php

namespace App\Http\Requests\Desk;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAvailabilityRequest extends FormRequest
{
    public function rules(): array
    {
        return ['intervals' => ['present', 'array', 'max:100'], 'intervals.*.clinic_location_id' => ['required', 'integer'],
            'intervals.*.weekday' => ['required', 'integer', 'between:1,7'], 'intervals.*.start_time' => ['required', 'date_format:H:i'],
            'intervals.*.end_time' => ['required', 'date_format:H:i']];
    }
}
