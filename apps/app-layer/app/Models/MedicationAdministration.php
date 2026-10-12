<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MedicationAdministration extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'provider_id', 'author_user_id', 'provider_name', 'kind', 'name', 'dose', 'route', 'site', 'lot_number', 'expiry_date', 'occurred_at', 'next_due_date', 'notes', 'status', 'version', 'void_reason', 'voided_at'];

    protected function casts(): array
    {
        return ['occurred_at' => 'immutable_datetime', 'voided_at' => 'immutable_datetime', 'expiry_date' => 'immutable_date', 'next_due_date' => 'immutable_date'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }
}
