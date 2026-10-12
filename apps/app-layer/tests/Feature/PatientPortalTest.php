<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\PatientPortalAccess;
use App\Models\PatientPortalInvitation;
use App\Models\PatientProblem;
use App\Models\Prescription;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\HealthcareTestCase;

class PatientPortalTest extends HealthcareTestCase
{
    private function patient(): Patient
    {
        return app(PatientRegistry::class)->register(['name' => 'Ayesha Khan', 'birth_date' => '1991-04-03'], $this->owner);
    }

    private function portalUser(): User
    {
        return User::create(['name' => 'Ayesha', 'email' => 'ayesha@example.test', 'password' => 'password']);
    }

    private function invite(Patient $patient, string $email = 'ayesha@example.test', bool $share = false): string
    {
        $this->post('/desk/patients/'.$patient->id.'/portal/invitations', ['email' => $email, 'share_clinical' => $share])->assertRedirect();

        return parse_url(session('patient_portal_invitation_url'), PHP_URL_PATH);
    }

    public function test_invitation_is_hashed_one_time_and_grants_no_membership(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $url = $this->invite($patient);
        $invite = PatientPortalInvitation::firstOrFail();
        $token = basename($url);
        $this->assertSame(hash('sha256', $token), $invite->token_hash);
        $this->assertNotSame($token, $invite->token_hash);
        $oneTimeUrl = session('patient_portal_invitation_url');
        $this->get('/desk/patients/'.$patient->id.'/portal')->assertInertia(fn (Assert $page) => $page->component('desk/patient-portal')->where('invitation_url', $oneTimeUrl));
        $this->get('/desk/patients/'.$patient->id.'/portal')->assertInertia(fn (Assert $page) => $page->where('invitation_url', null));
        $this->actingAs($user);
        Organization::setCurrent(null);
        session()->forget(Organization::SESSION_KEY);
        $this->get($url)->assertOk();
        $this->post($url)->assertRedirect();
        $access = PatientPortalAccess::firstOrFail();
        $this->assertFalse($access->share_clinical);
        $this->assertSame($user->id, $access->user_id);
        $this->assertSame($patient->id, $access->patient_id);
        $this->assertDatabaseMissing('memberships', ['user_id' => $user->id]);
        $this->post($url)->assertGone();
        $this->get('/portal/patients/'.$access->id)->assertOk()->assertInertia(fn (Assert $page) => $page->component('portal/patient')->where('patient.name', 'Ayesha Khan')->has('encounters', 0)->has('prescriptions', 0));
    }

    public function test_wrong_email_and_expired_invitation_cannot_be_redeemed(): void
    {
        $patient = $this->patient();
        $url = $this->invite($patient);
        $user = $this->portalUser();
        $user->update(['email' => 'someone@example.test']);
        $this->actingAs($user);
        $this->post($url)->assertForbidden();
        $this->assertDatabaseCount('patient_portal_accesses', 0);
        $user->update(['email' => 'ayesha@example.test']);
        PatientPortalInvitation::firstOrFail()->update(['expires_at' => now()->subMinute()]);
        $this->post($url)->assertGone();
        $this->assertDatabaseCount('patient_portal_accesses', 0);
    }

    public function test_portal_honors_sharing_and_never_exposes_draft_or_other_patient_notes(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $provider = Provider::create(['name' => 'Doctor', 'user_id' => $this->owner->id, 'active' => true]);
        $base = ['patient_id' => $patient->id, 'provider_id' => $provider->id, 'author_user_id' => $this->owner->id, 'author_name' => 'Doctor', 'provider_name' => 'Doctor', 'occurred_at' => now()];
        ClinicalEncounter::create([...$base, 'status' => 'draft', 'assessment' => 'Private draft']);
        ClinicalEncounter::create([...$base, 'status' => 'signed', 'signed_at' => now(), 'assessment' => 'Shared assessment']);
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        ClinicalEncounter::create([...$base, 'patient_id' => $other->id, 'status' => 'signed', 'signed_at' => now(), 'assessment' => 'Other patient assessment']);
        $access = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id, 'share_clinical' => false]);
        $foreign = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $other->id, 'user_id' => $this->owner->id, 'share_clinical' => true]);
        $this->actingAs($user);
        Organization::setCurrent($this->otherClinic());
        $this->get('/portal/patients/'.$access->id)->assertInertia(fn (Assert $page) => $page->has('encounters', 0));
        $access->update(['share_clinical' => true]);
        $this->get('/portal/patients/'.$access->id)->assertInertia(fn (Assert $page) => $page->has('encounters', 1)->where('encounters.0.assessment', 'Shared assessment'));
        $this->get('/portal/patients/'.$foreign->id)->assertNotFound();
    }

    public function test_admin_can_revoke_access_and_archived_patient_cannot_be_invited(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $access = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id, 'share_clinical' => true]);
        $this->delete('/desk/patients/'.$patient->id.'/portal/accesses/'.$access->id)->assertRedirect();
        $patient->update(['status' => 'archived']);
        $this->post('/desk/patients/'.$patient->id.'/portal/invitations', ['email' => $user->email])->assertSessionHasErrors('patient');
        $this->actingAs($user);
        $this->get('/portal/patients/'.$access->id)->assertNotFound();
        $this->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page->component('portal/index')->has('accesses', 0));
    }

    public function test_provider_can_invite_but_reception_and_provider_cannot_administer_grants(): void
    {
        $patient = $this->patient();
        $user = User::create(['name' => 'Staff', 'email' => 'staff@example.test', 'password' => 'password']);
        $this->clinic->addMember($user, OrganizationRole::Member);
        $this->actingAs($user);
        $this->get('/desk/patients/'.$patient->id.'/portal')->assertForbidden();
        $this->post('/desk/patients/'.$patient->id.'/portal/invitations', ['email' => 'ayesha@example.test'])->assertForbidden();
        Provider::create(['name' => 'Doctor', 'user_id' => $user->id, 'active' => true]);
        $this->invite($patient);
        $grant = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id]);
        $this->delete('/desk/patients/'.$patient->id.'/portal/accesses/'.$grant->id)->assertForbidden();
        $this->patch('/desk/patients/'.$patient->id.'/portal/accesses/'.$grant->id, ['share_clinical' => true])->assertForbidden();
    }

    public function test_portal_only_lists_own_appointments_and_issued_prescriptions_with_privacy_headers(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $provider = Provider::create(['name' => 'Doctor', 'active' => true]);
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        $location = ClinicLocation::create(['name' => 'Main clinic']);
        $service = HealthcareService::create(['name' => 'Consultation', 'duration_minutes' => 20]);
        foreach ([$patient, $other] as $person) {
            Appointment::create(['patient_id' => $person->id, 'provider_id' => $provider->id, 'clinic_location_id' => $location->id, 'healthcare_service_id' => $service->id, 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addMinutes(20), 'timezone' => 'Asia/Karachi', 'duration_minutes' => 20, 'idempotency_key' => 'patient-'.$person->id, 'request_fingerprint' => str_repeat('a', 64)]);
        }
        $base = ['patient_id' => $patient->id, 'provider_id' => $provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Doctor', 'items' => [['medicine' => 'Medicine', 'dose' => 'One tablet', 'route' => 'Oral', 'frequency' => 'Daily', 'duration_days' => 7, 'quantity' => 7]]];
        Prescription::create([...$base, 'status' => 'draft']);
        Prescription::create([...$base, 'status' => 'cancelled', 'issued_at' => now(), 'cancelled_at' => now()]);
        $issued = Prescription::create([...$base, 'status' => 'issued', 'issued_at' => now()]);
        Prescription::create([...$base, 'patient_id' => $other->id, 'status' => 'issued', 'issued_at' => now()]);
        $grant = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id, 'share_clinical' => true]);
        $this->actingAs($user);
        Organization::setCurrent($this->otherClinic());
        $response = $this->get('/portal/patients/'.$grant->id)->assertOk()->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $response->assertInertia(fn (Assert $page) => $page->has('appointments', 1)->where('appointments.0.provider_name', 'Doctor')->has('prescriptions', 1)->where('prescriptions.0.id', $issued->id));
        $this->assertDatabaseHas('activities', ['organization_id' => $this->clinic->id, 'subject_id' => $patient->id, 'type' => 'portal.viewed', 'user_id' => $user->id]);
    }

    public function test_revoked_invitation_and_cross_patient_admin_grant_cannot_be_used(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $url = $this->invite($patient);
        $invitation = PatientPortalInvitation::firstOrFail();
        $this->delete('/desk/patients/'.$patient->id.'/portal/invitations/'.$invitation->id)->assertRedirect();
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        $foreign = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $other->id, 'user_id' => $user->id, 'share_clinical' => true]);
        $this->patch('/desk/patients/'.$patient->id.'/portal/accesses/'.$foreign->id, ['share_clinical' => false])->assertNotFound();
        $this->actingAs($user);
        $this->post($url)->assertGone();
        $this->assertDatabaseCount('patient_portal_accesses', 1);
    }

    public function test_admin_can_set_portal_access_expiry_and_expired_grants_are_hidden(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $access = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id, 'share_clinical' => false]);
        $expiry = now()->addDays(5)->startOfSecond();
        $this->patch('/desk/patients/'.$patient->id.'/portal/accesses/'.$access->id, ['share_clinical' => false, 'expires_at' => $expiry->toIso8601String()])->assertRedirect();
        $this->assertNotNull($access->fresh()->expires_at);
        $this->assertTrue($access->fresh()->expires_at->equalTo($expiry));
        $this->patch('/desk/patients/'.$patient->id.'/portal/accesses/'.$access->id, ['share_clinical' => false, 'expires_at' => now()->subMinute()->toIso8601String()])->assertSessionHasErrors('expires_at');
        $access->update(['expires_at' => now()->subMinute()]);
        $this->actingAs($user);
        $this->get('/portal')->assertInertia(fn (Assert $page) => $page->has('accesses', 0));
        $this->get('/portal/patients/'.$access->id)->assertNotFound();
    }

    public function test_current_problem_and_allergy_chart_entries_require_sharing_and_are_patient_scoped(): void
    {
        $patient = $this->patient();
        $user = $this->portalUser();
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        foreach ([$patient, $other] as $person) {
            PatientProblem::create(['patient_id' => $person->id, 'name' => 'Active problem', 'status' => 'active', 'recorded_by' => $this->owner->id]);
            PatientAllergy::create(['patient_id' => $person->id, 'allergen' => 'Penicillin', 'reaction' => 'Rash', 'severity' => 'moderate', 'status' => 'active', 'recorded_by' => $this->owner->id]);
        }
        PatientProblem::create(['patient_id' => $patient->id, 'name' => 'Resolved problem', 'status' => 'resolved']);
        PatientAllergy::create(['patient_id' => $patient->id, 'allergen' => 'Inactive allergen', 'reaction' => 'Rash', 'severity' => 'mild', 'status' => 'inactive']);
        $grant = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $patient->id, 'user_id' => $user->id, 'share_clinical' => false]);
        $this->actingAs($user);
        Organization::setCurrent($this->otherClinic());
        $this->get('/portal/patients/'.$grant->id)->assertInertia(fn (Assert $page) => $page->has('problems', 0)->has('allergies', 0));
        $grant->update(['share_clinical' => true]);
        $this->get('/portal/patients/'.$grant->id)->assertInertia(fn (Assert $page) => $page->has('problems', 1)->where('problems.0.name', 'Active problem')->has('allergies', 1)->where('allergies.0.allergen', 'Penicillin'));
    }
}
