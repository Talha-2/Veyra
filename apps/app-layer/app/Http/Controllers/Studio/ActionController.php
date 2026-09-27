<?php

namespace App\Http\Controllers\Studio;

use App\Enums\ActionKind;
use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\Integration;
use App\Models\ToolCall;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Integrations and the actions they expose, with the reliability flags that
 * decide how each one may fail.
 */
class ActionController extends Controller
{
    public function index(): Response
    {
        $since = now()->subDays(7);

        // Per-action outcome counts for the last week, one query.
        $stats = ToolCall::query()
            ->where('created_at', '>=', $since)
            ->selectRaw('action_id, status, count(*) as n, percentile_cont(0.95) within group (order by duration_ms) as p95')
            ->whereNotNull('action_id')
            ->groupBy('action_id', 'status')
            ->get()
            ->groupBy('action_id');

        $actions = Action::query()
            ->with('integration:id,label,status')
            ->withCount('experts')
            ->orderBy('name')
            ->get()
            ->map(function (Action $a) use ($stats) {
                $rows = $stats->get($a->id, collect());
                $total = $rows->sum('n');
                $ok = $rows->firstWhere('status', 'succeeded')?->n ?? 0;

                return [
                    'id' => $a->id,
                    'slug' => $a->slug,
                    'name' => $a->name,
                    'description' => $a->description,
                    'kind' => $a->kind->value,
                    'kind_label' => $a->kind->label(),
                    'external' => $a->kind->isExternal(),
                    'integration' => $a->integration?->label,
                    'is_idempotent' => $a->is_idempotent,
                    'is_durable_write' => $a->is_durable_write,
                    'requires_approval' => $a->requires_approval,
                    'timeout_ms' => $a->timeout_ms,
                    'max_retries' => $a->max_retries,
                    'enabled' => $a->enabled,
                    'experts_count' => $a->experts_count,
                    'calls_7d' => $total,
                    'success_rate' => $total ? round($ok / $total * 100) : null,
                    'timeouts_7d' => $rows->firstWhere('status', 'timeout')?->n ?? 0,
                    'p95_ms' => $rows->max('p95') ? (int) $rows->max('p95') : null,
                    // So the edit dialog opens filled in. The auth secret is
                    // never sent back to the browser.
                    'http' => $a->kind === ActionKind::Http ? [
                        'method' => $a->config['method'] ?? 'POST',
                        'url' => $a->config['url'] ?? '',
                        'auth_type' => $a->config['auth_type'] ?? 'none',
                        'parameters' => collect($a->parameters['properties'] ?? [])
                            ->map(fn ($p, $name) => [
                                'name' => (string) $name,
                                'description' => $p['description'] ?? '',
                                'required' => in_array($name, $a->parameters['required'] ?? [], true),
                            ])->values()->all(),
                    ] : null,
                ];
            });

        return Inertia::render('studio/actions', [
            'actions' => $actions,
            'integrations' => Integration::query()->withCount('actions')->orderBy('label')->get()
                ->map(fn ($i) => [
                    'id' => $i->id, 'label' => $i->label, 'provider' => $i->provider,
                    'status' => $i->status, 'actions_count' => $i->actions_count, 'error' => $i->error,
                    'connected_at' => $i->connected_at?->toIso8601String(),
                    // For the page: the app's logo (stored at connect time) and,
                    // for an MCP server, where it lives. Never the credentials.
                    'toolkit' => $i->toolkit,
                    'logo' => $i->config['logo'] ?? null,
                    'url' => $i->provider === 'mcp' ? ($i->config['url'] ?? null) : null,
                    'transport' => $i->provider === 'mcp' ? ($i->config['transport'] ?? null) : null,
                ])->all(),
            'kinds' => collect(ActionKind::cases())->map(fn ($k) => ['value' => $k->value, 'label' => $k->label()])->all(),
        ]);
    }

    public function update(Request $request, Action $action): RedirectResponse
    {
        $validated = $request->validate([
            'description' => ['sometimes', 'string', 'max:500'],
            'is_idempotent' => ['sometimes', 'boolean'],
            'is_durable_write' => ['sometimes', 'boolean'],
            'requires_approval' => ['sometimes', 'boolean'],
            'timeout_ms' => ['sometimes', 'integer', 'between:1000,120000'],
            'max_retries' => ['sometimes', 'integer', 'between:0,5'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        // Internal actions are transactional and idempotent by construction;
        // letting someone flip that flag would make the runtime believe a
        // retry is dangerous when it is not.
        if ($action->kind === ActionKind::Internal) {
            unset($validated['is_idempotent']);
        }

        $action->fill($validated)->save();

        return back()->with('success', 'Action saved.');
    }
}
