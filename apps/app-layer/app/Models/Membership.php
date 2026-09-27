<?php

namespace App\Models;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * One user's access to one organization.
 *
 * A pivot with behaviour: it answers what role someone holds and which of the
 * two product surfaces they may open. The gates in TenancyServiceProvider ask
 * this model and nothing else, so surface access has exactly one definition.
 */
#[Fillable(['organization_id', 'user_id', 'role', 'surfaces', 'extension', 'phone'])]
class Membership extends Pivot
{
    public $incrementing = true;

    protected $table = 'memberships';

    protected function casts(): array
    {
        return [
            'role' => OrganizationRole::class,
            'surfaces' => 'array',
        ];
    }

    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function organization(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /** Whether this member may open the given surface. */
    public function canAccess(Surface $surface): bool
    {
        return in_array($surface->value, $this->surfaces ?? [], strict: true);
    }

    /**
     * Surfaces this member may open, in a fixed order.
     *
     * Order is Desk then Studio everywhere it is rendered, so the app switcher
     * does not reorder itself between users.
     *
     * @return list<Surface>
     */
    public function accessibleSurfaces(): array
    {
        return array_values(array_filter(
            [Surface::Desk, Surface::Studio],
            fn (Surface $s) => $this->canAccess($s),
        ));
    }

    /** Where this member should land after sign-in, or null if they may open nothing. */
    public function landingSurface(): ?Surface
    {
        return $this->accessibleSurfaces()[0] ?? null;
    }

    public function grant(Surface $surface): void
    {
        if (! $this->canAccess($surface)) {
            $this->surfaces = [...$this->surfaces ?? [], $surface->value];
            $this->save();
        }
    }

    public function revoke(Surface $surface): void
    {
        $this->surfaces = array_values(array_filter(
            $this->surfaces ?? [],
            fn (string $value) => $value !== $surface->value,
        ));
        $this->save();
    }
}
