<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AgentThread;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The Ask stream relay: the app opens an SSE stream to the agent gateway,
 * passes every event through to the browser, and saves the finished turn.
 */
class AskStreamTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.url' => null]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
    }

    private function sse(array ...$events): string
    {
        return collect($events)->map(fn ($e) => 'data: '.json_encode($e)."\n\n")->implode('');
    }

    private function events(string $body): array
    {
        return collect(explode("\n", $body))
            ->filter(fn ($l) => str_starts_with($l, 'data: '))
            ->map(fn ($l) => json_decode(substr($l, 6), true))
            ->values()->all();
    }

    public function test_a_turn_is_relayed_and_saved_with_its_tool_steps(): void
    {
        config(['services.agent.url' => 'http://gateway.test', 'services.agent.secret' => 'secret']);
        Http::fake(['http://gateway.test/v1/threads/stream' => Http::response($this->sse(
            ['type' => 'status', 'text' => 'Thinking'],
            ['type' => 'tool', 'id' => 'c1', 'name' => 'search_knowledge', 'status' => 'running', 'label' => 'Searching knowledge', 'detail' => 'evanston'],
            ['type' => 'tool', 'id' => 'c1', 'name' => 'search_knowledge', 'status' => 'done', 'label' => 'Searched knowledge', 'summary' => 'Evanston: yes', 'ms' => 40],
            ['type' => 'delta', 'text' => 'Yes, Evanston '],
            ['type' => 'delta', 'text' => 'is covered.'],
            ['type' => 'done', 'content' => 'Yes, Evanston is covered.', 'tokens' => 30, 'model' => 'gpt-test'],
        ), 200, ['Content-Type' => 'text/event-stream'])]);

        $response = $this->actingAs($this->owner)->post('/studio/ask/stream', ['message' => 'Do we serve Evanston?']);
        $response->assertOk();
        $this->assertStringStartsWith('text/event-stream', $response->headers->get('Content-Type'));

        $events = $this->events($response->streamedContent());
        $thread = AgentThread::withoutGlobalScopes()->firstOrFail();

        $this->assertSame(['type' => 'thread', 'id' => $thread->id, 'title' => 'Do we serve Evanston?'], $events[0]);
        $this->assertSame(['status', 'tool', 'tool', 'delta', 'delta', 'done'], array_column(array_slice($events, 1), 'type'));

        $this->assertCount(2, $thread->messages);
        $reply = $thread->messages[1];
        $this->assertSame('assistant', $reply['role']);
        $this->assertSame('Yes, Evanston is covered.', $reply['content']);
        $this->assertSame(['tool', 'text'], array_column($reply['parts'], 'type'));
        $this->assertSame('done', $reply['parts'][0]['status'], 'the running step is updated in place, not duplicated');
        $this->assertSame(30, $reply['tokens']);

        Http::assertSent(fn (Request $r) => $r->url() === 'http://gateway.test/v1/threads/stream'
            && $r['thread_id'] === $thread->id && $r['history'] === [] && $r['organization_id'] === $this->organization->id);
    }

    public function test_a_follow_up_sends_the_finished_history(): void
    {
        config(['services.agent.url' => 'http://gateway.test', 'services.agent.secret' => 'secret']);
        Http::fake(['http://gateway.test/v1/threads/stream' => Http::response($this->sse(['type' => 'done', 'content' => '$89.', 'tokens' => 5]), 200)]);

        Organization::setCurrent($this->organization);
        $thread = AgentThread::create(['user_id' => $this->owner->id, 'title' => 'Fees', 'messages' => [
            ['role' => 'user', 'content' => 'What is the diagnostic visit?'],
            ['role' => 'assistant', 'content' => 'A technician inspects the system.'],
            ['role' => 'user', 'content' => 'Unanswered one'],
            ['role' => 'assistant', 'content' => '', 'error' => 'The agent failed.'],
        ]]);
        Organization::setCurrent(null);

        $this->actingAs($this->owner)->post('/studio/ask/stream', ['message' => 'And the fee?', 'thread_id' => $thread->id])->streamedContent();

        Http::assertSent(fn (Request $r) => $r['history'] === [
            ['role' => 'user', 'content' => 'What is the diagnostic visit?'],
            ['role' => 'assistant', 'content' => 'A technician inspects the system.'],
            ['role' => 'user', 'content' => 'Unanswered one'],
        ]);
        // A non-streaming model's answer still lands as a text part.
        $this->assertSame('$89.', $thread->fresh()->messages[5]['content']);
    }

    public function test_an_unreachable_gateway_ends_with_an_error_and_keeps_the_question(): void
    {
        $events = $this->events($this->actingAs($this->owner)->post('/studio/ask/stream', ['message' => 'Hello?'])->streamedContent());

        $this->assertSame(['thread', 'error'], array_column($events, 'type'));
        $thread = AgentThread::withoutGlobalScopes()->firstOrFail();
        $this->assertSame('Hello?', $thread->messages[0]['content']);
        $this->assertArrayHasKey('error', $thread->messages[1]);
    }

    public function test_a_stream_cut_off_before_done_is_saved_as_an_error(): void
    {
        config(['services.agent.url' => 'http://gateway.test', 'services.agent.secret' => 'secret']);
        Http::fake(['http://gateway.test/*' => Http::response($this->sse(['type' => 'delta', 'text' => 'Half an ans']), 200)]);

        $events = $this->events($this->actingAs($this->owner)->post('/studio/ask/stream', ['message' => 'Tell me'])->streamedContent());

        $this->assertSame('error', end($events)['type']);
        $reply = AgentThread::withoutGlobalScopes()->firstOrFail()->messages[1];
        $this->assertSame('Half an ans', $reply['content']);
        $this->assertSame('The agent stopped before finishing its reply.', $reply['error']);
    }

    public function test_someone_elses_thread_cannot_be_continued_or_renamed(): void
    {
        Organization::setCurrent($this->organization);
        $thread = AgentThread::create(['user_id' => $this->owner->id, 'title' => 'Mine', 'messages' => []]);
        Organization::setCurrent(null);

        $colleague = User::create(['name' => 'C', 'email' => 'c@veyra.test', 'password' => 'password']);
        $this->organization->addMember($colleague, OrganizationRole::Admin);

        $this->actingAs($colleague)->post('/studio/ask/stream', ['message' => 'x', 'thread_id' => $thread->id])->assertNotFound();
        $this->actingAs($colleague)->patch("/studio/ask/{$thread->id}", ['title' => 'Theirs'])->assertForbidden();

        $this->actingAs($this->owner)->patch("/studio/ask/{$thread->id}", ['title' => 'Renamed'])->assertRedirect();
        $this->assertSame('Renamed', $thread->fresh()->title);
    }

    public function test_the_page_carries_a_question_from_the_command_palette(): void
    {
        $this->actingAs($this->owner)->get('/studio/ask?q=Why+did+the+call+drop')
            ->assertInertia(fn ($page) => $page->component('studio/ask')->where('prefill', 'Why did the call drop')->where('user_first_name', 'Ada')->where('thread', null));
    }
}
