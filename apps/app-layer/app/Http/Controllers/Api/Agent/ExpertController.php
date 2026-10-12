<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Expert;
use App\Models\Organization;
use App\Models\Skill;
use App\Services\Agent\CoreRuntimeConfig;
use Illuminate\Http\JsonResponse;

class ExpertController extends Controller
{
    public function execution(Organization $organization, Expert $expert, CoreRuntimeConfig $runtime): JsonResponse
    {
        abort_unless($runtime->canExecute($expert), 404);

        return response()->json(['expert' => $runtime->expertDefinition($expert)]);
    }

    public function skills(Organization $organization, Expert $expert, CoreRuntimeConfig $runtime): JsonResponse
    {
        abort_unless($runtime->canExecute($expert), 404);

        return response()->json(['skills' => $runtime->skills($expert)]);
    }

    public function skill(Organization $organization, Expert $expert, Skill $skill, CoreRuntimeConfig $runtime): JsonResponse
    {
        abort_unless($runtime->canExecute($expert) && $skill->enabled && ($skill->private_expert_id === null || $skill->private_expert_id === $expert->id), 404);

        return response()->json([
            'slug' => $skill->slug, 'name' => $skill->name, 'description' => $skill->description, 'version' => $skill->version,
            'execution_mode' => $skill->execution_mode->value, 'steps' => $skill->isGated() ? $skill->steps : null,
            'path' => "/skills/org/{$skill->slug}/SKILL.md", 'markdown' => $skill->toMarkdown(),
        ]);
    }
}
