<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'e164', 'friendly_name', 'country', 'provider', 'provider_sid', 'capabilities',
    'assigned_user_id', 'sms_autoreply', 'ivr', 'language', 'status', 'monthly_cost',
])]
class PhoneNumber extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'capabilities' => 'array',
            'ivr' => 'array',
            'sms_autoreply' => 'boolean',
        ];
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function calls(): HasMany
    {
        return $this->hasMany(Call::class);
    }

    /** No assigned user means the AI agent answers this line. */
    public function answeredByAgent(): bool
    {
        return $this->assigned_user_id === null;
    }

    /**
     * The language this number runs in, falling back to the tenant default.
     *
     * Per number rather than per tenant because the STT model for Urdu is
     * monolingual: one organization can own an Urdu line and an English one, and
     * they cannot share a setting. See docs/urdu-support.md.
     */
    public function effectiveLanguage(): string
    {
        return $this->language
            ?? AgentConfig::query()->value('primary_language')
            ?? 'en';
    }
}
