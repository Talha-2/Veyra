<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ProviderAvailability extends Model
{
    use BelongsToTenant;

    protected $fillable = ['provider_id', 'clinic_location_id', 'weekday', 'start_time', 'end_time'];
}
