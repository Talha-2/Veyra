<?php

use App\Http\Controllers\Desk\AppointmentController;
use App\Http\Controllers\Desk\AvailabilityController;
use App\Http\Controllers\Desk\CalendarController;
use App\Http\Controllers\Desk\ProviderController;
use Illuminate\Support\Facades\Route;

Route::get('/providers', [ProviderController::class, 'index'])->name('providers');
Route::get('/calendar', [CalendarController::class, 'index'])->name('calendar');
Route::get('/calendar/patients', [CalendarController::class, 'patients'])->name('calendar.patients');
Route::get('/providers/{provider}', [ProviderController::class, 'show'])->name('providers.show');
Route::get('/providers/{provider}/slots', [AvailabilityController::class, 'slots'])->name('providers.slots');
Route::post('/appointments', [AppointmentController::class, 'store'])->name('appointments.store');
Route::patch('/appointments/{appointment}/reschedule', [AppointmentController::class, 'reschedule'])->name('appointments.reschedule');
Route::post('/appointments/{appointment}/cancel', [AppointmentController::class, 'cancel'])->name('appointments.cancel');
Route::post('/appointments/{appointment}/status', [AppointmentController::class, 'status'])->name('appointments.status');
Route::middleware('can:administer-organization')->group(function () {
    Route::put('/providers/{provider}/availability', [AvailabilityController::class, 'update'])->name('providers.availability');
    Route::post('/providers/{provider}/blocks', [AvailabilityController::class, 'block'])->name('providers.blocks');
    Route::delete('/providers/{provider}/blocks/{block}', [AvailabilityController::class, 'unblock'])->name('providers.blocks.delete');
    Route::post('/providers', [ProviderController::class, 'store'])->name('providers.store');
    Route::patch('/providers/{provider}', [ProviderController::class, 'update'])->name('providers.update');
    Route::post('/locations', [ProviderController::class, 'location'])->name('locations.store');
    Route::post('/services', [ProviderController::class, 'service'])->name('services.store');
});
