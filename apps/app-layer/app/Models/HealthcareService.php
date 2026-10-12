<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class HealthcareService extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'duration_minutes', 'fee_minor', 'currency'];

    protected $attributes = ['currency' => 'PKR'];
}
