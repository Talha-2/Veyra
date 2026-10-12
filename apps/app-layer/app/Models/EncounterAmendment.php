<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class EncounterAmendment extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'organization_id'];
}
