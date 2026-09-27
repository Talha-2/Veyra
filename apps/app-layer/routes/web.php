<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\RegisteredUserController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\OrganizationSwitchController;
use App\Http\Controllers\SurfaceRedirectController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Shared routes
|--------------------------------------------------------------------------
|
| Everything that belongs to neither product: authentication, onboarding,
| organization switching, and the root redirect that decides which surface a
| user lands on.
|
| Desk and Studio routes are NOT here — they live in routes/desk/ and
| routes/studio/ and are registered in bootstrap/app.php with their own prefix
| and access gate.
|
*/

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::post('/login', [AuthenticatedSessionController::class, 'store']);

    Route::get('/register', [RegisteredUserController::class, 'create'])->name('register');
    Route::post('/register', [RegisteredUserController::class, 'store']);
});

Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');

    // Onboarding runs before a tenant exists, so it must sit outside the
    // `tenant` middleware — that middleware redirects here when it cannot find
    // an organization, and guarding it with itself would loop.
    Route::get('/onboarding/organization', [OnboardingController::class, 'create'])
        ->name('onboarding.organization');
    Route::post('/onboarding/organization', [OnboardingController::class, 'store']);

    Route::middleware('tenant')->group(function () {
        Route::post('/organizations/{organization}/switch', OrganizationSwitchController::class)
            ->name('organizations.switch');

        // The root. Which product you land on depends on what you have access
        // to, so it is a redirect rather than a page — see SurfaceRedirectController.
        Route::get('/', SurfaceRedirectController::class)->name('home');
    });
});
