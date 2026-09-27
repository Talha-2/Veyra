<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Skill;
use Illuminate\Http\JsonResponse;

/**
 * Skills, read progressively.
 *
 * The index is names and descriptions — what goes in the prompt. The body is
 * fetched only when the model decides a skill is relevant, and is cached per
 * call by the agent layer on `version`.
 */
class SkillController extends Controller
{
    public function index(Organization $organization): JsonResponse
    {
        return response()->json([
            'skills' => Skill::query()->enabled()->orderBy('name')->get()
                ->map(fn (Skill $s) => ['slug' => $s->slug, 'name' => $s->name, 'description' => $s->description, 'version' => $s->version, 'scope' => $s->scope, 'execution_mode' => $s->execution_mode->value])
                ->all(),
        ]);
    }

    public function show(Organization $organization, Skill $skill): JsonResponse
    {
        abort_unless($skill->enabled, 404);

        return response()->json([
            'slug' => $skill->slug,
            'name' => $skill->name,
            'description' => $skill->description,
            'version' => $skill->version,
            'execution_mode' => $skill->execution_mode->value,
            'steps' => $skill->isGated() ? $skill->steps : null,
            'path' => "/skills/org/{$skill->slug}/SKILL.md",
            'markdown' => $skill->toMarkdown(),
        ]);
    }
}
