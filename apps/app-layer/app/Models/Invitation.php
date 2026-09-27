<?php

namespace App\Models;

use App\Enums\OrganizationRole;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Fillable(['email', 'role', 'surfaces', 'token', 'invited_by_id', 'expires_at'])]
class Invitation extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'role' => OrganizationRole::class,
            'surfaces' => 'array',
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_id');
    }

    public function scopePending(Builder $query): void
    {
        $query->whereNull('accepted_at')->where('expires_at', '>', now());
    }

    public static function issue(string $email, OrganizationRole $role, array $surfaces, ?User $by): self
    {
        return static::create([
            'email' => mb_strtolower(trim($email)),
            'role' => $role,
            'surfaces' => $surfaces,
            'token' => Str::random(48),
            'invited_by_id' => $by?->getKey(),
            'expires_at' => now()->addDays(7),
        ]);
    }

    public function isPending(): bool
    {
        return $this->accepted_at === null && $this->expires_at->isFuture();
    }
}
