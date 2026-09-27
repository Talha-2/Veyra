<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** API keys, webhook endpoints, and the event catalog. Ported from the retired server's developer router. */
class DeveloperController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('studio/developer', [
            'keys' => ApiKey::query()->with('createdBy:id,name')->latest()->get()->map(fn (ApiKey $k) => [
                'id' => $k->id, 'name' => $k->name, 'prefix' => $k->prefix, 'scopes' => $k->scopes,
                'publishable' => $k->publishable, 'active' => $k->isActive(),
                'last_used_at' => $k->last_used_at?->toIso8601String(), 'created_at' => $k->created_at?->toIso8601String(),
                'created_by' => $k->createdBy?->name,
            ])->all(),
            'scopes' => ApiKey::SCOPES,
            'webhooks' => WebhookEndpoint::query()->withCount('deliveries')->latest()->get()->map(fn (WebhookEndpoint $w) => [
                'id' => $w->id, 'url' => $w->url, 'events' => $w->events, 'enabled' => $w->enabled,
                'deliveries_count' => $w->deliveries_count, 'consecutive_failures' => $w->consecutive_failures,
                'last_delivered_at' => $w->last_delivered_at?->toIso8601String(),
                // Enough to read a health trend at a glance, not a log.
                'recent' => $w->deliveries()->limit(20)->get()->map(fn (WebhookDelivery $d) => [
                    'id' => $d->id, 'event' => $d->event, 'status' => $d->status, 'response_status' => $d->response_status,
                    'attempt' => $d->attempt, 'at' => $d->created_at?->toIso8601String(),
                ])->all(),
            ])->all(),
            'events' => WebhookEndpoint::EVENTS,
            'base_url' => url('/api/v1'),
        ]);
    }

    public function storeKey(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => [Rule::in(ApiKey::SCOPES)],
            'publishable' => ['boolean'],
        ]);

        [, $secret] = ApiKey::mint($validated['name'], $validated['scopes'], $validated['publishable'] ?? false, $request->user());

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
        $webhook->update($request->validate(['enabled' => ['required', 'boolean']]));

        return back();
    }

    public function destroyWebhook(WebhookEndpoint $webhook): RedirectResponse
    {
        $webhook->delete();

        return back();
    }

    /** Send a signed test event and record the delivery, so the endpoint's owner can see what a real one looks like. */
    public function testWebhook(WebhookEndpoint $webhook): RedirectResponse
    {
        $payload = ['id' => 'evt_'.Str::random(12), 'type' => 'test.ping', 'created_at' => now()->toIso8601String(), 'data' => ['message' => 'Hello from Veyra.']];
        $body = json_encode($payload);
        $signature = hash_hmac('sha256', $body, $webhook->secret);

        try {
            $response = Http::timeout(10)->withHeaders(['X-Veyra-Signature' => "sha256={$signature}", 'Content-Type' => 'application/json'])->withBody($body, 'application/json')->post($webhook->url);
            $status = $response->status();
            $ok = $response->successful();
            $text = str($response->body())->limit(1000)->value();
        } catch (\Throwable $e) {
            $status = null; $ok = false; $text = $e->getMessage();
        }

        WebhookDelivery::create([
            'webhook_endpoint_id' => $webhook->id, 'event' => 'test.ping', 'payload' => $payload,
            'response_status' => $status, 'response_body' => $text, 'attempt' => 1, 'status' => $ok ? 'delivered' : 'failed',
        ]);
        $webhook->update(['last_delivered_at' => $ok ? now() : $webhook->last_delivered_at, 'consecutive_failures' => $ok ? 0 : $webhook->consecutive_failures + 1]);

        return back()->with($ok ? 'success' : 'error', $ok ? "Delivered (HTTP {$status})." : 'Delivery failed: '.($status ? "HTTP {$status}" : $text));
    }
}
