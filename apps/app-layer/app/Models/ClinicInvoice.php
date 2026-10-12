<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ClinicInvoice extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['lines' => 'array', 'identity_snapshot' => 'array', 'total_minor' => 'integer', 'paid_minor' => 'integer', 'issued_at' => 'datetime'];
    }
}
