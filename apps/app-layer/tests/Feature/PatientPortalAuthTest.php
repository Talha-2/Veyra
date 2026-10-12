<?php

namespace Tests\Feature;

use App\Models\PatientPortalAccess;
use App\Models\User;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia;
use Tests\HealthcareTestCase;

class PatientPortalAuthTest extends HealthcareTestCase
{
    public function test_patient_profile_exposes_portal_admin_action_without_a_provider_account(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        $this->get('/desk/patients/'.$patient->id)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->where('can_manage_portal', true)->where('can_access_clinical', false));
    }

    public function test_invited_patient_can_register_without_creating_a_staff_organization(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Invited patient'], $this->owner);
        $this->post('/desk/patients/'.$patient->id.'/portal/invitations', ['email' => 'new-patient@example.test'])->assertRedirect();
        $invitation = $this->app['session']->get('patient_portal_invitation_url');
        $this->post('/logout')->assertRedirect();
        $this->get($invitation)->assertRedirect(route('login'));
        $this->post('/register', ['name' => 'Patient account', 'email' => 'new-patient@example.test', 'password' => 'test-password-123', 'password_confirmation' => 'test-password-123'])->assertRedirect($invitation);
        $user = User::where('email', 'new-patient@example.test')->firstOrFail();
        $this->assertSame(0, $user->memberships()->count());
        $this->post($invitation)->assertRedirect();
        $this->assertDatabaseHas('patient_portal_accesses', ['user_id' => $user->id, 'patient_id' => $patient->id]);
    }

    public function test_returning_patient_login_opens_portal_without_staff_onboarding(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        $user = User::create(['name' => 'Patient account', 'email' => 'portal-login@example.test', 'password' => 'test-password-123']);
        PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id, 'share_clinical' => false]);
        $this->post('/logout')->assertRedirect();
        $this->post('/login', ['email' => $user->email, 'password' => 'test-password-123'])->assertRedirect(route('portal.index'));
    }
}
