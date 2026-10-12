<?php

namespace Tests\Feature;

use App\Models\PatientReferral;
use App\Models\Provider;
use App\Services\Healthcare\ClinicalRecords;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class ReferralCoordinationTest extends SchedulingTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->provider->update(['user_id' => $this->owner->id]);
    }

    private function issued(array $attributes = []): PatientReferral
    {
        $this->post('/desk/referrals', [...['patient_id' => $this->patient->id, 'recipient' => 'Cardiology service', 'reason' => 'Specialist assessment', 'letter' => 'Original clinical letter'], ...$attributes])->assertRedirect();
        $referral = PatientReferral::sole();
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['version' => 1, 'action' => 'issue'])->assertRedirect();

        return $referral->fresh();
    }

    public function test_schedule_reschedule_and_complete_preserve_letter_and_update_history(): void
    {
        $referral = $this->issued();
        $url = '/desk/referrals/'.$referral->id.'/coordination';
        $this->post($url, ['version' => 2, 'status' => 'scheduled', 'scheduled_on' => '2026-10-12', 'note' => 'Appointment arranged'])->assertRedirect();
        $this->post($url, ['version' => 3, 'status' => 'scheduled', 'scheduled_on' => '2026-10-13', 'note' => 'Specialist rescheduled'])->assertRedirect();
        $this->post($url, ['version' => 4, 'status' => 'completed', 'note' => 'Specialist outcome recorded'])->assertRedirect();
        $this->assertSame('issued', $referral->fresh()->status);
        $this->assertSame('completed', $referral->fresh()->coordination_status);
        $this->assertSame('Original clinical letter', $referral->fresh()->letter);
        $this->assertDatabaseCount('referral_updates', 3);
        $this->get('/desk/referrals/'.$referral->id)->assertInertia(fn (Assert $page) => $page->component('desk/referral')->where('referral.can_edit', true)->has('referral.updates', 3)->where('referral.updates.0.note', 'Appointment arranged')->where('referral.updates.1.scheduled_on', '2026-10-13')->where('referral.updates.2.recorded_by_name', $this->owner->name));
        $this->post($url, ['version' => 5, 'status' => 'scheduled', 'scheduled_on' => '2026-10-14', 'note' => 'Invalid reopen'])->assertSessionHasErrors('status');
        $this->assertDatabaseCount('referral_updates', 3);
    }

    public function test_stale_and_invalid_coordination_cannot_write_history(): void
    {
        $referral = $this->issued();
        $url = '/desk/referrals/'.$referral->id.'/coordination';
        $this->post($url, ['version' => 2, 'status' => 'scheduled', 'note' => 'Arrange visit'])->assertSessionHasErrors('scheduled_on');
        $this->post($url, ['version' => 2, 'status' => 'scheduled', 'scheduled_on' => '2026-10-10', 'note' => 'Past date'])->assertSessionHasErrors('scheduled_on');
        $this->post($url, ['version' => 2, 'status' => 'completed', 'note' => ''])->assertSessionHasErrors('note');
        $this->post($url, ['version' => 1, 'status' => 'completed', 'note' => 'Stale data'])->assertSessionHasErrors('version');
        $this->assertSame('pending', $referral->fresh()->coordination_status);
        $this->assertDatabaseCount('referral_updates', 0);
    }

    public function test_archived_patient_can_record_outcome_but_cannot_schedule_new_visit(): void
    {
        $referral = $this->issued();
        $this->patient->update(['status' => 'archived']);
        $this->post('/desk/referrals/'.$referral->id.'/coordination', ['version' => 2, 'status' => 'scheduled', 'scheduled_on' => '2026-10-12', 'note' => 'New appointment'])->assertSessionHasErrors('patient');
        $this->post('/desk/referrals/'.$referral->id.'/coordination', ['version' => 2, 'status' => 'declined', 'note' => 'Patient declined referral'])->assertRedirect();
        $this->assertSame('declined', $referral->fresh()->coordination_status);
    }

    public function test_readers_can_inspect_issued_history_but_not_mutate_it(): void
    {
        $referral = $this->issued();
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/referrals/'.$referral->id)->assertInertia(fn (Assert $page) => $page->where('referral.can_edit', false)->where('referral.letter', 'Original clinical letter'));
        $this->post('/desk/referrals/'.$referral->id.'/coordination', ['version' => 2, 'status' => 'completed', 'note' => 'Not author'])->assertForbidden();
        $referral->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/referrals/'.$referral->id)->assertNotFound();
    }

    public function test_revoked_referrals_retain_letter_and_reject_coordination(): void
    {
        $referral = $this->issued();
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['version' => 2, 'action' => 'revoke', 'reason' => 'Superseded'])->assertRedirect();
        $this->post('/desk/referrals/'.$referral->id.'/coordination', ['version' => 3, 'status' => 'completed', 'note' => 'Too late'])->assertSessionHasErrors('referral');
        $this->assertDatabaseCount('referral_updates', 0);
        $this->get('/desk/referrals?status=revoked&search=CARDIOLOGY')->assertInertia(fn (Assert $page) => $page->where('records.total', 1)->where('counts.pending', 0)->where('filters.status', 'revoked'));
    }

    public function test_linked_private_encounter_protects_referral_and_its_coordination_history(): void
    {
        $encounter = app(ClinicalRecords::class)->start($this->patient, [], $this->owner);
        $referral = $this->issued(['clinical_encounter_id' => $encounter->id]);
        $this->post('/desk/referrals/'.$referral->id.'/coordination', ['version' => 2, 'status' => 'completed', 'note' => 'Private outcome'])->assertRedirect();
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/referrals/'.$referral->id)->assertForbidden();
        $this->get('/desk/referrals')->assertInertia(fn (Assert $page) => $page->where('records.total', 0)->where('counts.completed', 0));
    }
}
