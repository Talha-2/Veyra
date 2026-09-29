<?php

namespace App\Support\PublicApi;

use App\Models\ApiKey;
use App\Models\WebhookEndpoint;

/**
 * The OpenAPI 3.1 description of the public API — hand-maintained, in one
 * place. Served at GET /api/v1/openapi.json and rendered by the Developer
 * page and the public reference at /docs/api.
 *
 * PublicApiTest checks this against routes/api_v1.php in both directions
 * (every route documented, every documented path routed) and checks every
 * `x-scope` is a real ApiKey scope, so the document cannot quietly drift.
 */
class OpenApiSpec
{
    private const TS = '2026-09-28T14:03:11Z';

    public static function build(?string $baseUrl = null): array
    {
        return (new self)->document($baseUrl ?? url('/api/v1'));
    }

    private function document(string $baseUrl): array
    {
        return [
            'openapi' => '3.1.0',
            'info' => [
                'title' => 'Veyra API',
                'version' => '1.0.0',
                'summary' => 'Contacts, conversations, tickets, leads, calls and knowledge — the data behind Veyra Desk, for your own systems.',
                'description' => implode("\n\n", [
                    'Everything an operator works with in Veyra Desk, over HTTPS and JSON, so you can run Veyra behind your own platform instead of (or as well as) Desk.',
                    '**Authentication.** Send a server key as `Authorization: Bearer vy_sk_…`. Create keys in Studio › Developer; each key belongs to one organization and carries scopes. Publishable keys (`vy_pk_…`) are safe to embed in a web page and can only call routes marked publishable.',
                    '**Objects.** Every object has a numeric `id`, an `object` type name, and `created_at` / `updated_at` in ISO 8601 UTC.',
                    '**Lists** return `{object: "list", data, has_more, next_cursor}`, newest first. Pass `next_cursor` back as `?cursor=` for the next page; `?limit=` is 1–100 (default 25). Most lists filter by `?updated_since=` (ISO 8601).',
                    '**Errors** are `{error: {type, message, fields?}}` with the matching status: 401 no or bad key, 403 missing scope (`insufficient_scope`), or a publishable key on a server-only route or without its chat session token (`permission_error`), 404 not found, 405 wrong method, 422 validation (`fields` names each bad field), 429 rate limited, 503 the agent could not answer (`agent_unavailable`).',
                    '**Rate limit.** 120 requests a minute per key. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix seconds); a 429 adds `Retry-After`.',
                    '**Webhooks.** Register an endpoint and Veyra POSTs signed events to it as things change. Verify `X-Veyra-Signature: sha256=<hex>`, the HMAC-SHA256 of the raw body keyed with the endpoint\'s signing secret.',
                ]),
            ],
            'servers' => [['url' => $baseUrl, 'description' => 'This Veyra deployment']],
            'security' => [['bearerAuth' => []]],
            'tags' => $this->tags(),
            'paths' => $this->paths(),
            'webhooks' => $this->webhooks(),
            'components' => [
                'securitySchemes' => [
                    'bearerAuth' => ['type' => 'http', 'scheme' => 'bearer', 'bearerFormat' => 'vy_sk_… (server) or vy_pk_… (publishable)'],
                ],
                'parameters' => $this->sharedParameters(),
                'responses' => $this->errorResponses(),
                'schemas' => $this->schemas(),
            ],
            'x-scopes' => ApiKey::SCOPE_DESCRIPTIONS,
            'x-publishable-scopes' => ApiKey::PUBLISHABLE_SCOPES,
            'x-rate-limit' => (int) config('public_api.rate_limit', 120),
        ];
    }

    // ── tags ─────────────────────────────────────────────────────────────

    private function tags(): array
    {
        return [
            ['name' => 'Authentication', 'description' => 'Check which key you are using, whose it is and what it may do.'],
            ['name' => 'Contacts', 'description' => 'People. Every conversation, ticket, call and lead hangs off a contact. Phone and email are unique within an organization.'],
            ['name' => 'Conversations', 'description' => 'One thread with one address on one channel (call, SMS, email, web chat, fax), with its messages and internal notes.'],
            ['name' => 'Messages', 'description' => 'Record outbound messages and internal notes. Sending over SMS and email is not connected yet: an outbound message is recorded with `status: "queued"` and stays queued until it is.'],
            ['name' => 'Tickets', 'description' => 'Support and follow-up items, raised by operators, the agent or the API. `number` is the per-organization reference shown as `#12`.'],
            ['name' => 'Leads', 'description' => 'Contacts placed in a sales pipeline and moving through its stages.'],
            ['name' => 'Pipelines', 'description' => 'The pipelines leads move through, with their ordered stages.'],
            ['name' => 'Calls', 'description' => 'Phone and browser calls handled by the agent, with transcript, summary and every handoff the agent made while working.'],
            ['name' => 'Knowledge', 'description' => 'The documents the agent answers from, and the same search it uses on a call.'],
            ['name' => 'Webhooks', 'description' => 'Endpoints Veyra POSTs signed events to. The event catalog is under Webhook events.'],
            ['name' => 'Agent chat', 'description' => 'Your website or app talks to your agent: the same agent that answers your phone, with its skills, knowledge, memory and actions. Every chat is a web-chat conversation in Desk, where your team can read it; messages added to the conversation appear in the session\'s messages. Replies can stream as server-sent events. Publishable keys may call these endpoints from a browser, and must then send the session\'s `session_token` in the `X-Chat-Session-Token` header.'],
        ];
    }

    // ── paths ────────────────────────────────────────────────────────────

    private function paths(): array
    {
        $ex = $this->examples();
        $id = fn (string $what) => ['name' => 'id', 'in' => 'path', 'required' => true, 'description' => "The {$what}'s id.", 'schema' => ['type' => 'integer'], 'example' => 42];
        $q = fn (string $name, string $type, string $desc, mixed $example = null, array $extra = []) => array_filter([
            'name' => $name, 'in' => 'query', 'required' => $extra['required'] ?? false, 'description' => $desc,
            'schema' => array_filter(['type' => $type, 'enum' => $extra['enum'] ?? null, 'format' => $extra['format'] ?? null]),
            'example' => $example,
        ], fn ($v) => $v !== null);
        $page = [['$ref' => '#/components/parameters/limit'], ['$ref' => '#/components/parameters/cursor'], ['$ref' => '#/components/parameters/updated_since']];

        return [
            '/openapi.json' => ['get' => [
                'operationId' => 'getOpenApi', 'tags' => ['Authentication'], 'summary' => 'Get this document',
                'description' => 'The OpenAPI 3.1 description of this API. No key needed.',
                'security' => [], 'x-scope' => null, 'x-public' => true,
                'responses' => ['200' => ['description' => 'The OpenAPI document.', 'content' => ['application/json' => ['schema' => ['type' => 'object']]]]],
            ]],

            '/me' => ['get' => $this->op('getMe', 'Authentication', 'Get the current key', 'The key the request was made with, its organization and scopes. Any valid key may call this, publishable ones included.', null, [], null, ['200', 'Me', $ex['me']], publishable: true)],

            '/contacts' => [
                'get' => $this->op('listContacts', 'Contacts', 'List contacts', 'Newest first. `q` matches name, email, company and phone.', 'contacts:read', [
                    $q('q', 'string', 'Search text.', 'Hartley'),
                    $q('stage', 'string', 'Only contacts in this stage.', 'qualified', ['enum' => ['new', 'open', 'qualified', 'won', 'lost']]),
                    $q('email', 'string', 'Exact email (case-insensitive).', 'maya@hartley.co'),
                    $q('phone', 'string', 'Exact phone, any formatting.', '+1 415 555 2671'),
                    ...$page,
                ], null, ['200', ['list' => 'Contact'], $this->listOf($ex['contact'])]),
                'post' => $this->op('createContact', 'Contacts', 'Create a contact', 'Needs at least a name, phone or email. Phone and email are normalised and must not belong to another contact (422). Past conversations from the same phone or email join the new contact\'s history.', 'contacts:write', [], ['ContactCreate', ['name' => 'Maya Hartley', 'phone' => '+1 415 555 2671', 'email' => 'maya@hartley.co', 'company' => 'Hartley & Co', 'tags' => ['vip']]], ['201', 'Contact', $ex['contact']]),
            ],
            '/contacts/lookup' => ['get' => $this->op('lookupContact', 'Contacts', 'Look up a contact by phone or email', 'Matches the contact\'s own phone or email first, then any number or address they have called or written from. 404 when nobody matches.', 'contacts:read', [
                $q('phone', 'string', 'A phone number in any format. Give this or email.', '+14155552671'),
                $q('email', 'string', 'An email address. Give this or phone.', 'maya@hartley.co'),
            ], null, ['200', 'Contact', $ex['contact']], notFound: true)],
            '/contacts/{id}' => [
                'get' => $this->op('getContact', 'Contacts', 'Get a contact', null, 'contacts:read', [$id('contact')], null, ['200', 'Contact', $ex['contact']]),
                'patch' => $this->op('updateContact', 'Contacts', 'Update a contact', 'Send only the fields to change. `tags` replaces the whole set.', 'contacts:write', [$id('contact')], ['ContactUpdate', ['stage' => 'qualified', 'value' => 4800]], ['200', 'Contact', $ex['contact']]),
                'delete' => $this->op('deleteContact', 'Contacts', 'Delete a contact', 'Their conversations, tickets and calls are kept.', 'contacts:write', [$id('contact')], null, ['200', 'Deleted', ['id' => 42, 'object' => 'contact', 'deleted' => true]]),
            ],

            '/conversations' => ['get' => $this->op('listConversations', 'Conversations', 'List conversations', 'Newest first.', 'conversations:read', [
                $q('status', 'string', 'open, snoozed or closed.', 'open', ['enum' => ['open', 'snoozed', 'closed']]),
                $q('channel', 'string', 'Only this channel.', 'sms', ['enum' => ['call', 'sms', 'email', 'web_chat', 'fax']]),
                $q('contact_id', 'integer', 'Only this contact\'s conversations.', 42),
                ...$page,
            ], null, ['200', ['list' => 'Conversation'], $this->listOf($ex['conversation'])])],
            '/conversations/{id}' => ['get' => $this->op('getConversation', 'Conversations', 'Get a conversation', 'Includes the latest 50 messages, oldest first; `messages.has_more` says whether there are older ones to page through.', 'conversations:read', [$id('conversation')], null, ['200', 'ConversationWithMessages', $ex['conversation'] + ['messages' => ['data' => [$ex['message_in'], $ex['message']], 'has_more' => false]]])],
            '/conversations/{id}/messages' => [
                'get' => $this->op('listMessages', 'Conversations', 'List a conversation\'s messages', 'Newest first.', 'conversations:read', [$id('conversation'), $q('direction', 'string', 'inbound or outbound.', 'inbound', ['enum' => ['inbound', 'outbound']]), ...$page], null, ['200', ['list' => 'Message'], $this->listOf($ex['message_in'])]),
                'post' => $this->op('createConversationMessage', 'Messages', 'Record a message on a conversation', 'Records an outbound message on an SMS or email conversation, addressed to the conversation\'s phone or email. **It is not sent yet:** no SMS or email provider is connected, so it is created with `status: "queued"` and stays queued. It appears in the Desk thread immediately. Blocked and do-not-disturb addresses are refused (422, `not_permitted`).', 'messages:write', [$id('conversation')], ['ConversationMessageCreate', ['body' => 'Your table for four is confirmed for 7:30 tonight.']], ['201', 'Message', $ex['message']]),
            ],
            '/conversations/{id}/notes' => [
                'get' => $this->op('listConversationNotes', 'Conversations', 'List a conversation\'s internal notes', 'Newest first. Notes are for the team and never reach the customer.', 'conversations:read', [$id('conversation'), ...$page], null, ['200', ['list' => 'Note'], $this->listOf($ex['note'])]),
                'post' => $this->op('createConversationNote', 'Messages', 'Add an internal note to a conversation', 'Visible to the team in Desk; never sent to the customer.', 'messages:write', [$id('conversation')], ['NoteCreate', ['body' => 'Customer prefers a call back after 5pm.']], ['201', 'Note', $ex['note']]),
            ],
            '/messages' => ['post' => $this->op('createMessage', 'Messages', 'Record a message to an address', 'Records an outbound SMS or email to a phone number or address, on its existing conversation or a new one. **Not sent yet** — see Messages: it is created `queued` and stays queued until sending is connected.', 'messages:write', [], ['MessageCreate', ['channel' => 'sms', 'to' => '+14155552671', 'body' => 'Your order is ready to collect.']], ['201', 'Message', $ex['message']])],

            '/tickets' => [
                'get' => $this->op('listTickets', 'Tickets', 'List tickets', 'Newest first. `q` matches the subject.', 'tickets:read', [
                    $q('status', 'string', 'Only this status.', 'open', ['enum' => ['open', 'in_progress', 'pending', 'resolved', 'closed']]),
                    $q('priority', 'string', 'Only this priority.', 'high', ['enum' => ['low', 'normal', 'high', 'urgent']]),
                    $q('contact_id', 'integer', 'Only this contact\'s tickets.', 42),
                    $q('type_id', 'integer', 'Only this ticket type.', 3),
                    $q('number', 'integer', 'The ticket with this number (#12 → 12).', 12),
                    $q('q', 'string', 'Search the subject.', 'refund'),
                    ...$page,
                ], null, ['200', ['list' => 'Ticket'], $this->listOf($ex['ticket'])]),
                'post' => $this->op('createTicket', 'Tickets', 'Create a ticket', 'Assigned to the ticket type\'s default assignees, exactly as when raised in Desk.', 'tickets:write', [], ['TicketCreate', ['subject' => 'Refund for double charge', 'body' => 'Charged twice on 26 September.', 'priority' => 'high', 'contact_id' => 42]], ['201', 'Ticket', $ex['ticket']]),
            ],
            '/tickets/{id}' => [
                'get' => $this->op('getTicket', 'Tickets', 'Get a ticket', null, 'tickets:read', [$id('ticket')], null, ['200', 'Ticket', $ex['ticket']]),
                'patch' => $this->op('updateTicket', 'Tickets', 'Update a ticket', 'Send only the fields to change. Moving to resolved or closed stamps `resolved_at`; reopening clears it.', 'tickets:write', [$id('ticket')], ['TicketUpdate', ['status' => 'resolved']], ['200', 'Ticket', ['status' => 'resolved', 'resolved_at' => self::TS] + $ex['ticket']]),
            ],
            '/tickets/{id}/notes' => [
                'get' => $this->op('listTicketNotes', 'Tickets', 'List a ticket\'s notes', 'Newest first.', 'tickets:read', [$id('ticket'), ...$page], null, ['200', ['list' => 'Note'], $this->listOf(['parent' => ['object' => 'ticket', 'id' => 7]] + $ex['note'])]),
                'post' => $this->op('createTicketNote', 'Tickets', 'Add a note to a ticket', null, 'tickets:write', [$id('ticket')], ['NoteCreate', ['body' => 'Refund issued in Stripe, ref re_3Q…']], ['201', 'Note', ['parent' => ['object' => 'ticket', 'id' => 7]] + $ex['note']]),
            ],

            '/pipelines' => ['get' => $this->op('listPipelines', 'Pipelines', 'List pipelines', 'Each with its stages in order. Use a stage id to create or move a lead.', 'leads:read', $page, null, ['200', ['list' => 'Pipeline'], $this->listOf($ex['pipeline'])])],
            '/leads' => [
                'get' => $this->op('listLeads', 'Leads', 'List leads', 'Newest first.', 'leads:read', [
                    $q('pipeline_id', 'integer', 'Only this pipeline.', 1),
                    $q('stage_id', 'integer', 'Only this stage.', 2),
                    $q('contact_id', 'integer', 'Only this contact\'s leads.', 42),
                    ...$page,
                ], null, ['200', ['list' => 'Lead'], $this->listOf($ex['lead'])]),
                'post' => $this->op('createLead', 'Leads', 'Create a lead', 'For an existing contact (`contact_id`) or one described inline (`contact`), which is matched by phone or email before a new one is made — so a form that submits twice does not create two people. Without `pipeline_id` the default pipeline is used; without `stage_id`, its first stage.', 'leads:write', [], ['LeadCreate', ['contact' => ['name' => 'Maya Hartley', 'email' => 'maya@hartley.co'], 'value' => 4800, 'source' => 'website']], ['201', 'Lead', $ex['lead']]),
            ],
            '/leads/{id}' => [
                'get' => $this->op('getLead', 'Leads', 'Get a lead', null, 'leads:read', [$id('lead')], null, ['200', 'Lead', $ex['lead']]),
                'patch' => $this->op('updateLead', 'Leads', 'Update a lead', 'Value, source, follow-up date and note. To change stage, use Move.', 'leads:write', [$id('lead')], ['LeadUpdate', ['value' => 6200, 'next_response_at' => '2026-10-02T15:00:00Z']], ['200', 'Lead', $ex['lead']]),
            ],
            '/leads/{id}/move' => ['post' => $this->op('moveLead', 'Leads', 'Move a lead to a stage', 'To a stage in the same pipeline or another; the lead follows the stage\'s pipeline and goes to the bottom of the column. Fires `lead.stage_changed`.', 'leads:write', [$id('lead')], ['LeadMove', ['stage_id' => 3]], ['200', 'Lead', ['stage' => ['id' => 3, 'name' => 'Proposal']] + $ex['lead']])],

            '/calls' => ['get' => $this->op('listCalls', 'Calls', 'List calls', 'Newest first, each with its summary once the call has one.', 'calls:read', [
                $q('status', 'string', 'e.g. ringing, in-progress, completed, failed.', 'completed'),
                $q('direction', 'string', 'inbound or outbound.', 'inbound', ['enum' => ['inbound', 'outbound']]),
                $q('contact_id', 'integer', 'Only this contact\'s calls.', 42),
                ...$page,
            ], null, ['200', ['list' => 'Call'], $this->listOf($ex['call'])])],
            '/calls/{id}' => ['get' => $this->op('getCall', 'Calls', 'Get a call', 'With the transcript turn by turn, and every handoff from the talking agent to the working agent with the tool calls made — the record behind anything the agent told the caller.', 'calls:read', [$id('call')], null, ['200', 'CallDetail', $ex['call_detail']])],

            '/knowledge/documents' => [
                'get' => $this->op('listDocuments', 'Knowledge', 'List documents', 'Newest first. `q` matches the name. The agent\'s own memories are not included.', 'knowledge:read', [
                    $q('status', 'string', 'processing, ready or error.', 'ready', ['enum' => ['processing', 'ready', 'error']]),
                    $q('folder_id', 'integer', 'Only this folder.', 4),
                    $q('q', 'string', 'Search the name.', 'returns'),
                    ...$page,
                ], null, ['200', ['list' => 'Document'], $this->listOf($ex['document'])]),
                'post' => $this->op('createDocument', 'Knowledge', 'Create a document', 'Plain text or Markdown. It is chunked for retrieval before the response returns, so it is searchable — and used by the agent — immediately.', 'knowledge:write', [], ['DocumentCreate', ['name' => 'Returns policy', 'content' => "# Returns\n\nUnworn items can be returned within 30 days…"]], ['201', 'DocumentWithContent', $ex['document'] + ['content' => "# Returns\n\nUnworn items can be returned within 30 days…"]]),
            ],
            '/knowledge/documents/{id}' => [
                'get' => $this->op('getDocument', 'Knowledge', 'Get a document', 'Including its text.', 'knowledge:read', [$id('document')], null, ['200', 'DocumentWithContent', $ex['document'] + ['content' => "# Returns\n\nUnworn items can be returned within 30 days…"]]),
                'patch' => $this->op('updateDocument', 'Knowledge', 'Update a document', 'Changing `content` re-chunks it.', 'knowledge:write', [$id('document')], ['DocumentUpdate', ['content' => "# Returns\n\nUnworn items can be returned within 45 days…"]], ['200', 'DocumentWithContent', $ex['document'] + ['content' => "# Returns\n\nUnworn items can be returned within 45 days…"]]),
                'delete' => $this->op('deleteDocument', 'Knowledge', 'Delete a document', 'The agent stops using it immediately.', 'knowledge:write', [$id('document')], null, ['200', 'Deleted', ['id' => 42, 'object' => 'document', 'deleted' => true]]),
            ],
            '/knowledge/search' => ['post' => $this->op('searchKnowledge', 'Knowledge', 'Search knowledge', 'The passages the agent would retrieve for a question, best first — the same search it runs on a call. Publishable keys may call this, so it can power a help widget on your site.', 'knowledge:read', [], ['KnowledgeSearchRequest', ['query' => 'how long do I have to return something', 'limit' => 3]], ['200', 'SearchResult', $ex['search']], publishable: true)],

            '/chat/sessions' => [
                'post' => $this->op('createChatSession', 'Agent chat', 'Start a chat session', 'With a server key, one session per visitor: calling again with the same `visitor.id` returns their open session (200) instead of a new one (201), and `email` or `phone` link the chat to an existing contact. With a publishable key every call starts a new session and `email` / `phone` are never used to match a contact, because a browser can claim any of them. The `session_token` is returned **only in this response**; publishable keys need it for every later call.', 'chat:write', [], ['ChatSessionCreate', ['visitor' => ['id' => 'user_8841', 'name' => 'Maria Delgado', 'email' => 'maria.d@example.com']]], ['201', 'ChatSession', $ex['chat_session']], publishable: true),
            ],
            '/chat/sessions/{id}' => [
                'get' => $this->op('getChatSession', 'Agent chat', 'Get a chat session', null, 'chat:write', [$id('session')], null, ['200', 'ChatSession', array_diff_key($ex['chat_session'], ['session_token' => 1, 'visitor' => 1])], publishable: true),
            ],
            '/chat/sessions/{id}/messages' => [
                'get' => $this->op('listChatMessages', 'Agent chat', 'List a session\'s messages', 'Newest first, a page at a time. Includes replies your team wrote in Desk.', 'chat:write', [$id('session'), ...$page], null, ['200', ['list' => 'Message'], $this->listOf($ex['chat_reply']['reply'])], publishable: true),
                'post' => $this->op('sendChatMessage', 'Agent chat', 'Send a message and get the reply', 'The agent reads the conversation so far, uses its tools, and answers. Waits for the whole reply by default. With `"stream": true` or `Accept: text/event-stream` the reply streams as server-sent events, one JSON object per `data:` line: `status`, `tool` (each step as it runs and finishes), `delta` (reply text), `done` (the full reply text), then `message` (the stored reply) or `error`. 503 with `type: agent_unavailable` when the agent cannot answer; the visitor\'s message is still saved. At most 30 messages a minute per key and session.', 'chat:write', [$id('session')], ['ChatMessageCreate', ['message' => 'Do you come out to Evanston?']], ['200', 'ChatReply', $ex['chat_reply']], publishable: true),
            ],

            '/webhook-endpoints' => [
                'get' => $this->op('listWebhookEndpoints', 'Webhooks', 'List webhook endpoints', null, 'webhooks:read', $page, null, ['200', ['list' => 'WebhookEndpoint'], $this->listOf($ex['webhook'])]),
                'post' => $this->op('createWebhookEndpoint', 'Webhooks', 'Create a webhook endpoint', 'Veyra POSTs every subscribed event to the URL, signed with the returned `secret` — **shown in this response only**. Use `["*"]` for every event, including ones added later. Endpoints are turned off automatically after '.WebhookEndpoint::disableAfter().' failed deliveries in a row.', 'webhooks:write', [], ['WebhookEndpointCreate', ['url' => 'https://hooks.example.com/veyra', 'events' => ['ticket.created', 'call.ended']]], ['201', 'WebhookEndpointWithSecret', $ex['webhook'] + ['secret' => 'whsec_9fK2mQ…']]),
            ],
            '/webhook-endpoints/{id}' => [
                'get' => $this->op('getWebhookEndpoint', 'Webhooks', 'Get a webhook endpoint', null, 'webhooks:read', [$id('endpoint')], null, ['200', 'WebhookEndpoint', $ex['webhook']]),
                'delete' => $this->op('deleteWebhookEndpoint', 'Webhooks', 'Delete a webhook endpoint', 'It stops receiving events immediately.', 'webhooks:write', [$id('endpoint')], null, ['200', 'Deleted', ['id' => 42, 'object' => 'webhook_endpoint', 'deleted' => true]]),
            ],
        ];
    }

    /**
     * One operation.
     *
     * @param  array{0:string,1:array}|null  $body  [schema name, example]
     * @param  array{0:string,1:string|array,2:array}  $ok  [status, schema name or ['list' => name], example]
     */
    private function op(string $operationId, string $tag, string $summary, ?string $description, ?string $scope, array $parameters, ?array $body, array $ok, bool $publishable = false, bool $notFound = false): array
    {
        [$status, $schema, $example] = $ok;
        $responseSchema = is_array($schema) ? $this->listSchema($schema['list']) : ['$ref' => "#/components/schemas/{$schema}"];

        $hasPathId = collect($parameters)->contains(fn ($p) => ($p['in'] ?? null) === 'path');
        $validates = $body !== null || collect($parameters)->contains(fn ($p) => ($p['in'] ?? null) === 'query' || isset($p['$ref']));

        $responses = [$status => [
            'description' => $status === '201' ? 'Created.' : 'OK.',
            'content' => ['application/json' => ['schema' => $responseSchema, 'example' => $example]],
        ]];
        $responses['401'] = ['$ref' => '#/components/responses/Unauthorized'];
        $responses['403'] = ['$ref' => '#/components/responses/Forbidden'];
        if ($hasPathId || $notFound) {
            $responses['404'] = ['$ref' => '#/components/responses/NotFound'];
        }
        if ($validates) {
            $responses['422'] = ['$ref' => '#/components/responses/ValidationFailed'];
        }
        $responses['429'] = ['$ref' => '#/components/responses/RateLimited'];

        $scopeText = $scope ? "Requires the `{$scope}` scope." : 'Any valid key.';

        return array_filter([
            'operationId' => $operationId,
            'tags' => [$tag],
            'summary' => $summary,
            'description' => trim(($description ? $description."\n\n" : '').$scopeText.($publishable ? ' Publishable keys allowed.' : '')),
            'x-scope' => $scope,
            'x-publishable' => $publishable,
            'parameters' => $parameters ?: null,
            'requestBody' => $body ? [
                'required' => true,
                'content' => ['application/json' => ['schema' => ['$ref' => "#/components/schemas/{$body[0]}"], 'example' => $body[1]]],
            ] : null,
            'responses' => $responses,
        ], fn ($v) => $v !== null);
    }

    private function listSchema(string $item): array
    {
        return [
            'type' => 'object',
            'required' => ['object', 'data', 'has_more', 'next_cursor'],
            'properties' => [
                'object' => ['type' => 'string', 'const' => 'list'],
                'data' => ['type' => 'array', 'items' => ['$ref' => "#/components/schemas/{$item}"]],
                'has_more' => ['type' => 'boolean', 'description' => 'Whether another page follows.'],
                'next_cursor' => ['type' => ['string', 'null'], 'description' => 'Pass as ?cursor= for the next page. Null on the last page.'],
            ],
        ];
    }

    private function listOf(array $item): array
    {
        return ['object' => 'list', 'data' => [$item], 'has_more' => true, 'next_cursor' => 'eyJpZCI6NDEsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0'];
    }

    // ── webhooks (OpenAPI 3.1 top-level) ─────────────────────────────────

    private function webhooks(): array
    {
        $ex = $this->examples();
        $objectFor = fn (string $event) => match (strtok($event, '.')) {
            'contact' => $ex['contact'], 'ticket' => $ex['ticket'], 'lead' => $ex['lead'],
            'call' => $ex['call'], 'run' => $ex['run'],
            default => $ex['message_in'],
        };

        $out = [];
        foreach (WebhookEndpoint::EVENT_DESCRIPTIONS as $event => $description) {
            $data = ['object' => $objectFor($event)];
            if (in_array($event, ['contact.updated', 'ticket.updated', 'lead.updated'], true)) {
                $data['previous_attributes'] = match ($event) {
                    'ticket.updated' => ['status' => 'open'],
                    'contact.updated' => ['stage' => 'new'],
                    default => ['value' => 3000],
                };
            }
            if ($event === 'lead.stage_changed') {
                $data['previous_attributes'] = ['pipeline_stage_id' => 1];
            }

            $out[$event] = ['post' => [
                'operationId' => 'event_'.str_replace('.', '_', $event),
                'summary' => $event,
                'description' => $description.' `data.object` has the same shape the API returns for it; on *.updated and lead.stage_changed, `data.previous_attributes` holds the old values of what changed.',
                'parameters' => [
                    ['name' => 'X-Veyra-Event', 'in' => 'header', 'required' => true, 'schema' => ['type' => 'string'], 'example' => $event],
                    ['name' => 'X-Veyra-Delivery', 'in' => 'header', 'required' => true, 'schema' => ['type' => 'string'], 'description' => 'Unique per delivery attempt.'],
                    ['name' => 'X-Veyra-Attempt', 'in' => 'header', 'required' => true, 'schema' => ['type' => 'integer'], 'description' => 'Which attempt this is: 1, or 2 on the one retry.'],
                    ['name' => 'X-Veyra-Signature', 'in' => 'header', 'required' => true, 'schema' => ['type' => 'string'], 'description' => 'sha256=<hex HMAC-SHA256 of the raw body, keyed with the endpoint secret>'],
                ],
                'requestBody' => ['content' => ['application/json' => [
                    'schema' => ['$ref' => '#/components/schemas/Event'],
                    'example' => ['id' => 'evt_01j8z6q9x4k2m7c3v5b1n0p8r6', 'object' => 'event', 'type' => $event, 'created_at' => self::TS, 'organization_id' => 1, 'data' => $data],
                ]]],
                'responses' => ['2XX' => ['description' => 'Acknowledged. Anything else, a redirect or no answer within 5 seconds counts as a failure.']],
            ]];
        }

        return $out;
    }

    // ── components ───────────────────────────────────────────────────────

    private function sharedParameters(): array
    {
        return [
            'limit' => ['name' => 'limit', 'in' => 'query', 'description' => 'Page size, 1–100.', 'schema' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 25], 'example' => 25],
            'cursor' => ['name' => 'cursor', 'in' => 'query', 'description' => 'next_cursor from the previous page.', 'schema' => ['type' => 'string']],
            'updated_since' => ['name' => 'updated_since', 'in' => 'query', 'description' => 'Only records changed at or after this time (ISO 8601).', 'schema' => ['type' => 'string', 'format' => 'date-time'], 'example' => '2026-09-01T00:00:00Z'],
        ];
    }

    private function errorResponses(): array
    {
        $error = fn (string $description, string $type, string $message, array $extra = []) => [
            'description' => $description,
            'content' => ['application/json' => [
                'schema' => ['$ref' => '#/components/schemas/Error'],
                'example' => ['error' => ['type' => $type, 'message' => $message, ...$extra]],
            ]],
        ];

        return [
            'Unauthorized' => $error('No key, an unknown key, or a revoked key.', 'authentication_error', 'That API key is not valid. Check it was copied whole; keys start with vy_sk_ or vy_pk_.'),
            'Forbidden' => $error('The key lacks the scope, or a publishable key called a server-only route.', 'insufficient_scope', 'This key lacks the tickets:write scope. Add it by creating a key that has it.', ['required_scope' => 'tickets:write']),
            'NotFound' => $error('No such record in this key\'s organization.', 'not_found', 'No such ticket with id 42.'),
            'ValidationFailed' => $error('The request was understood but a field is wrong. `fields` names each one.', 'validation_error', 'The subject field is required.', ['fields' => ['subject' => ['The subject field is required.']]]),
            'RateLimited' => $error('Over the per-key rate limit. Wait Retry-After seconds.', 'rate_limited', 'Rate limit of 120 requests a minute reached. Retry in 12 s.'),
        ];
    }

    private function schemas(): array
    {
        $s = fn (string $type, string $description = '', array $extra = []) => array_filter([
            'type' => str_contains($type, '|') ? explode('|', $type) : $type,
            'description' => $description ?: null,
            ...$extra,
        ], fn ($v) => $v !== null);
        $ts = fn (string $d = '') => $s('string', $d, ['format' => 'date-time']);
        $tsn = fn (string $d = '') => $s('string|null', $d, ['format' => 'date-time']);
        $obj = fn (array $properties, array $required = [], string $description = '') => array_filter([
            'type' => 'object', 'description' => $description ?: null, 'required' => $required ?: null, 'properties' => $properties,
        ], fn ($v) => $v !== null);
        $meta = fn (string $object) => ['id' => $s('integer'), 'object' => $s('string', '', ['const' => $object])];
        $stamps = fn () => ['created_at' => $ts(), 'updated_at' => $ts()];
        $ref = fn (string $name) => ['$ref' => "#/components/schemas/{$name}"];
        $stages = ['new', 'open', 'qualified', 'won', 'lost'];
        $ticketStatus = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
        $priority = ['low', 'normal', 'high', 'urgent'];

        $contact = [
            'name' => $s('string|null', 'Full name.'), 'phone' => $s('string|null', 'Normalised to +digits.'),
            'email' => $s('string|null', 'Lower-cased.'), 'company' => $s('string|null'),
            'stage' => $s('string', 'Lifecycle stage.', ['enum' => $stages]), 'source' => $s('string', 'Where the contact came from, e.g. call, website, api.'),
            'value' => $s('integer', 'Estimated value, in whole currency units.'), 'tags' => $s('array', 'Tag names. On write, replaces the set.', ['items' => ['type' => 'string']]),
        ];
        $ticketFields = [
            'subject' => $s('string'), 'body' => $s('string|null'),
            'status' => $s('string', '', ['enum' => $ticketStatus]), 'priority' => $s('string', '', ['enum' => $priority]),
            'contact_id' => $s('integer|null'), 'conversation_id' => $s('integer|null'),
        ];
        $leadFields = [
            'source' => $s('string|null'), 'value' => $s('integer', 'Deal value, whole currency units.'),
            'next_response_at' => $tsn('When to follow up.'), 'outreach_note' => $s('string|null'),
        ];
        $message = [
            ...$meta('message'), 'conversation_id' => $s('integer'),
            'channel' => $s('string', '', ['enum' => ['call', 'sms', 'email', 'web_chat', 'fax']]),
            'direction' => $s('string', '', ['enum' => ['inbound', 'outbound']]),
            'status' => $s('string', 'Inbound: received. Outbound from the API: queued — sending is not connected yet.'),
            'subject' => $s('string|null', 'Email only.'), 'body' => $s('string|null'), 'from' => $s('string|null'), 'to' => $s('string|null'),
            'from_agent' => $s('boolean', 'Written by the AI agent.'), 'sent_by_user_id' => $s('integer|null', 'The team member who wrote it, if one did.'),
            'read_at' => $tsn(), ...$stamps(),
        ];
        $call = [
            ...$meta('call'), 'direction' => $s('string', '', ['enum' => ['inbound', 'outbound']]),
            'status' => $s('string', 'queued, ringing, in-progress, transferred, completed, failed…'),
            'from' => $s('string|null'), 'to' => $s('string|null'), 'contact_id' => $s('integer|null'), 'conversation_id' => $s('integer|null'),
            'duration_sec' => $s('integer'), 'language' => $s('string|null'), 'recording_url' => $s('string|null'),
            'transferred' => $s('boolean'), 'error' => $s('string|null'), 'summary' => $s('string|null', 'Written by the agent after the call.'),
            ...$stamps(),
        ];
        $document = [
            ...$meta('document'), 'name' => $s('string'), 'folder_id' => $s('integer|null'),
            'source_type' => $s('string', 'upload, created, scrape or api.'), 'source_url' => $s('string|null'),
            'mime' => $s('string'), 'size_bytes' => $s('integer'),
            'status' => $s('string', 'Only ready documents are searchable.', ['enum' => ['processing', 'ready', 'error']]),
            'error' => $s('string|null'), 'chunk_count' => $s('integer'), 'retrievable' => $s('boolean', 'Ready and has chunks: the agent can use it.'),
            ...$stamps(),
        ];
        $webhook = [
            ...$meta('webhook_endpoint'), 'url' => $s('string'), 'events' => $s('array', 'Subscribed events; "*" is all.', ['items' => ['type' => 'string']]),
            'enabled' => $s('boolean'), 'disabled_reason' => $s('string|null', 'Why it was turned off, when it was turned off automatically.'),
            'consecutive_failures' => $s('integer'), 'last_delivered_at' => $tsn(), ...$stamps(),
        ];

        return [
            'Error' => $obj(['error' => $obj([
                'type' => $s('string', 'Stable, for code: authentication_error, permission_error, insufficient_scope, not_found, validation_error, not_permitted, channel_not_supported, rate_limited, api_error.'),
                'message' => $s('string', 'For people.'),
                'fields' => $s('object', '422 only: messages per field.', ['additionalProperties' => ['type' => 'array', 'items' => ['type' => 'string']]]),
                'required_scope' => $s('string', '403 insufficient_scope only.'),
            ], ['type', 'message'])], ['error']),
            'Deleted' => $obj(['id' => $s('integer'), 'object' => $s('string'), 'deleted' => $s('boolean', '', ['const' => true])], ['id', 'object', 'deleted']),
            'Me' => $obj([
                'object' => $s('string', '', ['const' => 'api_key']), 'id' => $s('integer'), 'name' => $s('string'), 'prefix' => $s('string'),
                'type' => $s('string', '', ['enum' => ['server', 'publishable']]), 'scopes' => $s('array', '', ['items' => ['type' => 'string']]),
                'organization' => $obj(['id' => $s('integer'), 'object' => $s('string'), 'name' => $s('string'), 'slug' => $s('string'), 'timezone' => $s('string')]),
                'created_at' => $ts(), 'last_used_at' => $tsn(),
            ]),
            'Contact' => $obj([...$meta('contact'), ...$contact, 'display_name' => $s('string', 'Name, or phone or email when there is no name.'), 'owner_id' => $s('integer|null'), 'last_contact_at' => $tsn(), ...$stamps()]),
            'ContactCreate' => $obj($contact, [], 'At least one of name, phone or email.'),
            'ContactUpdate' => $obj($contact),
            'Conversation' => $obj([
                ...$meta('conversation'), 'channel' => $s('string', '', ['enum' => ['call', 'sms', 'email', 'web_chat', 'fax']]),
                'status' => $s('string', '', ['enum' => ['open', 'snoozed', 'closed']]), 'subject' => $s('string|null'),
                'contact_id' => $s('integer|null', 'Null until the address is linked to a contact.'),
                'identifier' => $obj(['type' => $s('string', 'phone, email or web_session'), 'value' => $s('string')]),
                'unread_count' => $s('integer'), 'last_message_at' => $tsn(), 'snoozed_until' => $tsn(), ...$stamps(),
            ]),
            'ConversationWithMessages' => ['allOf' => [$ref('Conversation'), $obj(['messages' => $obj(['data' => $s('array', 'Latest 50, oldest first.', ['items' => $ref('Message')]), 'has_more' => $s('boolean')])])]],
            'Message' => $obj($message),
            'MessageCreate' => $obj([
                'channel' => $s('string', '', ['enum' => ['sms', 'email']]), 'to' => $s('string', 'Phone number (sms) or email address (email).'),
                'body' => $s('string'), 'subject' => $s('string|null', 'Email only.'),
            ], ['channel', 'to', 'body']),
            'ConversationMessageCreate' => $obj(['body' => $s('string'), 'subject' => $s('string|null', 'Email only.')], ['body']),
            'Note' => $obj([...$meta('note'), 'parent' => $obj(['object' => $s('string', 'ticket or conversation'), 'id' => $s('integer')]), 'body' => $s('string'), 'author' => $s('object|null', 'The team member, or null when written through the API.'), ...$stamps()]),
            'NoteCreate' => $obj(['body' => $s('string')], ['body']),
            'Ticket' => $obj([
                ...$meta('ticket'), 'number' => $s('integer', 'Per-organization sequence.'), 'reference' => $s('string', 'e.g. #12'),
                ...$ticketFields, 'type' => $s('object|null', 'The ticket type {id, name}.'), 'channel' => $s('string', 'Where it was raised: manual, call, api…'),
                'created_by_agent' => $s('boolean'), 'assignee_ids' => $s('array', '', ['items' => ['type' => 'integer']]),
                'tags' => $s('array', '', ['items' => ['type' => 'string']]), 'resolved_at' => $tsn(), ...$stamps(),
            ]),
            'TicketCreate' => $obj([...$ticketFields, 'type_id' => $s('integer|null', 'A ticket type id.'), 'tags' => $s('array', '', ['items' => ['type' => 'string']])], ['subject']),
            'TicketUpdate' => $obj([...$ticketFields, 'type_id' => $s('integer|null'), 'tags' => $s('array', 'Replaces the set.', ['items' => ['type' => 'string']])]),
            'Lead' => $obj([
                ...$meta('lead'), 'contact_id' => $s('integer'), 'contact' => $s('object', '{id, name, phone, email, company}'),
                'pipeline_id' => $s('integer'), 'stage' => $s('object|null', '{id, name}'), ...$leadFields,
                'assignee_ids' => $s('array', '', ['items' => ['type' => 'integer']]), ...$stamps(),
            ]),
            'LeadCreate' => $obj([
                'contact_id' => $s('integer', 'An existing contact. Give this or contact.'),
                'contact' => $obj(['name' => $s('string|null'), 'phone' => $s('string|null'), 'email' => $s('string|null'), 'company' => $s('string|null')], [], 'A contact to find by phone/email or create.'),
                'pipeline_id' => $s('integer|null', 'Default pipeline when omitted.'), 'stage_id' => $s('integer|null', 'First stage when omitted.'),
                ...$leadFields,
            ]),
            'LeadUpdate' => $obj($leadFields),
            'LeadMove' => $obj(['stage_id' => $s('integer', 'Any stage in any of the organization\'s pipelines.')], ['stage_id']),
            'Pipeline' => $obj([
                ...$meta('pipeline'), 'name' => $s('string'), 'is_default' => $s('boolean'),
                'stages' => $s('array', 'In order.', ['items' => $obj(['id' => $s('integer'), 'object' => $s('string'), 'name' => $s('string'), 'color' => $s('string'), 'position' => $s('integer')])]),
                ...$stamps(),
            ]),
            'Call' => $obj($call),
            'CallDetail' => ['allOf' => [$ref('Call'), $obj([
                'transcript' => $s('array', 'Turns in order: {role, text, …}.', ['items' => ['type' => 'object']]),
                'handoffs' => $s('array', 'Each talker → worker delegation: sequence, status, transcript_delta, reply, duration_ms, tool_calls[].', ['items' => ['type' => 'object']]),
            ])]],
            'Document' => $obj($document),
            'DocumentWithContent' => ['allOf' => [$ref('Document'), $obj(['content' => $s('string|null')])]],
            'DocumentCreate' => $obj(['name' => $s('string'), 'content' => $s('string', 'Plain text or Markdown, up to 500,000 characters.'), 'folder_id' => $s('integer|null'), 'source_url' => $s('string|null')], ['name', 'content']),
            'DocumentUpdate' => $obj(['name' => $s('string'), 'content' => $s('string'), 'folder_id' => $s('integer|null'), 'source_url' => $s('string|null')]),
            'KnowledgeSearchRequest' => $obj(['query' => $s('string', 'At least 3 characters.'), 'limit' => $s('integer', '1–20, default 8.')], ['query']),
            'SearchResult' => $obj([
                'object' => $s('string', '', ['const' => 'search_result']), 'query' => $s('string'),
                'data' => $s('array', 'Best first.', ['items' => $obj(['object' => $s('string'), 'document_id' => $s('integer'), 'document_name' => $s('string|null'), 'position' => $s('integer'), 'score' => $s('integer'), 'excerpt' => $s('string'), 'content' => $s('string')])]),
            ]),
            'ChatSessionCreate' => $obj(['visitor' => $obj([
                'id' => $s('string', 'Your stable id for this visitor (up to 128 characters).'),
                'name' => $s('string|null'), 'email' => $s('string|null', 'Links the chat to an existing contact with this email.'), 'phone' => $s('string|null', 'Links the chat to an existing contact with this phone number.'),
            ], ['id'])], ['visitor']),
            'ChatSession' => $obj([
                'id' => $s('integer'), 'object' => $s('string', '', ['const' => 'chat_session']), 'conversation_id' => $s('integer', 'The Desk conversation; the same as id.'),
                'status' => $s('string'), 'contact_id' => $s('integer|null'), 'visitor' => ['type' => 'object'],
                'session_token' => $s('string', 'Only in the create response. Publishable keys send it as X-Chat-Session-Token.'),
                'created_at' => $ts(), 'updated_at' => $ts(),
            ]),
            'ChatMessageCreate' => $obj(['message' => $s('string', 'Up to 5,000 characters.'), 'stream' => $s('boolean', 'Stream the reply as server-sent events.')], ['message']),
            'ChatReply' => $obj([
                'object' => $s('string', '', ['const' => 'chat_reply']), 'session_id' => $s('integer'),
                'message' => $ref('Message'), 'reply' => $ref('Message'),
                'steps' => $s('array', 'What the agent did to answer: knowledge searches, lookups, actions.', ['items' => $obj(['name' => $s('string'), 'label' => $s('string'), 'detail' => $s('string|null'), 'status' => $s('string'), 'summary' => $s('string|null'), 'ms' => $s('integer|null')])]),
            ]),
            'WebhookEndpoint' => $obj($webhook),
            'WebhookEndpointWithSecret' => ['allOf' => [$ref('WebhookEndpoint'), $obj(['secret' => $s('string', 'The signing secret. Only in the create response.')])]],
            'WebhookEndpointCreate' => $obj([
                'url' => $s('string', 'Must start with https://.'),
                'events' => $s('array', 'Event names, or ["*"] for all.', ['items' => ['type' => 'string', 'enum' => ['*', ...WebhookEndpoint::EVENTS]]]),
            ], ['url', 'events']),
            'Event' => $obj([
                'id' => $s('string', 'evt_…, unique per event.'), 'object' => $s('string', '', ['const' => 'event']),
                'type' => $s('string', '', ['enum' => WebhookEndpoint::EVENTS]), 'created_at' => $ts(), 'organization_id' => $s('integer'),
                'data' => $obj(['object' => $s('object', 'The record, as the API returns it.'), 'previous_attributes' => $s('object', 'Old values of changed fields (*.updated, lead.stage_changed).')]),
            ]),
        ];
    }

    // ── examples ─────────────────────────────────────────────────────────

    private function examples(): array
    {
        $t = ['created_at' => '2026-09-26T09:12:40Z', 'updated_at' => self::TS];
        $contact = ['id' => 42, 'object' => 'contact', 'name' => 'Maya Hartley', 'display_name' => 'Maya Hartley', 'phone' => '+14155552671', 'email' => 'maya@hartley.co', 'company' => 'Hartley & Co', 'stage' => 'qualified', 'source' => 'call', 'value' => 4800, 'owner_id' => 3, 'tags' => ['vip'], 'last_contact_at' => self::TS, ...$t];
        $message = ['id' => 918, 'object' => 'message', 'conversation_id' => 311, 'channel' => 'sms', 'direction' => 'outbound', 'status' => 'queued', 'subject' => null, 'body' => 'Your table for four is confirmed for 7:30 tonight.', 'from' => null, 'to' => '+14155552671', 'from_agent' => false, 'sent_by_user_id' => null, 'read_at' => null, 'created_at' => self::TS, 'updated_at' => self::TS];

        return [
            'me' => ['object' => 'api_key', 'id' => 5, 'name' => 'Helpdesk sync', 'prefix' => 'vy_sk_8fKq2mX', 'type' => 'server', 'scopes' => ['contacts:read', 'tickets:write'], 'organization' => ['id' => 1, 'object' => 'organization', 'name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'America/Chicago'], 'created_at' => '2026-09-20T10:00:00Z', 'last_used_at' => self::TS],
            'contact' => $contact,
            'conversation' => ['id' => 311, 'object' => 'conversation', 'channel' => 'sms', 'status' => 'open', 'subject' => null, 'contact_id' => 42, 'identifier' => ['type' => 'phone', 'value' => '+14155552671'], 'unread_count' => 1, 'last_message_at' => self::TS, 'snoozed_until' => null, ...$t],
            'message' => $message,
            'message_in' => ['id' => 917, 'direction' => 'inbound', 'status' => 'received', 'body' => 'Can I move my booking to 7:30?', 'from' => '+14155552671', 'to' => '+13125550142'] + $message,
            'note' => ['id' => 77, 'object' => 'note', 'parent' => ['object' => 'conversation', 'id' => 311], 'body' => 'Customer prefers a call back after 5pm.', 'author' => null, 'created_at' => self::TS, 'updated_at' => self::TS],
            'ticket' => ['id' => 7, 'object' => 'ticket', 'number' => 12, 'reference' => '#12', 'subject' => 'Refund for double charge', 'body' => 'Charged twice on 26 September.', 'status' => 'open', 'priority' => 'high', 'type' => ['id' => 3, 'name' => 'Billing'], 'contact_id' => 42, 'conversation_id' => null, 'channel' => 'api', 'created_by_agent' => false, 'assignee_ids' => [3], 'tags' => [], 'resolved_at' => null, ...$t],
            'lead' => ['id' => 19, 'object' => 'lead', 'contact_id' => 42, 'contact' => ['id' => 42, 'name' => 'Maya Hartley', 'phone' => '+14155552671', 'email' => 'maya@hartley.co', 'company' => 'Hartley & Co'], 'pipeline_id' => 1, 'stage' => ['id' => 2, 'name' => 'Qualified'], 'source' => 'website', 'value' => 4800, 'next_response_at' => '2026-10-02T15:00:00Z', 'outreach_note' => null, 'assignee_ids' => [], ...$t],
            'pipeline' => ['id' => 1, 'object' => 'pipeline', 'name' => 'Sales', 'is_default' => true, 'stages' => [
                ['id' => 1, 'object' => 'pipeline_stage', 'name' => 'New', 'color' => '#71717a', 'position' => 0],
                ['id' => 2, 'object' => 'pipeline_stage', 'name' => 'Qualified', 'color' => '#3b82f6', 'position' => 1],
                ['id' => 3, 'object' => 'pipeline_stage', 'name' => 'Proposal', 'color' => '#f59e0b', 'position' => 2],
            ], ...$t],
            'call' => $call = ['id' => 205, 'object' => 'call', 'direction' => 'inbound', 'status' => 'completed', 'from' => '+14155552671', 'to' => '+13125550142', 'contact_id' => 42, 'conversation_id' => 310, 'duration_sec' => 247, 'language' => 'en', 'recording_url' => null, 'transferred' => false, 'error' => null, 'summary' => 'Asked to move Friday\'s booking to 7:30; moved and confirmed by text.', ...$t],
            'call_detail' => $call + [
                'transcript' => [['role' => 'assistant', 'text' => 'Thanks for calling Northwind, how can I help?'], ['role' => 'user', 'text' => 'I need to move my booking to 7:30.']],
                'handoffs' => [['sequence' => 1, 'status' => 'completed', 'is_finalization' => false, 'transcript_delta' => "Human: I need to move my booking to 7:30.", 'reply' => 'Moved to 7:30 Friday; confirmation queued by SMS.', 'error' => null, 'duration_ms' => 2140, 'started_at' => self::TS, 'completed_at' => self::TS,
                    'tool_calls' => [['id' => 88, 'action' => 'book_appointment', 'kind' => 'composio', 'status' => 'succeeded', 'arguments' => ['time' => '19:30'], 'result' => ['ok' => true], 'error' => null, 'duration_ms' => 1320, 'created_at' => self::TS]]]],
            ],
            'document' => ['id' => 64, 'object' => 'document', 'name' => 'Returns policy', 'folder_id' => null, 'source_type' => 'api', 'source_url' => null, 'mime' => 'text/markdown', 'size_bytes' => 1840, 'status' => 'ready', 'error' => null, 'chunk_count' => 2, 'retrievable' => true, ...$t],
            'chat_session' => ['id' => 318, 'object' => 'chat_session', 'conversation_id' => 318, 'status' => 'open', 'contact_id' => 12, 'visitor' => ['id' => 'user_8841', 'name' => 'Maria Delgado', 'email' => 'maria.d@example.com'], 'session_token' => 'cs_4f1c9a…', 'created_at' => '2026-09-28T16:02:11+00:00', 'updated_at' => '2026-09-28T16:02:11+00:00'],
            'chat_reply' => [
                'object' => 'chat_reply', 'session_id' => 318,
                'message' => ['id' => 9012, 'object' => 'message', 'conversation_id' => 318, 'channel' => 'web_chat', 'direction' => 'inbound', 'status' => 'received', 'subject' => null, 'body' => 'Do you come out to Evanston?', 'from' => 'api:user_8841', 'to' => null, 'from_agent' => false, 'sent_by_user_id' => null, 'read_at' => null, 'created_at' => '2026-09-28T16:02:15+00:00', 'updated_at' => '2026-09-28T16:02:15+00:00'],
                'reply' => ['id' => 9013, 'object' => 'message', 'conversation_id' => 318, 'channel' => 'web_chat', 'direction' => 'outbound', 'status' => 'sent', 'subject' => null, 'body' => 'Yes, Evanston is in our service area. A diagnostic visit is $89, waived if you go ahead with the repair.', 'from' => null, 'to' => null, 'from_agent' => true, 'sent_by_user_id' => null, 'read_at' => null, 'created_at' => '2026-09-28T16:02:19+00:00', 'updated_at' => '2026-09-28T16:02:19+00:00'],
                'steps' => [['name' => 'search_knowledge', 'label' => 'Searched knowledge', 'detail' => 'Evanston service area', 'status' => 'done', 'summary' => 'Service area: …Evanston, Oak Park and Naperville are inside the area.', 'ms' => 212]],
            ],
            'search' => ['object' => 'search_result', 'query' => 'how long do I have to return something', 'data' => [['object' => 'chunk', 'document_id' => 64, 'document_name' => 'Returns policy', 'position' => 0, 'score' => 4, 'excerpt' => 'Unworn items can be returned within 30 days of delivery…', 'content' => "# Returns\n\nUnworn items can be returned within 30 days of delivery…"]]],
            'webhook' => ['id' => 9, 'object' => 'webhook_endpoint', 'url' => 'https://hooks.example.com/veyra', 'events' => ['ticket.created', 'call.ended'], 'enabled' => true, 'disabled_reason' => null, 'consecutive_failures' => 0, 'last_delivered_at' => self::TS, ...$t],
            'run' => ['id' => 51, 'object' => 'run', 'automation_id' => 4, 'trigger' => 'schedule', 'status' => 'done', 'result' => 'Sent the morning digest.', 'error' => null, 'started_at' => self::TS, 'ended_at' => self::TS, ...$t],
        ];
    }
}
