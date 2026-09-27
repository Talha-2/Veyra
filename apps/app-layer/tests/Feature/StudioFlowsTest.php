<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Action;
use App\Models\ApiKey;
use App\Models\Automation;
use App\Models\Contact;
use App\Models\Document;
use App\Models\Folder;
use App\Models\Integration;
use App\Models\Invitation;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\TicketType;
use App\Models\User;
use App\Models\WebhookEndpoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Studio write paths, end to end through the HTTP layer.
 *
 * The browser sweep proves every page renders; these prove that what the
 * pages post actually lands, with the side effects the UI promises (a chunked
 * document, a minted secret shown once, a removed stage that keeps its leads).
 */
class StudioFlowsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        // The developer's .env may name a live gateway and real provider
        // keys; the suite must reach none of them. This is the "nothing
        // configured" case by construction; live modes are tested with
        // Http::fake() where they matter.
        config(['services.agent.url' => null, 'services.composio.key' => null, 'services.cartesia.key' => null, 'services.elevenlabs.key' => null]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
    }

    /** Fixtures built outside a request need the tenant set explicitly, as the seeders do. */
    private function asTenant(callable $fn): mixed
    {
        Organization::setCurrent($this->organization);
        try {
            return $fn();
        } finally {
            Organization::setCurrent(null);
        }
    }

    // ── Automations ─────────────────────────────────────────────────────

    public function test_an_automation_is_created_then_configured_with_a_webhook_and_a_schedule(): void
    {
        $response = $this->actingAs($this->owner)->post('/studio/automations', ['name' => 'Morning digest', 'description' => 'Summarise overnight.']);

        $automation = Automation::withoutGlobalScopes()->firstOrFail();
        $response->assertRedirect("/studio/automations/{$automation->id}");
        $this->assertSame(['manual'], $automation->triggers);

        $this->actingAs($this->owner)->patch("/studio/automations/{$automation->id}", [
            'triggers' => ['schedule', 'webhook'],
            'schedule' => ['kind' => 'daily', 'at' => '07:00', 'tz' => 'America/Chicago'],
            'enabled' => true,
        ])->assertRedirect();

        $automation->refresh();
        // The webhook secret is minted on first enable and the schedule sets a next run.
        $this->assertStringStartsWith('whsec_', $automation->webhook_secret);
        $this->assertNotNull($automation->next_run_at);

        $this->actingAs($this->owner)->patch("/studio/automations/{$automation->id}", ['enabled' => false]);
        $this->assertNull($automation->refresh()->next_run_at);
        $this->assertStringStartsWith('whsec_', $automation->webhook_secret, 'Disabling must not revoke the secret.');

        // No agent layer configured in tests: the run is queued for the
        // claim loop rather than pushed, and the button still did something.
        $this->actingAs($this->owner)->post("/studio/automations/{$automation->id}/run")->assertRedirect()->assertSessionHas('success', 'Run queued. It will start when the agent layer next checks for work.');
        $this->assertSame(1, $automation->runs()->where('trigger', 'manual')->where('status', 'queued')->count());
    }

    public function test_an_automation_needs_at_least_one_trigger(): void
    {
        $automation = $this->asTenant(fn () => Automation::create(['name' => 'X', 'triggers' => ['manual'], 'reasoning' => 'fast']));

        $this->actingAs($this->owner)->from('/studio/automations/'.$automation->id)
            ->patch("/studio/automations/{$automation->id}", ['triggers' => []])
            ->assertSessionHasErrors('triggers');
    }

    public function test_trying_a_skill_goes_through_the_gateway_and_says_so_when_there_is_none(): void
    {
        $skill = $this->asTenant(fn () => \App\Models\Skill::create(['slug' => 'reschedule', 'name' => 'Reschedule', 'description' => 'Move it.', 'body' => 'Ask for the reference.']));

        // No agent layer: the button says so instead of spinning.
        $this->actingAs($this->owner)->from("/studio/skills/{$skill->id}")->post("/studio/skills/{$skill->id}/test", ['scenario' => 'Move my Thursday visit.'])
            ->assertRedirect("/studio/skills/{$skill->id}")->assertSessionHas('error');

        // With one: the dry-run result comes back as the flash the page renders.
        config(['services.agent.url' => 'http://gateway.test', 'services.agent.secret' => 'secret']);
        \Illuminate\Support\Facades\Http::fake(['http://gateway.test/*' => \Illuminate\Support\Facades\Http::response(['reply' => 'Ask for the booking reference.', 'failed' => false, 'steps' => ['read_skill'], 'tokens' => 120])]);

        $this->actingAs($this->owner)->from("/studio/skills/{$skill->id}")->post("/studio/skills/{$skill->id}/test", ['scenario' => 'Move my Thursday visit.'])
            ->assertRedirect()->assertSessionHas('skill_test', fn ($r) => $r['reply'] === 'Ask for the booking reference.' && $r['steps'] === ['read_skill'] && $r['failed'] === false);

        \Illuminate\Support\Facades\Http::assertSent(fn ($request) => $request->url() === 'http://gateway.test/v1/skills/test'
            && $request->hasHeader('Authorization', 'Bearer secret')
            && $request['skill'] === 'reschedule' && $request['scenario'] === 'Move my Thursday visit.');
    }

    // ── Knowledge ───────────────────────────────────────────────────────

    public function test_a_written_document_is_chunked_by_paragraph_and_searchable(): void
    {
        // Three paragraphs of ~700 characters: too big for one chunk, and
        // the boundary must fall between paragraphs, never inside one.
        $counties = str_repeat('We serve Cook, DuPage, Lake and Will counties. ', 15);
        $evanston = 'Evanston is inside the area. '.str_repeat('Oak Park and Naperville are inside the area too. ', 14);
        $rockford = str_repeat('Rockford and Milwaukee are outside the area. ', 15);

        $this->actingAs($this->owner)->post('/studio/knowledge/documents', [
            'name' => 'Service area',
            'content' => "{$counties}\n\n{$evanston}\n\n{$rockford}",
        ])->assertRedirect()->assertSessionHas('success');

        $document = Document::withoutGlobalScopes()->firstOrFail();
        $this->assertSame('ready', $document->status);
        $this->assertTrue($document->isRetrievable());
        $this->assertGreaterThan(1, $document->chunk_count);
        foreach ($document->chunks as $chunk) {
            $this->assertStringEndsWith('. ', $chunk->content.' ', 'A chunk boundary split a paragraph.');
        }

        // The search test surfaces the chunk that holds the term.
        $this->actingAs($this->owner)->get('/studio/knowledge?search=evanston')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('search.query', 'evanston')
                ->where('search.results.0.document', 'Service area')
                ->where('search.results.0.score', fn ($score) => $score >= 1));

        $this->actingAs($this->owner)->get('/studio/knowledge?search=rockford')
            ->assertInertia(fn ($page) => $page->where('search.results.0.excerpt', fn ($e) => str_contains($e, 'Rockford')));

        // Editing the content re-indexes.
        $this->actingAs($this->owner)->patch("/studio/knowledge/documents/{$document->id}", ['content' => 'One paragraph only.']);
        $this->assertSame(1, $document->refresh()->chunk_count);
        $this->assertSame(1, $document->chunks()->count());
    }

    public function test_deleting_a_folder_moves_its_documents_up_rather_than_deleting_them(): void
    {
        [$parent, $child, $doc] = $this->asTenant(function () {
            $parent = Folder::create(['name' => 'Policies']);
            $child = Folder::create(['name' => 'Pricing', 'parent_id' => $parent->id]);
            $doc = Document::create(['name' => 'Deposits', 'folder_id' => $child->id, 'source_type' => 'created', 'mime' => 'text/markdown', 'size_bytes' => 5, 'content' => 'x']);

            return [$parent, $child, $doc];
        });

        $this->actingAs($this->owner)->delete("/studio/knowledge/folders/{$child->id}")->assertRedirect();

        $this->assertSame($parent->id, $doc->refresh()->folder_id);
        $this->assertDatabaseMissing('folders', ['id' => $child->id]);

        // Bulk move to root, then bulk delete.
        $this->actingAs($this->owner)->post('/studio/knowledge/move', ['document_ids' => [$doc->id], 'folder_id' => null]);
        $this->assertNull($doc->refresh()->folder_id);

        $this->actingAs($this->owner)->post('/studio/knowledge/bulk-delete', ['document_ids' => [$doc->id]]);
        $this->assertSoftDeleted('documents', ['id' => $doc->id]);
    }

    public function test_memory_is_a_document_the_agent_owns_and_ordinary_documents_are_not_reachable_as_memory(): void
    {
        $this->actingAs($this->owner)->post('/studio/memory', ['name' => 'Scheduling', 'content' => 'No installs on Fridays.'])->assertRedirect();

        $memory = Document::withoutGlobalScopes()->where('source_type', 'agent')->firstOrFail();
        $this->actingAs($this->owner)->patch("/studio/memory/{$memory->id}", ['content' => 'No installs on Fridays or Sundays.'])->assertRedirect();
        $this->assertSame('No installs on Fridays or Sundays.', $memory->refresh()->content);

        $ordinary = $this->asTenant(fn () => Document::create(['name' => 'Prices', 'source_type' => 'created', 'mime' => 'text/markdown', 'size_bytes' => 1, 'content' => 'x']));
        $this->actingAs($this->owner)->patch("/studio/memory/{$ordinary->id}", ['content' => 'y'])->assertNotFound();
        $this->actingAs($this->owner)->delete("/studio/memory/{$ordinary->id}")->assertNotFound();
    }

    // ── Developer ───────────────────────────────────────────────────────

    public function test_an_api_key_is_shown_once_and_only_its_hash_persists(): void
    {
        $response = $this->actingAs($this->owner)->post('/studio/developer/keys', ['name' => 'Widget', 'scopes' => ['calls:read']]);
        $response->assertRedirect()->assertSessionHas('new_key');

        $secret = session('new_key');
        $key = ApiKey::withoutGlobalScopes()->firstOrFail();
        $this->assertStringStartsWith($key->prefix, $secret);
        $this->assertNotSame($secret, $key->key_hash);
        $this->assertTrue($key->isActive());

        $this->actingAs($this->owner)->delete("/studio/developer/keys/{$key->id}")->assertRedirect();
        $this->assertFalse($key->refresh()->isActive());

        $this->actingAs($this->owner)->post('/studio/developer/keys', ['name' => 'Bad', 'scopes' => ['everything']])->assertSessionHasErrors('scopes.0');
    }

    public function test_a_webhook_endpoint_must_be_https_and_flashes_its_secret_once(): void
    {
        $this->actingAs($this->owner)->post('/studio/developer/webhooks', ['url' => 'http://insecure.example/hook', 'events' => ['*']])
            ->assertSessionHasErrors('url');

        $this->actingAs($this->owner)->post('/studio/developer/webhooks', ['url' => 'https://hooks.example/veyra', 'events' => ['call.ended']])
            ->assertRedirect()->assertSessionHas('new_webhook_secret');

        $endpoint = WebhookEndpoint::withoutGlobalScopes()->firstOrFail();
        $this->assertTrue($endpoint->enabled);

        $this->actingAs($this->owner)->patch("/studio/developer/webhooks/{$endpoint->id}", ['enabled' => false]);
        $this->assertFalse($endpoint->refresh()->enabled);
    }

    // ── Team & access ───────────────────────────────────────────────────

    public function test_inviting_and_adjusting_surfaces_is_an_administrator_job(): void
    {
        $member = User::create(['name' => 'Sam Support', 'email' => 'sam@veyra.test', 'password' => 'password']);
        $membership = $this->organization->addMember($member, OrganizationRole::Member);

        // A member sees the team but cannot change it.
        $this->actingAs($member)->get('/studio')->assertRedirect('/desk');
        $this->actingAs($member)->post('/studio/settings/team/invite', ['email' => 'x@y.test', 'role' => 'member', 'surfaces' => ['desk']])->assertForbidden();

        // The owner grants Studio to the member; role is untouched.
        $this->actingAs($this->owner)->patch("/studio/settings/team/{$membership->id}", ['surfaces' => ['desk', 'studio']])->assertRedirect();
        $this->assertEqualsCanonicalizing(['desk', 'studio'], $membership->refresh()->surfaces);
        $this->assertSame(OrganizationRole::Member, $membership->role);
        // A fresh User: the in-memory membership memo is per request in
        // production, but this test reuses one instance across requests.
        $this->actingAs($member->fresh())->get('/studio')->assertOk();

        // Invitations: issued, deduplicated against members and pending invites.
        $this->actingAs($this->owner)->post('/studio/settings/team/invite', ['email' => 'New@Example.test', 'role' => 'admin', 'surfaces' => ['studio']])->assertRedirect()->assertSessionHas('success');
        $this->assertSame(1, Invitation::withoutGlobalScopes()->where('email', 'new@example.test')->count());
        $this->actingAs($this->owner)->post('/studio/settings/team/invite', ['email' => 'new@example.test', 'role' => 'admin', 'surfaces' => ['studio']])->assertSessionHasErrors('email');
        $this->actingAs($this->owner)->post('/studio/settings/team/invite', ['email' => 'sam@veyra.test', 'role' => 'member', 'surfaces' => ['desk']])->assertSessionHasErrors('email');
    }

    public function test_the_last_owner_cannot_be_demoted_and_nobody_can_remove_themselves(): void
    {
        $mine = $this->organization->membershipFor($this->owner);

        $this->actingAs($this->owner)->patch("/studio/settings/team/{$mine->id}", ['role' => 'admin'])->assertSessionHasErrors('role');
        $this->assertSame(OrganizationRole::Owner, $mine->refresh()->role);

        $this->actingAs($this->owner)->delete("/studio/settings/team/{$mine->id}")->assertStatus(422);
        $this->assertDatabaseHas('memberships', ['id' => $mine->id]);
    }

    public function test_a_membership_in_another_organization_cannot_be_edited_by_id(): void
    {
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        $stranger = User::create(['name' => 'S', 'email' => 's@other.test', 'password' => 'password']);
        $theirs = $other->addMember($stranger, OrganizationRole::Member);

        $this->actingAs($this->owner)->patch("/studio/settings/team/{$theirs->id}", ['surfaces' => ['studio']])->assertNotFound();
        $this->assertSame(['desk'], $theirs->refresh()->surfaces);
    }

    // ── Product settings ────────────────────────────────────────────────

    public function test_removing_a_pipeline_stage_moves_its_leads_to_the_first_stage(): void
    {
        $this->actingAs($this->owner)->post('/studio/settings/pipelines', ['name' => 'Sales'])->assertRedirect();

        $pipeline = Pipeline::withoutGlobalScopes()->with('stages')->firstOrFail();
        $this->assertTrue($pipeline->is_default);
        $this->assertCount(4, $pipeline->stages);
        [$new, $contacted, $won, $lost] = $pipeline->stages->sortBy('position')->values();

        $lead = $this->asTenant(function () use ($pipeline, $lost) {
            $contact = Contact::create(['name' => 'Lena']);

            return Lead::create(['contact_id' => $contact->id, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $lost->id, 'position' => 0]);
        });

        // Drop "Lost", rename "Won", reorder so "Contacted" comes first.
        $this->actingAs($this->owner)->patch("/studio/settings/pipelines/{$pipeline->id}", [
            'stages' => [
                ['id' => $contacted->id, 'name' => 'Contacted', 'color' => '#ffdd03'],
                ['id' => $new->id, 'name' => 'New', 'color' => '#4dcafa'],
                ['id' => $won->id, 'name' => 'Closed won', 'color' => '#62f6b5'],
                ['id' => null, 'name' => 'Nurture', 'color' => '#71717a'],
            ],
        ])->assertRedirect();

        $this->assertDatabaseMissing('pipeline_stages', ['id' => $lost->id]);
        $this->assertSame($contacted->id, $lead->refresh()->pipeline_stage_id);
        $this->assertSame('Closed won', $won->refresh()->name);
        $this->assertSame(0, $contacted->refresh()->position);
        $this->assertSame(4, $pipeline->stages()->count());
    }

    public function test_ticket_types_carry_default_assignees(): void
    {
        $this->actingAs($this->owner)->post('/studio/settings/ticket-types', ['name' => 'Billing', 'color' => '#ffdd03', 'default_assignee_ids' => [$this->owner->id]])->assertRedirect();

        $type = TicketType::withoutGlobalScopes()->firstOrFail();
        $this->assertSame([$this->owner->id], $type->default_assignee_ids);

        $this->actingAs($this->owner)->post('/studio/settings/ticket-types', ['name' => 'Bad', 'color' => 'yellow'])->assertSessionHasErrors('color');
        $this->actingAs($this->owner)->patch("/studio/settings/ticket-types/{$type->id}", ['enabled' => false]);
        $this->assertFalse($type->refresh()->enabled);
    }

    public function test_only_an_administrator_changes_the_organization(): void
    {
        $member = User::create(['name' => 'Sam', 'email' => 'sam@veyra.test', 'password' => 'password']);
        $this->organization->addMember($member, OrganizationRole::Member)->grant(\App\Enums\Surface::Studio);

        $this->actingAs($member)->put('/studio/settings/organization', ['name' => 'Hijacked', 'timezone' => 'UTC'])->assertForbidden();
        $this->actingAs($this->owner)->put('/studio/settings/organization', ['name' => 'Northwind Services', 'timezone' => 'America/Chicago'])->assertRedirect();
        $this->assertSame('America/Chicago', $this->organization->refresh()->timezone);
    }

    // ── Integrations ────────────────────────────────────────────────────

    public function test_connecting_a_catalog_app_mirrors_its_tools_as_actions_and_disconnecting_removes_them(): void
    {
        $this->actingAs($this->owner)->post('/studio/integrations/catalog/googlecalendar/connect')->assertRedirect('/studio/integrations');

        $integration = Integration::withoutGlobalScopes()->where('toolkit', 'googlecalendar')->firstOrFail();
        $this->assertSame('connected', $integration->status, 'Stub mode connects immediately.');
        $actions = Action::withoutGlobalScopes()->where('integration_id', $integration->id)->get();
        $this->assertGreaterThan(0, $actions->count());

        // Reliability flags come from what the tool does.
        $write = $actions->first(fn (Action $a) => $a->is_durable_write);
        $read = $actions->first(fn (Action $a) => ! $a->is_durable_write);
        $this->assertNotNull($write);
        $this->assertNotNull($read);
        $this->assertFalse($write->is_idempotent);
        $this->assertTrue($read->is_idempotent);

        $this->actingAs($this->owner)->delete("/studio/integrations/{$integration->id}")->assertRedirect();
        $this->assertSame(0, Action::withoutGlobalScopes()->where('integration_id', $integration->id)->count());
    }

    public function test_with_composio_configured_connecting_sends_the_person_to_the_provider_and_the_callback_finishes_it(): void
    {
        config(['services.composio.key' => 'ak_test']);
        \Illuminate\Support\Facades\Cache::flush();
        $http = \Illuminate\Support\Facades\Http::class;
        $http::fake([
            'backend.composio.dev/api/v3/toolkits/googlecalendar' => $http::response(['slug' => 'googlecalendar', 'name' => 'Google Calendar', 'composio_managed_auth_schemes' => ['OAUTH2'], 'auth_schemes' => ['OAUTH2'], 'meta' => ['description' => 'Calendar.', 'logo' => 'https://logos/gcal', 'tools_count' => 28, 'categories' => [['id' => 'productivity', 'name' => 'productivity']]]]),
            'backend.composio.dev/api/v3/tools*' => $http::response(['items' => [
                ['slug' => 'GOOGLECALENDAR_FIND_FREE_SLOTS', 'name' => 'Find free slots', 'description' => 'Free windows.', 'input_parameters' => ['type' => 'object', 'properties' => ['date' => ['type' => 'string']]], 'is_deprecated' => false],
                ['slug' => 'GOOGLECALENDAR_CREATE_EVENT', 'name' => 'Create event', 'description' => 'Book.', 'input_parameters' => ['type' => 'object', 'properties' => []], 'is_deprecated' => false],
            ], 'next_cursor' => null]),
            'backend.composio.dev/api/v3/auth_configs*' => fn ($request) => $request->method() === 'POST'
                ? $http::response(['auth_config' => ['id' => 'ac_1']])
                : $http::response(['items' => []]),
            'backend.composio.dev/api/v3/connected_accounts/link' => $http::response(['redirect_url' => 'https://accounts.google.com/o/oauth2/auth?x=1', 'connected_account_id' => 'ca_1']),
            'backend.composio.dev/api/v3/connected_accounts/ca_1' => $http::response(['id' => 'ca_1', 'status' => 'ACTIVE']),
        ]);

        // Inertia::location: for an Inertia request a 409 carrying the
        // external URL; for a plain one, a redirect to it. The page sends
        // the former; this test checks the latter is the same URL.
        $response = $this->actingAs($this->owner)->post('/studio/integrations/catalog/googlecalendar/connect', ['tools' => ['GOOGLECALENDAR_CREATE_EVENT']]);
        $response->assertRedirect('https://accounts.google.com/o/oauth2/auth?x=1');
        $this->actingAs($this->owner)->withHeader('X-Inertia', 'true')->post('/studio/integrations/catalog/googlecalendar/connect', ['tools' => ['GOOGLECALENDAR_CREATE_EVENT']])
            ->assertStatus(409)->assertHeader('X-Inertia-Location', 'https://accounts.google.com/o/oauth2/auth?x=1');

        $integration = Integration::withoutGlobalScopes()->where('toolkit', 'googlecalendar')->firstOrFail();
        $this->assertSame('initiated', $integration->status);
        $this->assertSame('ca_1', $integration->external_account_id);
        $actions = Action::withoutGlobalScopes()->where('integration_id', $integration->id)->get();
        $this->assertCount(1, $actions, 'only the chosen tool is mirrored');
        $this->assertFalse($actions[0]->enabled, 'disabled until the account is live');
        $this->assertTrue($actions[0]->is_durable_write);
        $this->assertSame('GOOGLECALENDAR_CREATE_EVENT', $actions[0]->config['tool_slug']);

        // Back from Google: the account is active, so the actions go live.
        // withHeader() above sticks for the rest of the test; the browser
        // arrives at the callback from Google with no Inertia header.
        $this->flushHeaders();
        $this->actingAs($this->owner)->get("/studio/integrations/callback?integration={$integration->id}")->assertRedirect('/studio/integrations')->assertSessionHas('success');
        $this->assertSame('connected', $integration->refresh()->status);
        $this->assertTrue($actions[0]->refresh()->enabled);
        $this->assertSame('ca_1', $actions[0]->config['connected_account_id']);
    }

    public function test_an_api_key_app_refuses_to_connect_without_a_key(): void
    {
        $this->actingAs($this->owner)->post('/studio/integrations/catalog/stripe/connect')->assertSessionHasErrors('api_key');
        $this->actingAs($this->owner)->post('/studio/integrations/catalog/no-such-app/connect')->assertNotFound();
    }

    public function test_a_custom_http_action_becomes_a_tool_schema(): void
    {
        $this->actingAs($this->owner)->post('/studio/integrations/http', [
            'name' => 'Create booking', 'description' => 'Book a slot in the dispatch system.',
            'method' => 'POST', 'url' => 'https://api.northwind.example/bookings', 'auth_type' => 'bearer', 'auth_value' => 'tok',
            'parameters' => [
                ['name' => 'contact_id', 'description' => 'The contact', 'required' => true],
                ['name' => 'notes', 'description' => 'Free text', 'required' => false],
            ],
        ])->assertRedirect()->assertSessionHas('success');

        $action = Action::withoutGlobalScopes()->where('slug', 'create_booking')->firstOrFail();
        $this->assertSame(['contact_id'], $action->parameters['required']);
        $this->assertArrayHasKey('notes', $action->parameters['properties']);
        // A POST defaults to a durable, non-repeatable write.
        $this->assertTrue($action->is_durable_write);
        $this->assertFalse($action->is_idempotent);

        $this->actingAs($this->owner)->post('/studio/integrations/http', [
            'name' => 'Bad', 'description' => 'x', 'method' => 'GET', 'url' => 'https://x.test', 'auth_type' => 'none',
            'parameters' => [['name' => 'Not Valid', 'description' => 'x']],
        ])->assertSessionHasErrors('parameters.0.name');
    }

    public function test_an_mcp_server_is_recorded_and_its_credentials_are_kept_out_of_config(): void
    {
        $this->actingAs($this->owner)->post('/studio/integrations/mcp', [
            'label' => 'Dispatch MCP', 'url' => 'https://mcp.northwind.example/sse', 'transport' => 'sse', 'auth_type' => 'bearer', 'auth_value' => 'secret-token',
        ])->assertRedirect();

        $integration = Integration::withoutGlobalScopes()->where('provider', 'mcp')->firstOrFail();
        $this->assertSame('disconnected', $integration->status);
        $this->assertSame('sse', $integration->config['transport']);
        $this->assertArrayNotHasKey('auth_value', $integration->config);
        $this->assertSame('secret-token', $integration->credentials['auth_value']);
    }

    // ── Ask ─────────────────────────────────────────────────────────────

    public function test_asking_starts_a_thread_and_records_the_honest_placeholder(): void
    {
        $response = $this->actingAs($this->owner)->post('/studio/ask', ['message' => 'Write a skill for rescheduling.']);

        $thread = \App\Models\AgentThread::withoutGlobalScopes()->firstOrFail();
        $response->assertRedirect("/studio/ask/{$thread->id}");
        $this->assertCount(2, $thread->messages);
        $this->assertSame('user', $thread->messages[0]['role']);
        $this->assertTrue($thread->messages[1]['pending']);

        // Another user in the same organization cannot read or delete it.
        $colleague = User::create(['name' => 'C', 'email' => 'c@veyra.test', 'password' => 'password']);
        $this->organization->addMember($colleague, OrganizationRole::Admin);
        $this->actingAs($colleague)->get('/studio/ask')->assertInertia(fn ($page) => $page->has('threads', 0));
        $this->actingAs($colleague)->delete("/studio/ask/{$thread->id}")->assertForbidden();
    }

    // ── Tenancy across Studio ───────────────────────────────────────────

    public function test_studio_records_in_another_organization_are_not_found_by_id(): void
    {
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        Organization::setCurrent($other);
        $document = Document::create(['name' => 'Theirs', 'source_type' => 'created', 'mime' => 'text/markdown', 'size_bytes' => 1, 'content' => 'x']);
        $automation = Automation::create(['name' => 'Theirs', 'triggers' => ['manual'], 'reasoning' => 'fast']);
        Organization::setCurrent(null);

        $this->actingAs($this->owner)->get("/studio/knowledge/documents/{$document->id}")->assertNotFound();
        $this->actingAs($this->owner)->patch("/studio/automations/{$automation->id}", ['name' => 'Mine now'])->assertNotFound();
        $this->assertSame('Theirs', $automation->refresh()->name);
    }
}
