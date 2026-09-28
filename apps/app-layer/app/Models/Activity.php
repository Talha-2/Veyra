<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One thing that happened to a contact, conversation, ticket or lead.
 *
 * The agent is an actor here (`actor = agent`, no user), so a timeline reads
 * "agent booked appointment · Sam closed ticket · system merged identifier" in
 * one list. Written through `Activity::log()` so the shape is consistent.
 */
#[Fillable(['subject_type', 'subject_id', 'user_id', 'actor', 'type', 'description', 'meta'])]
class Activity extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function log(
        Model $subject,
        string $type,
        string $description,
        ?User $user = null,
        array $meta = [],
        string $actor = 'user',
    ): self {
        return static::create([
            'subject_type' => $subject->getMorphClass(),
            'subject_id' => $subject->getKey(),
            'user_id' => $user?->getKey(),
            'actor' => $user ? 'user' : $actor,
            'type' => $type,
            'description' => $description,
            'meta' => $meta ?: null,
        ]);
    }

    public function actorLabel(): string
    {
        return match ($this->actor) {
            'agent' => 'Agent',
            'system' => 'System',
            // Written through the public API (/api/v1) by an integration.
            'api' => 'API',
            default => $this->user?->name ?? 'Someone',
        };
    }
}
