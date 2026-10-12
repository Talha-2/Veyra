<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClinicalEncounter extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['vitals' => 'array', 'occurred_at' => 'immutable_datetime', 'signed_at' => 'immutable_datetime'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }

    public function amendments(): HasMany
    {
        return $this->hasMany(EncounterAmendment::class)->orderBy('id');
    }
}
