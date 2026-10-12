<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Appointment extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'provider_id', 'clinic_location_id', 'healthcare_service_id', 'created_by', 'conversation_id', 'status', 'source', 'starts_at', 'ends_at', 'timezone', 'duration_minutes', 'buffer_before_minutes', 'buffer_after_minutes', 'idempotency_key', 'request_fingerprint'];

    protected $attributes = ['status' => 'booked', 'buffer_before_minutes' => 0, 'buffer_after_minutes' => 0];

    protected function casts(): array
    {
        return ['starts_at' => 'immutable_datetime', 'ends_at' => 'immutable_datetime', 'checked_in_at' => 'immutable_datetime', 'consultation_started_at' => 'immutable_datetime', 'completed_at' => 'immutable_datetime'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function encounter(): HasOne
    {
        return $this->hasOne(ClinicalEncounter::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(ClinicLocation::class, 'clinic_location_id');
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(HealthcareService::class, 'healthcare_service_id');
    }
}
