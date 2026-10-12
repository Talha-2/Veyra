<?php

use App\Http\Controllers\Desk\ClinicalChartController;
use Illuminate\Support\Facades\Route;

Route::get('/patients/{patient}/chart', [ClinicalChartController::class, 'index'])->name('patients.chart');
Route::post('/patients/{patient}/encounters', [ClinicalChartController::class, 'store'])->name('encounters.store');
Route::get('/encounters/{encounter}', [ClinicalChartController::class, 'show'])->name('encounters.show');
Route::patch('/encounters/{encounter}', [ClinicalChartController::class, 'update'])->name('encounters.update');
Route::post('/encounters/{encounter}/sign', [ClinicalChartController::class, 'sign'])->name('encounters.sign');
Route::post('/encounters/{encounter}/complete', [ClinicalChartController::class, 'complete'])->name('encounters.complete');
Route::post('/encounters/{encounter}/amendments', [ClinicalChartController::class, 'amend'])->name('encounters.amend');
