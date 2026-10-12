<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class InventoryBatch extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'expires_on' => 'immutable_date'];
    }
}
