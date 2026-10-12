<?php

use App\Http\Controllers\Desk\ClinicalAncillaryController;
use Illuminate\Support\Facades\Route;

Route::get('/labs', [ClinicalAncillaryController::class, 'diagnostics'])->name('labs.index');
Route::get('/images', [ClinicalAncillaryController::class, 'diagnostics'])->name('images.index');
Route::post('/diagnostics', [ClinicalAncillaryController::class, 'storeOrder'])->name('diagnostics.store');
Route::post('/diagnostics/{order}/transition', [ClinicalAncillaryController::class, 'transitionOrder'])->name('diagnostics.transition');
Route::get('/documents', [ClinicalAncillaryController::class, 'documents'])->name('patient-documents.index');
Route::post('/documents', [ClinicalAncillaryController::class, 'upload'])->name('patient-documents.store');
Route::get('/documents/{document}/download', [ClinicalAncillaryController::class, 'download'])->name('patient-documents.download');
Route::get('/referrals', [ClinicalAncillaryController::class, 'referrals'])->name('referrals.index');
Route::get('/referrals/{referral}', [ClinicalAncillaryController::class, 'showReferral'])->name('referrals.show');
Route::post('/referrals/{referral}/coordination', [ClinicalAncillaryController::class, 'coordinateReferral'])->name('referrals.coordination');
Route::post('/referrals', [ClinicalAncillaryController::class, 'storeReferral'])->name('referrals.store');
Route::post('/referrals/{referral}/transition', [ClinicalAncillaryController::class, 'transitionReferral'])->name('referrals.transition');
Route::patch('/diagnostics/{order}', [ClinicalAncillaryController::class, 'updateOrder'])->name('diagnostics.update');
Route::patch('/referrals/{referral}', [ClinicalAncillaryController::class, 'updateReferral'])->name('referrals.update');
