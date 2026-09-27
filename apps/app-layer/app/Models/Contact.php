<?php

namespace App\Models;

use App\Enums\ContactStage;
use App\Traits\BelongsToTenant;
use App\Traits\Taggable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A person. The model everything else in Desk hangs off.
 *
 * Most contacts are created by the system, not by a human: any phone number or
 * address that reaches us gets an identifier, and the identifier becomes a
 * contact the first time we learn a name. So almost every field is nullable and
 * the interesting question is usually "what do we know so far".
 */
#[Fillable(['name', 'phone', 'email', 'company', 'stage', 'source', 'owner_id', 'value', 'is_favorite', 'avatar_color'])]
class Contact extends Model
{
    use BelongsToTenant, SoftDeletes, Taggable;

    protected function casts(): array
    {
        return [
            'stage' => ContactStage::class,
            'is_favorite' => 'boolean',
            'last_contact_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function identifiers(): HasMany
    {
        return $this->hasMany(Identifier::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function calls(): HasMany
    {
        return $this->hasMany(Call::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable')->latest();
    }

    public function reminders(): MorphMany
    {
        return $this->morphMany(Reminder::class, 'remindable');
    }

    public function activities(): MorphMany
    {
        return $this->morphMany(Activity::class, 'subject')->latest();
    }

    /** What to show when there is no name yet — which is the common case. */
    public function displayName(): string
    {
        return $this->name
            ?: $this->phone
            ?: $this->email
            ?: "Contact #{$this->id}";
    }

    public function initials(): string
    {
        if (! $this->name) {
            return '?';
        }

        return collect(explode(' ', $this->name))
            ->filter()
            ->take(2)
            ->map(fn ($part) => mb_strtoupper(mb_substr($part, 0, 1)))
            ->implode('');
    }
}
