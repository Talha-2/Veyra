<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ClinicPayment extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['amount_minor' => 'integer'];
    }
}
