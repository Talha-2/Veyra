<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\MedicationAdministration;
use App\Models\Organization;
use App\Models\PatientAllergy;
use App\Models\PatientProblem;
use App\Models\Prescription;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\ClinicalRecords;
use App\Services\Healthcare\PatientRegistry;
use Tests\SchedulingTestCase;

class ClinicalCareTest extends SchedulingTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->provider->update(['user_id' => $this->owner->id]);
    }

    private function draft(): Prescription
    {
        $this->post('/desk/patients/'.$this->patient->id.'/prescriptions', ['items' => [['medicine' => 'Demo medicine', 'strength' => 'Demo strength', 'dose' => 'As documented', 'route' => 'Documented route', 'frequency' => 'As documented', 'duration_days' => 7, 'quantity' => 7, 'instructions' => 'Synthetic prescription for UI verification']]])->assertRedirect();

        return Prescription::firstOrFail();
    }

    public function test_providers_can_record_and_resolve_patient_problems_and_allergies(): void
    {
        $base = '/desk/patients/'.$this->patient->id;
        $this->post($base.'/problems', ['name' => 'Recorded condition', 'code' => 'LOCAL-1'])->assertRedirect();
        $this->post($base.'/allergies', ['allergen' => 'Recorded allergen', 'reaction' => 'Recorded reaction', 'severity' => 'moderate'])->assertRedirect();
        $problem = PatientProblem::firstOrFail();
        $allergy = PatientAllergy::firstOrFail();
        $this->post('/desk/problems/'.$problem->id.'/resolve', ['version' => 1])->assertRedirect();
        $this->assertSame('resolved', $problem->fresh()->status);
        $this->post('/desk/allergies/'.$allergy->id.'/inactivate', ['version' => 1, 'reason' => 'Reviewed historical entry'])->assertRedirect();
        $this->assertSame('inactive', $allergy->fresh()->status);
        $this->assertSame('Recorded reaction', $allergy->fresh()->reaction);
    }

    public function test_prescriptions_require_explicit_review_and_issued_content_is_locked(): void
    {
        $rx = $this->draft();
        $url = '/desk/prescriptions/'.$rx->id;
        $this->post($url.'/issue', ['version' => 1, 'reviewed' => false])->assertSessionHasErrors('reviewed');
        $this->post($url.'/issue', ['version' => 1, 'reviewed' => true])->assertRedirect();
        $this->assertSame('issued', $rx->fresh()->status);
        $this->assertNotNull($rx->fresh()->issued_at);
        $this->patch($url, ['version' => 2, 'items' => [['medicine' => 'Changed']]])->assertSessionHasErrors('prescription');
        $this->post($url.'/cancel', ['version' => 2, 'reason' => 'Replaced with updated prescription'])->assertRedirect();
        $this->assertSame('Demo medicine', $rx->fresh()->items[0]['medicine']);
        $this->assertSame('cancelled', $rx->fresh()->status);
    }

    public function test_other_provider_cannot_read_or_issue_someone_elses_draft(): void
    {
        $rx = $this->draft();
        $colleague = User::factory()->create();
        $this->clinic->addMember($colleague, OrganizationRole::Member);
        Provider::create(['name' => 'Other Provider', 'user_id' => $colleague->id]);
        $this->actingAs($colleague)->get('/desk/prescriptions/'.$rx->id)->assertForbidden();
        $this->post('/desk/prescriptions/'.$rx->id.'/issue', ['version' => 1, 'reviewed' => true])->assertForbidden();
    }

    public function test_cancelling_an_unissued_draft_does_not_publish_it_to_other_providers(): void
    {
        $rx = $this->draft();
        $this->post('/desk/prescriptions/'.$rx->id.'/cancel', ['version' => 1, 'reason' => 'Draft not needed'])->assertRedirect();
        $colleague = User::factory()->create();
        $this->clinic->addMember($colleague, OrganizationRole::Member);
        Provider::create(['name' => 'Other Provider', 'user_id' => $colleague->id]);
        $this->actingAs($colleague)->get('/desk/prescriptions/'.$rx->id)->assertForbidden();
    }

    public function test_prescription_items_must_be_a_list(): void
    {
        $this->post('/desk/patients/'.$this->patient->id.'/prescriptions', ['items' => ['medicine_a' => ['medicine' => 'Demo medicine', 'dose' => 'Recorded dose', 'route' => 'Recorded route', 'frequency' => 'Recorded frequency', 'duration_days' => 7, 'quantity' => 7]]])->assertSessionHasErrors('items');
        $this->assertDatabaseCount('prescriptions', 0);
    }

    public function test_issued_prescription_retains_patient_identity_after_demographic_updates(): void
    {
        $rx = $this->draft();
        $this->post('/desk/prescriptions/'.$rx->id.'/issue', ['version' => 1, 'reviewed' => true])->assertRedirect();
        $this->patient->contact->update(['name' => 'Updated patient name']);
        $this->assertSame('Ali Ahmed', data_get($rx->fresh()->patient_snapshot, 'name'));
    }

    public function test_staff_and_other_tenants_cannot_access_clinical_care(): void
    {
        $rx = $this->draft();
        $staff = User::factory()->create();
        $this->clinic->addMember($staff, OrganizationRole::Member);
        $this->actingAs($staff)->get('/desk/patients/'.$this->patient->id.'/care')->assertForbidden();
        $other = $this->otherClinic();
        $other->addMember($this->owner, OrganizationRole::Owner);
        Organization::setCurrent($other);
        Provider::create(['name' => 'Other clinic doctor', 'user_id' => $this->owner->id]);
        $this->actingAs($this->owner)->get('/desk/prescriptions/'.$rx->id)->assertNotFound();
    }

    public function test_archived_patients_and_stale_versions_cannot_receive_new_mutations(): void
    {
        $rx = $this->draft();
        $this->post('/desk/prescriptions/'.$rx->id.'/issue', ['version' => 99, 'reviewed' => true])->assertSessionHasErrors('version');
        $this->patient->update(['status' => 'archived']);
        $this->post('/desk/prescriptions/'.$rx->id.'/issue', ['version' => 1, 'reviewed' => true])->assertSessionHasErrors('patient');
        $this->post('/desk/patients/'.$this->patient->id.'/problems', ['name' => 'New'])->assertSessionHasErrors('patient');
    }

    public function test_administration_history_is_preserved_when_voided(): void
    {
        $this->post('/desk/patients/'.$this->patient->id.'/administrations', ['kind' => 'vaccine', 'name' => 'Demo vaccine', 'dose' => 'Recorded amount', 'route' => 'Recorded route', 'site' => 'Recorded site', 'lot_number' => 'DEMO-1', 'occurred_at' => '2026-10-10T04:00:00Z'])->assertRedirect();
        $record = MedicationAdministration::firstOrFail();
        $this->post('/desk/administrations/'.$record->id.'/void', ['reason' => 'Duplicate documentation', 'version' => 1])->assertRedirect();
        $this->assertSame('voided', $record->fresh()->status);
        $this->assertSame('DEMO-1', $record->fresh()->lot_number);
        $this->post('/desk/administrations/'.$record->id.'/void', ['reason' => 'Replacement reason', 'version' => 2])->assertSessionHasErrors('record');
        $this->assertSame('Duplicate documentation', $record->fresh()->void_reason);
    }

    public function test_prescription_cannot_link_another_patients_encounter(): void
    {
        $otherPatient = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        $encounter = app(ClinicalRecords::class)->start($otherPatient, [], $this->owner);
        $this->post('/desk/patients/'.$this->patient->id.'/prescriptions', ['encounter_id' => $encounter->id, 'items' => [['medicine' => 'Demo medicine', 'dose' => 'Recorded dose', 'route' => 'Recorded route', 'frequency' => 'Recorded frequency', 'duration_days' => 7, 'quantity' => 7]]])->assertSessionHasErrors('encounter_id');
    }
}
