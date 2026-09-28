<?php

namespace App\Services\Webhooks;

use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Scopes\TenantScope;
use Closure;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

use function Illuminate\Support\defer;

/**
 * Signed, recorded, after-the-response webhook delivery.
 *
 * There is no queue worker in production (QUEUE_CONNECTION=sync under
 * `artisan serve`), so a delivery cannot be a job. Instead `emit()` decides
 * who should hear about an event and defers the HTTP work until after the
 * response has been sent, in the same PHP worker. Three rules follow:
 *
 * - **Short timeouts.** The worker is busy until the delivery finishes.
 * - **Nothing here may break the request that caused it.** Every step is
 *   wrapped; a failure is recorded and reported, never thrown.
 * - **Every attempt is a WebhookDelivery row**, so the Developer page can
 *   show exactly what was sent and what came back.
 *
 * Signature: `X-Veyra-Signature: sha256=<hex HMAC-SHA256 of the raw body,
 * keyed with the endpoint's signing secret>`.
 */
class WebhookDispatcher
{
    public const USER_AGENT = 'Veyra-Webhooks/1.0';

    /**
     * Queue an event for every enabled endpoint of the organization that
     * subscribes to it. `$object` may be a closure so the payload is only
     * built when someone is listening.
     *
     * @param  array<string, mixed>|Closure(): array<string, mixed>  $object
     * @param  array<string, mixed>  $previous  changed fields' old values, for *.updated events
     */
    public function emit(string $event, ?int $organizationId, array|Closure $object, array $previous = []): void
    {
        if ($organizationId === null) {
            return;
        }

        try {
            $endpoints = WebhookEndpoint::withoutGlobalScope(TenantScope::class)
                ->where('organization_id', $organizationId)
                ->where('enabled', true)
                ->get()
                ->filter(fn (WebhookEndpoint $e) => $e->subscribesTo($event))
                ->values();

            if ($endpoints->isEmpty()) {
                return;
            }

            $payload = $this->envelope($event, $organizationId, $object instanceof Closure ? $object() : $object, $previous);

            foreach ($endpoints as $endpoint) {
                // `always`: the record changed whether or not the request
                // that changed it went on to fail.
                defer(fn () => $this->deliver($endpoint->id, $payload), always: true);
            }
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** @return array<string, mixed> */
    public function envelope(string $event, int $organizationId, array $object, array $previous = []): array
    {
        return [
            'id' => 'evt_'.Str::lower((string) Str::ulid()),
            'object' => 'event',
            'type' => $event,
            'created_at' => now()->utc()->toIso8601ZuluString(),
            'organization_id' => $organizationId,
            'data' => array_filter(['object' => $object, 'previous_attributes' => $previous ?: null], fn ($v) => $v !== null),
        ];
    }

    /**
     * Deliver one event to one endpoint: one attempt, and one immediate retry
     * when the endpoint answered 5xx/429 or refused quickly. The outcome of
     * the last attempt moves the endpoint's failure count.
     */
    public function deliver(int $endpointId, array $payload): ?WebhookDelivery
    {
        try {
            $endpoint = WebhookEndpoint::withoutGlobalScope(TenantScope::class)->find($endpointId);

            // Re-read: an earlier delivery in the same request may have just
            // turned this endpoint off.
            if (! $endpoint || ! $endpoint->enabled) {
                return null;
            }

            $delivery = $this->attempt($endpoint, $payload, 1);
            if ($delivery->status === 'failed' && $this->retryable($delivery)) {
                $delivery = $this->attempt($endpoint, $payload, 2);
            }

            $delivery->status === 'delivered' ? $endpoint->recordSuccess() : $endpoint->recordFailure();

            return $delivery;
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    /** The "Send test" button: a real, signed delivery of a `test.ping` event, sent now. */
    public function sendTest(WebhookEndpoint $endpoint): WebhookDelivery
    {
        $payload = $this->envelope('test.ping', $endpoint->organization_id, [
            'object' => 'test', 'message' => 'Hello from Veyra. This is what a delivery looks like.',
        ]);
        $delivery = $this->attempt($endpoint, $payload, 1);
        $delivery->status === 'delivered' ? $endpoint->recordSuccess() : $endpoint->recordFailure();

        return $delivery;
    }

    public static function sign(string $body, string $secret): string
    {
        return 'sha256='.hash_hmac('sha256', $body, $secret);
    }

    private function attempt(WebhookEndpoint $endpoint, array $payload, int $attempt): WebhookDelivery
    {
        $delivery = (new WebhookDelivery)->forceFill([
            'organization_id' => $endpoint->organization_id,
            'webhook_endpoint_id' => $endpoint->id,
            'event' => $payload['type'],
            'payload' => $payload,
            'attempt' => $attempt,
            'status' => 'pending',
        ]);
        $delivery->save();

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $started = hrtime(true);
        $status = null;
        $ok = false;

        if ($refusal = $this->refusal($endpoint->url)) {
            $text = $refusal;
        } else {
            try {
                $response = Http::timeout((int) config('public_api.webhooks.timeout', 5))
                    ->connectTimeout((int) config('public_api.webhooks.connect_timeout', 3))
                    ->withoutRedirecting()
                    ->withUserAgent(self::USER_AGENT)
                    ->withHeaders([
                        'X-Veyra-Event' => $payload['type'],
                        'X-Veyra-Delivery' => (string) $delivery->id,
                        'X-Veyra-Signature' => self::sign($body, $endpoint->secret),
                        'X-Veyra-Attempt' => (string) $attempt,
                    ])
                    ->withBody($body, 'application/json')
                    ->post($endpoint->url);

                $status = $response->status();
                $ok = $response->successful();
                $text = str($response->body())->limit(1000)->value();
            } catch (Throwable $e) {
                $text = str($e->getMessage())->limit(1000)->value();
            }
        }

        $delivery->forceFill([
            'status' => $ok ? 'delivered' : 'failed',
            'response_status' => $status,
            'response_body' => $text,
            'duration_ms' => (int) round((hrtime(true) - $started) / 1e6),
        ])->save();

        return $delivery;
    }

    private function retryable(WebhookDelivery $delivery): bool
    {
        if ($delivery->response_status === null) {
            // Refused fast (nothing listening, DNS) is worth one more try;
            // a timeout is not — it would hold the worker twice as long.
            return $delivery->duration_ms < 1000 && ! str_starts_with((string) $delivery->response_body, 'Refused');
        }

        return $delivery->response_status >= 500 || $delivery->response_status === 429;
    }

    /**
     * Why a URL may not be called, or null. Outside local development an
     * endpoint may not point into a private network — otherwise any
     * customer could make the app probe addresses only it can reach.
     */
    public function refusal(string $url): ?string
    {
        if (config('public_api.webhooks.allow_private_urls')) {
            return null;
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return 'Refused: the URL has no host.';
        }
        $host = trim($host, '[]');

        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if ($ips === []) {
            return "Could not resolve {$host}.";
        }

        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return "Refused: {$host} is a private or reserved address ({$ip}).";
            }
        }

        return null;
    }
}
