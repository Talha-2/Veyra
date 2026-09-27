<?php

namespace App\Providers;

use App\Enums\Surface;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

/**
 * Wires the two things tenancy and the surface split need globally: the
 * migration macro that declares tenant ownership, and the gates that keep Desk
 * and Studio apart.
 */
class TenancyServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->registerBlueprintMacro();
        $this->registerSurfaceGates();
    }

    /**
     * `$table->organization()` — the tenant foreign key.
     *
     * A macro rather than a copied pair of lines so that every tenant-owned
     * table is indexed and cascades identically, and so "which tables are
     * tenant-owned" is one grep.
     */
    protected function registerBlueprintMacro(): void
    {
        Blueprint::macro('organization', function (string $column = 'organization_id') {
            /** @var Blueprint $this */
            return $this->foreignId($column)
                ->constrained('organizations')
                ->cascadeOnDelete()
                ->index();
        });
    }

    /**
     * `access-desk` and `access-studio`.
     *
     * These are the only thing holding the two products apart, so they are
     * defined once, here, and read from the membership rather than the role.
     * Every route in routes/desk/ and routes/studio/ sits behind one of them.
     */
    protected function registerSurfaceGates(): void
    {
        foreach (Surface::cases() as $surface) {
            Gate::define(
                $surface->gate(),
                fn (User $user) => $user->canAccessSurface($surface),
            );
        }

        Gate::define(
            'administer-organization',
            fn (User $user) => (bool) $user->currentMembership()?->role->administersOrganization(),
        );
    }
}
