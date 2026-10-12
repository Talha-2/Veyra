<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Activity;
use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\BookingService;
use Carbon\CarbonImmutable;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class ClinicWorklistTest extends SchedulingTestCase
{
    public function test_location_filter_returns_only_existing_location_fields(): void
    {
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('locations.0', ['id' => $this->location->id, 'name' => 'Lahore', 'timezone' => 'Asia/Karachi']));
    }

    public function test_stale_prepare_cannot_start_a_newly_checked_in_consultation(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        $visit = $this->visit();
        $this->post('/desk/appointments/'.$visit->id.'/status', ['status' => 'checked_in'])->assertRedirect();
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id, 'expected_status' => 'booked'])->assertSessionHasErrors('expected_status');
        $this->assertNull($visit->fresh()->consultation_started_at);
        $this->assertDatabaseCount('clinical_encounters', 0);
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id, 'expected_status' => 'checked_in'])->assertRedirect();
        $this->assertNotNull($visit->fresh()->consultation_started_at);
    }

    public function test_search_and_location_provider_filters_use_clinic_day_boundaries(): void
    {
        $visit = $this->visit();
        $visit->update(['starts_at' => '2026-10-10T19:00:00Z']);
        $this->patient->contact->update(['phone' => '+923001234567']);
        $filters = '&provider_id='.$this->provider->id.'&location_id='.$this->location->id;
        foreach (['Ali', 'aLI', mb_strtolower($this->patient->mrn), $this->patient->mrn, '1234567'] as $search) {
            $this->get('/desk/dashboard?search='.urlencode($search).$filters)->assertInertia(fn (Assert $page) => $page->where('appointments.total', 1)->where('filters.provider_id', (string) $this->provider->id)->where('filters.location_id', (string) $this->location->id));
        }
        $visit->update(['starts_at' => '2026-10-11T19:00:00Z']);
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('appointments.total', 0));
        $this->get('/desk/dashboard?date=2026-10-12')->assertInertia(fn (Assert $page) => $page->where('appointments.total', 1));
        $this->location->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/dashboard?location_id='.$this->location->id)->assertSessionHasErrors('location_id');
    }

    public function test_archived_patient_and_other_provider_cannot_offer_start_but_signed_notes_are_readable(): void
    {
        $visit = $this->visit();
        $visit->update(['starts_at' => '2026-10-11T04:00:00Z']);
        $this->provider->update(['user_id' => $this->owner->id]);
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id])->assertRedirect();
        $note = ClinicalEncounter::sole();
        $note->update(['status' => 'signed', 'signed_at' => now()]);
        $this->patient->update(['status' => 'archived']);
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('appointments.data.0.can_start', false)->where('appointments.data.0.encounter.id', $note->id));
        $this->patient->update(['status' => 'active']);
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('appointments.data.0.can_start', false)->where('appointments.data.0.encounter.id', $note->id));
    }

    public function test_relinked_provider_cannot_resume_private_draft_or_record_start(): void
    {
        $visit = $this->visit();
        $visit->update(['status' => 'checked_in', 'starts_at' => '2026-10-11T04:00:00Z']);
        $note = ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Doctor', 'author_name' => 'Author', 'appointment_id' => $visit->id, 'occurred_at' => now()]);
        $replacement = User::create(['name' => 'Replacement', 'email' => 'worklist-replacement@example.test', 'password' => 'password']);
        $this->clinic->addMember($replacement, OrganizationRole::Member);
        $this->provider->update(['user_id' => $replacement->id]);
        $this->actingAs($replacement);
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('appointments.data.0.encounter', null)->where('appointments.data.0.can_start', false)->where('attention.unsigned_count', 0));
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id])->assertForbidden();
        $this->assertNull($visit->fresh()->consultation_started_at);
        $this->assertSame($note->id, ClinicalEncounter::sole()->id);
    }

    public function test_clinician_attention_uses_existing_result_visibility_and_own_unsigned_notes(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        $other = Provider::create(['name' => 'Other doctor']);
        $private = ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $other->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Other doctor', 'author_name' => 'Author', 'occurred_at' => now()]);
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', [])->assertRedirect();
        $attributes = ['patient_id' => $this->patient->id, 'provider_id' => $other->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Other doctor', 'author_name' => 'Author', 'kind' => 'lab', 'name' => 'Result', 'indication' => 'Indication', 'status' => 'resulted', 'ordered_at' => now(), 'resulted_at' => now()];
        DiagnosticOrder::create([...$attributes, 'clinical_encounter_id' => $private->id]);
        DiagnosticOrder::create($attributes);
        DiagnosticOrder::create([...$attributes, 'ordered_at' => null]);
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('attention.unsigned_count', 1)->has('attention.unsigned_visits', 1)->where('attention.pending_results_count', 1));
    }

    public function test_recorded_wait_and_operational_stages_do_not_infer_started_from_a_prepared_note(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        $visit = $this->visit();
        $visit->update(['starts_at' => '2026-10-11T04:00:00Z']);
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id])->assertRedirect();
        $visit->forceFill(['status' => 'checked_in', 'checked_in_at' => '2026-10-11T02:30:00Z'])->save();
        $this->get('/desk/dashboard?stage=waiting')->assertInertia(fn (Assert $page) => $page->where('counts.waiting', 1)->where('appointments.data.0.visit_stage', 'waiting')->where('appointments.data.0.waiting_minutes', 30)->where('appointments.data.0.can_start', true));
        $this->post('/desk/patients/'.$this->patient->id.'/encounters', ['appointment_id' => $visit->id])->assertRedirect();
        CarbonImmutable::setTestNow(CarbonImmutable::now()->addMinutes(15));
        $this->get('/desk/dashboard?stage=in_consultation')->assertInertia(fn (Assert $page) => $page->where('counts.in_consultation', 1)->where('appointments.data.0.waiting_minutes', 30));
        ClinicalEncounter::sole()->update(['status' => 'signed', 'signed_at' => now()]);
        $this->provider->update(['user_id' => null]);
        $this->get('/desk/dashboard?stage=ready_checkout')->assertInertia(fn (Assert $page) => $page->where('counts.ready_checkout', 1)->where('appointments.data.0.visit_stage', 'ready_checkout')->where('appointments.data.0.encounter', null));
    }

    private function visit(): Appointment
    {
        return app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
    }

    public function test_arrival_and_checkout_retries_preserve_timestamps_and_activity(): void
    {
        $visit = $this->visit();
        $url = '/desk/appointments/'.$visit->id.'/status';
        $this->post($url, ['status' => 'checked_in', 'expected_status' => 'booked'])->assertRedirect();
        $arrival = $visit->fresh()->checked_in_at;
        $this->assertNotNull($arrival);
        CarbonImmutable::setTestNow(CarbonImmutable::now()->addMinutes(10));
        $this->post($url, ['status' => 'checked_in', 'expected_status' => 'booked'])->assertRedirect();
        $this->assertTrue($arrival->equalTo($visit->fresh()->checked_in_at));
        $this->assertSame(1, Activity::where('type', 'appointment.checked_in')->count());
        $this->post($url, ['status' => 'completed', 'expected_status' => 'checked_in'])->assertRedirect();
        $completed = $visit->fresh()->completed_at;
        $this->assertNotNull($completed);
        CarbonImmutable::setTestNow(CarbonImmutable::now()->addMinutes(10));
        $this->post($url, ['status' => 'completed', 'expected_status' => 'checked_in'])->assertRedirect();
        $this->assertTrue($completed->equalTo($visit->fresh()->completed_at));
        $this->assertSame(1, Activity::where('type', 'appointment.completed')->count());
    }

    public function test_stale_transitions_and_cancellation_do_not_change_a_moved_visit(): void
    {
        $visit = $this->visit();
        $visit->update(['status' => 'checked_in']);
        $this->post('/desk/appointments/'.$visit->id.'/status', ['status' => 'completed', 'expected_status' => 'booked'])->assertSessionHasErrors('expected_status');
        $this->post('/desk/appointments/'.$visit->id.'/cancel', ['expected_status' => 'booked'])->assertSessionHasErrors('expected_status');
        $this->assertSame('checked_in', $visit->fresh()->status);
        $this->post('/desk/appointments/'.$visit->id.'/status', ['status' => 'in_consultation'])->assertSessionHasErrors('status');
    }

    public function test_pre_charting_does_not_start_and_checkin_resume_records_first_start(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        $visit = $this->visit();
        $url = '/desk/patients/'.$this->patient->id.'/encounters';
        $this->post($url, ['appointment_id' => $visit->id])->assertRedirect();
        $this->assertNull($visit->fresh()->consultation_started_at);
        $visit->update(['status' => 'checked_in']);
        $this->post($url, ['appointment_id' => $visit->id])->assertRedirect();
        $started = $visit->fresh()->consultation_started_at;
        $this->assertNotNull($started);
        CarbonImmutable::setTestNow(CarbonImmutable::now()->addMinutes(5));
        $this->post($url, ['appointment_id' => $visit->id])->assertRedirect();
        $this->assertTrue($started->equalTo($visit->fresh()->consultation_started_at));
        $this->assertSame(1, ClinicalEncounter::count());
    }

    public function test_reception_sees_progress_without_private_note_or_attention(): void
    {
        $visit = $this->visit();
        $visit->update(['starts_at' => '2026-10-11T04:00:00Z', 'status' => 'checked_in']);
        ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'appointment_id' => $visit->id, 'occurred_at' => now(), 'provider_name' => 'Doctor', 'author_name' => 'Author', 'chief_complaint' => 'Private symptom']);
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('can_access_clinical', false)->where('attention', null)->where('appointments.data.0.encounter', null)->where('appointments.data.0.can_start', false)->where('appointments.data.0.visit_stage', 'waiting')->where('appointments.data.0.waiting_minutes', null));
    }

    public function test_worklist_paginates_more_than_fifty_clinic_day_visits_and_scopes_filters(): void
    {
        $visit = $this->visit();
        $visit->update(['starts_at' => '2026-10-10T19:00:00Z']);
        for ($i = 0; $i < 51; $i++) {
            $copy = $visit->replicate();
            $copy->idempotency_key = 'copy-'.$i;
            $copy->save();
        }
        $this->get('/desk/dashboard?search=Ali&stage=all')->assertInertia(fn (Assert $page) => $page->where('counts.total', 52)->has('appointments.data', 25)->where('appointments.total', 52)->where('appointments.last_page', 3));
        $this->get('/desk/dashboard?page=3')->assertInertia(fn (Assert $page) => $page->has('appointments.data', 2));
        $this->get('/desk/dashboard?date=2026-10-10')->assertInertia(fn (Assert $page) => $page->where('counts.total', 0));
        $foreign = Provider::create(['name' => 'Foreign']);
        $foreign->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/dashboard?provider_id='.$foreign->id)->assertSessionHasErrors('provider_id');
        $this->get('/desk/dashboard?date=not-a-date')->assertSessionHasErrors('date');
    }
}
