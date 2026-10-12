<?php

namespace App\Http\Requests\Desk;

use App\Services\Healthcare\BookingService;
use Illuminate\Foundation\Http\FormRequest;

class BookAppointmentRequest extends FormRequest
{
    public function rules(): array
    {
        return BookingService::rules();
    }
}
