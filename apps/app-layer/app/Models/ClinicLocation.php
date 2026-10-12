<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ClinicLocation extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'address', 'timezone'];

    protected $attributes = ['timezone' => 'Asia/Karachi'];
}
