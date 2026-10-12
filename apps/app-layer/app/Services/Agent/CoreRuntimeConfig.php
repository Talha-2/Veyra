<?php

namespace App\Services\Agent;

use App\Enums\ActionKind;
use App\Enums\AgentRuntime;
use App\Models\Action;
use App\Models\AgentConfig;
use App\Models\Expert;
use App\Models\Provider;
use App\Models\Skill;
use App\Services\Healthcare\HealthcareActions;
use App\Services\Organization\StarterAgent;
use Illuminate\Support\Facades\DB;

class CoreRuntimeConfig
{
    public const TAKER_PROMPT = 'You own every word the customer hears. Answer business questions using the business information and knowledge base. Delegate anything that must be booked, written, changed or submitted. Report only verified results from completed actions.';

    public const WORKER_PROMPT = 'You do the work using shared skills and explicitly permitted actions. Use customer records and the knowledge base before asking for details. Ask for missing information precisely. Perform the action before reporting that it happened. Delegate optional specialist tasks only when needed.';

    public function initialize(AgentConfig $config): AgentConfig
    {
        return DB::transaction(function () use ($config) {
            $config = AgentConfig::query()->whereKey($config->id)->lockForUpdate()->firstOrFail();
            $advanced = $config->advanced ?? [];
            if ($advanced['core_initialized'] ?? false) {
                return $config;
            }
            $taker = Expert::query()->where('is_builtin', true)->forRuntime(AgentRuntime::Talker)->orderBy('position')->orderBy('id')->first();
            $worker = Expert::query()->where('is_builtin', true)->forRuntime(AgentRuntime::Worker)->orderBy('position')->orderBy('id')->first();
            app(StarterAgent::class)->syncInternalActions();
            $schedulingIds = [];
            if (Provider::query()->exists()) {
                HealthcareActions::sync();
                $schedulingIds = Action::query()->enabled()->where('kind', ActionKind::Internal)->whereIn('slug', HealthcareActions::SLUGS)->pluck('id')->all();
            }
            $defaults = [
                'core_taker_prompt' => $taker?->system_prompt ?? self::TAKER_PROMPT,
                'core_worker_prompt' => $worker?->system_prompt ?? self::WORKER_PROMPT,
                'core_worker_reasoning_effort' => $worker?->reasoning_effort,
                'core_action_ids' => array_values(array_unique([...($worker ? $worker->actions()->pluck('actions.id')->all() : $this->defaultActionIds()), ...$schedulingIds])),
            ];
            foreach (['talker_model' => $taker?->model, 'worker_model' => $worker?->model] as $key => $model) {
                if (filled($model)) {
                    $defaults[$key] = $model;
                }
            }
            foreach ($defaults as $key => $value) {
                if (! array_key_exists($key, $advanced)) {
                    $advanced[$key] = $value;
                }
            }
            $config->forceFill(['advanced' => [...$advanced, 'core_initialized' => true]])->save();

            return $config;
        });
    }

    private function defaultActionIds(): array
    {
        $slugs = [];
        foreach (StarterAgent::catalog() as $slug => $definition) {
            if ($definition[6]) {
                $slugs[] = $slug;
            }
        }

        return Action::query()->where('kind', ActionKind::Internal)->whereIn('slug', $slugs)->pluck('id')->all();
    }

    public function definitions(AgentConfig $config): array
    {
        $advanced = $config->advanced ?? [];
        $skills = $this->skills();

        return [
            'taker' => ['slug' => 'core-taker', 'name' => 'Core taker', 'description' => 'Owns the customer conversation.', 'runtime' => 'talker', 'system_prompt' => $advanced['core_taker_prompt'] ?? self::TAKER_PROMPT, 'model' => $advanced['talker_model'] ?? null, 'reasoning_effort' => null, 'skills' => $skills, 'tools' => [], 'peers' => []],
            'worker' => ['slug' => 'core-worker', 'name' => 'Core worker', 'description' => 'Executes shared skills and permitted actions.', 'runtime' => 'worker', 'system_prompt' => $advanced['core_worker_prompt'] ?? self::WORKER_PROMPT, 'model' => $advanced['worker_model'] ?? null, 'reasoning_effort' => $advanced['core_worker_reasoning_effort'] ?? null, 'skills' => $skills, 'tools' => Action::query()->enabled()->whereIn('id', $advanced['core_action_ids'] ?? [])->with('integration')->orderBy('id')->get()->map(fn (Action $action) => $action->toToolSpec())->all(), 'peers' => []],
        ];
    }

    public function skills(?Expert $expert = null): array
    {
        $query = Skill::query()->enabled();
        if ($expert) {
            $query->availableToExpert($expert);
        } else {
            $query->shared();
        }

        return $query->orderBy('name')->get()->map(fn (Skill $skill) => [
            'slug' => $skill->slug, 'name' => $skill->name, 'description' => $skill->description,
            'path' => "/skills/org/{$skill->slug}/SKILL.md", 'version' => $skill->version, 'scope' => $skill->scope, 'execution_mode' => $skill->execution_mode->value,
        ])->all();
    }

    public function expertDefinition(Expert $expert): array
    {
        return [
            'id' => $expert->id,
            'slug' => $expert->slug, 'name' => $expert->name, 'description' => $expert->description, 'runtime' => $expert->runtime->value,
            'system_prompt' => $expert->system_prompt, 'model' => $expert->model, 'reasoning_effort' => $expert->reasoning_effort,
            'skills' => $this->skills($expert), 'tools' => $expert->actions()->where('enabled', true)->with('integration')->orderBy('id')->get()->map(fn (Action $action) => $action->toToolSpec())->all(), 'peers' => [],
        ];
    }

    public function canExecute(Expert $expert): bool
    {
        return $expert->enabled && ! $expert->is_builtin && in_array($expert->runtime, [AgentRuntime::Worker, AgentRuntime::Text], true);
    }
}
