<?php

use App\Http\Controllers\Studio\ActionController;
use App\Http\Controllers\Studio\AgentController;
use App\Http\Controllers\Studio\ApprovalController;
use App\Http\Controllers\Studio\AskController;
use App\Http\Controllers\Studio\AutomationController;
use App\Http\Controllers\Studio\DeveloperController;
use App\Http\Controllers\Studio\EvalController;
use App\Http\Controllers\Studio\ExpertController;
use App\Http\Controllers\Studio\IntegrationController;
use App\Http\Controllers\Studio\KnowledgeController;
use App\Http\Controllers\Studio\MemoryController;
use App\Http\Controllers\Studio\OverviewController;
use App\Http\Controllers\Studio\SettingsController;
use App\Http\Controllers\Studio\SkillController;
use App\Http\Controllers\Studio\TelephonyController;
use App\Http\Controllers\Studio\VoiceController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Veyra Studio
|--------------------------------------------------------------------------
|
| Every file in routes/studio/ is loaded under the `/studio` prefix behind the
| `surface:studio` middleware — see bootstrap/app.php.
|
| Studio is the builder surface: configure and supervise the agent. Note this is
| a deliberate divergence from Z360, where AI Studio is a page under Settings.
| Here it is its own product, separately granted, with its own navigation.
|
*/

Route::get('/', OverviewController::class)->name('home');

// Actions marked "Needs approval", decided from the Overview page.
Route::post('/approvals/{toolCall}/approve', [ApprovalController::class, 'approve'])->middleware('throttle:30,1')->name('approvals.approve');
Route::post('/approvals/{toolCall}/reject', [ApprovalController::class, 'reject'])->name('approvals.reject');

Route::get('/agent', [AgentController::class, 'index'])->name('agent');
Route::put('/agent', [AgentController::class, 'update'])->name('agent.update');

Route::get('/voice', [VoiceController::class, 'index'])->name('voice');
Route::put('/voice', [VoiceController::class, 'update'])->name('voice.update');
Route::get('/voice/preview', [VoiceController::class, 'preview'])->middleware('throttle:60,1')->name('voice.preview');

Route::get('/experts', [ExpertController::class, 'index'])->name('experts');
Route::post('/experts', [ExpertController::class, 'store'])->name('experts.store');
Route::get('/experts/{expert}', [ExpertController::class, 'show'])->name('experts.show');
Route::patch('/experts/{expert}', [ExpertController::class, 'update'])->name('experts.update');
Route::delete('/experts/{expert}', [ExpertController::class, 'destroy'])->name('experts.destroy');

Route::get('/skills', [SkillController::class, 'index'])->name('skills');
Route::post('/skills', [SkillController::class, 'store'])->name('skills.store');
Route::get('/skills/{skill}', [SkillController::class, 'show'])->name('skills.show');
Route::patch('/skills/{skill}', [SkillController::class, 'update'])->name('skills.update');
Route::post('/skills/{skill}/test', [SkillController::class, 'test'])->middleware('throttle:10,1')->name('skills.test');
Route::delete('/skills/{skill}', [SkillController::class, 'destroy'])->name('skills.destroy');

Route::get('/automations', [AutomationController::class, 'index'])->name('automations');
Route::post('/automations', [AutomationController::class, 'store'])->name('automations.store');
Route::get('/automations/{automation}', [AutomationController::class, 'show'])->name('automations.show');
Route::patch('/automations/{automation}', [AutomationController::class, 'update'])->name('automations.update');
Route::post('/automations/{automation}/run', [AutomationController::class, 'run'])->name('automations.run');
Route::delete('/automations/{automation}', [AutomationController::class, 'destroy'])->name('automations.destroy');

Route::get('/integrations', [ActionController::class, 'index'])->name('integrations');
Route::patch('/integrations/actions/{action}', [ActionController::class, 'update'])->name('actions.update');
Route::get('/integrations/catalog', [IntegrationController::class, 'catalog'])->name('integrations.catalog');
Route::get('/integrations/catalog/{slug}/tools', [IntegrationController::class, 'tools'])->name('integrations.tools');
Route::post('/integrations/catalog/{slug}/connect', [IntegrationController::class, 'connect'])->name('integrations.connect');
// Where Composio sends the person back after they sign in with the provider.
Route::get('/integrations/callback', [IntegrationController::class, 'callback'])->name('integrations.callback');
Route::post('/integrations/{integration}/refresh', [IntegrationController::class, 'refresh'])->name('integrations.refresh');
Route::delete('/integrations/{integration}', [IntegrationController::class, 'disconnect'])->name('integrations.disconnect');
Route::post('/integrations/mcp', [IntegrationController::class, 'storeMcp'])->name('integrations.mcp.store');
Route::post('/integrations/mcp/{integration}/test', [IntegrationController::class, 'testMcp'])->middleware('throttle:20,1')->name('integrations.mcp.test');
Route::post('/integrations/http', [IntegrationController::class, 'storeHttpAction'])->name('integrations.http.store');
Route::patch('/integrations/http/{action}', [IntegrationController::class, 'updateHttpAction'])->name('integrations.http.update');
// SSRF-capable by design; throttled for the same reason the old server did.
Route::post('/integrations/http/{action}/test', [IntegrationController::class, 'testHttpAction'])->middleware('throttle:20,1')->name('integrations.http.test');

Route::get('/telephony', [TelephonyController::class, 'index'])->name('telephony');
Route::patch('/telephony/numbers/{number}', [TelephonyController::class, 'updateNumber'])->name('telephony.numbers.update');
Route::put('/telephony/provider', [TelephonyController::class, 'updateProvider'])->name('telephony.provider');

Route::get('/knowledge', [KnowledgeController::class, 'index'])->name('knowledge');
Route::get('/knowledge/documents/{document}', [KnowledgeController::class, 'show'])->name('knowledge.documents.show');
Route::post('/knowledge/folders', [KnowledgeController::class, 'storeFolder'])->name('knowledge.folders.store');
Route::patch('/knowledge/folders/{folder}', [KnowledgeController::class, 'renameFolder'])->name('knowledge.folders.rename');
Route::delete('/knowledge/folders/{folder}', [KnowledgeController::class, 'destroyFolder'])->name('knowledge.folders.destroy');
Route::post('/knowledge/documents', [KnowledgeController::class, 'storeDocument'])->name('knowledge.documents.store');
Route::post('/knowledge/upload', [KnowledgeController::class, 'upload'])->name('knowledge.upload');
Route::post('/knowledge/scrape', [KnowledgeController::class, 'scrape'])->middleware('throttle:10,1')->name('knowledge.scrape');
Route::post('/knowledge/move', [KnowledgeController::class, 'move'])->name('knowledge.move');
Route::post('/knowledge/bulk-delete', [KnowledgeController::class, 'bulkDestroy'])->name('knowledge.bulk-delete');
Route::patch('/knowledge/documents/{document}', [KnowledgeController::class, 'updateDocument'])->name('knowledge.documents.update');
Route::post('/knowledge/documents/{document}/reindex', [KnowledgeController::class, 'reindex'])->name('knowledge.documents.reindex');
Route::delete('/knowledge/documents/{document}', [KnowledgeController::class, 'destroyDocument'])->name('knowledge.documents.destroy');

Route::get('/memory', [MemoryController::class, 'index'])->name('memory');
Route::post('/memory', [MemoryController::class, 'store'])->name('memory.store');
Route::patch('/memory/{document}', [MemoryController::class, 'update'])->name('memory.update');
Route::delete('/memory/{document}', [MemoryController::class, 'destroy'])->name('memory.destroy');

Route::get('/ask', [AskController::class, 'index'])->name('ask');
// Before the {thread} routes: "stream" is not a thread id.
Route::post('/ask/stream', [AskController::class, 'stream'])->middleware('throttle:30,1')->name('ask.stream');
Route::get('/ask/{thread}', [AskController::class, 'index'])->whereNumber('thread')->name('ask.show');
Route::post('/ask', [AskController::class, 'send'])->name('ask.send');
Route::post('/ask/{thread}', [AskController::class, 'send'])->whereNumber('thread')->name('ask.reply');
Route::patch('/ask/{thread}', [AskController::class, 'rename'])->whereNumber('thread')->name('ask.rename');
Route::delete('/ask/{thread}', [AskController::class, 'destroy'])->whereNumber('thread')->name('ask.destroy');

Route::get('/evals', [EvalController::class, 'index'])->name('evals');

Route::get('/developer', [DeveloperController::class, 'index'])->name('developer');
Route::post('/developer/keys', [DeveloperController::class, 'storeKey'])->name('developer.keys.store');
Route::delete('/developer/keys/{key}', [DeveloperController::class, 'revokeKey'])->name('developer.keys.revoke');
Route::post('/developer/webhooks', [DeveloperController::class, 'storeWebhook'])->name('developer.webhooks.store');
Route::patch('/developer/webhooks/{webhook}', [DeveloperController::class, 'updateWebhook'])->name('developer.webhooks.update');
Route::post('/developer/webhooks/{webhook}/test', [DeveloperController::class, 'testWebhook'])->middleware('throttle:10,1')->name('developer.webhooks.test');
Route::delete('/developer/webhooks/{webhook}', [DeveloperController::class, 'destroyWebhook'])->name('developer.webhooks.destroy');

// Settings, on Z360's split: organization, product, user.
Route::prefix('settings')->name('settings.')->group(function () {
    Route::redirect('/', '/studio/settings/organization')->name('index');
    Route::get('/organization', [SettingsController::class, 'organization'])->name('organization');
    Route::put('/organization', [SettingsController::class, 'updateOrganization'])->name('organization.update');
    Route::get('/team', [SettingsController::class, 'team'])->name('team');
    Route::post('/team/invite', [SettingsController::class, 'invite'])->name('team.invite');
    Route::delete('/team/invitations/{invitation}', [SettingsController::class, 'revokeInvitation'])->name('team.invitations.revoke');
    Route::patch('/team/{membership}', [SettingsController::class, 'updateMember'])->name('team.update');
    Route::delete('/team/{membership}', [SettingsController::class, 'removeMember'])->name('team.remove');
    Route::get('/ticket-types', [SettingsController::class, 'ticketTypes'])->name('ticket-types');
    Route::post('/ticket-types', [SettingsController::class, 'storeTicketType'])->name('ticket-types.store');
    Route::patch('/ticket-types/{type}', [SettingsController::class, 'updateTicketType'])->name('ticket-types.update');
    Route::delete('/ticket-types/{type}', [SettingsController::class, 'destroyTicketType'])->name('ticket-types.destroy');
    Route::get('/pipelines', [SettingsController::class, 'pipelines'])->name('pipelines');
    Route::post('/pipelines', [SettingsController::class, 'storePipeline'])->name('pipelines.store');
    Route::patch('/pipelines/{pipeline}', [SettingsController::class, 'updatePipeline'])->name('pipelines.update');
    Route::get('/profile', [SettingsController::class, 'profile'])->name('profile');
    Route::put('/profile', [SettingsController::class, 'updateProfile'])->name('profile.update');
    Route::put('/password', [SettingsController::class, 'updatePassword'])->name('password.update');
    Route::get('/sessions', [SettingsController::class, 'sessions'])->name('sessions');
    Route::post('/sessions/logout-others', [SettingsController::class, 'logoutOtherSessions'])->name('sessions.logout-others');
});
