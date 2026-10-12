<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Prescription extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'provider_id', 'author_user_id', 'encounter_id', 'provider_name', 'registration_number', 'status', 'items', 'allergy_review', 'patient_snapshot', 'version', 'issued_at', 'cancelled_at', 'cancel_reason'];

    protected function casts(): array
    {
        return ['items' => 'array', 'allergy_review' => 'array', 'patient_snapshot' => 'array', 'issued_at' => 'immutable_datetime', 'cancelled_at' => 'immutable_datetime'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }
}
