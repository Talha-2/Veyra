<?php

namespace Database\Seeders;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * A workspace with three people who prove the surface split works.
     *
     * The three accounts are not decoration: each one exercises a different
     * branch of the access rules, so `migrate:fresh --seed` followed by signing
     * in as each is a complete manual test of phase 1.
     */
    public function run(): void
    {
        $organization = Organization::create([
            'name' => 'Northwind Services',
            'slug' => 'northwind',
            'timezone' => 'America/Chicago',
        ]);

        // Both surfaces, and may administer the organization.
        $owner = User::create([
            'name' => 'Ada Owner',
            'email' => 'owner@veyra.test',
            'password' => 'password',
        ]);
        $organization->addMember($owner, OrganizationRole::Owner);

        // Desk only. Hitting /studio must redirect them back to /desk with a
        // warning, and they must see no app switcher at all.
        $operator = User::create([
            'name' => 'Sam Operator',
            'email' => 'operator@veyra.test',
            'password' => 'password',
        ]);
        $organization->addMember($operator, OrganizationRole::Member);

        // Studio only — an admin whose Desk access was explicitly revoked. This
        // is the case that role-derived permissions cannot express, and the
        // reason `surfaces` lives on the membership.
        $builder = User::create([
            'name' => 'Rae Builder',
            'email' => 'builder@veyra.test',
            'password' => 'password',
        ]);
        $organization->addMember($builder, OrganizationRole::Admin)
            ->revoke(Surface::Desk);

        // A second organization for the owner, so the organization picker has
        // something to pick between — and, deliberately, with no demo data, so
        // every empty state gets exercised by simply switching to it.
        $second = Organization::create([
            'name' => 'Lakeside Clinic',
            'slug' => 'lakeside',
            'timezone' => 'America/New_York',
        ]);
        $second->addMember($owner, OrganizationRole::Owner);

        $this->call(DemoDataSeeder::class);
        $this->call(ProductionShapeSeeder::class);
    }
}
