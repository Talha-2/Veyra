<?php

namespace App\Http\Controllers\Studio;

use App\Enums\ActionKind;
use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\ActionGroup;
use App\Models\Integration;
use App\Models\Organization;
use App\Services\Composio\ComposioClient;
use App\Support\IntegrationCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Throwable;

/**
 * Connecting external tools: the Composio catalog, MCP servers, and custom
 * HTTP actions.
 *
 * The Composio flow, end to end: the person picks an app and the tools they
 * want the agent to have; the app creates (or reuses) the toolkit's auth
 * config, asks Composio for a sign-in link, records the integration as
 * `initiated`, and sends the browser to the provider. Composio sends them
 * back to `callback`, which reads the account's status and flips the
 * integration to `connected`. The tools were mirrored as Actions at the
 * start, disabled until the account is live, so nothing is offered to an
 * expert that cannot run.
 */
class IntegrationController extends Controller
{
    public function catalog(Request $request): Response
    {
        $q = trim((string) $request->query('q')) ?: null;
        $category = $request->query('category') ?: null;

        $connected = Integration::query()->where('provider', 'composio')->get()->keyBy('toolkit');

        $apps = collect(IntegrationCatalog::apps($q, $category))
            ->map(fn ($a) => [
                ...$a,
                'connected' => $connected->has($a['slug']),
                'integration_id' => $connected->get($a['slug'])?->id,
                'status' => $connected->get($a['slug'])?->status,
            ])
            ->sortBy([['popular', 'desc']])
            ->values()
            ->all();

        return Inertia::render('studio/catalog', [
            'apps' => $apps,
            'categories' => IntegrationCatalog::categories(),
            'filters' => ['q' => $q, 'category' => $category],
            'live' => IntegrationCatalog::live(),
            'configured' => IntegrationCatalog::configured(),
        ]);
    }

    /** The tools one toolkit exposes, for the connect dialog's checklist. */
    public function tools(string $slug): JsonResponse
    {
        abort_unless(IntegrationCatalog::find($slug), 404);

        return response()->json(['tools' => IntegrationCatalog::tools($slug)]);
    }

    /** Connect a toolkit: creates the integration, mirrors the chosen tools as actions, and starts the sign-in. */
    public function connect(Request $request, string $slug, ComposioClient $composio): RedirectResponse|SymfonyResponse
    {
        $app = IntegrationCatalog::find($slug) ?? abort(404);

        $validated = $request->validate([
            'api_key' => [Rule::requiredIf($app['auth'] === 'api_key'), 'nullable', 'string', 'max:500'],
            'tools' => ['array'],
            'tools.*' => ['string', 'max:160'],
        ]);

        $integration = Integration::updateOrCreate(
            ['provider' => 'composio', 'toolkit' => $slug],
            ['label' => $app['name'], 'status' => 'initiated', 'error' => null, 'config' => ['auth' => $app['auth'], 'stub' => ! IntegrationCatalog::configured(), 'logo' => $app['logo'] ?? null]],
        );

        $this->mirrorTools($integration, $app, $validated['tools'] ?? [], enabled: false);

        // Curated mode: no Composio to talk to. The connection is recorded so
        // the actions can be built against; the page says it is a stub.
        if (! IntegrationCatalog::configured()) {
            $integration->update(['status' => 'connected', 'connected_at' => now(), 'credentials' => filled($validated['api_key'] ?? null) ? ['api_key' => $validated['api_key']] : null]);
            $integration->actions()->update(['enabled' => true]);

            return redirect()->route('studio.integrations')->with('success', "{$app['name']} connected (curated mode). Grant its actions to an expert to use them.");
        }

        $userId = 'org-'.Organization::currentId();

        try {
            if ($app['auth'] === 'api_key' && filled($validated['api_key'] ?? null)) {
                $config = $composio->authConfigFor($slug, $validated['api_key']);
                $account = $composio->connectWithApiKey($config['id'], $userId, $validated['api_key']);
                $integration->update([
                    'status' => $account['status'] === 'active' ? 'connected' : 'initiated',
                    'external_account_id' => $account['connected_account_id'],
                    'config' => [...$integration->config, 'auth_config_id' => $config['id']],
                    'connected_at' => now(),
                ]);
                if ($integration->status === 'connected') {
                    $integration->actions()->update(['enabled' => true]);
                }

                return redirect()->route('studio.integrations')->with('success', "{$app['name']} connected.");
            }

            $config = $composio->authConfigFor($slug);
            $link = $composio->link($config['id'], $userId, route('studio.integrations.callback', ['integration' => $integration->id]));
            $integration->update([
                'external_account_id' => $link['connected_account_id'],
                'config' => [...$integration->config, 'auth_config_id' => $config['id'], 'managed_auth' => $config['managed']],
            ]);
        } catch (Throwable $e) {
            Log::warning('composio.connect_failed', ['toolkit' => $slug, 'error' => $e->getMessage()]);
            $integration->update(['status' => 'error', 'error' => str($e->getMessage())->limit(300)->value()]);

            return back()->with('error', "Could not start connecting {$app['name']}: ".str($e->getMessage())->limit(200));
        }

        // An external redirect out of an Inertia form: Inertia::location.
        return Inertia::location($link['redirect_url']);
    }

    /** Composio sends the person back here. Read the account's real status; never trust the query string. */
    public function callback(Request $request, ComposioClient $composio): RedirectResponse
    {
        $integration = Integration::query()->find($request->query('integration'))
            ?? Integration::query()->where('provider', 'composio')->where('status', 'initiated')->latest('updated_at')->first();

        if (! $integration) {
            return redirect()->route('studio.integrations')->with('warning', 'No pending connection was found for that sign-in.');
        }

        return $this->syncStatus($integration, $composio);
    }

    /** Re-check a pending or errored connection with Composio. */
    public function refresh(Integration $integration, ComposioClient $composio): RedirectResponse
    {
        abort_unless($integration->provider === 'composio', 404);

        return $this->syncStatus($integration, $composio);
    }

    public function disconnect(Integration $integration, ComposioClient $composio): RedirectResponse
    {
        if ($integration->provider === 'composio' && $integration->external_account_id && $composio->configured()) {
            try {
                $composio->deleteConnectedAccount($integration->external_account_id);
            } catch (Throwable $e) {
                Log::warning('composio.disconnect_failed', ['integration' => $integration->id, 'error' => $e->getMessage()]);
            }
        }

        // Actions cascade with the integration; experts lose them from their
        // tool list on the next call, which is the right behaviour.
        $integration->delete();

        return back()->with('success', "{$integration->label} disconnected.");
    }

    // ── MCP servers ─────────────────────────────────────────────────────

    public function storeMcp(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'label' => ['required', 'string', 'max:80'],
            'url' => ['required', 'url', 'max:500'],
            'transport' => ['required', Rule::in(['streamable_http', 'sse'])],
            'auth_type' => ['required', Rule::in(['none', 'bearer', 'header'])],
            'auth_value' => ['nullable', 'string', 'max:1000'],
        ]);

        Integration::create([
            'provider' => 'mcp',
            'label' => $validated['label'],
            'status' => 'disconnected',
            'credentials' => $validated['auth_value'] ? ['auth_type' => $validated['auth_type'], 'auth_value' => $validated['auth_value']] : null,
            'config' => ['url' => $validated['url'], 'transport' => $validated['transport'], 'auth_type' => $validated['auth_type']],
        ]);

        return back()->with('success', 'MCP server added. Test it to load its tools.');
    }

    /**
     * Probe an MCP server and cache its tool list as actions.
     *
     * A real probe is an MCP initialize + tools/list handshake, which the
     * agent layer owns. Here the reachability check is real and the tool
     * import is what the contract will fill in.
     */
    public function testMcp(Integration $integration): RedirectResponse
    {
        abort_unless($integration->provider === 'mcp', 404);

        $url = $integration->config['url'] ?? '';

        try {
            $response = Http::timeout(8)->withHeaders($this->mcpHeaders($integration))->get($url);
            $reachable = $response->status() < 500;
        } catch (\Throwable $e) {
            $integration->update(['status' => 'error', 'error' => $e->getMessage()]);

            return back()->with('error', "Could not reach {$integration->label}: {$e->getMessage()}");
        }

        $integration->update(['status' => $reachable ? 'connected' : 'error', 'error' => $reachable ? null : "HTTP {$response->status()}", 'connected_at' => now()]);

        return back()->with($reachable ? 'success' : 'error', $reachable ? 'Server reachable. Tools load through the agent layer on first use.' : 'Server returned an error.');
    }

    private function mcpHeaders(Integration $integration): array
    {
        $creds = $integration->credentials ?? [];

        return match ($creds['auth_type'] ?? 'none') {
            'bearer' => ['Authorization' => 'Bearer '.($creds['auth_value'] ?? '')],
            'header' => (function () use ($creds) {
                [$k, $v] = array_pad(explode(':', $creds['auth_value'] ?? '', 2), 2, '');

                return $k ? [trim($k) => trim($v)] : [];
            })(),
            default => [],
        };
    }

    // ── Custom HTTP actions ─────────────────────────────────────────────

    public function storeHttpAction(Request $request): RedirectResponse
    {
        $validated = $this->validateHttpAction($request);

        Action::create([
            ...$this->httpActionAttributes($validated),
            'slug' => str($validated['name'])->slug('_')->value(),
        ]);

        return back()->with('success', 'Action created.');
    }

    public function updateHttpAction(Request $request, Action $action): RedirectResponse
    {
        abort_unless($action->kind === ActionKind::Http, 404);

        $action->update($this->httpActionAttributes($this->validateHttpAction($request)));

        return back()->with('success', 'Action saved.');
    }

    /**
     * Fire the action once with sample arguments and show what came back.
     *
     * Rate-limited at the route: this is an SSRF-capable proxy by design, and
     * the old server throttled it for the same reason.
     */
    public function testHttpAction(Request $request, Action $action): RedirectResponse
    {
        abort_unless($action->kind === ActionKind::Http, 404);

        $args = $request->validate(['arguments' => ['array']])['arguments'] ?? [];
        $config = $action->config ?? [];

        try {
            $started = hrtime(true);
            $client = Http::timeout(min(30, (int) ceil($action->timeout_ms / 1000)))->withHeaders($config['headers'] ?? []);
            $client = match ($config['auth_type'] ?? 'none') {
                'bearer' => $client->withToken($config['auth_value'] ?? ''),
                'basic' => $client->withBasicAuth(...array_pad(explode(':', $config['auth_value'] ?? '', 2), 2, '')),
                'header' => (function () use ($client, $config) {
                    [$k, $v] = array_pad(explode(':', $config['auth_value'] ?? '', 2), 2, '');

                    return $k ? $client->withHeaders([trim($k) => trim($v)]) : $client;
                })(),
                default => $client,
            };
            $response = ($config['method'] ?? 'POST') === 'GET'
                ? $client->get($config['url'], $args)
                : $client->post($config['url'], $args);
            $ms = (int) ((hrtime(true) - $started) / 1e6);

            return back()->with('test_result', [
                'status' => $response->status(), 'ms' => $ms,
                'body' => str($response->body())->limit(2000)->value(),
            ]);
        } catch (\Throwable $e) {
            return back()->with('test_result', ['status' => 0, 'ms' => null, 'body' => $e->getMessage()]);
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /**
     * Every chosen tool becomes an action the agent can be granted, with the
     * reliability flags pre-set from what the tool does. Disabled until the
     * account is live; enabled by the status sync.
     */
    private function mirrorTools(Integration $integration, array $app, array $selected, bool $enabled): void
    {
        $group = ActionGroup::updateOrCreate(['integration_id' => $integration->id], ['name' => $app['name'], 'description' => $app['description']]);

        $tools = collect(IntegrationCatalog::tools($app['slug']));
        if ($selected) {
            $tools = $tools->whereIn('slug', $selected);
        }

        foreach ($tools as $tool) {
            Action::updateOrCreate(
                ['slug' => strtolower($tool['slug'])],
                [
                    'integration_id' => $integration->id,
                    'action_group_id' => $group->id,
                    'kind' => ActionKind::Composio,
                    'name' => $tool['name'],
                    'description' => $tool['description'],
                    'parameters' => $tool['parameters'] ?: null,
                    // What the agent layer needs to execute it: the toolkit,
                    // Composio's tool slug, and the account, filled in on sync.
                    'config' => ['toolkit' => $app['slug'], 'tool_slug' => $tool['slug'], 'connected_account_id' => $integration->external_account_id, 'user_id' => 'org-'.Organization::currentId()],
                    'is_durable_write' => $tool['durable'],
                    'is_idempotent' => ! $tool['durable'],
                    'timeout_ms' => ActionKind::Composio->defaultTimeoutMs(),
                    'enabled' => $enabled,
                ],
            );
        }
    }

    private function syncStatus(Integration $integration, ComposioClient $composio): RedirectResponse
    {
        if (! $integration->external_account_id) {
            return redirect()->route('studio.integrations')->with('warning', "{$integration->label} has no account to check yet. Connect it again.");
        }

        try {
            $account = $composio->connectedAccount($integration->external_account_id);
        } catch (Throwable $e) {
            $integration->update(['status' => 'error', 'error' => str($e->getMessage())->limit(300)->value()]);

            return redirect()->route('studio.integrations')->with('error', "Could not check {$integration->label}: ".str($e->getMessage())->limit(200));
        }

        // Composio's states for a link nobody has finished: initiated,
        // initializing, pending. None of them is an error.
        $connected = $account['status'] === 'active';
        $pending = in_array($account['status'], ['initiated', 'initializing', 'pending'], true);
        $integration->update([
            'status' => $connected ? 'connected' : ($pending ? 'initiated' : 'error'),
            'error' => $connected ? null : ($pending ? 'Sign-in not completed yet. Open the connect link again to finish.' : ($account['error'] ?: "Composio reports: {$account['status']}.")),
            'connected_at' => $connected ? now() : $integration->connected_at,
        ]);
        // The account id is now known to every mirrored action.
        $integration->actions()->each(fn (Action $a) => $a->update(['enabled' => $connected, 'config' => [...($a->config ?? []), 'connected_account_id' => $integration->external_account_id]]));

        return redirect()->route('studio.integrations')->with(
            $connected ? 'success' : 'warning',
            $connected ? "{$integration->label} connected. Grant its actions to an expert to use them." : "{$integration->label}: {$integration->error}",
        );
    }

    private function validateHttpAction(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'description' => ['required', 'string', 'max:500'],
            'method' => ['required', Rule::in(['GET', 'POST'])],
            'url' => ['required', 'url', 'max:1000'],
            'auth_type' => ['required', Rule::in(['none', 'bearer', 'basic', 'header'])],
            'auth_value' => ['nullable', 'string', 'max:1000'],
            'headers' => ['nullable', 'array'],
            'parameters' => ['nullable', 'array'],
            'parameters.*.name' => ['required', 'string', 'max:60', 'regex:/^[a-z_][a-z0-9_]*$/'],
            'parameters.*.description' => ['required', 'string', 'max:300'],
            'parameters.*.required' => ['boolean'],
            'is_idempotent' => ['boolean'],
            'is_durable_write' => ['boolean'],
            'requires_approval' => ['boolean'],
            'timeout_ms' => ['nullable', 'integer', 'between:1000,120000'],
        ]);
    }

    private function httpActionAttributes(array $v): array
    {
        $props = collect($v['parameters'] ?? [])->mapWithKeys(fn ($p) => [$p['name'] => ['type' => 'string', 'description' => $p['description']]])->all();
        $required = collect($v['parameters'] ?? [])->filter(fn ($p) => $p['required'] ?? false)->pluck('name')->values()->all();

        return [
            'kind' => ActionKind::Http,
            'name' => $v['name'],
            'description' => $v['description'],
            'parameters' => ['type' => 'object', 'properties' => $props ?: new \stdClass, 'required' => $required],
            'config' => [
                'method' => $v['method'], 'url' => $v['url'], 'auth_type' => $v['auth_type'],
                'auth_value' => $v['auth_value'] ?? null, 'headers' => $v['headers'] ?? [],
            ],
            'is_idempotent' => $v['is_idempotent'] ?? ($v['method'] === 'GET'),
            'is_durable_write' => $v['is_durable_write'] ?? ($v['method'] !== 'GET'),
            'requires_approval' => $v['requires_approval'] ?? false,
            'timeout_ms' => $v['timeout_ms'] ?? ActionKind::Http->defaultTimeoutMs(),
        ];
    }
}
