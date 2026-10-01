<?php

namespace App\Http\Controllers\Studio;

use App\Enums\SkillExecutionMode;
use App\Http\Controllers\Controller;
use App\Models\Skill;
use App\Services\Agent\AgentGateway;
use App\Services\Agent\AgentUnavailable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SkillController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('studio/skills', [
            'skills' => Skill::query()
                ->withCount('experts')
                ->with(['updatedBy:id,name', 'experts:id,name'])
                ->orderBy('name')
                ->get()
                ->map(fn (Skill $s) => [
                    'id' => $s->id,
                    'slug' => $s->slug,
                    'name' => $s->name,
                    'description' => $s->description,
                    'execution_mode' => $s->execution_mode->value,
                    'mode_label' => $s->execution_mode->label(),
                    'enabled' => $s->enabled,
                    'version' => $s->version,
                    'experts_count' => $s->experts_count,
                    // Names, so the list can say who uses a skill rather than how many.
                    'experts' => $s->experts->map(fn ($e) => ['id' => $e->id, 'name' => $e->name])->values()->all(),
                    'updated_by' => $s->updatedBy?->name,
                    'updated_at' => $s->updated_at?->toIso8601String(),
                ]),
            'modes' => collect(SkillExecutionMode::cases())->map(fn ($m) => [
                'value' => $m->value, 'label' => $m->label(), 'description' => $m->description(), 'caution' => $m->caution(),
            ])->all(),
        ]);
    }

    public function show(Skill $skill, AgentGateway $gateway): Response
    {
        return Inertia::render('studio/skill', [
            'agent_available' => $gateway->available(),
            'skill' => [
                'id' => $skill->id,
                'slug' => $skill->slug,
                'name' => $skill->name,
                'description' => $skill->description,
                'body' => $skill->body,
                'execution_mode' => $skill->execution_mode->value,
                'steps' => $skill->steps ?? [],
                'enabled' => $skill->enabled,
                'version' => $skill->version,
                // What the model will actually read, so the author sees exactly
                // the artefact — frontmatter included — rather than a form.
                'rendered' => $skill->toMarkdown(),
                'experts' => $skill->experts()->get(['experts.id', 'name'])->map(fn ($e) => ['id' => $e->id, 'name' => $e->name])->all(),
            ],
            'modes' => collect(SkillExecutionMode::cases())->map(fn ($m) => [
                'value' => $m->value, 'label' => $m->label(), 'description' => $m->description(), 'caution' => $m->caution(),
            ])->all(),
        ]);
    }

    /**
     * Run the saved skill against a written scenario, without a caller.
     *
     * The agent layer runs it as a dry run: reads happen, writes are
     * simulated, so an author can try "caller wants to move Thursday"
     * against the real tenant without filing a ticket for a person who does
     * not exist. The result is the worker's private reply plus the steps it
     * took — which is the fastest way to learn whether the skill reads.
     */
    public function test(Request $request, Skill $skill, AgentGateway $gateway): RedirectResponse
    {
        $validated = $request->validate(['scenario' => ['required', 'string', 'max:5000']]);

        try {
            $result = $gateway->testSkill($skill, $validated['scenario']);
        } catch (AgentUnavailable $e) {
            return back()->with('error', 'The agent layer is not connected, so the skill cannot be tried here. '.$e->getMessage());
        }

        return back()->with('skill_test', [
            'scenario' => $validated['scenario'],
            'reply' => $result['reply'] ?? '',
            'failed' => (bool) ($result['failed'] ?? false),
            'steps' => $result['steps'] ?? [],
            'tokens' => (int) ($result['tokens'] ?? 0),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'description' => ['required', 'string', 'max:200'],
            'execution_mode' => ['required', Rule::enum(SkillExecutionMode::class)],
        ]);

        $skill = Skill::create([
            ...$validated,
            'slug' => $this->uniqueSlug($validated['name']),
            'updated_by_id' => $request->user()->getKey(),
        ]);

        return redirect()->route('studio.skills.show', $skill);
    }

    public function update(Request $request, Skill $skill): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            // Short on purpose: this is what the model reads to decide whether
            // to open the skill at all, and it is in the prompt for every skill
            // the expert has, on every turn.
            'description' => ['sometimes', 'string', 'max:200'],
            'body' => ['sometimes', 'nullable', 'string', 'max:30000'],
            'execution_mode' => ['sometimes', Rule::enum(SkillExecutionMode::class)],
            'steps' => ['sometimes', 'nullable', 'array', 'max:30'],
            'steps.*.name' => ['required', 'string', 'max:80'],
            'steps.*.instruction' => ['required', 'string', 'max:1000'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        // A gated skill with no steps is a prose skill that will refuse to run.
        if (($validated['execution_mode'] ?? $skill->execution_mode->value) === 'gated'
            && empty($validated['steps'] ?? $skill->steps)) {
            return back()->withErrors(['steps' => 'A step-gated skill needs at least one step.']);
        }

        $skill->fill([...$validated, 'updated_by_id' => $request->user()->getKey()])->save();

        return back()->with('success', "Skill saved as version {$skill->version}.");
    }

    public function destroy(Skill $skill): RedirectResponse
    {
        $skill->delete();

        return redirect()->route('studio.skills');
    }

    /**
     * A slug no other skill in this organization holds — deleted ones included, since they keep theirs.
     * Two with the same name used to collide on the unique index and 500.
     */
    private function uniqueSlug(string $name): string
    {
        $base = str($name)->slug()->value() ?: 'skill';
        $slug = $base;
        for ($n = 2; Skill::withTrashed()->where('slug', $slug)->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
