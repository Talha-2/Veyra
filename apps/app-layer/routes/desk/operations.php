<?php

use App\Http\Controllers\Desk\OperationsController as Operations;
use Illuminate\Support\Facades\Route;

Route::get('/billing', [Operations::class, 'billing'])->name('billing');
Route::post('/billing', [Operations::class, 'storeInvoice'])->name('billing.store');
Route::get('/billing/{invoice}', [Operations::class, 'invoice'])->name('billing.show');
Route::post('/billing/{invoice}/issue', [Operations::class, 'issue'])->name('billing.issue');
Route::post('/billing/{invoice}/payments', [Operations::class, 'payment'])->name('billing.payments');
Route::post('/billing/{invoice}/void', [Operations::class, 'void'])->name('billing.void');
Route::get('/inventory', [Operations::class, 'inventory'])->name('inventory');
Route::post('/inventory/items', [Operations::class, 'item'])->name('inventory.items');
Route::post('/inventory/batches', [Operations::class, 'batch'])->name('inventory.batches');
Route::post('/inventory/{batch}/move', [Operations::class, 'move'])->name('inventory.move');
Route::get('/care-tasks', [Operations::class, 'tasks'])->name('care-tasks');
Route::post('/care-tasks', [Operations::class, 'task'])->name('care-tasks.store');
Route::patch('/care-tasks/{task}', [Operations::class, 'taskStatus'])->name('care-tasks.update');
Route::get('/analytics', [Operations::class, 'analytics'])->name('analytics');
