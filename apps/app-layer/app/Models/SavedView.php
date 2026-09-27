<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved filter set on one list surface, private to a user or shared.
 *
 * Server-side on purpose. Z360 keeps these in localStorage, which loses them
 * across devices and means a view a team lead builds cannot be handed to the
 * team.
 */
#[Fillable(['user_id', 'surface', 'name', 'filters', 'sort', 'is_shared', 'position'])]
class SavedView extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['filters' => 'array', 'sort' => 'array', 'is_shared' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Views this user can see on a surface: their own plus anything shared. */
    public function scopeVisibleTo(Builder $query, User $user, string $surface): void
    {
        $query->where('surface', $surface)
            ->where(fn (Builder $q) => $q->where('user_id', $user->getKey())->orWhere('is_shared', true))
            ->orderBy('position');
    }
}
