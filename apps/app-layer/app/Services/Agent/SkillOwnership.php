<?php

namespace App\Services\Agent;

use App\Models\Expert;
use App\Models\Organization;
use App\Models\Skill;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class SkillOwnership
{
    /** Serialize ownership changes, grants and owner deletion within one tenant. */
    public function transact(callable $change): mixed
    {
        return DB::transaction(function () use ($change) {
            Organization::query()->whereKey(Organization::current()->id)->lockForUpdate()->firstOrFail();

            return $change();
        }, 3);
    }

    public function ownerRule(): Exists
    {
        return Rule::exists('experts', 'id')->where('organization_id', Organization::current()->id)->where(fn ($query) => $query->where('is_builtin', false)->whereIn('runtime', ['worker', 'text']));
    }

    public function syncPrivateOwner(Skill $skill): void
    {
        if ($skill->private_expert_id !== null) {
            $skill->experts()->sync([$skill->private_expert_id]);
        }
    }

    public function owners(): array
    {
        return Expert::query()->where('is_builtin', false)->whereIn('runtime', ['worker', 'text'])->orderBy('name')->get(['id', 'name', 'enabled'])
            ->map(fn (Expert $expert) => ['id' => $expert->id, 'name' => $expert->name, 'enabled' => $expert->enabled])->all();
    }
}
