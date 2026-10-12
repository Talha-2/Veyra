<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PatientProblem extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'name', 'code', 'onset_date', 'status', 'notes', 'version', 'recorded_by', 'resolved_at'];

    protected function casts(): array
    {
        return ['onset_date' => 'immutable_date', 'resolved_at' => 'immutable_datetime'];
    }
}
