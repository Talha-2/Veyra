<?php

namespace App\Services\Composio;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Composio's v3 API, the parts Studio uses: browse toolkits and tools, create
 * the auth config a toolkit needs, hand a person off to connect an account,
 * and read the account back afterwards.
 *
 * Read calls are cached: the catalog is 1,500 toolkits and does not change
 * between page loads. Nothing here executes a tool — that is the agent
 * layer's job, keyed by the connected account this class records.
 */
class ComposioClient
{
    public const BASE = 'https://backend.composio.dev/api/v3';

    public function configured(): bool
    {
        return filled(config('services.composio.key'));
    }

    // ── catalog ─────────────────────────────────────────────────────────

    /** @return array{items: list<array>, total: int} */
    public function toolkits(?string $search = null, ?string $category = null, int $limit = 60): array
    {
        $key = 'composio:toolkits:'.md5(json_encode([$search, $category, $limit]));

        return Cache::remember($key, now()->addHour(), function () use ($search, $category, $limit) {
            $body = $this->get('/toolkits', array_filter(['search' => $search, 'category' => $category, 'limit' => $limit, 'sort_by' => $search ? null : 'usage']));

            return ['items' => $body['items'] ?? [], 'total' => (int) ($body['total_items'] ?? count($body['items'] ?? []))];
        });
    }

    public function toolkit(string $slug): ?array
    {
        return Cache::remember("composio:toolkit:{$slug}", now()->addHour(), function () use ($slug) {
            try {
                return $this->get("/toolkits/{$slug}");
            } catch (RequestException $e) {
                return $e->response->status() === 404 ? null : throw $e;
            }
        }) ?: null;
    }

    /** @return list<string> */
    public function categories(): array
    {
        return Cache::remember('composio:categories', now()->addHours(6), function () {
            $items = $this->get('/toolkits/categories')['items'] ?? [];

            return collect($items)->map(fn ($c) => $c['name'] ?? $c['id'] ?? null)->filter()->unique()->values()->all();
        });
    }

    /** @return list<array> */
    public function tools(string $toolkitSlug, int $limit = 200): array
    {
        return Cache::remember("composio:tools:{$toolkitSlug}", now()->addHour(), function () use ($toolkitSlug, $limit) {
            $items = [];
            $cursor = null;
            do {
                $body = $this->get('/tools', array_filter(['toolkit_slug' => $toolkitSlug, 'limit' => min($limit, 100), 'cursor' => $cursor]));
                $items = [...$items, ...($body['items'] ?? [])];
                $cursor = $body['next_cursor'] ?? null;
            } while ($cursor && count($items) < $limit);

            return array_values(array_filter($items, fn ($t) => ! ($t['is_deprecated'] ?? false)));
        });
    }

    // ── connecting ──────────────────────────────────────────────────────

    /**
     * The auth config to connect this toolkit under. Reused when one exists;
     * otherwise Composio's managed OAuth app, or — for Google toolkits that
     * do not offer one — the organization's own OAuth client from config.
     *
     * @return array{id: string, managed: bool}
     */
    public function authConfigFor(string $toolkitSlug, ?string $apiKey = null): array
    {
        $existing = collect($this->get('/auth_configs', ['toolkit_slug' => $toolkitSlug, 'limit' => 10])['items'] ?? [])
            ->first(fn ($c) => ($c['status'] ?? 'ENABLED') === 'ENABLED');
        if ($existing && ! $apiKey) {
            return ['id' => $existing['id'], 'managed' => (bool) ($existing['is_composio_managed'] ?? false)];
        }

        $toolkit = $this->toolkit($toolkitSlug) ?? throw new RuntimeException("Unknown toolkit {$toolkitSlug}.");
        $managed = collect($toolkit['composio_managed_auth_schemes'] ?? []);
        $schemes = collect($toolkit['auth_config_details'] ?? [])->pluck('mode')->merge($toolkit['auth_schemes'] ?? [])->filter()->unique();

        if ($apiKey !== null || (! $managed->count() && $schemes->contains('API_KEY'))) {
            // An API-key toolkit: the config is per org, the key rides on the account.
            $created = $this->post('/auth_configs', ['toolkit' => ['slug' => $toolkitSlug], 'auth_config' => ['type' => 'use_custom_auth', 'authScheme' => 'API_KEY', 'credentials' => new \stdClass]]);

            return ['id' => $created['auth_config']['id'] ?? $created['id'], 'managed' => false];
        }

        if ($managed->count()) {
            $created = $this->post('/auth_configs', ['toolkit' => ['slug' => $toolkitSlug], 'auth_config' => ['type' => 'use_composio_managed_auth']]);

            return ['id' => $created['auth_config']['id'] ?? $created['id'], 'managed' => true];
        }

        if (str_starts_with($toolkitSlug, 'google') && config('services.google.client_id')) {
            $created = $this->post('/auth_configs', ['toolkit' => ['slug' => $toolkitSlug], 'auth_config' => [
                'type' => 'use_custom_auth', 'authScheme' => 'OAUTH2',
                'credentials' => ['client_id' => config('services.google.client_id'), 'client_secret' => config('services.google.client_secret')],
            ]]);

            return ['id' => $created['auth_config']['id'] ?? $created['id'], 'managed' => false];
        }

        throw new RuntimeException("{$toolkit['name']} needs its own OAuth app credentials; Composio does not offer a managed login for it.");
    }

    /**
     * Start an OAuth connection. Returns the URL to send the person to and
     * the account id to poll afterwards.
     *
     * @return array{redirect_url: string, connected_account_id: string}
     */
    public function link(string $authConfigId, string $userId, string $callbackUrl): array
    {
        $body = $this->post('/connected_accounts/link', ['auth_config_id' => $authConfigId, 'user_id' => $userId, 'callback_url' => $callbackUrl]);

        return ['redirect_url' => $body['redirect_url'] ?? $body['redirectUrl'] ?? '', 'connected_account_id' => $body['connected_account_id'] ?? $body['id'] ?? ''];
    }

    /** Connect an API-key toolkit directly: no redirect, the account is active at once. */
    public function connectWithApiKey(string $authConfigId, string $userId, string $apiKey): array
    {
        $body = $this->post('/connected_accounts', ['auth_config' => ['id' => $authConfigId], 'connection' => ['user_id' => $userId, 'state' => ['authScheme' => 'API_KEY', 'val' => ['status' => 'ACTIVE', 'api_key' => $apiKey]]]]);

        return ['connected_account_id' => $body['id'] ?? '', 'status' => strtolower($body['status'] ?? 'active')];
    }

    /** @return array{status: string, error: ?string} */
    public function connectedAccount(string $id): array
    {
        $body = $this->get("/connected_accounts/{$id}");

        return ['status' => strtolower($body['status'] ?? 'unknown'), 'error' => $body['status_reason'] ?? null];
    }

    public function deleteConnectedAccount(string $id): void
    {
        try {
            $this->client()->delete("/connected_accounts/{$id}")->throw();
        } catch (RequestException $e) {
            if ($e->response->status() !== 404) {
                throw $e;
            }
        }
    }

    // ── transport ───────────────────────────────────────────────────────

    private function get(string $path, array $query = []): array
    {
        return $this->client()->get($path, $query)->throw()->json() ?? [];
    }

    private function post(string $path, array $body): array
    {
        return $this->client()->post($path, $body)->throw()->json() ?? [];
    }

    private function client(): PendingRequest
    {
        if (! $this->configured()) {
            throw new RuntimeException('COMPOSIO_API_KEY is not set.');
        }

        return Http::baseUrl(self::BASE)->withHeaders(['x-api-key' => config('services.composio.key')])->acceptJson()->timeout(20)->connectTimeout(5);
    }
}
