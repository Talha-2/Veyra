<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ProviderTimeBlock extends Model
{
    use BelongsToTenant;

    protected $fillable = ['provider_id', 'starts_at', 'ends_at', 'label'];

    protected function casts(): array
    {
        return ['starts_at' => 'immutable_datetime', 'ends_at' => 'immutable_datetime'];
    }
}
