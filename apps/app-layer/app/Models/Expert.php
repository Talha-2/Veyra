<?php

namespace App\Models;

use App\Enums\AgentRuntime;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * An expert is a data record, not a class.
 *
 * This is the single most misunderstood part of the harness. There is no router
 * graph and no expert subgraph — there is one agent loop whose system prompt and
 * bound tools get swapped between turns. An "expert" is the bundle that gets
 * swapped in: a prompt, a tool list, a skill list, a model.
 *
 * Because it is data, an organization can define its own experts in Studio and
 * the agent layer picks them up without a deploy. Built-ins are seeded rows,
 * distinguished only by `is_builtin` so the UI can stop someone deleting them.
 */
#[Fillable([
    'slug', 'name', 'description', 'system_prompt', 'model',
    'reasoning_effort', 'runtime', 'enabled', 'position',
])]
class Expert extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'runtime' => AgentRuntime::class,
            'is_builtin' => 'boolean',
            'enabled' => 'boolean',
        ];
    }

    public function skills(): BelongsToMany
    {
        return $this->belongsToMany(Skill::class)->withTimestamps();
    }

    public function actions(): BelongsToMany
    {
        return $this->belongsToMany(Action::class)->withTimestamps();
    }

    public function scopeEnabled(Builder $query): void
    {
        $query->where('enabled', true);
    }

    public function scopeForRuntime(Builder $query, AgentRuntime $runtime): void
    {
        $query->where('runtime', $runtime);
    }

    /**
     * The one-line entry this expert contributes to a peer's routing block.
     *
     * Peer routing injects name + description for every sibling, so this text is
     * read by the model on every turn of every other expert. Description length
     * is therefore a latency and cost decision, not just copy — which is why the
     * UI limits it rather than offering a textarea.
     */
    public function routingLine(): string
    {
        return "{$this->slug}: {$this->description}";
    }

    /**
     * Skill catalog for the system prompt: name, description and a read hint.
     *
     * Progressive disclosure — the body is never injected. The model reads a
     * skill only once it has decided that skill is relevant, which is what keeps
     * a 40-skill organization inside a voice-sized context window.
     *
     * @return list<array{name: string, description: string, path: string}>
     */
    public function skillCatalog(): array
    {
        return $this->skills()
            ->where('enabled', true)
            ->get()
            ->map(fn (Skill $skill) => [
                'name' => $skill->name,
                'description' => $skill->description,
                'path' => "/skills/org/{$skill->slug}/SKILL.md",
            ])
            ->all();
    }
}
