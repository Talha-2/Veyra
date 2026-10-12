<?php

namespace Tests;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

abstract class HealthcareTestCase extends TestCase
{
    use RefreshDatabase;

    protected Organization $clinic;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        config(['services.agent.url' => null, 'services.cartesia.key' => null, 'services.elevenlabs.key' => null]);
        $this->clinic = Organization::create(['name' => 'Lahore Clinic', 'slug' => 'lahore', 'timezone' => 'Asia/Karachi']);
        $this->owner = User::create(['name' => 'Clinic Owner', 'email' => 'clinic@example.test', 'password' => 'password']);
        $this->clinic->addMember($this->owner, OrganizationRole::Owner);
        Organization::setCurrent($this->clinic);
        $this->actingAs($this->owner);
    }

    protected function tearDown(): void
    {
        Organization::setCurrent(null);
        parent::tearDown();
    }

    protected function otherClinic(): Organization
    {
        return Organization::create(['name' => 'Other Clinic', 'slug' => 'other', 'timezone' => 'Asia/Karachi']);
    }
}
