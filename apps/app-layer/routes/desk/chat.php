<?php

use App\Http\Controllers\Desk\StaffChatController;
use Illuminate\Support\Facades\Route;

Route::get('/chat', [StaffChatController::class, 'index'])->name('chat');
Route::get('/chat/rooms', [StaffChatController::class, 'rooms'])->name('chat.rooms');
Route::post('/chat/rooms', [StaffChatController::class, 'create'])->middleware('throttle:30,1')->name('chat.create');
Route::get('/chat/rooms/{room}/feed', [StaffChatController::class, 'feed'])->name('chat.feed');
Route::post('/chat/rooms/{room}/messages', [StaffChatController::class, 'send'])->middleware('throttle:60,1')->name('chat.send');
Route::post('/chat/rooms/{room}/read', [StaffChatController::class, 'read'])->name('chat.read');
