<?php

namespace Tests\Feature;

use App\Enums\Surface;
use App\Models\Contact;
use App\Models\Organization;
use App\Models\Patient;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\HealthcareTestCase;

class PatientDeskTest extends HealthcareTestCase
{
    public function test_staff_registers_edits_and_archives_a_patient(): void
    {
        $this->post('/desk/patients', ['name' => 'Ayesha Khan', 'birth_date' => '1990-04-03'])->assertRedirect();
        $patient = Patient::firstOrFail();
        $this->get('/desk/patients/'.$patient->id)->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/patient')->where('patient.contact.name', 'Ayesha Khan'));
        $this->patch('/desk/patients/'.$patient->id, ['city' => 'Lahore'])->assertRedirect();
        $this->assertSame('Lahore', $patient->fresh()->city);
        $this->post('/desk/patients/'.$patient->id.'/archive')->assertRedirect();
        $this->assertSame('archived', $patient->fresh()->status);
        $this->post('/desk/patients/'.$patient->id.'/restore')->assertRedirect();
        $this->assertSame('active', $patient->fresh()->status);
    }

    public function test_directory_searches_mrn_and_preserves_filters(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ayesha'], $this->owner);
        app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->get('/desk/patients?search='.$patient->mrn.'&status=active')
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('patients.data', 1)->where('filters.status', 'active'));
    }

    public function test_cross_tenant_profile_and_mutations_are_not_found(): void
    {
        Organization::setCurrent($this->otherClinic());
        $patient = app(PatientRegistry::class)->register(['name' => 'Other Patient'], $this->owner);
        Organization::setCurrent($this->clinic);
        $this->get('/desk/patients/'.$patient->id)->assertNotFound();
        $this->patch('/desk/patients/'.$patient->id, ['city' => 'Lahore'])->assertNotFound();
        $this->post('/desk/patients/'.$patient->id.'/archive')->assertNotFound();
        $this->post('/desk/patients/'.$patient->id.'/restore')->assertNotFound();
    }

    public function test_future_birth_date_is_rejected_over_http(): void
    {
        $this->post('/desk/patients', ['name' => 'Ali', 'birth_date' => '2999-01-01'])->assertSessionHasErrors('birth_date');
        $this->assertSame(0, Contact::count());
    }

    public function test_studio_only_user_cannot_open_patients(): void
    {
        $this->owner->currentMembership()->revoke(Surface::Desk);
        $this->get('/desk/patients')->assertRedirect('/studio');
    }
}
