<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\AgentConfig;
use App\Models\Expert;
use App\Models\Organization;
use App\Services\Agent\CoreRuntimeConfig;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class RuntimeController extends Controller
{
    public function index(CoreRuntimeConfig $runtime): Response
    {
        $config = $runtime->initialize(AgentConfig::query()->firstOrCreate([]));
        $advanced = $config->advanced ?? [];

        return Inertia::render('studio/runtime', [
            'runtime' => ['taker_prompt' => $advanced['core_taker_prompt'] ?? '', 'worker_prompt' => $advanced['core_worker_prompt'] ?? '', 'taker_model' => $advanced['talker_model'] ?? '', 'worker_model' => $advanced['worker_model'] ?? '', 'worker_reasoning_effort' => $advanced['core_worker_reasoning_effort'] ?? null, 'action_ids' => $advanced['core_action_ids'] ?? []],
            'all_actions' => Action::query()->orderBy('name')->get()->map(fn (Action $action) => ['id' => $action->id, 'name' => $action->name, 'description' => $action->description, 'kind' => $action->kind->label(), 'durable' => $action->is_durable_write])->all(),
            'legacy_profiles' => Expert::query()->where(fn ($query) => $query->where('is_builtin', true)->orWhere('runtime', 'talker'))->orderBy('position')->get()->map(fn (Expert $expert) => ['id' => $expert->id, 'name' => $expert->name, 'runtime' => $expert->runtime->value])->all(),
        ]);
    }

    public function update(Request $request, CoreRuntimeConfig $runtime): RedirectResponse
    {
        $validated = $request->validate([
            'taker_prompt' => ['sometimes', 'nullable', 'string', 'max:20000'], 'worker_prompt' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'taker_model' => ['sometimes', 'nullable', 'string', 'max:120', 'regex:/^[a-z0-9_-]+:[A-Za-z0-9._\/-]+$/'],
            'worker_model' => ['sometimes', 'nullable', 'string', 'max:120', 'regex:/^[a-z0-9_-]+:[A-Za-z0-9._\/-]+$/'],
            'worker_reasoning_effort' => ['sometimes', 'nullable', Rule::in(['low', 'medium', 'high'])],
            'action_ids' => ['sometimes', 'array'], 'action_ids.*' => ['integer', Rule::exists('actions', 'id')->where('organization_id', Organization::currentId())],
        ]);
        DB::transaction(function () use ($validated, $runtime) {
            $config = $runtime->initialize(AgentConfig::query()->firstOrCreate([]));
            $advanced = $config->advanced ?? [];
            foreach (['taker_prompt' => 'core_taker_prompt', 'worker_prompt' => 'core_worker_prompt', 'taker_model' => 'talker_model', 'worker_model' => 'worker_model', 'worker_reasoning_effort' => 'core_worker_reasoning_effort', 'action_ids' => 'core_action_ids'] as $field => $key) {
                if (array_key_exists($field, $validated)) {
                    $advanced[$key] = $validated[$field];
                }
            }
            $config->forceFill(['advanced' => $advanced])->save();
        });

        return back()->with('success', 'Core runtime saved.');
    }
}
