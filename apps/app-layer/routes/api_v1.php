<?php

use App\Http\Controllers\Api\V1\CallController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\KnowledgeController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\OpenApiController;
use App\Http\Controllers\Api\V1\TicketController;
use App\Http\Controllers\Api\V1\WebhookEndpointController;
use App\Http\Controllers\Api\V1\ChatController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| The public API, v1 — /api/v1
|--------------------------------------------------------------------------
|
| For customers who integrate Veyra into their own systems instead of (or as
| well as) working in Desk. NOT the agent contract (/api/agent/v1).
|
| Every route:
|   - authenticates with an API key (AuthenticateApiKey, alias `api.key`),
|     which also sets the key's organization as the tenant and rate-limits;
|   - states its scope with ->apiScope('resource:read|write'), or
|     ->apiScope(null) for "any valid key". A route with no apiScope() is
|     refused at runtime — forgetting it fails closed;
|   - is refused to publishable keys (vy_pk_) unless marked ->publishable().
|
| Publishable today: GET /me and POST /knowledge/search.
|
| The OpenAPI document (App\Support\PublicApi\OpenApiSpec) describes each of
| these; PublicApiTest fails if a route here is missing from it.
|
*/

// The spec itself is public: partners read it before they have a key.
Route::get('/openapi.json', OpenApiController::class)->name('openapi');

Route::middleware('api.key')->group(function () {
    Route::get('/me', MeController::class)->apiScope(null)->publishable()->name('me');

    // ── Contacts ──────────────────────────────────────────────────────
    Route::get('/contacts', [ContactController::class, 'index'])->apiScope('contacts:read')->name('contacts.index');
    Route::get('/contacts/lookup', [ContactController::class, 'lookup'])->apiScope('contacts:read')->name('contacts.lookup');
    Route::post('/contacts', [ContactController::class, 'store'])->apiScope('contacts:write')->name('contacts.store');
    Route::get('/contacts/{contact}', [ContactController::class, 'show'])->whereNumber('contact')->apiScope('contacts:read')->name('contacts.show');
    Route::patch('/contacts/{contact}', [ContactController::class, 'update'])->whereNumber('contact')->apiScope('contacts:write')->name('contacts.update');
    Route::delete('/contacts/{contact}', [ContactController::class, 'destroy'])->whereNumber('contact')->apiScope('contacts:write')->name('contacts.destroy');

    // ── Conversations and messages ────────────────────────────────────
    Route::get('/conversations', [ConversationController::class, 'index'])->apiScope('conversations:read')->name('conversations.index');
    Route::get('/conversations/{conversation}', [ConversationController::class, 'show'])->whereNumber('conversation')->apiScope('conversations:read')->name('conversations.show');
    Route::get('/conversations/{conversation}/messages', [ConversationController::class, 'messages'])->whereNumber('conversation')->apiScope('conversations:read')->name('conversations.messages');
    Route::get('/conversations/{conversation}/notes', [ConversationController::class, 'notes'])->whereNumber('conversation')->apiScope('conversations:read')->name('conversations.notes');
    Route::post('/conversations/{conversation}/messages', [MessageController::class, 'storeOnConversation'])->whereNumber('conversation')->apiScope('messages:write')->name('conversations.messages.store');
    Route::post('/conversations/{conversation}/notes', [MessageController::class, 'storeNote'])->whereNumber('conversation')->apiScope('messages:write')->name('conversations.notes.store');
    Route::post('/messages', [MessageController::class, 'store'])->apiScope('messages:write')->name('messages.store');

    // ── Tickets ───────────────────────────────────────────────────────
    Route::get('/tickets', [TicketController::class, 'index'])->apiScope('tickets:read')->name('tickets.index');
    Route::post('/tickets', [TicketController::class, 'store'])->apiScope('tickets:write')->name('tickets.store');
    Route::get('/tickets/{ticket}', [TicketController::class, 'show'])->whereNumber('ticket')->apiScope('tickets:read')->name('tickets.show');
    Route::patch('/tickets/{ticket}', [TicketController::class, 'update'])->whereNumber('ticket')->apiScope('tickets:write')->name('tickets.update');
    Route::get('/tickets/{ticket}/notes', [TicketController::class, 'notes'])->whereNumber('ticket')->apiScope('tickets:read')->name('tickets.notes');
    Route::post('/tickets/{ticket}/notes', [TicketController::class, 'storeNote'])->whereNumber('ticket')->apiScope('tickets:write')->name('tickets.notes.store');

    // ── Leads and pipelines ───────────────────────────────────────────
    Route::get('/pipelines', [LeadController::class, 'pipelines'])->apiScope('leads:read')->name('pipelines.index');
    Route::get('/leads', [LeadController::class, 'index'])->apiScope('leads:read')->name('leads.index');
    Route::post('/leads', [LeadController::class, 'store'])->apiScope('leads:write')->name('leads.store');
    Route::get('/leads/{lead}', [LeadController::class, 'show'])->whereNumber('lead')->apiScope('leads:read')->name('leads.show');
    Route::patch('/leads/{lead}', [LeadController::class, 'update'])->whereNumber('lead')->apiScope('leads:write')->name('leads.update');
    Route::post('/leads/{lead}/move', [LeadController::class, 'move'])->whereNumber('lead')->apiScope('leads:write')->name('leads.move');

    // ── Calls ─────────────────────────────────────────────────────────
    Route::get('/calls', [CallController::class, 'index'])->apiScope('calls:read')->name('calls.index');
    Route::get('/calls/{call}', [CallController::class, 'show'])->whereNumber('call')->apiScope('calls:read')->name('calls.show');

    // ── Knowledge ─────────────────────────────────────────────────────
    Route::get('/knowledge/documents', [KnowledgeController::class, 'index'])->apiScope('knowledge:read')->name('knowledge.index');
    Route::post('/knowledge/documents', [KnowledgeController::class, 'store'])->apiScope('knowledge:write')->name('knowledge.store');
    Route::get('/knowledge/documents/{document}', [KnowledgeController::class, 'show'])->whereNumber('document')->apiScope('knowledge:read')->name('knowledge.show');
    Route::patch('/knowledge/documents/{document}', [KnowledgeController::class, 'update'])->whereNumber('document')->apiScope('knowledge:write')->name('knowledge.update');
    Route::delete('/knowledge/documents/{document}', [KnowledgeController::class, 'destroy'])->whereNumber('document')->apiScope('knowledge:write')->name('knowledge.destroy');
    Route::post('/knowledge/search', [KnowledgeController::class, 'search'])->apiScope('knowledge:read')->publishable()->name('knowledge.search');

    // ── Webhook endpoints ─────────────────────────────────────────────
    Route::get('/webhook-endpoints', [WebhookEndpointController::class, 'index'])->apiScope('webhooks:read')->name('webhook-endpoints.index');
    Route::post('/webhook-endpoints', [WebhookEndpointController::class, 'store'])->apiScope('webhooks:write')->name('webhook-endpoints.store');
    Route::get('/webhook-endpoints/{webhookEndpoint}', [WebhookEndpointController::class, 'show'])->whereNumber('webhookEndpoint')->apiScope('webhooks:read')->name('webhook-endpoints.show');
    Route::delete('/webhook-endpoints/{webhookEndpoint}', [WebhookEndpointController::class, 'destroy'])->whereNumber('webhookEndpoint')->apiScope('webhooks:write')->name('webhook-endpoints.destroy');

    // ── Agent chat ───────────────────────────────────────────────────
    // Your site or backend talks to your agent. Publishable keys may call
    // these (a website widget), and must then send the session's token.
    Route::post('/chat/sessions', [ChatController::class, 'store'])->apiScope('chat:write')->publishable()->name('chat.sessions.store');
    Route::get('/chat/sessions/{session}', [ChatController::class, 'show'])->whereNumber('session')->apiScope('chat:write')->publishable()->name('chat.sessions.show');
    Route::get('/chat/sessions/{session}/messages', [ChatController::class, 'messages'])->whereNumber('session')->apiScope('chat:write')->publishable()->name('chat.messages.index');
    Route::post('/chat/sessions/{session}/messages', [ChatController::class, 'send'])->whereNumber('session')->apiScope('chat:write')->publishable()->middleware('throttle:30,1')->name('chat.messages.send');
});
