<?php

namespace App\Models;

use App\Scopes\TenantScope;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * A key for the public API (`/api/v1`). The secret is shown once and never
 * stored — only its hash. `prefix` exists so the list can say which key is which.
 *
 * Two kinds:
 * - **server** (`vy_sk_…`): can do whatever its scopes allow. Never in a browser.
 * - **publishable** (`vy_pk_…`): safe to embed. It may only call routes marked
 *   publishable in routes/api_v1.php, and may only hold PUBLISHABLE_SCOPES.
 */
#[Fillable(['name', 'prefix', 'key_hash', 'scopes', 'publishable', 'created_by_id'])]
class ApiKey extends Model
{
    use BelongsToTenant;

    /**
     * Every scope a route checks, grouped by resource, and nothing else — the
     * Developer page's scope picker and the OpenAPI spec are built from this,
     * so a scope that exists here has a route behind it.
     */
    public const SCOPE_DESCRIPTIONS = [
        'contacts:read' => 'List, fetch and look up contacts.',
        'contacts:write' => 'Create, update and delete contacts.',
        'conversations:read' => 'List conversations and read their messages and notes.',
        'messages:write' => 'Record outbound messages and add internal notes.',
        'tickets:read' => 'List and fetch tickets and their notes.',
        'tickets:write' => 'Create and update tickets, and add notes.',
        'leads:read' => 'List and fetch leads and pipelines.',
        'leads:write' => 'Create and update leads, and move them between stages.',
        'calls:read' => 'List calls and read transcripts, summaries and handoffs.',
        'knowledge:read' => 'List, fetch and search knowledge documents.',
        'knowledge:write' => 'Create, update and delete knowledge documents.',
        'webhooks:read' => 'List webhook endpoints.',
        'webhooks:write' => 'Create and delete webhook endpoints.',
        'chat:write' => 'Chat with your agent: start sessions, send messages, read replies.',
    ];

    public const SCOPES = [
        'contacts:read', 'contacts:write',
        'conversations:read', 'messages:write',
        'tickets:read', 'tickets:write',
        'leads:read', 'leads:write',
        'calls:read',
        'knowledge:read', 'knowledge:write',
        'webhooks:read', 'webhooks:write',
        'chat:write',
    ];

    /**
     * What a publishable key may hold. A publishable key ships inside a web
     * page, so anything it can reach is effectively public: today that is
     * knowledge search, which only returns what the agent already tells any
     * caller. Agent chat will join it when `/api/v1/chat` lands.
     */
    public const PUBLISHABLE_SCOPES = ['knowledge:read', 'chat:write'];

    protected function casts(): array
    {
        return ['scopes' => 'array', 'publishable' => 'boolean', 'last_used_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    /**
     * Mint a key. Returns [model, plaintext]; the plaintext exists only in the
     * response that created it.
     *
     * @return array{0: self, 1: string}
     */
    public static function mint(string $name, array $scopes, bool $publishable, ?User $by): array
    {
        $kind = $publishable ? 'pk' : 'sk';
        $secret = "vy_{$kind}_".Str::random(40);

        $key = static::create([
            'name' => $name,
            // The first 14 characters, enough to tell keys apart in a list
            // without giving away anything useful. The UI adds the ellipsis.
            'prefix' => substr($secret, 0, 14),
            'key_hash' => static::hashSecret($secret),
            'scopes' => array_values($scopes),
            'publishable' => $publishable,
            'created_by_id' => $by?->getKey(),
        ]);

        return [$key, $secret];
    }

    public static function hashSecret(string $secret): string
    {
        return hash('sha256', $secret);
    }

    /**
     * The key a bearer token names, across every tenant — the token is how
     * the tenant is found, so there is no tenant to scope by yet. Revoked
     * keys are returned too, so the caller can say "revoked" rather than
     * "invalid".
     */
    public static function findByToken(string $token): ?self
    {
        if (! preg_match('/^vy_(sk|pk)_[A-Za-z0-9]{20,80}$/', $token)) {
            return null;
        }

        return static::withoutGlobalScope(TenantScope::class)
            ->where('key_hash', static::hashSecret($token))
            ->first();
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }

    public function hasScope(string $scope): bool
    {
        return in_array($scope, $this->scopes ?? [], true);
    }

    /**
     * Stamp last use, at most once a minute. Every request would otherwise
     * be a write, and "used 20 seconds ago" is no more useful than "just now".
     */
    public function touchLastUsed(): void
    {
        if ($this->last_used_at && $this->last_used_at->gt(now()->subMinute())) {
            return;
        }

        $this->forceFill(['last_used_at' => now()])->saveQuietly();
    }

    /** Permanent. A revoked key is kept so the list can show who created what and when it stopped. */
    public function revoke(): void
    {
        $this->forceFill(['revoked_at' => now()])->save();
    }
}
