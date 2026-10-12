<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ClinicalTemplate extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'kind', 'active', 'history', 'subjective', 'objective', 'assessment', 'plan'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }
}
