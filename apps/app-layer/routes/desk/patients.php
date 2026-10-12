<?php

use App\Http\Controllers\Desk\PatientController;
use Illuminate\Support\Facades\Route;

Route::get('/patients', [PatientController::class, 'index'])->name('patients');
Route::get('/patients/contact-options', [PatientController::class, 'contactOptions'])->name('patients.contacts');
Route::get('/patients/profile/{contact}', [PatientController::class, 'profile'])->name('patients.profile');
Route::post('/patients', [PatientController::class, 'store'])->name('patients.store');
Route::get('/patients/{patient}', [PatientController::class, 'show'])->name('patients.show');
Route::patch('/patients/{patient}', [PatientController::class, 'update'])->name('patients.update');
Route::post('/patients/{patient}/archive', [PatientController::class, 'archive'])->name('patients.archive');
Route::post('/patients/{patient}/restore', [PatientController::class, 'restore'])->name('patients.restore');
