<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Http\Requests\Desk\BookAppointmentRequest;
use App\Http\Requests\Desk\RescheduleAppointmentRequest;
use App\Models\Appointment;
use App\Services\Healthcare\BookingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AppointmentController extends Controller
{
    public function store(BookAppointmentRequest $request, BookingService $service)
    {
        $service->book($request->validated(), $request->user(), 'staff');

        return back()->with('success', 'Appointment booked.');
    }

    public function reschedule(RescheduleAppointmentRequest $request, Appointment $appointment, BookingService $service)
    {
        $service->reschedule($appointment, CarbonImmutable::parse($request->validated('starts_at')), $request->user());

        return back()->with('success', 'Appointment rescheduled.');
    }

    public function cancel(Request $request, Appointment $appointment, BookingService $service)
    {
        $request->validate(['expected_status' => ['nullable', Rule::in(['booked', 'checked_in', 'completed', 'cancelled', 'no_show'])]]);
        $service->cancel($appointment, $request->user(), $request->input('expected_status'));

        return back()->with('success', 'Appointment cancelled.');
    }

    public function status(Request $request, Appointment $appointment, BookingService $service)
    {
        $request->validate(['status' => ['required', Rule::in(['checked_in', 'completed', 'cancelled', 'no_show'])], 'expected_status' => ['nullable', Rule::in(['booked', 'checked_in', 'completed', 'cancelled', 'no_show'])]]);
        $service->transition($appointment, $request->input('status'), $request->user(), $request->input('expected_status'));

        return back()->with('success', 'Appointment status saved.');
    }
}
