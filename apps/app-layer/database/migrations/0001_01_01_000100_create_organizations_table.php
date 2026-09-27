<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tenancy, which the old FastAPI schema had none of.
 *
 * Every tenant-owned table in this application carries an `organization_id`
 * declared through the `$table->organization()` macro, and every query against
 * it is filtered by TenantScope. This migration creates the two tables that
 * make that possible, so it must run before any tenant-owned table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // Used in URLs and as the agent layer's org identifier, so it is
            // immutable in practice even though nothing here enforces that.
            $table->string('slug')->unique();
            $table->string('timezone')->default('UTC');
            $table->timestamps();
            $table->softDeletes();
        });

        // A user's access to one organization, and to which surfaces of it.
        //
        // `surfaces` is stored per-membership rather than derived from `role`
        // because Desk and Studio are separate products: a support agent gets
        // Desk and never sees Studio, and that has to be expressible without
        // inventing a role for every combination. Role still supplies the
        // default (see OrganizationRole::defaultSurfaces).
        Schema::create('memberships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role');
            $table->json('surfaces');

            // The old schema had a separate `team_members` table holding these
            // three columns plus a name, because it had no real user accounts.
            // Now that it does, a "team member" is just a membership: the direct
            // line and extension are how the agent transfers a call to this
            // person, and they are per-organization, not per-person.
            $table->string('phone')->nullable();
            $table->string('extension')->nullable();
            $table->string('avatar_color')->default('#e96b34');

            $table->timestamps();

            $table->unique(['organization_id', 'user_id']);
            $table->index(['organization_id', 'extension']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memberships');
        Schema::dropIfExists('organizations');
    }
};
