<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\ApiKey;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\User;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\Webhooks\WebhookDispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Tests\TestCase;

/**
 * Real events, delivered after the response, signed, recorded, and never
 * able to break the request that caused them.
 */
class WebhookDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private const URL = 'https://hooks.example.com/veyra';

    private Organization $org;

    private User $owner;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();

        // hooks.example.com does not resolve in the test sandbox; the private
        // address guard is tested on its own below.
        config(['public_api.webhooks.allow_private_urls' => true]);

        $this->org = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->org->addMember($this->owner, OrganizationRole::Owner);
        $this->key = $this->as(fn () => ApiKey::mint('Test', ApiKey::SCOPES, false, null)[1]);
    }

    private function as(callable $fn, ?Organization $org = null): mixed
    {
        Organization::setCurrent($org ?? $this->org);
        try {
            return $fn();
        } finally {
            Organization::setCurrent(null);
        }
    }

    private function endpoint(array $events = ['*'], ?Organization $org = null, string $url = self::URL): WebhookEndpoint
    {
        return $this->as(fn () => WebhookEndpoint::create(['url' => $url, 'events' => $events, 'secret' => 'whsec_test_secret', 'enabled' => true]), $org);
    }

    private function api(): static
    {
        return $this->withToken($this->key)->withHeader('Accept', 'application/json');
    }

    public function test_a_ticket_created_through_the_api_is_delivered_signed(): void
    {
        Http::fake([self::URL => Http::response('ok', 200)]);
        $this->endpoint(['ticket.created']);

        $id = $this->api()->postJson('/api/v1/tickets', ['subject' => 'Refund'])->assertCreated()->json('id');

        $delivery = WebhookDelivery::withoutGlobalScopes()->sole();
        $this->assertSame('delivered', $delivery->status);
        $this->assertSame('ticket.created', $delivery->event);
        $this->assertSame(200, $delivery->response_status);
        $this->assertSame($this->org->id, $delivery->organization_id);

        Http::assertSentCount(1);
        Http::assertSent(function (HttpRequest $request) use ($delivery, $id) {
            $body = $request->body();
            $payload = json_decode($body, true);

            return $request->url() === self::URL
                && $request->hasHeader('X-Veyra-Signature', 'sha256='.hash_hmac('sha256', $body, 'whsec_test_secret'))
                && $request->hasHeader('X-Veyra-Event', 'ticket.created')
                && $request->hasHeader('X-Veyra-Delivery', (string) $delivery->id)
                && $payload['type'] === 'ticket.created'
                && $payload['object'] === 'event'
                && str_starts_with($payload['id'], 'evt_')
                && $payload['data']['object']['id'] === $id
                && $payload['data']['object']['object'] === 'ticket';
        });

        $endpoint = WebhookEndpoint::withoutGlobalScopes()->sole();
        $this->assertNotNull($endpoint->last_delivered_at);
        $this->assertSame(0, $endpoint->consecutive_failures);
    }

    public function test_delivery_waits_until_after_the_response(): void
    {
        Http::fake([self::URL => Http::response('ok', 200)]);
        $this->endpoint();

        app(WebhookDispatcher::class)->emit('contact.created', $this->org->id, ['id' => 1, 'object' => 'contact']);

        // Queued for after the response, not sent inline.
        Http::assertNothingSent();
        $this->assertSame(0, WebhookDelivery::withoutGlobalScopes()->count());
        $this->assertSame(1, app(DeferredCallbackCollection::class)->count());

        app(DeferredCallbackCollection::class)->invoke();

        Http::assertSentCount(1);
        $this->assertSame('delivered', WebhookDelivery::withoutGlobalScopes()->sole()->status);
    }

    public function test_a_failing_endpoint_never_breaks_the_request_and_is_retried_once(): void
    {
        Http::fake([self::URL => Http::response('down', 503)]);
        $this->endpoint();

        $this->api()->postJson('/api/v1/contacts', ['name' => 'Maya'])->assertCreated();

        $attempts = WebhookDelivery::withoutGlobalScopes()->orderBy('id')->get();
        $this->assertSame([1, 2], $attempts->pluck('attempt')->all());
        $this->assertSame(['failed', 'failed'], $attempts->pluck('status')->all());
        $this->assertSame(503, $attempts->last()->response_status);
        // One event, one failure, however many attempts.
        $this->assertSame(1, WebhookEndpoint::withoutGlobalScopes()->sole()->consecutive_failures);
    }

    public function test_a_connection_error_is_recorded_not_thrown(): void
    {
        Http::fake(fn () => throw new ConnectionException('Connection refused'));
        $this->endpoint(['contact.created']);

        $this->api()->postJson('/api/v1/contacts', ['name' => 'Maya'])->assertCreated();

        $last = WebhookDelivery::withoutGlobalScopes()->latest('id')->first();
        $this->assertSame('failed', $last->status);
        $this->assertNull($last->response_status);
        $this->assertStringContainsString('Connection refused', $last->response_body);
    }

    public function test_an_endpoint_is_turned_off_after_repeated_failures_and_back_on_from_studio(): void
    {
        config(['public_api.webhooks.disable_after' => 3]);
        Http::fake([self::URL => Http::response('nope', 400)]);
        $endpoint = $this->endpoint(['contact.created']);

        foreach (['A', 'B', 'C'] as $name) {
            $this->api()->postJson('/api/v1/contacts', ['name' => $name])->assertCreated();
        }

        $endpoint->refresh();
        $this->assertFalse($endpoint->enabled);
        $this->assertSame(3, $endpoint->consecutive_failures);
        $this->assertStringContainsString('3 failed deliveries', $endpoint->disabled_reason);
        $this->assertSame(3, WebhookDelivery::withoutGlobalScopes()->count(), '4xx is not retried');

        // Off means off.
        $this->api()->postJson('/api/v1/contacts', ['name' => 'D'])->assertCreated();
        $this->assertSame(3, WebhookDelivery::withoutGlobalScopes()->count());

        // Switching it back on is a fresh start.
        $this->actingAs($this->owner)->patch("/studio/developer/webhooks/{$endpoint->id}", ['enabled' => true])->assertRedirect();
        $endpoint->refresh();
        $this->assertTrue($endpoint->enabled);
        $this->assertSame(0, $endpoint->consecutive_failures);
        $this->assertNull($endpoint->disabled_reason);
    }

    public function test_only_subscribed_endpoints_of_the_same_organization_hear_an_event(): void
    {
        Http::fake(['*' => Http::response('ok', 200)]);
        $other = Organization::create(['name' => 'Lakeside', 'slug' => 'lakeside', 'timezone' => 'UTC']);
        $this->endpoint(['call.ended'], url: 'https://hooks.example.com/calls');
        $this->endpoint(['*'], $other, 'https://hooks.example.com/theirs');
        $this->endpoint(['contact.created'], url: 'https://hooks.example.com/contacts');

        $this->api()->postJson('/api/v1/contacts', ['name' => 'Maya'])->assertCreated();

        Http::assertSentCount(1);
        Http::assertSent(fn (HttpRequest $r) => $r->url() === 'https://hooks.example.com/contacts');
    }

    public function test_changes_from_desk_emit_events_with_previous_values(): void
    {
        Http::fake([self::URL => Http::response('ok', 200)]);
        [$lead, $won] = $this->as(function () {
            $p = Pipeline::create(['name' => 'Sales', 'is_default' => true]);
            $new = PipelineStage::create(['pipeline_id' => $p->id, 'name' => 'New', 'position' => 0]);
            $won = PipelineStage::create(['pipeline_id' => $p->id, 'name' => 'Won', 'position' => 1]);
            $lead = Lead::create(['contact_id' => Contact::create(['name' => 'Maya'])->id, 'pipeline_id' => $p->id, 'pipeline_stage_id' => $new->id]);

            return [$lead, $won];
        });
        $this->endpoint(['lead.stage_changed', 'ticket.created']);

        // A drag on the Desk kanban.
        $this->actingAs($this->owner)->post("/desk/leads/{$lead->id}/move", ['pipeline_stage_id' => $won->id, 'position' => 0])->assertRedirect();
        // A ticket raised in Desk.
        $this->actingAs($this->owner)->post('/desk/tickets', ['subject' => 'From Desk', 'priority' => 'normal'])->assertRedirect();

        $events = WebhookDelivery::withoutGlobalScopes()->orderBy('id')->get();
        $this->assertSame(['lead.stage_changed', 'ticket.created'], $events->pluck('event')->all());
        $moved = $events->first()->payload;
        $this->assertSame($won->id, $moved['data']['object']['stage']['id']);
        $this->assertArrayHasKey('pipeline_stage_id', $moved['data']['previous_attributes']);
    }

    public function test_private_addresses_are_refused_outside_local_development(): void
    {
        config(['public_api.webhooks.allow_private_urls' => false]);
        Http::fake();
        $this->endpoint(['contact.created'], url: 'https://127.0.0.1/hook');

        $this->api()->postJson('/api/v1/contacts', ['name' => 'Maya'])->assertCreated();

        Http::assertNothingSent();
        $delivery = WebhookDelivery::withoutGlobalScopes()->sole();
        $this->assertSame('failed', $delivery->status);
        $this->assertStringStartsWith('Refused', $delivery->response_body);
    }

    public function test_the_studio_test_button_sends_a_signed_ping(): void
    {
        Http::fake([self::URL => Http::response('ok', 204)]);
        $endpoint = $this->endpoint(['call.ended']);

        $this->actingAs($this->owner)->post("/studio/developer/webhooks/{$endpoint->id}/test")->assertRedirect()->assertSessionHas('success');

        Http::assertSent(fn (HttpRequest $r) => $r->hasHeader('X-Veyra-Event', 'test.ping')
            && $r->hasHeader('X-Veyra-Signature', 'sha256='.hash_hmac('sha256', $r->body(), 'whsec_test_secret')));
        $this->assertSame(0, $endpoint->refresh()->consecutive_failures);
        $this->assertNotNull($endpoint->last_delivered_at);
    }
}
