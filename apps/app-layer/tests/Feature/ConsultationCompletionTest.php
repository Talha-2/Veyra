<?php

namespace Tests\Feature;

use App\Models\ClinicalEncounter;
use App\Models\PatientAllergy;
use App\Models\Provider;
use App\Services\Healthcare\BookingService;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class ConsultationCompletionTest extends SchedulingTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->provider->update(['user_id' => $this->owner->id]);
    }

    private function start(): ClinicalEncounter
    {
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', [])->assertRedirect();

        return ClinicalEncounter::sole();
    }

    private function note(int $version = 1): array
    {
        return ['version' => $version, 'chief_complaint' => 'Follow-up visit', 'history' => 'Reviewed history', 'allergy_status' => 'none_known', 'allergies' => '', 'subjective' => 'Recorded symptoms', 'objective' => 'Recorded examination', 'assessment' => 'Recorded assessment', 'plan' => 'Recorded follow-up plan', 'vitals' => ['pulse_bpm' => 72, 'oxygen_percent' => 0], 'confirmed' => true];
    }

    public function test_complete_saves_current_content_and_signs_atomically_without_checkout(): void
    {
        $visit = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->post('/desk/appointments/'.$visit->id.'/status', ['status' => 'checked_in'])->assertRedirect();
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id])->assertRedirect();
        $note = ClinicalEncounter::sole();
        $this->get('/desk/encounters/'.$note->id)->assertInertia(fn (Assert $page) => $page->where('appointment.id', $visit->id)->where('appointment.status', 'checked_in')->where('appointment.timezone', 'Asia/Karachi'));
        $this->post('/desk/encounters/'.$note->id.'/complete', $this->note())->assertRedirect();
        $this->assertSame('signed', $note->fresh()->status);
        $this->assertSame('Recorded follow-up plan', $note->fresh()->plan);
        $this->assertSame(0, $note->fresh()->vitals['oxygen_percent']);
        $this->assertSame(3, $note->fresh()->version);
        $this->assertSame('checked_in', $visit->fresh()->status);
        $this->post('/desk/appointments/'.$visit->id.'/status', ['status' => 'completed', 'expected_status' => 'checked_in'])->assertRedirect();
        $this->assertNotNull($visit->fresh()->completed_at);
        $this->assertDatabaseHas('activities', ['type' => 'encounter.signed']);
    }

    public function test_invalid_completion_rolls_back_content_version_and_activity(): void
    {
        $note = $this->start();
        $this->post('/desk/encounters/'.$note->id.'/complete', [...$this->note(), 'assessment' => ''])->assertSessionHasErrors('assessment');
        $this->assertSame('draft', $note->fresh()->status);
        $this->assertNull($note->fresh()->chief_complaint);
        $this->assertSame(1, $note->fresh()->version);
        $this->assertDatabaseMissing('activities', ['type' => 'encounter.updated']);
        $this->assertDatabaseMissing('activities', ['type' => 'encounter.signed']);
    }

    public function test_completion_requires_confirmation_and_rejects_stale_content(): void
    {
        $note = $this->start();
        $url = '/desk/encounters/'.$note->id;
        $this->post($url.'/complete', [...$this->note(), 'confirmed' => false])->assertSessionHasErrors('confirmed');
        $this->patch($url, [...$this->note(), 'plan' => 'Newer saved plan'])->assertRedirect();
        $this->post($url.'/complete', $this->note())->assertSessionHasErrors('version');
        $this->assertSame('Newer saved plan', $note->fresh()->plan);
        $this->assertSame('draft', $note->fresh()->status);
    }

    public function test_readiness_reports_required_fields_and_live_allergy_conflicts(): void
    {
        $note = $this->start();
        $url = '/desk/encounters/'.$note->id;
        $this->get($url)->assertInertia(fn (Assert $page) => $page->where('timezone', 'Asia/Karachi')->where('appointment', null)->where('readiness.ready', false)->has('readiness.errors.assessment')->has('summary.problems'));
        $this->patch($url, $this->note())->assertRedirect();
        $this->get($url)->assertInertia(fn (Assert $page) => $page->where('readiness.ready', true)->where('readiness.errors', []));
        PatientAllergy::create(['patient_id' => $this->patient->id, 'allergen' => 'Recorded allergen', 'reaction' => 'Recorded reaction', 'severity' => 'unknown']);
        $this->get($url)->assertInertia(fn (Assert $page) => $page->where('readiness.ready', false)->has('readiness.errors.allergy_status'));
        $this->post($url.'/complete', $this->note(2))->assertSessionHasErrors('allergy_status');
        $this->assertSame(2, $note->fresh()->version);
        $this->assertSame('draft', $note->fresh()->status);
    }

    public function test_completion_cannot_modify_signed_or_other_providers_records(): void
    {
        $note = $this->start();
        $this->post('/desk/encounters/'.$note->id.'/complete', $this->note())->assertRedirect();
        $this->post('/desk/encounters/'.$note->id.'/complete', [...$this->note(3), 'plan' => 'Overwrite'])->assertSessionHasErrors('encounter');
        $this->assertSame('Recorded follow-up plan', $note->fresh()->plan);
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->post('/desk/encounters/'.$note->id.'/complete', $this->note(3))->assertForbidden();
        $this->get('/desk/encounters/'.$note->id)->assertInertia(fn (Assert $page) => $page->where('can_edit', false));
    }

    public function test_chart_filters_search_readable_notes_without_disclosing_private_drafts(): void
    {
        $own = $this->start();
        $this->patch('/desk/encounters/'.$own->id, [...$this->note(), 'chief_complaint' => 'Diabetes follow-up'])->assertRedirect();
        $other = Provider::create(['name' => 'Other clinician']);
        ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $other->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Other clinician', 'author_name' => 'Author', 'status' => 'draft', 'chief_complaint' => 'Diabetes secret', 'occurred_at' => now()]);
        $this->get('/desk/patients/'.$this->patient->id.'/chart?status=draft&search=DIABETES')->assertInertia(fn (Assert $page) => $page->where('filters.status', 'draft')->where('filters.search', 'DIABETES')->where('encounters.total', 1)->where('encounters.data.0.id', $own->id));
        $this->get('/desk/patients/'.$this->patient->id.'/chart?status=signed')->assertInertia(fn (Assert $page) => $page->where('encounters.total', 0));
    }

    public function test_cross_tenant_and_unlinked_staff_cannot_complete_a_visit(): void
    {
        $note = $this->start();
        $this->provider->update(['user_id' => null]);
        $this->post('/desk/encounters/'.$note->id.'/complete', $this->note())->assertForbidden();
        $this->get('/desk/encounters/'.$note->id)->assertForbidden();
        $this->provider->update(['user_id' => $this->owner->id]);
        $note->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->post('/desk/encounters/'.$note->id.'/complete', $this->note())->assertNotFound();
        $this->assertSame('draft', $note->fresh()->status);
        $this->assertSame(1, $note->fresh()->version);
    }
}
