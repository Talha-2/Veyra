<?php

namespace Tests\Feature;

use App\Enums\Channel;
use App\Enums\IdentifierType;
use App\Enums\OrganizationRole;
use App\Models\ApiKey;
use App\Models\Call;
use App\Models\CallTranscript;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Document;
use App\Models\Identifier;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Ticket;
use App\Models\User;
use App\Support\PublicApi\OpenApiSpec;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The public API (/api/v1), from an integrator's side of the wire: keys,
 * scopes, tenancy, pagination, the error shape, rate limits, every resource,
 * and the OpenAPI document staying in step with the routes.
 */
class PublicApiTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;

    private Organization $other;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->other = Organization::create(['name' => 'Lakeside', 'slug' => 'lakeside', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->org->addMember($this->owner, OrganizationRole::Owner);
    }

    private function as(Organization $org, callable $fn): mixed
    {
        Organization::setCurrent($org);
        try {
            return $fn();
        } finally {
            Organization::setCurrent(null);
        }
    }

    /** A plaintext key for the organization. */
    private function key(array $scopes = ApiKey::SCOPES, ?Organization $org = null, bool $publishable = false): string
    {
        return $this->as($org ?? $this->org, fn () => ApiKey::mint('Test', $scopes, $publishable, null)[1]);
    }

    private function api(string $key): static
    {
        return $this->withToken($key)->withHeader('Accept', 'application/json');
    }

    // ── authentication ──────────────────────────────────────────────────

    public function test_missing_invalid_and_revoked_keys_are_401_with_the_error_shape(): void
    {
        $this->getJson('/api/v1/me')->assertStatus(401)->assertJsonPath('error.type', 'authentication_error');
        $this->api('vy_sk_'.str_repeat('x', 40))->getJson('/api/v1/me')->assertStatus(401)->assertJsonPath('error.type', 'authentication_error');
        $this->api('not-a-key')->getJson('/api/v1/me')->assertStatus(401);

        $secret = $this->key();
        $this->api($secret)->getJson('/api/v1/me')->assertOk()
            ->assertJsonPath('object', 'api_key')->assertJsonPath('organization.id', $this->org->id)->assertJsonPath('type', 'server');

        ApiKey::withoutGlobalScopes()->firstOrFail()->revoke();
        $this->api($secret)->getJson('/api/v1/me')->assertStatus(401)->assertJsonPath('error.type', 'authentication_error')
            ->assertJson(fn ($json) => $json->where('error.message', fn ($m) => str_contains($m, 'revoked'))->etc());
    }

    public function test_last_used_is_stamped_at_most_once_a_minute(): void
    {
        $secret = $this->key();
        $this->api($secret)->getJson('/api/v1/me')->assertOk();
        $first = ApiKey::withoutGlobalScopes()->firstOrFail()->last_used_at;
        $this->assertNotNull($first);

        $this->travel(20)->seconds();
        $this->api($secret)->getJson('/api/v1/me')->assertOk();
        $this->assertTrue(ApiKey::withoutGlobalScopes()->firstOrFail()->last_used_at->equalTo($first));

        $this->travel(2)->minutes();
        $this->api($secret)->getJson('/api/v1/me')->assertOk();
        $this->assertTrue(ApiKey::withoutGlobalScopes()->firstOrFail()->last_used_at->gt($first));
    }

    // ── scopes ──────────────────────────────────────────────────────────

    public function test_a_route_needs_its_scope(): void
    {
        $reader = $this->key(['contacts:read']);

        $this->api($reader)->getJson('/api/v1/contacts')->assertOk();
        $this->api($reader)->postJson('/api/v1/contacts', ['name' => 'X'])->assertStatus(403)
            ->assertJsonPath('error.type', 'insufficient_scope')->assertJsonPath('error.required_scope', 'contacts:write');
        $this->api($reader)->getJson('/api/v1/tickets')->assertStatus(403)->assertJsonPath('error.required_scope', 'tickets:read');
        $this->assertSame(0, Contact::withoutGlobalScopes()->count());
    }

    public function test_publishable_keys_only_reach_publishable_routes(): void
    {
        $pk = $this->key(['knowledge:read'], publishable: true);
        $this->assertStringStartsWith('vy_pk_', $pk);

        $this->api($pk)->getJson('/api/v1/me')->assertOk()->assertJsonPath('type', 'publishable');
        $this->api($pk)->postJson('/api/v1/knowledge/search', ['query' => 'returns policy'])->assertOk()->assertJsonPath('object', 'search_result');
        $this->api($pk)->getJson('/api/v1/knowledge/documents')->assertStatus(403)->assertJsonPath('error.type', 'permission_error');
    }

    public function test_the_studio_refuses_server_scopes_on_a_publishable_key(): void
    {
        $this->actingAs($this->owner)->post('/studio/developer/keys', ['name' => 'Widget', 'scopes' => ['tickets:write'], 'publishable' => true])
            ->assertSessionHasErrors('scopes.0');
        $this->actingAs($this->owner)->post('/studio/developer/keys', ['name' => 'Widget', 'scopes' => ['knowledge:read'], 'publishable' => true])
            ->assertSessionHas('new_key', fn ($k) => str_starts_with($k, 'vy_pk_'));
    }

    // ── tenancy ─────────────────────────────────────────────────────────

    public function test_a_key_never_sees_another_organization(): void
    {
        $mine = $this->as($this->org, fn () => Contact::create(['name' => 'Mine']));
        $theirs = $this->as($this->other, fn () => Contact::create(['name' => 'Theirs', 'email' => 'theirs@example.com']));
        $theirTicket = $this->as($this->other, fn () => Ticket::create(['subject' => 'Theirs']));
        $key = $this->key();

        $this->api($key)->getJson('/api/v1/contacts')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);
        $this->api($key)->getJson("/api/v1/contacts/{$theirs->id}")->assertNotFound()->assertJsonPath('error.type', 'not_found');
        $this->api($key)->patchJson("/api/v1/contacts/{$theirs->id}", ['name' => 'Hijacked'])->assertNotFound();
        $this->api($key)->deleteJson("/api/v1/contacts/{$theirs->id}")->assertNotFound();
        $this->api($key)->getJson('/api/v1/contacts/lookup?email=theirs@example.com')->assertNotFound();
        $this->api($key)->getJson("/api/v1/tickets/{$theirTicket->id}")->assertNotFound();

        // Referencing another tenant's record in a write is a validation error, not a link.
        $this->api($key)->postJson('/api/v1/tickets', ['subject' => 'Sneaky', 'contact_id' => $theirs->id])
            ->assertStatus(422)->assertJsonPath('error.type', 'validation_error')->assertJsonStructure(['error' => ['fields' => ['contact_id']]]);

        $this->assertSame('Theirs', $theirs->fresh()->name);
        $this->assertNull(Ticket::withoutGlobalScopes()->where('subject', 'Sneaky')->first());

        // The other organization's key sees only its own.
        $this->api($this->key(org: $this->other))->getJson('/api/v1/contacts')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $theirs->id);
    }

    // ── lists ───────────────────────────────────────────────────────────

    public function test_lists_are_cursor_paginated_newest_first(): void
    {
        $ids = $this->as($this->org, fn () => collect(range(1, 5))->map(fn ($i) => Contact::create(['name' => "Person {$i}"])->id));
        $key = $this->key(['contacts:read']);

        $first = $this->api($key)->getJson('/api/v1/contacts?limit=2')->assertOk()
            ->assertJsonPath('object', 'list')->assertJsonPath('has_more', true)->assertJsonCount(2, 'data');
        $this->assertSame([$ids[4], $ids[3]], array_column($first->json('data'), 'id'));

        $second = $this->api($key)->getJson('/api/v1/contacts?limit=2&cursor='.urlencode($first->json('next_cursor')))->assertOk();
        $this->assertSame([$ids[2], $ids[1]], array_column($second->json('data'), 'id'));

        $last = $this->api($key)->getJson('/api/v1/contacts?limit=2&cursor='.urlencode($second->json('next_cursor')))->assertOk()
            ->assertJsonPath('has_more', false)->assertJsonPath('next_cursor', null);
        $this->assertSame([$ids[0]], array_column($last->json('data'), 'id'));

        $this->api($key)->getJson('/api/v1/contacts?limit=0')->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['limit']]]);
        $this->api($key)->getJson('/api/v1/contacts?limit=500')->assertStatus(422);
        $this->api($key)->getJson('/api/v1/contacts?cursor=garbage')->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['cursor']]]);
    }

    public function test_updated_since_and_filters(): void
    {
        $this->as($this->org, function () {
            Contact::create(['name' => 'Old Oliver', 'stage' => 'won']);
            $this->travel(1)->days();
            Contact::create(['name' => 'New Nora', 'stage' => 'qualified', 'email' => 'nora@example.com']);
        });
        $key = $this->key(['contacts:read']);
        $since = now()->subHours(1)->utc()->toIso8601ZuluString();

        $this->api($key)->getJson('/api/v1/contacts?updated_since='.urlencode($since))->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'New Nora');
        $this->api($key)->getJson('/api/v1/contacts?stage=won')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Old Oliver');
        $this->api($key)->getJson('/api/v1/contacts?q=nora')->assertJsonCount(1, 'data');
        $this->api($key)->getJson('/api/v1/contacts?stage=nonsense')->assertStatus(422);
    }

    // ── rate limit ──────────────────────────────────────────────────────

    public function test_rate_limit_headers_and_429(): void
    {
        config(['public_api.rate_limit' => 3]);
        $key = $this->key();

        $this->api($key)->getJson('/api/v1/me')->assertOk()
            ->assertHeader('X-RateLimit-Limit', '3')->assertHeader('X-RateLimit-Remaining', '2')->assertHeader('X-RateLimit-Reset');
        $this->api($key)->getJson('/api/v1/me')->assertHeader('X-RateLimit-Remaining', '1');
        $this->api($key)->getJson('/api/v1/contacts/999')->assertNotFound()->assertHeader('X-RateLimit-Remaining', '0');
        $this->api($key)->getJson('/api/v1/me')->assertStatus(429)
            ->assertJsonPath('error.type', 'rate_limited')->assertHeader('Retry-After')->assertHeader('X-RateLimit-Remaining', '0');

        // Per key: another key is unaffected.
        $this->api($this->key())->getJson('/api/v1/me')->assertOk();
    }

    // ── contacts ────────────────────────────────────────────────────────

    public function test_contacts_crud_lookup_and_uniqueness(): void
    {
        $key = $this->key();
        // An earlier call from this number, before anyone knew who it was.
        $conversation = $this->as($this->org, fn () => Conversation::create(['identifier_id' => Identifier::resolve(IdentifierType::Phone, '+14155552671')->id, 'channel' => Channel::Call, 'status' => 'open']));

        $this->api($key)->postJson('/api/v1/contacts', [])->assertStatus(422)->assertJsonStructure(['error' => ['type', 'message', 'fields' => ['name']]]);

        $created = $this->api($key)->postJson('/api/v1/contacts', ['name' => 'Maya Hartley', 'phone' => '(415) 555-2671', 'email' => 'Maya@Hartley.co', 'tags' => ['vip']])
            ->assertCreated()->assertJsonPath('object', 'contact')->assertJsonPath('phone', '+4155552671')->assertJsonPath('email', 'maya@hartley.co')
            ->assertJsonPath('tags', ['vip'])->assertJsonPath('source', 'api');
        $id = $created->json('id');
        $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $created->json('created_at'));

        $this->api($key)->postJson('/api/v1/contacts', ['name' => 'Dup', 'email' => 'maya@hartley.co'])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['email']]]);

        $this->api($key)->getJson('/api/v1/contacts/lookup?email=MAYA@hartley.co')->assertOk()->assertJsonPath('id', $id);
        $this->api($key)->getJson('/api/v1/contacts/lookup?email=nobody@example.com')->assertNotFound();
        $this->api($key)->getJson('/api/v1/contacts/lookup')->assertStatus(422);

        $this->api($key)->patchJson("/api/v1/contacts/{$id}", ['stage' => 'qualified', 'value' => 4800])->assertOk()
            ->assertJsonPath('stage', 'qualified')->assertJsonPath('value', 4800)->assertJsonPath('name', 'Maya Hartley');

        // Setting the number the earlier call came from brings that conversation into the contact's history.
        $this->api($key)->patchJson("/api/v1/contacts/{$id}", ['phone' => '+1 415 555 2671'])->assertOk();
        $this->assertSame($id, $conversation->fresh()->contact_id);

        $this->api($key)->deleteJson("/api/v1/contacts/{$id}")->assertOk()->assertJson(['id' => $id, 'object' => 'contact', 'deleted' => true]);
        $this->api($key)->getJson("/api/v1/contacts/{$id}")->assertNotFound();
    }

    // ── conversations and messages ──────────────────────────────────────

    public function test_conversations_messages_and_notes(): void
    {
        $key = $this->key();
        $conversation = $this->as($this->org, function () {
            $c = Conversation::create(['identifier_id' => Identifier::resolve(IdentifierType::Phone, '+14155550100')->id, 'channel' => Channel::Sms, 'status' => 'open']);
            Message::create(['conversation_id' => $c->id, 'channel' => Channel::Sms, 'direction' => 'inbound', 'status' => 'received', 'body' => 'Hello?']);

            return $c;
        });

        $this->api($key)->getJson('/api/v1/conversations?channel=sms')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.identifier.value', '+14155550100');
        $this->api($key)->getJson("/api/v1/conversations/{$conversation->id}")->assertOk()
            ->assertJsonPath('messages.data.0.body', 'Hello?')->assertJsonPath('messages.has_more', false);

        $this->api($key)->postJson("/api/v1/conversations/{$conversation->id}/messages", ['body' => 'Hi, how can we help?'])
            ->assertCreated()->assertJsonPath('object', 'message')->assertJsonPath('status', 'queued')->assertJsonPath('direction', 'outbound')->assertJsonPath('to', '+14155550100');
        $this->api($key)->getJson("/api/v1/conversations/{$conversation->id}/messages?direction=outbound")->assertJsonCount(1, 'data');

        $this->api($key)->postJson("/api/v1/conversations/{$conversation->id}/notes", ['body' => 'VIP'])->assertCreated()
            ->assertJsonPath('object', 'note')->assertJsonPath('parent.object', 'conversation')->assertJsonPath('author', null);
        $this->api($key)->getJson("/api/v1/conversations/{$conversation->id}/notes")->assertJsonCount(1, 'data');

        // To an address: joins the existing thread.
        $this->api($key)->postJson('/api/v1/messages', ['channel' => 'sms', 'to' => '+1 415 555 0100', 'body' => 'Following up'])
            ->assertCreated()->assertJsonPath('conversation_id', $conversation->id);
        // A new email thread.
        $email = $this->api($key)->postJson('/api/v1/messages', ['channel' => 'email', 'to' => 'new@example.com', 'subject' => 'Hi', 'body' => 'Welcome'])->assertCreated();
        $this->assertNotSame($conversation->id, $email->json('conversation_id'));
        $this->api($key)->postJson('/api/v1/messages', ['channel' => 'call', 'to' => '+14155550100', 'body' => 'x'])->assertStatus(422);

        // Blocked addresses are refused.
        $this->as($this->org, fn () => $conversation->identifier->update(['blocked_at' => now()]));
        $this->api($key)->postJson("/api/v1/conversations/{$conversation->id}/messages", ['body' => 'x'])->assertStatus(422)->assertJsonPath('error.type', 'not_permitted');

        // Writing needs messages:write, reading does not grant it.
        $this->api($this->key(['conversations:read']))->postJson("/api/v1/conversations/{$conversation->id}/notes", ['body' => 'x'])->assertStatus(403);
    }

    // ── tickets ─────────────────────────────────────────────────────────

    public function test_tickets_create_update_and_notes(): void
    {
        $key = $this->key();
        $contact = $this->as($this->org, fn () => Contact::create(['name' => 'Maya']));

        $this->api($key)->postJson('/api/v1/tickets', ['priority' => 'whenever'])->assertStatus(422)
            ->assertJsonStructure(['error' => ['fields' => ['subject', 'priority']]]);

        $ticket = $this->api($key)->postJson('/api/v1/tickets', ['subject' => 'Refund', 'priority' => 'high', 'contact_id' => $contact->id, 'tags' => ['billing']])
            ->assertCreated()->assertJsonPath('object', 'ticket')->assertJsonPath('number', 1)->assertJsonPath('reference', '#1')
            ->assertJsonPath('status', 'open')->assertJsonPath('priority', 'high')->assertJsonPath('channel', 'api')->assertJsonPath('tags', ['billing']);
        $id = $ticket->json('id');

        $this->api($key)->patchJson("/api/v1/tickets/{$id}", ['status' => 'resolved'])->assertOk()
            ->assertJsonPath('status', 'resolved')->assertJson(fn ($j) => $j->whereNot('resolved_at', null)->etc());
        $this->api($key)->patchJson("/api/v1/tickets/{$id}", ['status' => 'open'])->assertOk()->assertJsonPath('resolved_at', null);

        $this->api($key)->postJson("/api/v1/tickets/{$id}/notes", ['body' => 'Refunded.'])->assertCreated()->assertJsonPath('parent', ['object' => 'ticket', 'id' => $id]);
        $this->api($key)->getJson("/api/v1/tickets/{$id}/notes")->assertJsonCount(1, 'data');
        $this->api($key)->getJson('/api/v1/tickets?number=1')->assertJsonCount(1, 'data');
        $this->api($key)->getJson('/api/v1/tickets?status=closed')->assertJsonCount(0, 'data');
    }

    // ── leads ───────────────────────────────────────────────────────────

    public function test_leads_create_inline_contact_and_move_stage(): void
    {
        $key = $this->key();
        [$pipeline, $new, $won] = $this->as($this->org, function () {
            $p = Pipeline::create(['name' => 'Sales', 'is_default' => true]);

            return [$p, PipelineStage::create(['pipeline_id' => $p->id, 'name' => 'New', 'position' => 0]), PipelineStage::create(['pipeline_id' => $p->id, 'name' => 'Won', 'position' => 1])];
        });
        $foreignStage = $this->as($this->other, fn () => PipelineStage::create(['pipeline_id' => Pipeline::create(['name' => 'Theirs'])->id, 'name' => 'X']));

        $this->api($key)->getJson('/api/v1/pipelines')->assertOk()->assertJsonPath('data.0.stages.1.name', 'Won');

        $lead = $this->api($key)->postJson('/api/v1/leads', ['contact' => ['name' => 'Maya', 'email' => 'maya@example.com'], 'value' => 4800, 'source' => 'website'])
            ->assertCreated()->assertJsonPath('object', 'lead')->assertJsonPath('pipeline_id', $pipeline->id)
            ->assertJsonPath('stage.id', $new->id)->assertJsonPath('contact.email', 'maya@example.com')->assertJsonPath('value', 4800);

        // The same person again is the same contact.
        $again = $this->api($key)->postJson('/api/v1/leads', ['contact' => ['email' => 'MAYA@example.com']])->assertCreated();
        $this->assertSame($lead->json('contact_id'), $again->json('contact_id'));

        $id = $lead->json('id');
        $this->api($key)->postJson("/api/v1/leads/{$id}/move", ['stage_id' => $won->id])->assertOk()->assertJsonPath('stage.name', 'Won');
        $this->api($key)->postJson("/api/v1/leads/{$id}/move", ['stage_id' => $foreignStage->id])->assertStatus(422);
        $this->api($key)->patchJson("/api/v1/leads/{$id}", ['value' => 6000, 'next_response_at' => '2026-10-02T15:00:00Z'])->assertOk()
            ->assertJsonPath('value', 6000)->assertJsonPath('next_response_at', '2026-10-02T15:00:00Z');
        $this->api($key)->getJson("/api/v1/leads?stage_id={$won->id}")->assertJsonCount(1, 'data');
        $this->api($key)->postJson('/api/v1/leads', [])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['contact_id', 'contact']]]);
    }

    // ── calls ───────────────────────────────────────────────────────────

    public function test_calls_list_and_detail_with_transcript(): void
    {
        $call = $this->as($this->org, function () {
            $call = Call::create(['direction' => 'inbound', 'from_number' => '+14155552671', 'to_number' => '+13125550142', 'status' => 'completed']);
            CallTranscript::create(['call_id' => $call->id, 'items' => [['role' => 'user', 'text' => 'Hi']], 'summary' => 'Asked about hours.']);

            return $call;
        });
        $key = $this->key(['calls:read']);

        $this->api($key)->getJson('/api/v1/calls')->assertOk()->assertJsonPath('data.0.summary', 'Asked about hours.')->assertJsonMissingPath('data.0.transcript');
        $this->api($key)->getJson("/api/v1/calls/{$call->id}")->assertOk()
            ->assertJsonPath('transcript.0.text', 'Hi')->assertJsonPath('handoffs', [])->assertJsonPath('from', '+14155552671');
    }

    // ── knowledge ───────────────────────────────────────────────────────

    public function test_knowledge_documents_and_search(): void
    {
        $key = $this->key();
        // The agent's own memory is not part of the knowledge API.
        $this->as($this->org, fn () => Document::create(['name' => 'Memory', 'source_type' => 'agent', 'content' => 'Returns secret memory note', 'status' => 'ready'])->reindex());

        $doc = $this->api($key)->postJson('/api/v1/knowledge/documents', ['name' => 'Returns policy', 'content' => "# Returns\n\nUnworn items can be returned within 30 days."])
            ->assertCreated()->assertJsonPath('status', 'ready')->assertJsonPath('retrievable', true)->assertJsonPath('source_type', 'api');
        $id = $doc->json('id');

        $this->api($key)->getJson('/api/v1/knowledge/documents')->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.content');
        $this->api($key)->getJson("/api/v1/knowledge/documents/{$id}")->assertJsonPath('content', "# Returns\n\nUnworn items can be returned within 30 days.");

        $hits = $this->api($key)->postJson('/api/v1/knowledge/search', ['query' => 'returned within days'])->assertOk()->json('data');
        $this->assertSame([$id], array_values(array_unique(array_column($hits, 'document_id'))));

        $this->api($key)->patchJson("/api/v1/knowledge/documents/{$id}", ['content' => 'Now 45 days for returns.'])->assertOk()->assertJsonPath('chunk_count', 1);
        $this->api($key)->postJson('/api/v1/knowledge/search', ['query' => 'x'])->assertStatus(422);
        $this->api($key)->deleteJson("/api/v1/knowledge/documents/{$id}")->assertOk()->assertJsonPath('deleted', true);
        $this->api($key)->postJson('/api/v1/knowledge/search', ['query' => 'returns'])->assertJsonCount(0, 'data');
    }

    // ── webhook endpoints ───────────────────────────────────────────────

    public function test_webhook_endpoints_via_the_api(): void
    {
        $key = $this->key();

        $this->api($key)->postJson('/api/v1/webhook-endpoints', ['url' => 'http://insecure.example', 'events' => ['*']])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['url']]]);
        $this->api($key)->postJson('/api/v1/webhook-endpoints', ['url' => 'https://hooks.example.com/x', 'events' => ['nope.happened']])->assertStatus(422);

        $created = $this->api($key)->postJson('/api/v1/webhook-endpoints', ['url' => 'https://hooks.example.com/x', 'events' => ['ticket.created']])
            ->assertCreated()->assertJsonPath('object', 'webhook_endpoint')->assertJsonPath('enabled', true);
        $this->assertStringStartsWith('whsec_', $created->json('secret'));
        $id = $created->json('id');

        $this->api($key)->getJson('/api/v1/webhook-endpoints')->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.secret');
        $this->api($key)->getJson("/api/v1/webhook-endpoints/{$id}")->assertOk()->assertJsonMissingPath('secret');
        $this->api($key)->deleteJson("/api/v1/webhook-endpoints/{$id}")->assertOk()->assertJsonPath('deleted', true);
        $this->api($key)->getJson('/api/v1/webhook-endpoints')->assertJsonCount(0, 'data');
    }

    // ── the document ────────────────────────────────────────────────────

    public function test_the_openapi_document_covers_every_route_and_scope(): void
    {
        $spec = $this->getJson('/api/v1/openapi.json')->assertOk()->assertJsonPath('openapi', '3.1.0')->json();

        $normalize = fn (string $path) => preg_replace('/\{[^}]+\}/', '{}', $path);
        $documented = [];
        foreach ($spec['paths'] as $path => $ops) {
            foreach ($ops as $method => $op) {
                $documented[] = strtoupper($method).' '.$normalize($path);
                if (array_key_exists('x-scope', $op) && $op['x-scope'] !== null) {
                    $this->assertContains($op['x-scope'], ApiKey::SCOPES, "{$path} documents an unknown scope");
                }
            }
        }

        $routed = [];
        $usedScopes = [];
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/')) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $routed[] = $method.' '.$normalize(substr($route->uri(), strlen('api/v1')));
            }
            $action = $route->getAction();
            if ($route->uri() !== 'api/v1/openapi.json') {
                $this->assertArrayHasKey('api_scope', $action, "{$route->uri()} declares no scope");
            }
            if (! empty($action['api_scope'])) {
                $usedScopes[] = $action['api_scope'];
            }
        }

        sort($documented);
        sort($routed);
        $this->assertSame($routed, $documented, 'routes/api_v1.php and OpenApiSpec disagree');
        $this->assertEqualsCanonicalizing(ApiKey::SCOPES, array_values(array_unique($usedScopes)), 'every scope has a route and every route scope is listed');
        $this->assertSame(array_keys(\App\Models\WebhookEndpoint::EVENT_DESCRIPTIONS), \App\Models\WebhookEndpoint::EVENTS);
        $this->assertSame(\App\Models\WebhookEndpoint::EVENTS, array_keys($spec['webhooks']));
        $this->assertIsArray(OpenApiSpec::build('https://example.test/api/v1'));
    }

    public function test_the_public_reference_needs_no_sign_in(): void
    {
        $this->get('/docs/api')->assertOk()->assertInertia(fn ($page) => $page->component('docs/api')->has('spec.paths'));
    }
}
