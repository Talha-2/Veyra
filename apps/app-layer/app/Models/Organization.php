<?php

namespace App\Models;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Session;

/**
 * The tenant. Everything a customer owns hangs off one of these.
 *
 * The current organization is session state, not a route parameter, so URLs
 * stay free of tenant ids and a stale link cannot silently address another
 * tenant's data. TenantScope reads it through `currentId()`.
 */
#[Fillable(['name', 'slug', 'timezone'])]
class Organization extends Model
{
    use SoftDeletes;

    /** Session key holding the active organization id. */
    public const SESSION_KEY = 'current_organization_id';

    /**
     * Cache of the resolved organization, keyed by id — never a source of truth.
     *
     * TenantScope runs on every query, so re-fetching per query is not
     * affordable. But an unconditional static memo is worse: it survives
     * between requests in a long-lived worker (Octane) and between tests, and
     * then serves a previous request's tenant. This is only ever returned when
     * its key still matches the session, so a stale value cannot escape.
     */
    protected static ?self $cache = null;

    /**
     * Explicit tenant for contexts with no session: queued jobs, console
     * commands, tests. Set through setCurrent(); takes priority over the session.
     */
    protected static ?self $override = null;

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'memberships')
            ->using(Membership::class)
            ->withPivot(['role', 'surfaces'])
            ->withTimestamps();
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }

    /**
     * The active organization, or null when there is none.
     *
     * Null is a real answer: unauthenticated requests, onboarding, and console
     * commands all run without a tenant.
     */
    public static function current(): ?self
    {
        $id = static::currentId();

        if ($id === null) {
            return null;
        }

        if (static::$override?->getKey() === $id) {
            return static::$override;
        }

        // The cache is only trusted while it still names the current tenant.
        if (static::$cache?->getKey() === $id) {
            return static::$cache;
        }

        return static::$cache = static::find($id);
    }

    /**
     * The active organization's id without loading the model.
     *
     * The hot path — TenantScope calls this on every query — and the single
     * definition of which tenant is active. Reading the session directly rather
     * than a memo is what keeps it honest; the session is cheap.
     */
    public static function currentId(): ?int
    {
        if (static::$override !== null) {
            return static::$override->getKey();
        }

        return Session::get(self::SESSION_KEY);
    }

    /** Make this the active organization for the rest of the session. */
    public function switchTo(): void
    {
        Session::put(self::SESSION_KEY, $this->getKey());

        static::$cache = $this;
    }

    /**
     * Drop the active organization.
     *
     * Called on logout and when a membership is revoked mid-session; without it
     * a revoked user keeps reading the tenant until their session expires.
     */
    public static function forget(): void
    {
        Session::forget(self::SESSION_KEY);

        static::$cache = null;
        static::$override = null;
    }

    /**
     * Set the tenant explicitly, for queued jobs, console commands and tests.
     *
     * TenantScope does not filter in console context, so a job that touches
     * tenant data must call this or it reads across every tenant.
     */
    public static function setCurrent(?self $organization): void
    {
        static::$override = $organization;
        static::$cache = $organization;
    }

    public function membershipFor(User $user): ?Membership
    {
        return $this->memberships()->where('user_id', $user->getKey())->first();
    }

    public function addMember(User $user, OrganizationRole $role): Membership
    {
        return $this->memberships()->create([
            'user_id' => $user->getKey(),
            'role' => $role,
            'surfaces' => array_map(fn (Surface $s) => $s->value, $role->defaultSurfaces()),
        ]);
    }
}
