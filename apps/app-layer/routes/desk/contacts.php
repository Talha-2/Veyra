<?php

use App\Http\Controllers\Desk\CallController;
use App\Http\Controllers\Desk\ContactController;
use App\Http\Controllers\Desk\DashboardController;
use App\Http\Controllers\Desk\InboxActionController;
use App\Http\Controllers\Desk\LeadController;
use App\Http\Controllers\Desk\NotificationController;
use App\Http\Controllers\Desk\TeamController;
use App\Http\Controllers\Desk\TicketController;
use Illuminate\Support\Facades\Route;

Route::get('/dashboard', DashboardController::class)->name('dashboard');

// Inbox — the long tail. The two hot paths (list, thread) are in inbox.php.
Route::post('/inbox', [InboxActionController::class, 'store'])->name('inbox.store');
Route::post('/inbox/bulk', [InboxActionController::class, 'bulk'])->name('inbox.bulk');
Route::post('/inbox/views', [InboxActionController::class, 'storeView'])->name('inbox.views.store');
Route::delete('/inbox/views/{view}', [InboxActionController::class, 'destroyView'])->name('inbox.views.destroy');
Route::post('/inbox/{conversation}/favorite', [InboxActionController::class, 'favorite'])->name('inbox.favorite');
Route::post('/inbox/{conversation}/tags', [InboxActionController::class, 'tag'])->name('inbox.tags');
Route::post('/inbox/{conversation}/assign', [InboxActionController::class, 'assign'])->name('inbox.assign');
Route::post('/inbox/{conversation}/notes', [InboxActionController::class, 'composeNote'])->name('inbox.notes');
Route::post('/inbox/{conversation}/reminders', [InboxActionController::class, 'composeReminder'])->name('inbox.reminders');
Route::post('/inbox/{conversation}/tickets', [InboxActionController::class, 'composeTicket'])->name('inbox.tickets');
Route::post('/identifiers/{identifier}/block', [InboxActionController::class, 'toggleBlock'])->name('identifiers.block');
Route::post('/identifiers/{identifier}/dnd', [InboxActionController::class, 'toggleDnd'])->name('identifiers.dnd');
Route::post('/messages/{message}/pin', [InboxActionController::class, 'pin'])->name('messages.pin');
Route::post('/messages/{message}/feedback', [InboxActionController::class, 'feedback'])->name('messages.feedback');

Route::get('/contacts', [ContactController::class, 'index'])->name('contacts');
Route::get('/contacts/export', [ContactController::class, 'export'])->name('contacts.export');
Route::post('/contacts', [ContactController::class, 'store'])->name('contacts.store');
Route::get('/contacts/{contact}', [ContactController::class, 'show'])->name('contacts.show');
Route::patch('/contacts/{contact}', [ContactController::class, 'update'])->name('contacts.update');
Route::post('/contacts/{contact}/favorite', [ContactController::class, 'favorite'])->name('contacts.favorite');
Route::post('/contacts/{contact}/notes', [ContactController::class, 'storeNote'])->name('contacts.notes.store');

Route::get('/leads', [LeadController::class, 'index'])->name('leads');
Route::post('/leads', [LeadController::class, 'store'])->name('leads.store');
Route::post('/leads/import', [LeadController::class, 'import'])->name('leads.import');
Route::patch('/leads/{lead}', [LeadController::class, 'update'])->name('leads.update');
Route::post('/leads/{lead}/move', [LeadController::class, 'move'])->name('leads.move');
Route::delete('/leads/{lead}', [LeadController::class, 'destroy'])->name('leads.destroy');

Route::get('/calls', [CallController::class, 'index'])->name('calls');
Route::get('/calls/{call}', [CallController::class, 'show'])->name('calls.show');

Route::get('/tickets', [TicketController::class, 'index'])->name('tickets');
Route::post('/tickets', [TicketController::class, 'store'])->name('tickets.store');
Route::get('/tickets/{ticket}', [TicketController::class, 'show'])->name('tickets.show');
Route::patch('/tickets/{ticket}', [TicketController::class, 'update'])->name('tickets.update');
Route::post('/tickets/{ticket}/notes', [TicketController::class, 'storeNote'])->name('tickets.notes.store');

Route::get('/team', [TeamController::class, 'index'])->name('team');

Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications');
Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');
Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead'])->name('notifications.read');
Route::get('/notifications/preferences', [NotificationController::class, 'preferences'])->name('notifications.preferences');
Route::put('/notifications/preferences', [NotificationController::class, 'updatePreferences'])->name('notifications.preferences.update');
