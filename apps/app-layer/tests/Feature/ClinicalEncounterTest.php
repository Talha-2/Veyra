<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Activity;
use App\Models\ClinicalEncounter;
use App\Models\PatientAllergy;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class ClinicalEncounterTest extends SchedulingTestCase
{
    public function test_signing_cannot_claim_no_known_allergies_when_active_entries_exist(): void
    {
        $encounter = $this->start();
        PatientAllergy::create(['patient_id' => $this->patient->id, 'allergen' => 'Recorded allergen', 'reaction' => 'Recorded reaction', 'severity' => 'unknown']);
        $this->patch('/desk/encounters/'.$encounter->id, $this->note())->assertRedirect();
        $this->post('/desk/encounters/'.$encounter->id.'/sign', ['version' => 2])->assertSessionHasErrors('allergy_status');
        $this->assertSame('draft', $encounter->fresh()->status);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->provider->update(['user_id' => $this->owner->id]);
    }

    private function start(): ClinicalEncounter
    {
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', [])->assertRedirect();

        return ClinicalEncounter::firstOrFail();
    }

    private function note(int $version = 1): array
    {
        return ['version' => $version, 'chief_complaint' => 'Follow-up consultation', 'history' => 'Past history reviewed',
            'allergy_status' => 'none_known', 'allergies' => '', 'subjective' => 'Feels well', 'objective' => 'Examination documented',
            'assessment' => 'Routine follow-up', 'plan' => 'Return in four weeks', 'vitals' => ['temperature_c' => 36.8, 'pulse_bpm' => 72]];
    }

    public function test_provider_can_document_sign_and_amend_without_rewriting_signed_note(): void
    {
        $encounter = $this->start();
        $url = '/desk/encounters/'.$encounter->id;
        $this->patch($url, $this->note())->assertRedirect();
        $this->post($url.'/sign', ['version' => 2])->assertRedirect();
        $this->assertSame('signed', $encounter->fresh()->status);
        $this->assertNotNull($encounter->fresh()->signed_at);
        $this->patch($url, [...$this->note(3), 'assessment' => 'Replaced'])->assertSessionHasErrors('encounter');
        $this->post($url.'/amendments', ['reason' => 'Clarify follow-up', 'content' => 'Return in two weeks'])->assertRedirect();
        $this->assertSame('Routine follow-up', $encounter->fresh()->assessment);
        $this->assertDatabaseHas('encounter_amendments', ['clinical_encounter_id' => $encounter->id, 'content' => 'Return in two weeks']);
        $this->assertDatabaseHas('activities', ['type' => 'encounter.signed']);
        $this->assertStringNotContainsString('Routine follow-up', json_encode(Activity::where('type', 'encounter.signed')->first()->meta));
    }

    public function test_staff_without_active_provider_cannot_access_clinical_content(): void
    {
        $encounter = $this->start();
        $this->provider->update(['active' => false]);
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertForbidden();
        $this->get('/desk/encounters/'.$encounter->id)->assertForbidden();
        $this->patch('/desk/encounters/'.$encounter->id, $this->note())->assertForbidden();
    }

    public function test_stale_edits_cannot_overwrite_newer_draft(): void
    {
        $encounter = $this->start();
        $this->patch('/desk/encounters/'.$encounter->id, $this->note())->assertRedirect();
        $this->patch('/desk/encounters/'.$encounter->id, [...$this->note(), 'plan' => 'Stale update'])->assertSessionHasErrors('version');
        $this->assertSame('Return in four weeks', $encounter->fresh()->plan);
        $this->post('/desk/encounters/'.$encounter->id.'/sign', ['version' => 1])->assertSessionHasErrors('version');
    }

    public function test_sign_requires_assessment_plan_and_explicit_allergy_review(): void
    {
        $encounter = $this->start();
        $this->post('/desk/encounters/'.$encounter->id.'/sign', ['version' => 1])->assertSessionHasErrors(['assessment', 'plan', 'allergy_status']);
        $this->assertSame('draft', $encounter->fresh()->status);
    }

    public function test_vitals_and_known_allergies_are_validated(): void
    {
        $encounter = $this->start();
        $this->patch('/desk/encounters/'.$encounter->id, [...$this->note(), 'allergy_status' => 'known', 'vitals' => ['oxygen_percent' => 150]])
            ->assertSessionHasErrors(['allergies', 'vitals.oxygen_percent']);
    }

    public function test_appointment_must_match_patient_and_provider_and_cannot_create_duplicate_visit(): void
    {
        $appointment = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $appointment->id])->assertRedirect();
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $appointment->id])->assertRedirect();
        $this->assertSame(1, ClinicalEncounter::count());
        $otherPatient = app(PatientRegistry::class)->register(['name' => 'Different patient'], $this->owner);
        $this->post('/desk/patients/'.$otherPatient->id.'/encounters', ['appointment_id' => $appointment->id])->assertSessionHasErrors('appointment_id');
    }

    public function test_other_provider_can_read_signed_visits_but_not_anothers_draft_or_sign_it(): void
    {
        $encounter = $this->start();
        $this->patch('/desk/encounters/'.$encounter->id, $this->note())->assertRedirect();
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Another doctor', 'user_id' => $this->owner->id]);
        $this->get('/desk/encounters/'.$encounter->id)->assertForbidden();
        $this->post('/desk/encounters/'.$encounter->id.'/sign', ['version' => 2])->assertForbidden();
        $encounter->update(['status' => 'signed', 'signed_at' => now()]);
        $this->get('/desk/encounters/'.$encounter->id)->assertOk();
        $this->post('/desk/encounters/'.$encounter->id.'/amendments', ['reason' => 'Correction', 'content' => 'New content'])->assertForbidden();
    }

    public function test_cross_tenant_records_are_not_accessible(): void
    {
        $encounter = $this->start();
        $encounter->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/encounters/'.$encounter->id)->assertNotFound();
    }

    public function test_chart_lists_records_and_logs_access(): void
    {
        $this->start();
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/clinical-chart')->has('encounters.data', 1));
        $this->assertDatabaseHas('activities', ['type' => 'clinical.chart_viewed']);
    }

    public function test_multiple_active_provider_links_fail_closed(): void
    {
        Provider::create(['name' => 'Second provider', 'user_id' => $this->owner->id]);
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', [])->assertForbidden();
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertForbidden();
    }

    public function test_cross_tenant_mutations_cannot_change_a_note(): void
    {
        $encounter = $this->start();
        $encounter->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $url = '/desk/encounters/'.$encounter->id;
        $this->patch($url, $this->note())->assertNotFound();
        $this->post($url.'/sign', ['version' => 1])->assertNotFound();
        $this->post($url.'/amendments', ['reason' => 'Wrong tenant', 'content' => 'No change'])->assertNotFound();
        $this->assertDatabaseMissing('encounter_amendments', ['clinical_encounter_id' => $encounter->id]);
    }

    public function test_relinked_provider_account_does_not_inherit_the_previous_authors_draft(): void
    {
        $encounter = $this->start();
        $replacement = User::create(['name' => 'Replacement doctor', 'email' => 'replacement@example.test', 'password' => 'password']);
        $this->clinic->addMember($replacement, OrganizationRole::Member);
        $this->provider->update(['user_id' => $replacement->id]);
        $this->actingAs($replacement);
        $this->get('/desk/encounters/'.$encounter->id)->assertForbidden();
        $this->patch('/desk/encounters/'.$encounter->id, $this->note())->assertForbidden();
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertInertia(fn (Assert $page) => $page->has('encounters.data', 0));
    }

    public function test_wrong_provider_cannot_start_an_appointment_encounter(): void
    {
        $appointment = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Another doctor', 'user_id' => $this->owner->id]);
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $appointment->id])->assertSessionHasErrors('appointment_id');
        $this->assertSame(0, ClinicalEncounter::count());
    }
}
