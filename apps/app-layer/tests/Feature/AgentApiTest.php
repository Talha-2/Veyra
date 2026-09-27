<?php

namespace Tests\Feature;

use App\Enums\ActionKind;
use App\Enums\AgentRuntime;
use App\Enums\Channel;
use App\Enums\IdentifierType;
use App\Enums\OrganizationRole;
use App\Models\Action;
use App\Models\AgentThread;
use App\Models\Automation;
use App\Models\AutomationRun;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Delegation;
use App\Models\Document;
use App\Models\Expert;
use App\Models\Identifier;
use App\Models\Organization;
use App\Models\PhoneNumber;
use App\Models\Skill;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Models\ToolCall;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The agent-layer contract, v1, from the agent's side of the wire.
 *
 * Every route the Python AppSdk calls is exercised here with the payloads it
 * sends. The reliability rules in ARCHITECTURE.md §5.4 each have a test that
 * would fail if the app stopped enforcing its half of them.
 */
class AgentApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-shared-secret';

    private Organization $organization;

    private PhoneNumber $line;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.agent.secret' => self::SECRET]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'America/Chicago']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);

        Organization::setCurrent($this->organization);
        $this->line = PhoneNumber::create(['e164' => '+13125550142', 'friendly_name' => 'Main line', 'language' => 'en']);

        $skill = Skill::create(['slug' => 'reschedule', 'name' => 'Reschedule', 'description' => 'Move an appointment.', 'body' => "Ask for the booking reference.\n\nOffer two windows."]);
        $book = Action::create(['kind' => ActionKind::Composio, 'slug' => 'book_appointment', 'name' => 'Book appointment', 'description' => 'Book a slot.', 'is_idempotent' => false, 'is_durable_write' => true, 'timeout_ms' => 15000]);
        $find = Action::create(['kind' => ActionKind::Internal, 'slug' => 'find_contact', 'name' => 'Find contact', 'description' => 'Look someone up.', 'is_idempotent' => true, 'is_durable_write' => false]);

        $worker = Expert::create(['slug' => 'scheduling', 'name' => 'Scheduling', 'description' => 'Books and moves appointments.', 'system_prompt' => 'You schedule.', 'runtime' => AgentRuntime::Worker]);
        $worker->skills()->attach($skill);
        $worker->actions()->attach([$book->id, $find->id]);
        Expert::create(['slug' => 'front', 'name' => 'Front desk', 'description' => 'Talks.', 'system_prompt' => 'You talk.', 'runtime' => AgentRuntime::Talker]);

        Organization::setCurrent(null);
    }

    private function agent(): static
    {
        return $this->withToken(self::SECRET)->withHeader('Accept', 'application/json');
    }

    private function org(string $path): string
    {
        return "/api/agent/v1/organizations/{$this->organization->id}{$path}";
    }

    private function inbound(string $from = '+17735550111', string $sid = 'CA1'): \Illuminate\Testing\TestResponse
    {
        return $this->agent()->postJson('/api/agent/v1/calls/inbound', [
            'to' => '+1 (312) 555-0142', 'from' => $from, 'provider' => 'twilio', 'provider_sid' => $sid, 'room' => 'room-1',
        ]);
    }

    // ── Auth ────────────────────────────────────────────────────────────

    public function test_the_secret_is_required_and_compared_exactly(): void
    {
        $this->getJson('/api/agent/v1/health')->assertStatus(401);
        $this->withToken('wrong')->getJson('/api/agent/v1/health')->assertStatus(401);
        $this->agent()->getJson('/api/agent/v1/health')->assertOk()->assertJson(['ok' => true, 'contract' => 'v1']);

        config(['services.agent.secret' => null]);
        $this->agent()->getJson('/api/agent/v1/health')->assertStatus(401)->assertJsonFragment(['message' => 'AGENT_SHARED_SECRET is not set on the app layer.']);
    }

    public function test_an_unknown_organization_in_the_path_is_a_404_not_a_leak(): void
    {
        $this->agent()->getJson('/api/agent/v1/organizations/999/context')->assertNotFound()->assertJson(['error' => 'unknown_organization']);
    }

    // ── Inbound call ────────────────────────────────────────────────────

    public function test_an_inbound_call_resolves_the_tenant_from_the_dialled_number(): void
    {
        $this->agent()->postJson('/api/agent/v1/calls/inbound', ['to' => '+19995550000', 'from' => '+17735550111', 'provider' => 'twilio', 'provider_sid' => 'CA0'])
            ->assertNotFound()->assertJson(['error' => 'unknown_number']);

        $response = $this->inbound()->assertCreated();
        $response->assertJsonPath('contract', 'v1')
            ->assertJsonPath('organization.id', $this->organization->id)
            ->assertJsonPath('call.direction', 'inbound')
            ->assertJsonPath('call.language', 'en')
            ->assertJsonPath('call.to', '+13125550142')
            ->assertJsonPath('line.e164', '+13125550142')
            ->assertJsonPath('caller.contact', null)
            ->assertJsonPath('caller.identifier.value', '+17735550111')
            ->assertJsonCount(2, 'experts');

        $worker = collect($response->json('experts'))->firstWhere('slug', 'scheduling');
        $talker = collect($response->json('experts'))->firstWhere('slug', 'front');
        $this->assertSame('worker', $worker['runtime']);
        $this->assertSame('reschedule', $worker['skills'][0]['slug']);
        $this->assertSame('book_appointment', $worker['tools'][0]['name']);
        $this->assertTrue($worker['tools'][0]['is_durable_write']);
        $this->assertSame([], $talker['peers'], 'the only talker has no peers');

        // The skill body is not in the bundle: progressive disclosure.
        $this->assertArrayNotHasKey('markdown', $worker['skills'][0]);
        $this->assertArrayNotHasKey('body', $worker['skills'][0]);

        $call = Call::withoutGlobalScopes()->firstOrFail();
        $this->assertSame($this->organization->id, $call->organization_id);
        $this->assertSame('in-progress', $call->status);
        $this->assertNotNull($call->conversation_id);
        $this->assertSame(Channel::Call, Conversation::withoutGlobalScopes()->find($call->conversation_id)->channel);
    }

    public function test_a_repeated_inbound_report_returns_the_same_call(): void
    {
        $first = $this->inbound()->assertCreated()->json('call.id');
        $second = $this->inbound()->assertOk()->json('call.id');

        $this->assertSame($first, $second);
        $this->assertSame(1, Call::withoutGlobalScopes()->count());
        $this->assertSame(1, Conversation::withoutGlobalScopes()->count());
    }

    public function test_a_known_caller_arrives_with_their_history(): void
    {
        Organization::setCurrent($this->organization);
        $contact = Contact::create(['name' => 'Tom Byrne', 'phone' => '+17735550111']);
        Identifier::resolve(IdentifierType::Phone, '+17735550111')->linkTo($contact);
        Ticket::create(['subject' => 'Grinding noise', 'body' => 'x', 'contact_id' => $contact->id]);
        Organization::setCurrent(null);

        $this->inbound()->assertCreated()
            ->assertJsonPath('caller.contact.name', 'Tom Byrne')
            ->assertJsonPath('caller.open_tickets.0.subject', 'Grinding noise')
            ->assertJsonPath('call.language', 'en');

        // The call itself is attributed, so the Desk shows it under Tom.
        $this->assertSame($contact->id, Call::withoutGlobalScopes()->first()->contact_id);
    }

    public function test_the_language_comes_from_the_line_not_the_tenant(): void
    {
        Organization::setCurrent($this->organization);
        $this->line->update(['language' => 'ur']);
        Organization::setCurrent(null);

        $this->inbound()->assertCreated()
            ->assertJsonPath('call.language', 'ur')
            ->assertJsonPath('call.capabilities.stt_multi', false)
            ->assertJsonPath('call.capabilities.rtl', true);
    }

    // ── Tenancy on scoped routes ────────────────────────────────────────

    public function test_a_call_cannot_be_reached_through_another_organizations_path(): void
    {
        $callId = $this->inbound()->json('call.id');
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);

        $this->agent()->postJson("/api/agent/v1/organizations/{$other->id}/calls/{$callId}/events", ['type' => 'ended'])->assertNotFound();
        $this->assertSame('in-progress', Call::withoutGlobalScopes()->find($callId)->status);
    }

    // ── Call lifecycle ──────────────────────────────────────────────────

    public function test_transcript_pushes_replace_and_ending_records_duration_and_summary(): void
    {
        $callId = $this->inbound()->json('call.id');

        $this->agent()->putJson($this->org("/calls/{$callId}/transcript"), ['items' => [['role' => 'agent', 'text' => 'Hello'], ['role' => 'caller', 'text' => 'Hi']]])->assertOk();
        $this->agent()->putJson($this->org("/calls/{$callId}/transcript"), ['items' => [['role' => 'agent', 'text' => 'Hello'], ['role' => 'caller', 'text' => 'Hi'], ['role' => 'agent', 'text' => 'How can I help?']], 'metrics' => ['voice_to_voice' => ['p50' => 700]]])->assertOk();

        $this->agent()->postJson($this->org("/calls/{$callId}/events"), ['type' => 'ended', 'duration_sec' => 214, 'summary' => 'Asked to reschedule.', 'metrics' => ['tokens' => 1200]])->assertOk();

        $call = Call::withoutGlobalScopes()->find($callId);
        $transcript = \App\Models\CallTranscript::withoutGlobalScopes()->where('call_id', $callId)->firstOrFail();
        $this->assertSame('completed', $call->status);
        $this->assertSame(214, $call->duration_sec);
        $this->assertCount(3, $transcript->items);
        $this->assertSame('Asked to reschedule.', $transcript->summary);
        $this->assertSame(['voice_to_voice' => ['p50' => 700], 'tokens' => 1200], $transcript->metrics);
        $this->assertDatabaseHas('activities', ['type' => 'call_ended', 'actor' => 'agent']);
    }

    public function test_recent_calls_lists_summaries_within_a_window(): void
    {
        $callId = $this->inbound()->json('call.id');
        $this->agent()->postJson($this->org("/calls/{$callId}/events"), ['type' => 'ended', 'duration_sec' => 90, 'summary' => 'Wants a Thursday slot.']);

        // urlencoded: an ISO offset's "+" is a space in a raw query string.
        $this->agent()->getJson($this->org('/calls?'.http_build_query(['since' => now()->subHour()->toIso8601String()])))->assertOk()
            ->assertJsonCount(1, 'calls')
            ->assertJsonPath('calls.0.id', $callId)
            ->assertJsonPath('calls.0.summary', 'Wants a Thursday slot.')
            ->assertJsonPath('calls.0.duration', '1:30');

        $this->agent()->getJson($this->org('/calls?'.http_build_query(['since' => now()->addHour()->toIso8601String()])))->assertOk()->assertJsonCount(0, 'calls');
    }

    // ── Skills & knowledge ──────────────────────────────────────────────

    public function test_a_skill_body_is_read_on_demand_as_markdown(): void
    {
        $this->agent()->getJson($this->org('/skills'))->assertOk()->assertJsonCount(1, 'skills')->assertJsonPath('skills.0.slug', 'reschedule');

        $this->agent()->getJson($this->org('/skills/reschedule'))->assertOk()
            ->assertJsonPath('version', 1)
            ->assertJsonPath('execution_mode', 'prose')
            ->assertJson(fn ($json) => $json->where('markdown', fn ($md) => str_starts_with($md, "---\nname: Reschedule") && str_contains($md, 'Offer two windows.'))->etc());

        $this->agent()->getJson($this->org('/skills/nope'))->assertNotFound();

        Skill::withoutGlobalScopes()->where('slug', 'reschedule')->update(['enabled' => false]);
        $this->agent()->getJson($this->org('/skills/reschedule'))->assertNotFound();
    }

    public function test_knowledge_search_returns_the_chunk_that_holds_the_term(): void
    {
        Organization::setCurrent($this->organization);
        Document::create(['name' => 'Service area', 'source_type' => 'created', 'mime' => 'text/markdown', 'size_bytes' => 1, 'content' => "We serve Cook county.\n\nEvanston is inside the area."])->reindex();
        Organization::setCurrent(null);

        $this->agent()->getJson($this->org('/knowledge/search?q=evanston'))->assertOk()
            ->assertJsonPath('results.0.document', 'Service area')
            ->assertJson(fn ($json) => $json->where('results.0.content', fn ($c) => str_contains($c, 'Evanston'))->etc());

        $this->agent()->getJson($this->org('/knowledge/search'))->assertStatus(422);
    }

    // ── Contacts ────────────────────────────────────────────────────────

    public function test_creating_a_contact_links_the_anonymous_call_history(): void
    {
        $callId = $this->inbound()->json('call.id');
        $this->agent()->getJson($this->org('/contacts/lookup?phone=%2B17735550111'))->assertOk()->assertJsonPath('found', false)->assertJsonPath('identifier.value', '+17735550111');

        $this->agent()->postJson($this->org('/contacts'), ['name' => 'Tom Byrne', 'phone' => '+1 773 555 0111', 'email' => 'Tom@Example.test'])->assertCreated()
            ->assertJsonPath('created', true)->assertJsonPath('contact.name', 'Tom Byrne');

        $contact = Contact::withoutGlobalScopes()->firstOrFail();
        $this->assertSame('tom@example.test', $contact->email);
        // The conversation and call that existed before we knew the name now belong to Tom.
        $this->assertSame($contact->id, Call::withoutGlobalScopes()->find($callId)->contact_id);
        $this->assertSame($contact->id, Conversation::withoutGlobalScopes()->first()->contact_id);

        // Creating again for the same phone returns Tom, never a duplicate.
        $this->agent()->postJson($this->org('/contacts'), ['name' => 'T. Byrne', 'phone' => '+17735550111'])->assertOk()->assertJsonPath('created', false)->assertJsonPath('contact.id', $contact->id);
        $this->assertSame(1, Contact::withoutGlobalScopes()->count());

        $this->agent()->getJson($this->org('/contacts/lookup?email=tom@example.test'))->assertOk()->assertJsonPath('found', true)->assertJsonPath('contact.id', $contact->id);
    }

    // ── Tickets ─────────────────────────────────────────────────────────

    public function test_a_ticket_raised_by_the_agent_is_numbered_routed_and_notified(): void
    {
        Organization::setCurrent($this->organization);
        TicketType::create(['name' => 'Billing', 'color' => '#ffdd03', 'default_assignee_ids' => [$this->owner->id], 'position' => 0]);
        Organization::setCurrent(null);
        $callId = $this->inbound()->json('call.id');

        $response = $this->agent()->postJson($this->org('/tickets'), [
            'subject' => 'Refund the deposit', 'body' => 'Caller cancelled inside 48h.', 'type' => 'billing', 'call_id' => $callId, 'idempotency_key' => 'call1-ticket1',
        ])->assertCreated();

        $response->assertJsonPath('created', true)->assertJsonPath('ticket.number', 1)->assertJsonPath('ticket.type', 'Billing')->assertJsonPath('ticket.assignees.0', 'Ada Owner');

        $ticket = Ticket::withoutGlobalScopes()->firstOrFail();
        $this->assertTrue($ticket->created_by_agent);
        $this->assertSame(Call::withoutGlobalScopes()->find($callId)->conversation_id, $ticket->conversation_id);
        $this->assertDatabaseHas('activities', ['type' => 'ticket_raised', 'actor' => 'agent']);
        $this->assertSame(1, $this->owner->notifications()->where('type', 'ticket.created')->count());

        // The retry after an ambiguous timeout finds its earlier self.
        $this->agent()->postJson($this->org('/tickets'), ['subject' => 'Refund the deposit', 'body' => 'x', 'idempotency_key' => 'call1-ticket1'])->assertOk()->assertJsonPath('created', false)->assertJsonPath('ticket.id', $ticket->id);
        $this->assertSame(1, Ticket::withoutGlobalScopes()->count());
    }

    // ── Messages ────────────────────────────────────────────────────────

    public function test_an_outbound_text_lands_on_the_sms_thread_and_respects_blocks(): void
    {
        $bundle = $this->inbound()->json();

        $this->agent()->postJson($this->org('/messages'), ['conversation_id' => $bundle['call']['conversation_id'], 'channel' => 'sms', 'body' => 'Sorry we missed you.'])->assertCreated()
            ->assertJsonPath('message.status', 'queued')->assertJsonPath('message.channel', 'sms')->assertJsonPath('message.to', '+17735550111');

        // Two threads for one identifier: the call, and now the SMS.
        $this->assertSame(2, Conversation::withoutGlobalScopes()->count());
        $this->assertSame(1, Conversation::withoutGlobalScopes()->where('channel', 'sms')->count());

        Identifier::withoutGlobalScopes()->where('value', '+17735550111')->update(['blocked_at' => now()]);
        $this->agent()->postJson($this->org('/messages'), ['to' => '+17735550111', 'channel' => 'sms', 'body' => 'Again'])->assertStatus(422)->assertJsonPath('error', 'not_permitted');
    }

    // ── delegate() audit ────────────────────────────────────────────────

    public function test_a_delegation_sequence_cannot_be_sent_twice_and_an_empty_reply_counts_as_failed(): void
    {
        $callId = $this->inbound()->json('call.id');

        $id = $this->agent()->postJson($this->org("/calls/{$callId}/delegations"), ['sequence' => 1, 'transcript_delta' => "AI: Hello\nHuman: Move my appointment"])->assertCreated()->json('id');
        $this->agent()->postJson($this->org("/calls/{$callId}/delegations"), ['sequence' => 1, 'transcript_delta' => 'again'])->assertStatus(409)->assertJsonPath('error', 'duplicate_sequence');

        $this->agent()->patchJson($this->org("/calls/{$callId}/delegations/{$id}"), ['status' => 'completed', 'reply' => '', 'duration_ms' => 900])->assertOk()
            ->assertJsonPath('failed', true)->assertJsonPath('completed_durable_write', false);

        $this->assertNotNull(Delegation::withoutGlobalScopes()->find($id)->completed_at);
    }

    // ── Tool-call audit and idempotency ─────────────────────────────────

    public function test_a_retried_non_idempotent_tool_call_is_returned_for_reconciliation_not_re_run(): void
    {
        $callId = $this->inbound()->json('call.id');
        $delegationId = $this->agent()->postJson($this->org("/calls/{$callId}/delegations"), ['sequence' => 1, 'transcript_delta' => 'x'])->json('id');

        $first = $this->agent()->postJson($this->org('/tool-calls'), [
            'action_slug' => 'book_appointment', 'arguments' => ['starts_at' => '2026-10-01T09:00:00Z'], 'idempotency_key' => 'call1-book-1', 'delegation_id' => $delegationId, 'expert_slug' => 'scheduling',
        ])->assertCreated();
        $first->assertJsonPath('duplicate', false)->assertJsonPath('tool_call.status', 'running')->assertJsonPath('tool_call.kind', 'composio');
        $toolCallId = $first->json('tool_call.id');

        $row = ToolCall::withoutGlobalScopes()->find($toolCallId);
        $this->assertSame($callId, $row->call_id, 'call_id is derived from the delegation');
        $this->assertNotNull($row->expert_id);
        $this->assertNotNull($row->action_id);

        // The upstream timed out. Recorded as such — never as success.
        $this->agent()->patchJson($this->org("/tool-calls/{$toolCallId}"), ['status' => 'timeout', 'error' => 'no response in 15000ms', 'duration_ms' => 15000])->assertOk()
            ->assertJsonPath('tool_call.confirmed_complete', false)->assertJsonPath('tool_call.needs_reconciliation', true);

        // The worker retries with the same key: it gets the earlier row back
        // and must reconcile, not book again.
        $this->agent()->postJson($this->org('/tool-calls'), ['action_slug' => 'book_appointment', 'idempotency_key' => 'call1-book-1'])->assertOk()
            ->assertJsonPath('duplicate', true)->assertJsonPath('tool_call.id', $toolCallId)->assertJsonPath('tool_call.status', 'timeout');
        $this->assertSame(1, ToolCall::withoutGlobalScopes()->count());

        // The delegation now knows nothing durable happened.
        $this->agent()->patchJson($this->org("/calls/{$callId}/delegations/{$delegationId}"), ['status' => 'completed', 'reply' => 'Tell the caller we could not confirm.'])->assertOk()
            ->assertJsonPath('completed_durable_write', false);
    }

    public function test_a_succeeded_durable_write_is_what_lets_the_talker_confirm(): void
    {
        $callId = $this->inbound()->json('call.id');
        $delegationId = $this->agent()->postJson($this->org("/calls/{$callId}/delegations"), ['sequence' => 1, 'transcript_delta' => 'x'])->json('id');
        $toolCallId = $this->agent()->postJson($this->org('/tool-calls'), ['action_slug' => 'book_appointment', 'idempotency_key' => 'k2', 'delegation_id' => $delegationId])->json('tool_call.id');
        $this->agent()->patchJson($this->org("/tool-calls/{$toolCallId}"), ['status' => 'succeeded', 'result' => ['booking_id' => 'bk_1'], 'duration_ms' => 800])->assertOk()->assertJsonPath('tool_call.confirmed_complete', true);

        $this->agent()->patchJson($this->org("/calls/{$callId}/delegations/{$delegationId}"), ['status' => 'completed', 'reply' => 'Booked for Thursday 9-12.'])->assertOk()
            ->assertJsonPath('failed', false)->assertJsonPath('completed_durable_write', true);
    }

    // ── Memory, threads, automations ────────────────────────────────────

    public function test_memory_is_upserted_by_name(): void
    {
        $this->agent()->postJson($this->org('/memory'), ['name' => 'Scheduling rules', 'content' => 'No Fridays.'])->assertCreated();
        $this->agent()->postJson($this->org('/memory'), ['name' => 'Scheduling rules', 'content' => 'No Fridays or Sundays.'])->assertOk();

        $memories = Document::withoutGlobalScopes()->where('source_type', 'agent')->get();
        $this->assertCount(1, $memories);
        $this->assertSame('No Fridays or Sundays.', $memories->first()->content);
        $this->assertSame('ready', $memories->first()->status);
    }

    public function test_an_agent_reply_replaces_the_pending_placeholder_on_a_thread(): void
    {
        Organization::setCurrent($this->organization);
        $thread = AgentThread::create(['user_id' => $this->owner->id, 'title' => 'Q', 'messages' => [
            ['role' => 'user', 'content' => 'Write a skill.', 'at' => now()->toIso8601String()],
            ['role' => 'assistant', 'content' => '', 'at' => now()->toIso8601String(), 'pending' => true],
        ]]);
        Organization::setCurrent(null);

        $this->agent()->postJson($this->org("/threads/{$thread->id}/messages"), ['content' => 'Here is a draft.', 'external_id' => 'thr_abc'])->assertOk()->assertJsonPath('messages', 2);

        $thread->refresh();
        $this->assertSame('Here is a draft.', $thread->messages[1]['content']);
        $this->assertArrayNotHasKey('pending', $thread->messages[1]);
        $this->assertSame('thr_abc', $thread->external_id);
    }

    public function test_the_unscoped_claim_spans_tenants_and_names_each_runs_organization(): void
    {
        Organization::setCurrent($this->organization);
        $mine = Automation::create(['name' => 'Mine', 'goal' => 'g', 'triggers' => ['manual'], 'reasoning' => 'fast', 'enabled' => true]);
        AutomationRun::create(['automation_id' => $mine->id, 'trigger' => 'manual', 'status' => 'queued', 'input' => 'g']);
        Organization::setCurrent(null);

        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        Organization::setCurrent($other);
        $theirs = Automation::create(['name' => 'Theirs', 'goal' => 'g', 'triggers' => ['schedule'], 'schedule' => ['kind' => 'hourly', 'tz' => 'UTC'], 'reasoning' => 'fast', 'enabled' => true]);
        $theirs->forceFill(['next_run_at' => now()->subMinute()])->save();
        Organization::setCurrent(null);

        $runs = collect($this->agent()->postJson('/api/agent/v1/automations/claim')->assertOk()->json('runs'));
        $this->assertCount(2, $runs);
        $this->assertEqualsCanonicalizing([$this->organization->id, $other->id], $runs->pluck('organization_id')->all());
        $this->assertSame('Theirs', $runs->firstWhere('organization_id', $other->id)['automation']['name']);

        // Nothing leaked between tenants and nothing is claimable twice.
        $this->agent()->postJson('/api/agent/v1/automations/claim')->assertOk()->assertJsonCount(0, 'runs');
        $this->assertSame(0, AutomationRun::withoutGlobalScopes()->where('status', 'queued')->count());
    }

    public function test_the_push_path_claims_one_queued_run_by_id_exactly_once(): void
    {
        Organization::setCurrent($this->organization);
        $automation = Automation::create(['name' => 'Text back', 'goal' => 'Text.', 'triggers' => ['manual'], 'reasoning' => 'fast', 'enabled' => true]);
        $run = AutomationRun::create(['automation_id' => $automation->id, 'trigger' => 'manual', 'status' => 'queued', 'input' => 'Text.']);
        Organization::setCurrent(null);

        $this->agent()->postJson($this->org("/automations/runs/{$run->id}/claim"))->assertOk()->assertJsonPath('run.id', $run->id)->assertJsonPath('run.automation.name', 'Text back');
        $this->assertSame('running', $run->refresh()->status);
        // Already claimed: the pull loop and the push cannot both run it.
        $this->agent()->postJson($this->org("/automations/runs/{$run->id}/claim"))->assertNotFound()->assertJsonPath('error', 'not_queued');
    }

    public function test_claiming_automations_takes_due_schedules_and_queued_runs_exactly_once(): void
    {
        Organization::setCurrent($this->organization);
        $digest = Automation::create(['name' => 'Digest', 'goal' => 'Summarise.', 'triggers' => ['schedule'], 'schedule' => ['kind' => 'daily', 'at' => '07:00', 'tz' => 'UTC'], 'reasoning' => 'fast', 'enabled' => true, 'allowed_action_ids' => [Action::query()->where('slug', 'find_contact')->value('id')]]);
        $digest->forceFill(['next_run_at' => now()->subMinute()])->save();
        $manual = Automation::create(['name' => 'Text back', 'goal' => 'Text.', 'triggers' => ['manual'], 'reasoning' => 'fast', 'enabled' => true]);
        $queued = AutomationRun::create(['automation_id' => $manual->id, 'trigger' => 'manual', 'status' => 'queued', 'input' => 'Text.']);
        Organization::setCurrent(null);

        $response = $this->agent()->postJson($this->org('/automations/claim'))->assertOk();
        $runs = collect($response->json('runs'));
        $this->assertCount(2, $runs);
        $scheduled = $runs->firstWhere('trigger', 'schedule');
        $this->assertSame('Digest', $scheduled['automation']['name']);
        $this->assertSame('find_contact', $scheduled['automation']['tools'][0]['name']);
        $this->assertSame($queued->id, $runs->firstWhere('trigger', 'manual')['id']);

        // The schedule advanced and the queued run is running: a second claim gets nothing.
        $this->assertTrue($digest->refresh()->next_run_at->isFuture());
        $this->assertSame('running', $queued->refresh()->status);
        $this->agent()->postJson($this->org('/automations/claim'))->assertOk()->assertJsonCount(0, 'runs');

        $this->agent()->patchJson($this->org("/automations/runs/{$scheduled['id']}"), ['status' => 'done', 'result' => '3 calls overnight.', 'tokens' => 900, 'duration_ms' => 4000, 'steps' => [['type' => 'final']]])->assertOk();
        $run = AutomationRun::withoutGlobalScopes()->find($scheduled['id']);
        $this->assertSame('done', $run->status);
        $this->assertNotNull($run->ended_at);
    }
}
