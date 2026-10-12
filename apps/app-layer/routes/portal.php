<?php

use App\Http\Controllers\PortalController;
use App\Http\Middleware\PatientPortalPrivacy;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', PatientPortalPrivacy::class])->prefix('portal')->name('portal.')->group(function () {
    Route::get('/', [PortalController::class, 'index'])->name('index');
    Route::get('/invitations/{token}', [PortalController::class, 'invitation'])->middleware('throttle:30,1')->name('invitation');
    Route::post('/invitations/{token}', [PortalController::class, 'redeem'])->middleware('throttle:10,1')->name('redeem');
    Route::post('/patients/{access}/questionnaires', [PortalController::class, 'respond'])->whereNumber('access')->middleware('throttle:20,1')->name('questionnaires.store');
    Route::get('/patients/{access}', [PortalController::class, 'patient'])->whereNumber('access')->name('patient');
});
