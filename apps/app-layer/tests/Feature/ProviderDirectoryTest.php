<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\User;
use App\Services\Agent\CallContextBuilder;
use Tests\HealthcareTestCase;

class ProviderDirectoryTest extends HealthcareTestCase
{
    public function test_provider_does_not_require_a_login_account(): void
    {
        $this->post('/desk/providers', ['name' => 'Dr Ayesha', 'specialty' => 'General practice'])->assertRedirect();
        $this->assertDatabaseHas('providers', ['name' => 'Dr Ayesha', 'organization_id' => $this->clinic->id, 'user_id' => null]);
        $this->assertDatabaseHas('actions', ['slug' => 'book_appointment', 'kind' => 'internal', 'is_durable_write' => true, 'is_idempotent' => false]);
        $context = app(CallContextBuilder::class)->forOrganization($this->clinic);
        $this->assertTrue($context['healthcare_enabled']);
    }

    public function test_provider_cannot_link_another_clinics_account(): void
    {
        $user = User::create(['name' => 'Other Doctor', 'email' => 'other@example.test', 'password' => 'password']);
        $this->otherClinic()->addMember($user, OrganizationRole::Member);
        $this->post('/desk/providers', ['name' => 'Doctor', 'user_id' => $user->id])->assertSessionHasErrors('user_id');
    }

    public function test_desk_member_can_read_but_cannot_change_provider_settings(): void
    {
        $user = User::create(['name' => 'Reception', 'email' => 'reception@example.test', 'password' => 'password']);
        $this->clinic->addMember($user, OrganizationRole::Member);
        $this->actingAs($user)->get('/desk/providers')->assertOk();
        $this->post('/desk/providers', ['name' => 'Doctor'])->assertForbidden();
    }

    public function test_services_validate_duration_and_locations_validate_timezone(): void
    {
        $this->post('/desk/services', ['name' => 'Consultation', 'duration_minutes' => 17])->assertSessionHasErrors('duration_minutes');
        $this->post('/desk/locations', ['name' => 'Main clinic', 'timezone' => 'Invalid/Timezone'])->assertSessionHasErrors('timezone');
        $this->post('/desk/services', ['name' => 'Consultation', 'duration_minutes' => 30, 'fee_minor' => 250000])->assertRedirect();
        $this->assertDatabaseHas('healthcare_services', ['name' => 'Consultation', 'duration_minutes' => 30, 'currency' => 'PKR']);
    }
}
