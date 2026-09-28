<?php

namespace Tests\Feature;

use App\Enums\Channel;
use App\Enums\OrganizationRole;
use App\Models\Call;
use App\Models\Conversation;
use App\Models\Document;
use App\Models\Expert;
use App\Models\Message;
use App\Models\Organization;
use App\Models\User;
use App\Services\Knowledge\KnowledgeSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Studio Talk: voice sessions the phone agent answers in a browser room,
 * live chat with the same worker, and the pieces that make both honest
 * (a starter agent for every organization, retrieval that finds prices).
 */
class TalkTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret';

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.url' => null, 'services.agent.secret' => self::SECRET, 'services.livekit' => ['url' => 'wss://example.livekit.cloud', 'key' => 'APIkey', 'secret' => 'livekit-secret']]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
    }

    public function test_starting_voice_opens_a_waiting_call_and_signs_a_room_token(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/studio/talk/voice')->assertOk();

        $call = Call::withoutGlobalScopes()->sole();
        $this->assertSame('web', $call->provider);
        $this->assertSame('ringing', $call->status);
        $this->assertStringStartsWith('web-'.$this->organization->id.'-', $call->room);
        $this->assertSame($call->room, $response->json('room'));

        // An HS256 JWT for that room, signed with the project secret.
        [$head, $claims, $sig] = explode('.', $response->json('token'));
        $payload = json_decode(base64_decode(strtr($claims, '-_', '+/')), true);
        $this->assertSame('APIkey', $payload['iss']);
        $this->assertSame($call->room, $payload['video']['room']);
        $this->assertTrue($payload['video']['roomJoin']);
        $this->assertSame((string) $call->id, $payload['attributes']['veyra.call_id']);
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "{$head}.{$claims}", 'livekit-secret', true)), '+/', '-_'), '=');
        $this->assertSame($expected, $sig);
    }

    public function test_voice_says_so_when_livekit_is_not_configured(): void
    {
        config(['services.livekit' => ['url' => null, 'key' => null, 'secret' => null]]);
        $this->actingAs($this->owner)->postJson('/studio/talk/voice')->assertStatus(503)->assertJsonFragment(['message' => 'Voice needs LiveKit: set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.']);
    }

    public function test_the_voice_worker_claims_a_browser_room_once_and_gets_the_call_bundle(): void
    {
        $room = $this->actingAs($this->owner)->postJson('/studio/talk/voice')->json('room');

        $first = $this->withToken(self::SECRET)->postJson('/api/agent/v1/calls/web', ['room' => $room])->assertCreated();
        $this->assertSame('northwind', $first->json('organization.slug'));
        $this->assertSame('web', $first->json('line.e164'));
        $this->assertSame('web_session', $first->json('caller.identifier.type'));
        $this->assertNotEmpty($first->json('experts'), 'a starter agent exists even for an organization that never configured one');
        $this->assertSame('in-progress', Call::withoutGlobalScopes()->sole()->status);

        // A retry (worker restarted) gets the same call back, not a new one.
        $this->withToken(self::SECRET)->postJson('/api/agent/v1/calls/web', ['room' => $room])->assertOk();

        // Unknown, non-web or stale rooms are refused.
        $this->withToken(self::SECRET)->postJson('/api/agent/v1/calls/web', ['room' => 'web-9-nope'])->assertNotFound();
        $this->withToken(self::SECRET)->postJson('/api/agent/v1/calls/web', ['room' => 'sip-room'])->assertStatus(422);
        Call::withoutGlobalScopes()->update(['created_at' => now()->subMinutes(20)]);
        $this->withToken(self::SECRET)->postJson('/api/agent/v1/calls/web', ['room' => $room])->assertNotFound();
        $this->withToken('wrong')->postJson('/api/agent/v1/calls/web', ['room' => $room])->assertStatus(401);
    }

    public function test_live_chat_relays_the_agent_and_records_both_sides_in_desk(): void
    {
        config(['services.agent.url' => 'http://gateway.test']);
        $sse = collect([
            ['type' => 'tool', 'id' => 'c1', 'name' => 'search_knowledge', 'status' => 'running', 'label' => 'Searching knowledge'],
            ['type' => 'tool', 'id' => 'c1', 'name' => 'search_knowledge', 'status' => 'done', 'label' => 'Searched knowledge', 'summary' => 'Evanston: yes'],
            ['type' => 'delta', 'text' => 'Yes, we come out to Evanston.'],
            ['type' => 'done', 'content' => 'Yes, we come out to Evanston.', 'tokens' => 12, 'model' => 'gpt-test'],
        ])->map(fn ($e) => 'data: '.json_encode($e)."\n\n")->implode('');
        Http::fake(['http://gateway.test/v1/chat/stream' => Http::response($sse, 200)]);

        $events = collect(explode("\n", $this->actingAs($this->owner)->post('/studio/talk/chat', ['message' => 'Do you come out to Evanston?'])->streamedContent()))
            ->filter(fn ($l) => str_starts_with($l, 'data: '))->map(fn ($l) => json_decode(substr($l, 6), true))->values();

        $this->assertSame('conversation', $events[0]['type']);
        $conversation = Conversation::withoutGlobalScopes()->sole();
        $this->assertSame(Channel::WebChat, $conversation->channel);

        $messages = Message::withoutGlobalScopes()->orderBy('id')->get();
        $this->assertSame(['inbound', 'outbound'], $messages->pluck('direction')->all());
        $this->assertTrue((bool) $messages[1]->from_agent);
        $this->assertSame('Yes, we come out to Evanston.', $messages[1]->body);
        $this->assertSame('done', $messages[1]->meta['steps'][0]['status']);

        Http::assertSent(fn (Request $r) => $r->url() === 'http://gateway.test/v1/chat/stream'
            && $r['conversation_id'] === $conversation->id
            && $r['context']['organization']['slug'] === 'northwind'
            && $r['context']['caller']['identifier']['type'] === 'web_session');
    }

    public function test_a_new_organization_gets_a_working_agent(): void
    {
        $user = User::create(['name' => 'Sam New', 'email' => 'sam@new.test', 'password' => 'password']);
        $this->actingAs($user)->post('/onboarding/organization', ['name' => 'Harbor Plumbing', 'timezone' => 'UTC'])->assertRedirect();

        $org = Organization::query()->where('name', 'Harbor Plumbing')->sole();
        Organization::setCurrent($org);
        try {
            $this->assertSame(['front-desk', 'operations'], Expert::query()->orderBy('position')->pluck('slug')->all());
            $this->assertSame(['create_ticket', 'find_contact'], Expert::query()->where('slug', 'operations')->sole()->actions()->pluck('slug')->sort()->values()->all());
        } finally {
            Organization::setCurrent(null);
        }
    }

    public function test_retrieval_finds_a_price_asked_for_in_other_words(): void
    {
        Organization::setCurrent($this->organization);
        try {
            $pricing = Document::create(['name' => 'Pricing and deposits', 'content' => 'A diagnostic visit is $89, waived if the customer proceeds with the repair.', 'status' => 'ready', 'source_type' => 'created']);
            $pricing->chunks()->create(['organization_id' => $this->organization->id, 'position' => 0, 'content' => $pricing->content]);
            $area = Document::create(['name' => 'Service area', 'content' => 'We serve the Chicago metro, including Evanston.', 'status' => 'ready', 'source_type' => 'created']);
            $area->chunks()->create(['organization_id' => $this->organization->id, 'position' => 0, 'content' => $area->content]);

            $search = app(KnowledgeSearch::class);
            foreach (['service call price', 'how much is a visit', 'what does it cost'] as $q) {
                $names = collect($search->search($q)['results'])->pluck('document')->all();
                $this->assertContains('Pricing and deposits', $names, "\"{$q}\" should reach the pricing document");
            }
        } finally {
            Organization::setCurrent(null);
        }
    }
}
