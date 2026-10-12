<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Provider extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'specialty', 'registration_number', 'qualifications', 'user_id', 'active', 'buffer_before_minutes', 'buffer_after_minutes', 'minimum_notice_minutes', 'booking_horizon_days'];

    protected $attributes = ['active' => true, 'buffer_before_minutes' => 0, 'buffer_after_minutes' => 0, 'minimum_notice_minutes' => 0, 'booking_horizon_days' => 90];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function locations(): BelongsToMany
    {
        return $this->belongsToMany(ClinicLocation::class);
    }

    public function services(): BelongsToMany
    {
        return $this->belongsToMany(HealthcareService::class);
    }

    public function availability(): HasMany
    {
        return $this->hasMany(ProviderAvailability::class);
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(ProviderTimeBlock::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }
}
