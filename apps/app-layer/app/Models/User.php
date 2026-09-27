<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\Surface;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * An account.
 *
 * A user is not tenant-owned — the same person can belong to several
 * organizations — so this model deliberately does not use BelongsToTenant.
 * Their access to any one organization lives on Membership.
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected static function booted(): void
    {
        // Membership changes can leave a User's memoized membership stale within
        // one request; nothing else needs a hook here.
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function organizations(): BelongsToMany
    {
        return $this->belongsToMany(Organization::class, 'memberships')
            ->using(Membership::class)
            ->withPivot(['role', 'surfaces'])
            ->withTimestamps();
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }

    /**
     * Memoized memberships, keyed by organization id.
     *
     * @var array<int, Membership|null>
     */
    protected array $membershipCache = [];

    /**
     * This user's membership in the active organization.
     *
     * Every gate check asks for it, so it must not be a query each time — but
     * the cache is keyed by organization rather than memoized outright, because
     * the active organization can change inside a single request (an org
     * switch) and a call-site memo would keep serving the previous tenant's
     * membership after it did.
     */
    public function currentMembership(): ?Membership
    {
        $organizationId = Organization::currentId();

        if ($organizationId === null) {
            return null;
        }

        return $this->membershipCache[$organizationId] ??= $this->memberships()
            ->where('organization_id', $organizationId)
            ->first();
    }

    /** Whether this user may open the given surface in the active organization. */
    public function canAccessSurface(Surface $surface): bool
    {
        return (bool) $this->currentMembership()?->canAccess($surface);
    }

    /**
     * Surfaces this user may open in the active organization.
     *
     * @return list<Surface>
     */
    public function accessibleSurfaces(): array
    {
        return $this->currentMembership()?->accessibleSurfaces() ?? [];
    }

    /** Where to send this user after sign-in or an org switch; null if they may open nothing. */
    public function landingSurface(): ?Surface
    {
        return $this->currentMembership()?->landingSurface();
    }

    public function assignedConversations(): BelongsToMany
    {
        return $this->belongsToMany(Conversation::class)->withTimestamps();
    }

    public function assignedTickets(): BelongsToMany
    {
        return $this->belongsToMany(Ticket::class)->withTimestamps();
    }

    public function pinnedMessages(): BelongsToMany
    {
        return $this->belongsToMany(Message::class, 'message_pins')->withTimestamps();
    }

    /**
     * How much this person is currently carrying.
     *
     * Both counts go through the tenant-scoped relations, so a user who belongs
     * to several organizations shows only the active one's workload — which is
     * the only number that means anything on a shift.
     */
    public function assignedConversationCount(): int
    {
        return $this->assignedConversations()->inbox()->count();
    }

    public function openTicketCount(): int
    {
        return $this->assignedTickets()->unresolved()->count();
    }
}
