<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AgentConfig;
use App\Models\BusinessProfile;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Renaming an organization carries the name everywhere it is still the old one. */
class OrganizationRenameTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_identifier_business_name_and_greeting_follow_a_rename(): void
    {
        $org = Organization::create(['name' => 'test', 'slug' => 'test', 'timezone' => 'UTC']);
        Organization::create(['name' => 'Harbor Plumbing', 'slug' => 'harbor-plumbing', 'timezone' => 'UTC']);
        $owner = User::create(['name' => 'Talha', 'email' => 't@x.test', 'password' => 'password']);
        $org->addMember($owner, OrganizationRole::Owner);

        Organization::setCurrent($org);
        BusinessProfile::create(['name' => 'test']);
        AgentConfig::create(['display_name' => 'Ava', 'greeting' => 'Thanks for calling test, this is Ava. How can I help?', 'primary_language' => 'en']);
        Organization::setCurrent(null);

        $this->actingAs($owner)->put('/studio/settings/organization', ['name' => 'Harbor Plumbing', 'timezone' => 'UTC'])->assertSessionHas('success');

        $org->refresh();
        $this->assertSame('Harbor Plumbing', $org->name);
        $this->assertSame('harbor-plumbing-2', $org->slug, 'unique against the other organization');

        Organization::setCurrent($org);
        $this->assertSame('Harbor Plumbing', BusinessProfile::query()->sole()->name);
        $this->assertSame('Thanks for calling Harbor Plumbing, this is Ava. How can I help?', AgentConfig::query()->sole()->greeting);
        Organization::setCurrent(null);

        // Saving without a name change keeps the identifier.
        $this->actingAs($owner)->put('/studio/settings/organization', ['name' => 'Harbor Plumbing', 'timezone' => 'America/Chicago']);
        $this->assertSame('harbor-plumbing-2', $org->refresh()->slug);
    }

    public function test_a_business_name_someone_wrote_is_left_alone(): void
    {
        $org = Organization::create(['name' => 'test', 'slug' => 'test', 'timezone' => 'UTC']);
        $owner = User::create(['name' => 'Talha', 'email' => 't@x.test', 'password' => 'password']);
        $org->addMember($owner, OrganizationRole::Owner);
        Organization::setCurrent($org);
        BusinessProfile::create(['name' => 'Northside Heating & Air']);
        Organization::setCurrent(null);

        $this->actingAs($owner)->put('/studio/settings/organization', ['name' => 'Northside', 'timezone' => 'UTC']);

        Organization::setCurrent($org);
        $this->assertSame('Northside Heating & Air', BusinessProfile::query()->sole()->name);
        Organization::setCurrent(null);
    }
}
