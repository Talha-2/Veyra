<?php

use App\Http\Controllers\Desk\HealthcareModulesController;
use Illuminate\Support\Facades\Route;

Route::get('/modules', [HealthcareModulesController::class, 'index'])->name('modules');
