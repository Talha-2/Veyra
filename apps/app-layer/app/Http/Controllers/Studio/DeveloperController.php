<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\Webhooks\WebhookDispatcher;
use App\Support\PublicApi\OpenApiSpec;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Studio › Developer: getting started, API keys, webhook endpoints with their
 * deliveries, and the API reference rendered from the OpenAPI spec.
 */
class DeveloperController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('studio/developer', [
            'keys' => ApiKey::query()->with('createdBy:id,name')->latest()->get()->map(fn (ApiKey $k) => [
                'id' => $k->id, 'name' => $k->name, 'prefix' => $k->prefix, 'scopes' => $k->scopes,
                'publishable' => $k->publishable, 'active' => $k->isActive(),
                'last_used_at' => $k->last_used_at?->toIso8601String(), 'created_at' => $k->created_at?->toIso8601String(),
                'revoked_at' => $k->revoked_at?->toIso8601String(),
                'created_by' => $k->createdBy?->name,
            ])->all(),
            'scopes' => ApiKey::SCOPES,
            'scope_descriptions' => ApiKey::SCOPE_DESCRIPTIONS,
            'publishable_scopes' => ApiKey::PUBLISHABLE_SCOPES,
            'webhooks' => WebhookEndpoint::query()->withCount('deliveries')->latest()->get()->map(fn (WebhookEndpoint $w) => [
                'id' => $w->id, 'url' => $w->url, 'events' => $w->events, 'enabled' => $w->enabled,
                'disabled_reason' => $w->disabled_reason,
                'deliveries_count' => $w->deliveries_count, 'consecutive_failures' => $w->consecutive_failures,
                'last_delivered_at' => $w->last_delivered_at?->toIso8601String(),
                // Enough to read a health trend and open the last few, not a log.
                'recent' => $w->deliveries()->limit(20)->get()->map(fn (WebhookDelivery $d) => [
                    'id' => $d->id, 'event' => $d->event, 'status' => $d->status, 'response_status' => $d->response_status,
                    'attempt' => $d->attempt, 'duration_ms' => $d->duration_ms, 'at' => $d->created_at?->toIso8601String(),
                    'payload' => $d->payload,
                    'response_body' => str((string) $d->response_body)->limit(400)->value(),
                ])->all(),
            ])->all(),
            'events' => WebhookEndpoint::EVENTS,
            'event_descriptions' => WebhookEndpoint::EVENT_DESCRIPTIONS,
            'disable_after' => WebhookEndpoint::disableAfter(),
            'base_url' => url('/api/v1'),
            // Lazy: only the reference tab needs it, and it is the largest prop.
            'spec' => Inertia::optional(fn () => OpenApiSpec::build()),
        ]);
    }

    public function storeKey(Request $request): RedirectResponse
    {
        $publishable = $request->boolean('publishable');
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => [Rule::in($publishable ? ApiKey::PUBLISHABLE_SCOPES : ApiKey::SCOPES)],
            'publishable' => ['boolean'],
        ], [
            'scopes.*.in' => $publishable
                ? 'A publishable key can only hold '.implode(', ', ApiKey::PUBLISHABLE_SCOPES).'.'
                : 'That is not a scope.',
        ]);

        [, $secret] = ApiKey::mint($validated['name'], array_values(array_unique($validated['scopes'])), $publishable, $request->user());

        // Flashed once. The hash is all that persists.
        return back()->with('new_key', $secret)->with('success', 'Key created. Copy it now — it will not be shown again.');
    }

    public function revokeKey(ApiKey $key): RedirectResponse
    {
        $key->revoke();

        return back()->with('success', "Key \"{$key->name}\" revoked.");
    }

    public function storeWebhook(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url', 'max:500', 'starts_with:https://'],
            'events' => ['required', 'array', 'min:1'],
            'events.*' => [Rule::in(['*', ...WebhookEndpoint::EVENTS])],
        ]);

        $endpoint = WebhookEndpoint::create([...$validated, 'secret' => 'whsec_'.Str::random(32), 'enabled' => true]);

        return back()->with('new_webhook_secret', $endpoint->secret)->with('success', 'Endpoint added. The signing secret is shown once.');
    }

    public function updateWebhook(Request $request, WebhookEndpoint $webhook): RedirectResponse
    {
        $webhook->setEnabled($request->validate(['enabled' => ['required', 'boolean']])['enabled']);

        return back();
    }

    public function destroyWebhook(WebhookEndpoint $webhook): RedirectResponse
    {
        $webhook->delete();

        return back();
    }

    /** Send a signed test event now and record it, so the endpoint's owner sees exactly what a real one looks like. */
    public function testWebhook(WebhookEndpoint $webhook, WebhookDispatcher $webhooks): RedirectResponse
    {
        $delivery = $webhooks->sendTest($webhook);
        $ok = $delivery->status === 'delivered';

        return back()->with($ok ? 'success' : 'error', $ok
            ? "Delivered (HTTP {$delivery->response_status}) in {$delivery->duration_ms} ms."
            : 'Delivery failed: '.($delivery->response_status ? "HTTP {$delivery->response_status}" : $delivery->response_body));
    }
}
