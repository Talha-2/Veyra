<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\PatientAllergy;
use App\Models\PatientProblem;
use App\Models\Prescription;
use App\Models\Provider;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class ClinicalSummaryTest extends SchedulingTestCase
{
    private function encounter(array $attributes = []): ClinicalEncounter
    {
        return ClinicalEncounter::create([...['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Ayesha', 'author_name' => $this->owner->name, 'status' => 'signed', 'occurred_at' => '2026-10-09T04:00:00Z', 'signed_at' => '2026-10-09T05:00:00Z', 'allergy_status' => 'known', 'vitals' => ['pulse' => 0]], ...$attributes]);
    }

    public function test_summary_separates_current_lists_from_historical_signed_observations(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        $recorded = $this->encounter();
        $latest = $this->encounter(['occurred_at' => '2026-10-10T04:00:00Z', 'vitals' => ['pulse' => null]]);
        $recorded->amendments()->create(['author_user_id' => $this->owner->id, 'author_name' => $this->owner->name, 'reason' => 'Correct observation', 'content' => 'Refer to this correction']);
        $latest->amendments()->create(['author_user_id' => $this->owner->id, 'author_name' => $this->owner->name, 'reason' => 'Updated review', 'content' => 'Refer to this review correction']);
        PatientProblem::create(['patient_id' => $this->patient->id, 'name' => 'Current problem', 'status' => 'active']);
        PatientProblem::create(['patient_id' => $this->patient->id, 'name' => 'Resolved problem', 'status' => 'resolved']);
        PatientAllergy::create(['patient_id' => $this->patient->id, 'allergen' => 'Historical entry', 'reaction' => 'Recorded reaction', 'severity' => 'moderate', 'status' => 'inactive']);
        Prescription::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Ayesha', 'status' => 'issued', 'issued_at' => '2026-10-10T05:00:00Z', 'items' => [['medicine' => 'Issued medicine']]]);
        Prescription::create(['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Ayesha', 'status' => 'draft', 'items' => [['medicine' => 'Private draft medicine']]]);
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertInertia(fn (Assert $page) => $page
            ->where('timezone', 'Asia/Karachi')->where('summary.problems.total', 1)->where('summary.problems.data.0.name', 'Current problem')
            ->where('summary.allergies.total', 0)->where('summary.allergy_review.status', 'known')->where('summary.allergy_review.encounter_id', $latest->id)
            ->where('summary.latest_vitals.encounter_id', $recorded->id)->where('summary.latest_vitals.values.pulse', 0)
            ->where('summary.latest_vitals.amended', true)->where('summary.allergy_review.amended', true)
            ->has('summary.recent_prescriptions', 1)->where('summary.recent_prescriptions.0.medicines.0', 'Issued medicine'));
    }

    public function test_summary_excludes_other_provider_drafts_and_restricted_results(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        $other = Provider::create(['name' => 'Other provider']);
        $private = $this->encounter(['provider_id' => $other->id, 'status' => 'draft', 'vitals' => ['pulse' => 42]]);
        $own = $this->encounter(['status' => 'draft', 'chief_complaint' => 'Own unfinished visit']);
        $base = ['patient_id' => $this->patient->id, 'provider_id' => $other->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Other provider', 'author_name' => $this->owner->name, 'kind' => 'lab', 'indication' => 'Recorded indication', 'priority' => 'routine', 'status' => 'resulted', 'ordered_at' => '2026-10-09T04:00:00Z', 'resulted_at' => '2026-10-10T04:00:00Z'];
        DiagnosticOrder::create([...$base, 'name' => 'Visible result']);
        DiagnosticOrder::create([...$base, 'name' => 'Restricted result', 'clinical_encounter_id' => $private->id]);
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertInertia(fn (Assert $page) => $page
            ->where('summary.latest_vitals', null)->where('summary.allergy_review', null)
            ->where('summary.unsigned_visits.total', 1)->where('summary.unsigned_visits.data.0.id', $own->id)
            ->where('summary.pending_results.total', 1)->where('summary.pending_results.data.0.name', 'Visible result'));
        $this->provider->update(['user_id' => null]);
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertForbidden();
    }

    public function test_reception_patient_overview_contains_visit_metadata_without_clinical_summary(): void
    {
        $base = ['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'clinic_location_id' => $this->location->id, 'healthcare_service_id' => $this->service->id, 'request_fingerprint' => str_repeat('a', 64), 'duration_minutes' => 30, 'source' => 'staff', 'timezone' => 'Asia/Karachi', 'status' => 'booked'];
        $future = Appointment::create([...$base, 'idempotency_key' => 'future-visit', 'starts_at' => '2026-10-12T04:00:00Z', 'ends_at' => '2026-10-12T04:30:00Z']);
        $past = Appointment::create([...$base, 'idempotency_key' => 'past-visit', 'status' => 'completed', 'starts_at' => '2026-10-09T04:00:00Z', 'ends_at' => '2026-10-09T04:30:00Z']);
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        Appointment::create([...$base, 'patient_id' => $other->id, 'idempotency_key' => 'other-visit', 'starts_at' => '2026-10-12T05:00:00Z', 'ends_at' => '2026-10-12T05:30:00Z']);
        $this->encounter(['chief_complaint' => 'Clinical secret']);
        $this->get('/desk/patients/'.$this->patient->id)->assertInertia(fn (Assert $page) => $page
            ->where('can_access_clinical', false)->where('timezone', 'Asia/Karachi')->missing('summary')
            ->has('visits.upcoming', 1)->where('visits.upcoming.0.id', $future->id)->where('visits.upcoming.0.timezone', 'Asia/Karachi')
            ->has('visits.recent', 1)->where('visits.recent.0.id', $past->id)->missing('visits.recent.0.encounter'));
    }

    public function test_summary_limits_lists_without_losing_totals_and_ignores_other_patients(): void
    {
        $this->provider->update(['user_id' => $this->owner->id]);
        for ($i = 0; $i < 9; $i++) {
            PatientProblem::create(['patient_id' => $this->patient->id, 'name' => 'Problem '.$i, 'status' => 'active']);
        }
        $other = app(PatientRegistry::class)->register(['name' => 'Other patient'], $this->owner);
        $this->encounter(['patient_id' => $other->id, 'vitals' => ['pulse' => 99]]);
        PatientProblem::create(['patient_id' => $other->id, 'name' => 'Other problem', 'status' => 'active']);
        $this->get('/desk/patients/'.$this->patient->id.'/chart')->assertInertia(fn (Assert $page) => $page
            ->where('summary.problems.total', 9)->has('summary.problems.data', 8)->where('summary.latest_vitals', null));
    }
}
