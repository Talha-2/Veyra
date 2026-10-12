<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Patient extends Model
{
    use BelongsToTenant;

    protected $fillable = ['contact_id', 'mrn', 'status', 'birth_date', 'administrative_sex', 'address_line_1', 'address_line_2', 'city', 'province', 'postal_code', 'country', 'preferred_language', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone'];

    protected function casts(): array
    {
        return ['birth_date' => 'immutable_date'];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function activities(): MorphMany
    {
        return $this->morphMany(Activity::class, 'subject')->latest();
    }
}
