<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * A key for the public API. The secret is shown once and never stored — only
 * its hash. `prefix` exists so the list can say which key is which.
 */
#[Fillable(['name', 'prefix', 'key_hash', 'scopes', 'publishable', 'created_by_id'])]
class ApiKey extends Model
{
    use BelongsToTenant;

    public const SCOPES = ['calls:write', 'calls:read', 'contacts:read', 'contacts:write', 'runs:read', 'runs:write'];

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
            'key_hash' => hash('sha256', $secret),
            'scopes' => $scopes,
            'publishable' => $publishable,
            'created_by_id' => $by?->getKey(),
        ]);

        return [$key, $secret];
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }

    /** Permanent. A revoked key is kept so the list can show who created what and when it stopped. */
    public function revoke(): void
    {
        $this->forceFill(['revoked_at' => now()])->save();
    }
}
