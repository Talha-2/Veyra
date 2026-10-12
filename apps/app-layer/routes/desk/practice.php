<?php

use App\Http\Controllers\Desk\PracticeSettingsController;
use Illuminate\Support\Facades\Route;

Route::get('/practice', [PracticeSettingsController::class, 'index'])->name('practice');
Route::get('/practice/templates/options', [PracticeSettingsController::class, 'options'])->name('practice.templates.options');
Route::get('/patients/{patient}/questionnaires', [PracticeSettingsController::class, 'patient'])->name('patients.questionnaires');
Route::post('/patients/{patient}/questionnaires', [PracticeSettingsController::class, 'respond'])->name('patients.questionnaires.store');
Route::middleware('can:administer-organization')->group(function () {
    Route::patch('/practice', [PracticeSettingsController::class, 'organization'])->name('practice.update');
    Route::post('/practice/templates', [PracticeSettingsController::class, 'storeTemplate'])->name('practice.templates.store');
    Route::patch('/practice/templates/{template}', [PracticeSettingsController::class, 'updateTemplate'])->name('practice.templates.update');
    Route::delete('/practice/templates/{template}', [PracticeSettingsController::class, 'destroyTemplate'])->name('practice.templates.destroy');
    Route::post('/practice/questionnaires', [PracticeSettingsController::class, 'storeQuestionnaire'])->name('practice.questionnaires.store');
    Route::patch('/practice/questionnaires/{questionnaire}', [PracticeSettingsController::class, 'updateQuestionnaire'])->name('practice.questionnaires.update');
    Route::delete('/practice/questionnaires/{questionnaire}', [PracticeSettingsController::class, 'destroyQuestionnaire'])->name('practice.questionnaires.destroy');
});
