<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Who the agent works for.
 *
 * Deliberately separate from the knowledge base. These are facts the agent must
 * always hold — name, hours, timezone — so they go into the system prompt on
 * every call. Knowledge-base material is looked up on demand instead; preloading
 * it would burn context and drift the persona toward whatever happens to have
 * been uploaded.
 */
#[Fillable(['name', 'description', 'industry', 'timezone', 'website', 'address', 'hours', 'holidays'])]
class BusinessProfile extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['hours' => 'array', 'holidays' => 'array'];
    }
}
