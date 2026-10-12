<?php

use App\Http\Controllers\Desk\ClinicalCareController;
use Illuminate\Support\Facades\Route;

Route::get('/patients/{patient}/care', [ClinicalCareController::class, 'care'])->name('patients.care');
Route::post('/patients/{patient}/problems', [ClinicalCareController::class, 'problem'])->name('patients.problems');
Route::post('/patients/{patient}/allergies', [ClinicalCareController::class, 'allergy'])->name('patients.allergies');
Route::post('/problems/{problem}/resolve', [ClinicalCareController::class, 'resolve'])->name('problems.resolve');
Route::post('/allergies/{allergy}/inactivate', [ClinicalCareController::class, 'inactivate'])->name('allergies.inactivate');
Route::get('/prescriptions', [ClinicalCareController::class, 'prescriptions'])->name('prescriptions');
Route::post('/patients/{patient}/prescriptions', [ClinicalCareController::class, 'draft'])->name('prescriptions.draft');
Route::get('/prescriptions/{prescription}', [ClinicalCareController::class, 'prescription'])->name('prescriptions.show');
Route::patch('/prescriptions/{prescription}', [ClinicalCareController::class, 'update'])->name('prescriptions.update');
Route::post('/prescriptions/{prescription}/issue', [ClinicalCareController::class, 'issue'])->name('prescriptions.issue');
Route::post('/prescriptions/{prescription}/cancel', [ClinicalCareController::class, 'cancel'])->name('prescriptions.cancel');
Route::get('/injections', [ClinicalCareController::class, 'administrations'])->name('administrations');
Route::post('/patients/{patient}/administrations', [ClinicalCareController::class, 'administer'])->name('administrations.store');
Route::post('/administrations/{administration}/void', [ClinicalCareController::class, 'void'])->name('administrations.void');
Route::get('/chart-notes', [ClinicalCareController::class, 'notes'])->name('chart-notes');
Route::get('/flowsheets', [ClinicalCareController::class, 'flowsheets'])->name('flowsheets');
