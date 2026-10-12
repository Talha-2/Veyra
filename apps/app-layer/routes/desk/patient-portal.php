<?php

use App\Http\Controllers\Desk\PatientPortalController;
use App\Http\Middleware\PatientPortalPrivacy;
use Illuminate\Support\Facades\Route;

Route::get('/patients/{patient}/portal', [PatientPortalController::class, 'index'])->middleware(PatientPortalPrivacy::class)->name('patients.portal');
Route::post('/patients/{patient}/portal/invitations', [PatientPortalController::class, 'invite'])->name('patients.portal.invite');
Route::middleware('can:administer-organization')->group(function () {
    Route::patch('/patients/{patient}/portal/accesses/{access}', [PatientPortalController::class, 'sharing'])->whereNumber('access')->name('patients.portal.sharing');
    Route::delete('/patients/{patient}/portal/accesses/{access}', [PatientPortalController::class, 'revoke'])->whereNumber('access')->name('patients.portal.revoke');
    Route::delete('/patients/{patient}/portal/invitations/{invitation}', [PatientPortalController::class, 'revokeInvitation'])->name('patients.portal.invitations.revoke');
});
