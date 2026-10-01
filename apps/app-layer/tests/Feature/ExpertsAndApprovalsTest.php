<?php

namespace Tests\Feature;

use App\Enums\ActionKind;
use App\Enums\AgentRuntime;
use App\Enums\OrganizationRole;
use App\Enums\ToolCallStatus;
use App\Models\Action;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Expert;
use App\Models\Identifier;
use App\Models\Integration;
use App\Models\Organization;
use App\Models\ToolCall;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Experts, MCP tools and approvals, as the app ships them to the agent layer
 * and as a person drives them from Studio.
 */
class ExpertsAndApprovalsTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-shared-secret';

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.agent.url' => null, 'services.agent.secret' => self::SECRET, 'services.composio.key' => null]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);

        $this->asTenant(function () {
            Expert::create(['slug' => 'front', 'name' => 'Front desk', 'description' => 'Talks.', 'runtime' => AgentRuntime::Talker, 'position' => 1]);
            Expert::create(['slug' => 'operations', 'name' => 'Operations', 'description' => 'Bookings and tickets.', 'runtime' => AgentRuntime::Worker, 'position' => 2]);
        });
    }

    private function asTenant(callable $fn): mixed
    {
        Organization::setCurrent($this->organization);
        try {
            return $fn();
        } finally {
            Organization::setCurrent(null);
        }
    }

    private function context(): array
    {
        return $this->withToken(self::SECRET)->getJson("/api/agent/v1/organizations/{$this->organization->id}/context")->assertOk()->json();
    }

    private function gatewayOn(): void
    {
        config(['services.agent.url' => 'http://gateway.test']);
    }

    // ── experts ─────────────────────────────────────────────────────────

    public function test_a_model_set_on_the_talker_expert_becomes_the_voice_talker_model(): void
    {
        $this->assertArrayNotHasKey('talker_model', (array) ($this->context()['agent']['advanced'] ?? []));

        $this->asTenant(fn () => Expert::query()->where('slug', 'front')->update(['model' => 'groq:openai/gpt-oss-20b']));

        $this->assertSame('groq:openai/gpt-oss-20b', $this->context()['agent']['advanced']['talker_model']);
    }

    public function test_experts_ship_in_studio_order_so_the_first_worker_is_the_primary(): void
    {
        $this->asTenant(fn () => Expert::create(['slug' => 'billing', 'name' => 'Billing', 'description' => 'Invoices.', 'runtime' => AgentRuntime::Worker, 'position' => 3]));

        $workers = collect($this->context()['experts'])->where('runtime', 'worker')->pluck('slug')->values()->all();
        $this->assertSame(['operations', 'billing'], $workers);

        $this->actingAs($this->owner)->get('/studio/experts')->assertOk()->assertInertia(fn ($page) => $page
            ->where('experts.1.slug', 'operations')->where('experts.1.primary', true)
            ->where('experts.2.slug', 'billing')->where('experts.2.primary', false));
    }

    public function test_reasoning_effort_accepts_only_what_the_agent_layer_sends(): void
    {
        $expert = $this->asTenant(fn () => Expert::query()->where('slug', 'operations')->first());

        $this->actingAs($this->owner)->patch("/studio/experts/{$expert->id}", ['reasoning_effort' => 'extreme'])->assertSessionHasErrors('reasoning_effort');
        $this->actingAs($this->owner)->patch("/studio/experts/{$expert->id}", ['reasoning_effort' => 'high'])->assertSessionHasNoErrors();
        $this->assertSame('high', $expert->refresh()->reasoning_effort);
        $this->assertSame('high', collect($this->context()['experts'])->firstWhere('slug', 'operations')['reasoning_effort']);
    }

    // ── MCP ─────────────────────────────────────────────────────────────

    private function mcpServer(): Integration
    {
        return $this->asTenant(fn () => Integration::create([
            'provider' => 'mcp', 'label' => 'Issue tracker', 'status' => 'disconnected',
            'credentials' => ['auth_type' => 'bearer', 'auth_value' => 'tok-123'],
            'config' => ['url' => 'https://mcp.example/mcp', 'transport' => 'streamable_http', 'auth_type' => 'bearer'],
        ]));
    }

    public function test_testing_an_mcp_server_loads_its_tools_as_actions_through_the_agent_layer(): void
    {
        $this->gatewayOn();
        $server = $this->mcpServer();
        Http::fake(['http://gateway.test/v1/mcp/tools' => Http::response(['tools' => [
            ['name' => 'get_issue', 'title' => 'Get an issue', 'description' => 'Read one issue.', 'input_schema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string']]], 'read_only' => true, 'idempotent' => false, 'destructive' => false],
            ['name' => 'create-issue', 'description' => 'Open an issue.', 'input_schema' => ['type' => 'object'], 'read_only' => false, 'idempotent' => false, 'destructive' => true],
        ]])]);

        $this->actingAs($this->owner)->post("/studio/integrations/mcp/{$server->id}/test")->assertSessionHas('success');

        Http::assertSent(fn (Request $r) => $r->url() === 'http://gateway.test/v1/mcp/tools'
            && $r['url'] === 'https://mcp.example/mcp' && $r['headers']['Authorization'] === 'Bearer tok-123');
        $this->assertSame('connected', $server->refresh()->status);

        $actions = $this->asTenant(fn () => Action::query()->where('integration_id', $server->id)->orderBy('slug')->get());
        $this->assertSame(["mcp{$server->id}_create_issue", "mcp{$server->id}_get_issue"], $actions->pluck('slug')->all());
        [$create, $get] = [$actions[0], $actions[1]];
        $this->assertSame(ActionKind::Mcp, $get->kind);
        $this->assertTrue($get->enabled);
        $this->assertFalse($get->is_durable_write);
        $this->assertTrue($get->is_idempotent);
        $this->assertTrue($create->is_durable_write);
        $this->assertSame('Get an issue', $get->name);

        // Granted to the worker, it ships with where it runs and how to authenticate.
        $this->asTenant(fn () => Expert::query()->where('slug', 'operations')->first()->actions()->attach($get));
        $tool = collect(collect($this->context()['experts'])->firstWhere('slug', 'operations')['tools'])->firstWhere('name', $get->slug);
        $this->assertSame('mcp', $tool['kind']);
        $this->assertSame(['tool' => 'get_issue', 'url' => 'https://mcp.example/mcp', 'transport' => 'streamable_http', 'headers' => ['Authorization' => 'Bearer tok-123']], $tool['config']);
    }

    public function test_testing_again_keeps_the_flags_a_person_set_and_drops_tools_that_are_gone(): void
    {
        $this->gatewayOn();
        $server = $this->mcpServer();
        Http::fakeSequence('http://gateway.test/v1/mcp/tools')
            ->push(['tools' => [['name' => 'a', 'description' => 'A', 'input_schema' => [], 'read_only' => false], ['name' => 'b', 'description' => 'B', 'input_schema' => [], 'read_only' => true]]])
            ->push(['tools' => [['name' => 'a', 'description' => 'A, renamed', 'input_schema' => [], 'read_only' => false]]]);

        $this->actingAs($this->owner)->post("/studio/integrations/mcp/{$server->id}/test");
        $this->asTenant(fn () => Action::query()->where('slug', "mcp{$server->id}_a")->update(['requires_approval' => true]));
        $this->actingAs($this->owner)->post("/studio/integrations/mcp/{$server->id}/test");

        $actions = $this->asTenant(fn () => Action::query()->where('integration_id', $server->id)->get());
        $this->assertCount(1, $actions);
        $this->assertTrue($actions[0]->requires_approval);
        $this->assertSame('A, renamed', $actions[0]->description);
    }

    public function test_a_server_the_agent_layer_cannot_talk_to_is_marked_with_the_reason(): void
    {
        $this->gatewayOn();
        $server = $this->mcpServer();
        Http::fake(['http://gateway.test/v1/mcp/tools' => Http::response(['detail' => 'HTTP 401 from the MCP server: bad token'], 502)]);

        $this->actingAs($this->owner)->post("/studio/integrations/mcp/{$server->id}/test")->assertSessionHas('error');

        $server->refresh();
        $this->assertSame('error', $server->status);
        $this->assertStringContainsString('bad token', $server->error);
    }

    // ── approvals ───────────────────────────────────────────────────────

    /** @return array{0: ToolCall, 1: Action, 2: Call} */
    private function awaitingApproval(ActionKind $kind = ActionKind::Internal, string $slug = 'create_ticket'): array
    {
        return $this->asTenant(function () use ($kind, $slug) {
            $action = Action::create(['kind' => $kind, 'slug' => $slug, 'name' => 'Create ticket', 'description' => 'Raise a ticket.', 'is_durable_write' => true, 'is_idempotent' => false, 'requires_approval' => true, 'timeout_ms' => 5000, 'config' => $kind === ActionKind::Http ? ['url' => 'https://x.example', 'method' => 'POST'] : null]);
            $contact = Contact::create(['name' => 'Maria Delgado', 'phone' => '+17735550111']);
            $identifier = Identifier::create(['type' => 'phone', 'value' => '+17735550111', 'contact_id' => $contact->id]);
            $conversation = Conversation::create(['channel' => 'call', 'identifier_id' => $identifier->id, 'contact_id' => $contact->id]);
            $call = Call::create(['direction' => 'inbound', 'from_number' => '+17735550111', 'to_number' => '+13125550142', 'conversation_id' => $conversation->id, 'contact_id' => $contact->id, 'status' => 'completed']);
            $toolCall = ToolCall::create(['action_id' => $action->id, 'call_id' => $call->id, 'action_slug' => $slug, 'kind' => $kind->value, 'arguments' => ['subject' => 'Refund INV-7', 'body' => 'Customer asked.', '_idempotency_key' => 'k1'], 'status' => ToolCallStatus::AwaitingApproval]);

            return [$toolCall, $action, $call];
        });
    }

    public function test_the_overview_lists_requests_waiting_for_approval(): void
    {
        [$toolCall] = $this->awaitingApproval();

        $this->actingAs($this->owner)->get('/studio')->assertOk()->assertInertia(fn ($page) => $page
            ->where('health.awaiting_approval', 1)
            ->where('approvals.0.id', $toolCall->id)
            ->where('approvals.0.action', 'Create ticket')
            ->where('approvals.0.contact', 'Maria Delgado')
            ->where('approvals.0.arguments.subject', 'Refund INV-7')
            ->missing('approvals.0.arguments._idempotency_key'));
    }

    public function test_approving_runs_the_action_once_through_the_agent_layer_and_records_the_result(): void
    {
        $this->gatewayOn();
        [$toolCall, $action, $call] = $this->awaitingApproval();
        Http::fake(['http://gateway.test/v1/tools/execute' => Http::response(['ok' => true, 'status' => 'succeeded', 'output' => 'Ticket #4 created', 'result' => ['ticket' => ['reference' => '#4']], 'error' => null, 'duration_ms' => 120])]);

        $this->actingAs($this->owner)->post("/studio/approvals/{$toolCall->id}/approve")->assertSessionHas('success');

        Http::assertSent(fn (Request $r) => $r->url() === 'http://gateway.test/v1/tools/execute'
            && $r['tool']['name'] === 'create_ticket' && $r['tool']['requires_approval'] === true
            && $r['arguments']['subject'] === 'Refund INV-7'
            && $r['arguments']['conversation_id'] === $call->conversation_id
            && $r['arguments']['contact_id'] === $call->contact_id
            && $r['tool_call_id'] === $toolCall->id);

        $toolCall->refresh();
        $this->assertSame(ToolCallStatus::Succeeded, $toolCall->status);
        $this->assertSame($this->owner->id, $toolCall->approved_by_id);
        $this->assertNotNull($toolCall->approved_at);
        $this->assertSame(['ticket' => ['reference' => '#4']], $toolCall->result);
        $this->assertSame(120, $toolCall->duration_ms);

        // A second press runs nothing.
        $this->actingAs($this->owner)->post("/studio/approvals/{$toolCall->id}/approve")->assertSessionHas('warning');
        Http::assertSentCount(1);
    }

    public function test_an_external_action_gets_only_the_arguments_the_agent_asked_for(): void
    {
        $this->gatewayOn();
        [$toolCall] = $this->awaitingApproval(ActionKind::Http, 'refund_invoice');
        Http::fake(['http://gateway.test/v1/tools/execute' => Http::response(['ok' => false, 'status' => 'failed', 'error' => 'HTTP 500', 'duration_ms' => 40])]);

        $this->actingAs($this->owner)->post("/studio/approvals/{$toolCall->id}/approve")->assertSessionHas('error');

        Http::assertSent(fn (Request $r) => ! isset($r['arguments']['conversation_id']) && $r['tool']['config']['url'] === 'https://x.example');
        $this->assertSame(ToolCallStatus::Failed, $toolCall->refresh()->status);
        $this->assertSame('HTTP 500', $toolCall->error);
    }

    public function test_when_the_agent_layer_is_down_the_request_keeps_waiting(): void
    {
        [$toolCall] = $this->awaitingApproval(); // gateway not configured

        $this->actingAs($this->owner)->post("/studio/approvals/{$toolCall->id}/approve")->assertSessionHas('error');

        $toolCall->refresh();
        $this->assertSame(ToolCallStatus::AwaitingApproval, $toolCall->status);
        $this->assertNull($toolCall->approved_by_id);
    }

    public function test_rejecting_records_that_it_never_ran(): void
    {
        $this->gatewayOn();
        Http::fake();
        [$toolCall] = $this->awaitingApproval();

        $this->actingAs($this->owner)->post("/studio/approvals/{$toolCall->id}/reject")->assertSessionHas('success');

        $toolCall->refresh();
        $this->assertSame(ToolCallStatus::Rejected, $toolCall->status);
        $this->assertTrue($toolCall->status->provesNothingHappened());
        $this->assertStringContainsString('Ada Owner', $toolCall->error);
        Http::assertNothingSent();

        $this->actingAs($this->owner)->post("/studio/approvals/{$toolCall->id}/approve")->assertSessionHas('warning');
        Http::assertNothingSent();
    }

    public function test_another_organizations_request_cannot_be_decided(): void
    {
        [$toolCall] = $this->awaitingApproval();
        $other = Organization::create(['name' => 'Lakeside', 'slug' => 'lakeside', 'timezone' => 'UTC']);
        $stranger = User::create(['name' => 'Eve', 'email' => 'eve@lakeside.test', 'password' => 'password']);
        $other->addMember($stranger, OrganizationRole::Owner);

        $this->actingAs($stranger)->post("/studio/approvals/{$toolCall->id}/reject")->assertNotFound();
        $this->assertSame(ToolCallStatus::AwaitingApproval, $toolCall->refresh()->status);
    }
}
