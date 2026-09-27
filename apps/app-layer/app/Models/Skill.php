<?php

namespace App\Models;

use App\Enums\SkillExecutionMode;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A skill is a markdown document the model reads and follows.
 *
 * It replaces the old "ability": an XML flow executed step-by-step by an engine
 * the model could not deviate from. Most skills are better as prose — they are
 * easier to write, easier to read, and the model can handle the cases the author
 * did not think of.
 *
 * But not all of them. A small model in an ungated loop has a documented history
 * of degenerating, and some procedures genuinely must not be improvised: taking
 * a payment, verifying identity, following a clinical intake script. Those
 * declare `gated` and run through the flow controller, which binds only the
 * current step's tools and advances deterministically.
 *
 * The decision is per skill, not per deployment. See ARCHITECTURE.md §8.
 */
#[Fillable([
    'slug', 'name', 'description', 'body', 'execution_mode',
    'steps', 'scope', 'enabled', 'updated_by_id',
])]
class Skill extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected function casts(): array
    {
        return [
            'execution_mode' => SkillExecutionMode::class,
            'steps' => 'array',
            'enabled' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        // Editing a skill changes how a live agent behaves on the next call, so
        // the version is bumped on every content change. The agent layer caches
        // skill bodies per call; the version is the cache key.
        static::updating(function (self $skill) {
            if ($skill->isDirty(['body', 'steps', 'execution_mode'])) {
                $skill->version = $skill->version + 1;
            }
        });
    }

    public function experts(): BelongsToMany
    {
        return $this->belongsToMany(Expert::class)->withTimestamps();
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_id');
    }

    public function scopeEnabled(Builder $query): void
    {
        $query->where('enabled', true);
    }

    public function isGated(): bool
    {
        return $this->execution_mode === SkillExecutionMode::Gated;
    }

    /**
     * The file the model reads: YAML frontmatter plus the body.
     *
     * Rendered rather than stored so the frontmatter cannot drift from the
     * columns. The harness reads skills through a filesystem-shaped backend, and
     * this is what `read_file` returns.
     */
    public function toMarkdown(): string
    {
        $front = [
            'name: '.$this->name,
            'description: '.str_replace("\n", ' ', $this->description),
        ];

        if ($this->isGated()) {
            $front[] = 'execution: gated';
        }

        return "---\n".implode("\n", $front)."\n---\n\n".($this->body ?? '');
    }
}
