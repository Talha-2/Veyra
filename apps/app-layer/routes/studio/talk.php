<?php

use App\Http\Controllers\Studio\TalkController;
use Illuminate\Support\Facades\Route;

/*
| Studio Talk: the customer-facing agent by voice (LiveKit, the same worker
| that answers the phone) or by chat (the same worker through the gateway).
| Loaded under /studio by bootstrap/app.php like every file in this folder.
*/

Route::get('/talk', [TalkController::class, 'index'])->name('talk');
Route::post('/talk/voice', [TalkController::class, 'voice'])->middleware('throttle:20,1')->name('talk.voice');
Route::post('/talk/chat', [TalkController::class, 'chat'])->middleware('throttle:40,1')->name('talk.chat');
