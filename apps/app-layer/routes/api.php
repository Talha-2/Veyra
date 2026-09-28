<?php

use App\Http\Controllers\Api\Agent\AutomationController;
use App\Http\Controllers\Api\Agent\CallController;
use App\Http\Controllers\Api\Agent\ContactController;
use App\Http\Controllers\Api\Agent\ContextController;
use App\Http\Controllers\Api\Agent\DelegationController;
use App\Http\Controllers\Api\Agent\HealthController;
use App\Http\Controllers\Api\Agent\KnowledgeController;
use App\Http\Controllers\Api\Agent\MemoryController;
use App\Http\Controllers\Api\Agent\MessageController;
use App\Http\Controllers\Api\Agent\SkillController;
use App\Http\Controllers\Api\Agent\ThreadController;
use App\Http\Controllers\Api\Agent\TicketController;
use App\Http\Controllers\Api\Agent\ToolCallController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| The agent-layer contract, v1
|--------------------------------------------------------------------------
|
| Everything the Python agent layer may ask the app for, and nothing else. It
| never opens a database connection; this is the whole surface. Full payloads
| are documented in docs/agent-contract.md and mirrored by the Python AppSdk.
|
| Versioned in the path. A breaking change is /v2 beside /v1, never an edit.
|
| Two kinds of route:
|   - unscoped: authenticated by the secret alone. The inbound call route
|     resolves the tenant from the dialled number, because at that moment the
|     agent does not yet know whose call it is.
|   - organization-scoped: the tenant is named in the path and every query is
|     scoped to it by the tenant middleware + TenantScope.
|
*/

/*
| The company website's contact and demo form. Public; throttled per IP.
| CORS for api/* comes from Laravel's default HandleCors config.
*/
Route::post('site/inquiries', [\App\Http\Controllers\Site\InquiryController::class, 'store'])
    ->middleware('throttle:6,1')
    ->name('site.inquiries.store');

/*
| The PUBLIC API for customers' own integrations, v1. Separate file, separate
| auth (API keys, not the agent secret). See routes/api_v1.php.
*/
Route::prefix('v1')->name('v1.')->group(base_path('routes/api_v1.php'));

Route::prefix('agent/v1')->name('agent.')->middleware('agent.auth')->group(function () {
    Route::get('/health', HealthController::class)->name('health');
    Route::post('/calls/inbound', [CallController::class, 'inbound'])->name('calls.inbound');
    // A browser voice session (Studio Talk): the room was created by the app,
    // so the room name alone identifies the tenant and the call.
    Route::post('/calls/web', [CallController::class, 'web'])->name('calls.web');
    // The gateway's pull loop does not know which tenants have work; this
    // claims across all of them and names the tenant on each run.
    Route::post('/automations/claim', [AutomationController::class, 'claimAll'])->name('automations.claim-all');

    Route::prefix('organizations/{organization}')->group(function () {
        Route::get('/context', ContextController::class)->name('context');

        Route::get('/skills', [SkillController::class, 'index'])->name('skills');
        // withoutScopedBindings: a custom key under a parent parameter makes
        // Laravel look for $organization->skills(), which does not exist.
        // TenantScope already scopes the lookup.
        Route::get('/skills/{skill:slug}', [SkillController::class, 'show'])->withoutScopedBindings()->name('skills.show');

        Route::get('/knowledge/search', KnowledgeController::class)->name('knowledge.search');

        Route::get('/contacts/lookup', [ContactController::class, 'lookup'])->name('contacts.lookup');
        Route::post('/contacts', [ContactController::class, 'store'])->name('contacts.store');
        Route::patch('/contacts/{contact}', [ContactController::class, 'update'])->name('contacts.update');

        Route::get('/tickets', [TicketController::class, 'index'])->name('tickets');
        Route::post('/tickets', [TicketController::class, 'store'])->name('tickets.store');

        Route::post('/messages', [MessageController::class, 'store'])->name('messages.store');

        Route::get('/calls', [CallController::class, 'index'])->name('calls');
        Route::post('/calls/{call}/events', [CallController::class, 'event'])->name('calls.events');
        Route::put('/calls/{call}/transcript', [CallController::class, 'transcript'])->name('calls.transcript');
        Route::post('/calls/{call}/delegations', [DelegationController::class, 'store'])->name('delegations.store');
        Route::patch('/calls/{call}/delegations/{delegation}', [DelegationController::class, 'update'])->name('delegations.update');

        Route::post('/tool-calls', [ToolCallController::class, 'store'])->name('tool-calls.store');
        Route::patch('/tool-calls/{toolCall}', [ToolCallController::class, 'update'])->name('tool-calls.update');

        Route::post('/memory', MemoryController::class)->name('memory.store');

        Route::post('/threads/{thread}/messages', ThreadController::class)->name('threads.reply');

        Route::post('/automations/claim', [AutomationController::class, 'claim'])->name('automations.claim');
        Route::post('/automations/runs/{run}/claim', [AutomationController::class, 'claimOne'])->name('automations.runs.claim');
        Route::patch('/automations/runs/{run}', [AutomationController::class, 'update'])->name('automations.runs.update');
    });
});
