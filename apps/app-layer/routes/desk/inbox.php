<?php

use App\Http\Controllers\Desk\InboxController;
use Illuminate\Support\Facades\Route;

/*
| Loaded under /desk behind surface:desk — see bootstrap/app.php.
*/

Route::get('/inbox', [InboxController::class, 'index'])->name('inbox');

// The thread lives at its own URL rather than in a query string so a
// conversation can be linked to, bookmarked and reopened — an operator handing
// one to a colleague should be able to paste a URL.
Route::get('/inbox/{conversation}', [InboxController::class, 'show'])->name('inbox.show');

Route::post('/inbox/{conversation}/messages', [InboxController::class, 'send'])->name('inbox.send');
Route::patch('/inbox/{conversation}', [InboxController::class, 'update'])->name('inbox.update');
