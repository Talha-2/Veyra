<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A configurable ticket category, with default assignees.
 *
 * The defaults matter more than they look: the agent raises tickets on calls,
 * and a "Billing" ticket it opens should land with billing without anyone
 * triaging it.
 */
#[Fillable(['name', 'color', 'description', 'default_assignee_ids', 'position', 'enabled'])]
class TicketType extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['default_assignee_ids' => 'array', 'enabled' => 'boolean'];
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }
}
