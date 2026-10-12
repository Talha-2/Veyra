<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PatientAllergy extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'allergen', 'reaction', 'severity', 'status', 'notes', 'inactive_reason', 'version', 'recorded_by', 'inactive_at'];

    protected function casts(): array
    {
        return ['inactive_at' => 'immutable_datetime'];
    }
}
