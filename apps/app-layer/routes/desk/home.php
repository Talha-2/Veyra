<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Veyra Desk
|--------------------------------------------------------------------------
|
| Every file in routes/desk/ is loaded under the `/desk` prefix behind the
| `surface:desk` middleware — see bootstrap/app.php. Nothing here needs to
| repeat either.
|
| Desk is the operator surface: work the conversations. It must never link to a
| Studio route; the app switcher is the only crossing point between the two.
|
*/

// The surface root is the dashboard, as in Z360. The inbox is one click away
// and is where an operator will spend the day; the dashboard is where a lead
// starts it.
Route::redirect('/', '/desk/dashboard')->name('home');
