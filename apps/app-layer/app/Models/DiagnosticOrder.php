<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiagnosticOrder extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'organization_id'];

    protected $hidden = ['storage_path', 'sha256'];

    protected function casts(): array
    {
        return ['ordered_at' => 'immutable_datetime', 'resulted_at' => 'immutable_datetime', 'reviewed_at' => 'immutable_datetime', 'cancelled_at' => 'immutable_datetime', 'issued_at' => 'immutable_datetime', 'revoked_at' => 'immutable_datetime'];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function encounter(): BelongsTo
    {
        return $this->belongsTo(ClinicalEncounter::class, 'clinical_encounter_id');
    }

    public function followUpTask(): BelongsTo
    {
        return $this->belongsTo(CareTask::class, 'follow_up_task_id');
    }
}
