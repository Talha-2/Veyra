<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Knowledge-base folders are organization for humans only.
 *
 * Retrieval ignores them entirely — every document is chunked and searchable
 * wherever it sits. Nobody should believe that moving a file changes what the
 * agent can find.
 */
#[Fillable(['name', 'parent_id'])]
class Folder extends Model
{
    use BelongsToTenant;

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }
}
