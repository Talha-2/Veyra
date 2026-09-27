<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A bundle of actions granted together.
 *
 * Permissions are assigned in units a person can reason about — "Calendar" —
 * rather than forty individual tools nobody reads.
 */
#[Fillable(['integration_id', 'name', 'description'])]
class ActionGroup extends Model
{
    use BelongsToTenant;

    public function integration(): BelongsTo
    {
        return $this->belongsTo(Integration::class);
    }

    public function actions(): HasMany
    {
        return $this->hasMany(Action::class);
    }
}
