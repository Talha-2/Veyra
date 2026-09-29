<?php

namespace Tests\Feature;

use App\Models\ApiKey;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * /api/v1/chat: a customer's website or backend talks to their agent, through
 * the same LiveChat service Studio Talk uses, with every turn in Desk.
 */
class PublicChatApiTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.url' => 'http://gateway.test', 'services.agent.secret' => 'secret']);
        $this->org = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);

        $sse = collect([
            ['type' => 'status', 'text' => 'Thinking'],
            ['type' => 'tool', 'id' => 'c1', 'name' => 'search_knowledge', 'status' => 'running', 'label' => 'Searching knowledge', 'detail' => 'Evanston'],
            ['type' => 'tool', 'id' => 'c1', 'name' => 'search_knowledge', 'status' => 'done', 'label' => 'Searched knowledge', 'detail' => 'Evanston', 'ms' => 40],
            ['type' => 'delta', 'text' => 'Yes, Evanston is in our area.'],
            ['type' => 'done', 'content' => 'Yes, Evanston is in our area.', 'tokens' => 9, 'model' => 'gpt-test'],
        ])->map(fn ($e) => 'data: '.json_encode($e)."\n\n")->implode('');
        Http::fake(['http://gateway.test/v1/chat/stream' => Http::response($sse, 200)]);
    }

    private function key(array $scopes = ['chat:write'], bool $publishable = false): string
    {
        Organization::setCurrent($this->org);
        try {
            return ApiKey::mint('Test', $scopes, $publishable, null)[1];
        } finally {
            Organization::setCurrent(null);
        }
    }

    public function test_a_server_key_starts_a_session_and_gets_the_agents_reply_with_its_steps(): void
    {
        $key = $this->key();
        $session = $this->withToken($key)->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'user_1', 'name' => 'Maria']])->assertCreated();
        $this->assertSame('chat_session', $session->json('object'));
        $this->assertStringStartsWith('cs_', $session->json('session_token'));

        // Same visitor again: the same open session, not a new one.
        $this->withToken($key)->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'user_1']])->assertOk()->assertJsonPath('id', $session->json('id'));

        $reply = $this->withToken($key)->postJson('/api/v1/chat/sessions/'.$session->json('id').'/messages', ['message' => 'Do you come out to Evanston?'])->assertOk();
        $this->assertSame('Yes, Evanston is in our area.', $reply->json('reply.body'));
        $this->assertTrue($reply->json('reply.from_agent'));
        $this->assertSame('Searched knowledge', $reply->json('steps.0.label'));

        // Both sides are a normal web-chat conversation in Desk.
        $this->assertSame(['inbound', 'outbound'], Message::withoutGlobalScopes()->orderBy('id')->pluck('direction')->all());
        $this->withToken($key)->getJson('/api/v1/chat/sessions/'.$session->json('id').'/messages')->assertOk()->assertJsonCount(2, 'data');

        Http::assertSent(fn (Request $r) => $r['context']['caller']['identifier']['value'] === 'api:user_1');
    }

    public function test_the_reply_can_stream_as_server_sent_events_ending_with_the_stored_message(): void
    {
        $key = $this->key();
        $id = $this->withToken($key)->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'user_2']])->json('id');

        $body = $this->withToken($key)->post('/api/v1/chat/sessions/'.$id.'/messages', ['message' => 'Evanston?', 'stream' => true], ['Accept' => 'text/event-stream'])->streamedContent();
        $types = collect(explode("\n", $body))->filter(fn ($l) => str_starts_with($l, 'data: '))->map(fn ($l) => json_decode(substr($l, 6), true)['type'])->values()->all();

        $this->assertSame(['status', 'tool', 'tool', 'delta', 'done', 'message'], $types);
    }

    public function test_a_publishable_key_needs_the_session_token_for_everything_after_creating(): void
    {
        $pk = $this->key(['chat:write'], publishable: true);
        $session = $this->withToken($pk)->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'browser_abc']])->assertCreated();
        $id = $session->json('id');

        $this->withToken($pk)->getJson("/api/v1/chat/sessions/{$id}/messages")->assertStatus(403);
        $this->withToken($pk)->withHeader('X-Chat-Session-Token', 'cs_wrong')->postJson("/api/v1/chat/sessions/{$id}/messages", ['message' => 'hi'])->assertStatus(403);
        $this->withToken($pk)->withHeader('X-Chat-Session-Token', $session->json('session_token'))->postJson("/api/v1/chat/sessions/{$id}/messages", ['message' => 'hi'])->assertOk();
    }

    public function test_a_known_customer_is_recognised_by_email(): void
    {
        Organization::setCurrent($this->org);
        $maria = Contact::create(['name' => 'Maria Delgado', 'email' => 'maria.d@example.com']);
        Organization::setCurrent(null);

        $session = $this->withToken($this->key())->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'user_9', 'email' => 'Maria.D@example.com']])->assertCreated();
        $this->assertSame($maria->id, $session->json('contact_id'));
    }

    public function test_a_publishable_key_cannot_take_over_a_session_by_repeating_its_visitor_id(): void
    {
        $pk = $this->key(['chat:write'], publishable: true);
        $first = $this->withToken($pk)->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'browser_abc']])->assertCreated();
        $again = $this->withToken($pk)->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'browser_abc']])->assertCreated();

        $this->assertNotSame($first->json('id'), $again->json('id'), 'a second browser gets its own session');
        $this->assertNotSame($first->json('session_token'), $again->json('session_token'));
        $this->withToken($pk)->withHeader('X-Chat-Session-Token', $again->json('session_token'))
            ->getJson('/api/v1/chat/sessions/'.$first->json('id').'/messages')->assertStatus(403);
    }

    public function test_a_publishable_key_cannot_attach_a_session_to_a_customer_by_email(): void
    {
        Organization::setCurrent($this->org);
        Contact::create(['name' => 'Maria Delgado', 'email' => 'maria.d@example.com', 'phone' => '+15551234567']);
        Organization::setCurrent(null);

        $session = $this->withToken($this->key(['chat:write'], publishable: true))
            ->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'b1', 'email' => 'maria.d@example.com', 'phone' => '+1 555 123 4567']])
            ->assertCreated();
        $this->assertNull($session->json('contact_id'), 'what a browser claims never links a known contact');
    }

    public function test_scope_and_tenancy_are_enforced(): void
    {
        $this->withToken($this->key(['contacts:read']))->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'x']])->assertStatus(403);

        $id = $this->withToken($this->key())->postJson('/api/v1/chat/sessions', ['visitor' => ['id' => 'x']])->json('id');
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        Organization::setCurrent($other);
        $otherKey = ApiKey::mint('Other', ['chat:write'], false, null)[1];
        Organization::setCurrent(null);
        $this->withToken($otherKey)->getJson("/api/v1/chat/sessions/{$id}")->assertNotFound();
        $this->assertSame(1, Conversation::withoutGlobalScopes()->count());
    }

    public function test_the_spec_documents_the_chat_endpoints(): void
    {
        $spec = $this->getJson('/api/v1/openapi.json')->assertOk();
        $this->assertArrayHasKey('/chat/sessions', $spec->json('paths'));
        $this->assertTrue($spec->json('paths./chat/sessions/{id}/messages.post.x-publishable'));
    }
}
