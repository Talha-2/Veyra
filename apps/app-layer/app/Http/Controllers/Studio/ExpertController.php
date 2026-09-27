<?php

namespace App\Http\Controllers\Studio;

use App\Enums\AgentRuntime;
use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\Expert;
use App\Models\Skill;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ExpertController extends Controller
{
    public function index(): Response
    {
        $experts = Expert::query()
            ->withCount(['skills', 'actions'])
            ->orderBy('position')
            ->get()
            ->map(fn (Expert $e) => [
                'id' => $e->id,
                'slug' => $e->slug,
                'name' => $e->name,
                'description' => $e->description,
                'runtime' => $e->runtime->value,
                'runtime_label' => $e->runtime->label(),
                'model' => $e->model,
                'is_builtin' => $e->is_builtin,
                'enabled' => $e->enabled,
                'skills_count' => $e->skills_count,
                'actions_count' => $e->actions_count,
            ]);

        return Inertia::render('studio/experts', [
            'experts' => $experts,
            'runtimes' => collect(AgentRuntime::cases())->map(fn ($r) => [
                'value' => $r->value, 'label' => $r->label(), 'description' => $r->description(),
            ])->all(),
        ]);
    }

    public function show(Expert $expert): Response
    {
        $expert->load(['skills:id,name,slug,description,execution_mode', 'actions:id,name,slug,kind,is_durable_write']);

        return Inertia::render('studio/expert', [
            'expert' => [
                'id' => $expert->id,
                'slug' => $expert->slug,
                'name' => $expert->name,
                'description' => $expert->description,
                'system_prompt' => $expert->system_prompt,
                'runtime' => $expert->runtime->value,
                'runtime_label' => $expert->runtime->label(),
                'runtime_description' => $expert->runtime->description(),
                'latency_critical' => $expert->runtime->isLatencyCritical(),
                'model' => $expert->model,
                'reasoning_effort' => $expert->reasoning_effort,
                'is_builtin' => $expert->is_builtin,
                'enabled' => $expert->enabled,
                'skill_ids' => $expert->skills->pluck('id')->all(),
                'action_ids' => $expert->actions->pluck('id')->all(),
            ],
            // Everything it could be granted, so the page is one form rather
            // than a picker per relation.
            'all_skills' => Skill::query()->enabled()->orderBy('name')->get()
                ->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'description' => $s->description, 'gated' => $s->isGated()])
                ->all(),
            'all_actions' => Action::query()->enabled()->orderBy('name')->get()
                ->map(fn ($a) => ['id' => $a->id, 'name' => $a->name, 'kind' => $a->kind->label(), 'durable' => $a->is_durable_write])
                ->all(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'description' => ['required', 'string', 'max:160'],
            'runtime' => ['required', Rule::enum(AgentRuntime::class)],
        ]);

        $expert = Expert::create([
            ...$validated,
            'slug' => str($validated['name'])->slug()->value(),
            'position' => Expert::query()->max('position') + 1,
        ]);

        return redirect()->route('studio.experts.show', $expert);
    }

    public function update(Request $request, Expert $expert): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            // Hard-capped, and it is not a style choice: every peer's routing
            // block includes this line, so its length is paid on every turn of
            // every other expert.
            'description' => ['sometimes', 'string', 'max:160'],
            'system_prompt' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'model' => ['sometimes', 'nullable', 'string', 'max:80'],
            'reasoning_effort' => ['sometimes', 'nullable', 'string', 'max:20'],
            'enabled' => ['sometimes', 'boolean'],
            'skill_ids' => ['sometimes', 'array'],
            'skill_ids.*' => ['integer', 'exists:skills,id'],
            'action_ids' => ['sometimes', 'array'],
            'action_ids.*' => ['integer', 'exists:actions,id'],
        ]);

        $expert->fill(collect($validated)->except(['skill_ids', 'action_ids'])->all())->save();

        if (array_key_exists('skill_ids', $validated)) {
            $expert->skills()->sync($validated['skill_ids']);
        }
        if (array_key_exists('action_ids', $validated)) {
            $expert->actions()->sync($validated['action_ids']);
        }

        return back()->with('success', 'Expert saved.');
    }

    public function destroy(Expert $expert): RedirectResponse
    {
        abort_if($expert->is_builtin, 403, 'Built-in experts cannot be deleted. Disable it instead.');

        $expert->delete();

        return redirect()->route('studio.experts');
    }
}
