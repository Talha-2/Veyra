<?php

namespace App\Http\Requests\Desk;

use Illuminate\Foundation\Http\FormRequest;

class StoreTimeBlockRequest extends FormRequest
{
    public function rules(): array
    {
        return ['starts_at' => ['required', 'date'], 'ends_at' => ['required', 'date', 'after:starts_at'], 'label' => ['nullable', 'string', 'max:255']];
    }
}
