<?php

namespace App\Traits;

use App\Models\Organization;
use App\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Makes a model tenant-owned.
 *
 * Two things happen: reads are filtered by TenantScope, and writes get the
 * active organization stamped on them automatically. The second half matters as
 * much as the first — a created row with a null `organization_id` is invisible
 * to every subsequent read, which surfaces as "the record saved but vanished".
 *
 * Every model using this trait needs `$table->organization()` in its migration.
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function (self $model) {
            if ($model->getAttribute($model->getTenantColumn()) === null) {
                $model->setAttribute($model->getTenantColumn(), Organization::currentId());
            }
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, $this->getTenantColumn());
    }

    public function getTenantColumn(): string
    {
        return 'organization_id';
    }

    public function getQualifiedTenantColumn(): string
    {
        return $this->getTable().'.'.$this->getTenantColumn();
    }
}
