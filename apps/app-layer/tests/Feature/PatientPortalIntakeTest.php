<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientPortalAccess;
use App\Models\PatientQuestionnaire;
use App\Models\QuestionnaireResponse;
use App\Models\User;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\HealthcareTestCase;

class PatientPortalIntakeTest extends HealthcareTestCase
{
    public function test_submission_redirects_to_patient_record_without_a_referrer(): void
    {
        $this->withSession(['_previous' => ['url' => url('/portal/invitations/'.str_repeat('x', 64))]])
            ->post($this->url(), $this->payload())->assertRedirect(route('portal.patient', ['access' => $this->access->id]));
    }

    public function test_validation_errors_return_to_patient_record_without_a_referrer(): void
    {
        $this->withSession(['_previous' => ['url' => url('/portal/invitations/'.str_repeat('x', 64))]])
            ->post($this->url(), [...$this->payload(), 'answers' => []])
            ->assertRedirect(route('portal.patient', ['access' => $this->access->id]))->assertSessionHasErrors('answers');
    }

    private Patient $patient;

    private User $portalUser;

    private PatientPortalAccess $access;

    private PatientQuestionnaire $questionnaire;

    protected function setUp(): void
    {
        parent::setUp();
        $this->patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        $this->portalUser = User::create(['name' => 'Patient account', 'email' => 'patient@example.test', 'password' => 'password']);
        $this->access = PatientPortalAccess::create(['organization_id' => $this->clinic->id, 'patient_id' => $this->patient->id, 'user_id' => $this->portalUser->id, 'share_clinical' => false]);
        $this->questionnaire = PatientQuestionnaire::create(['title' => 'Intake', 'questions' => ['Reason for visit?', 'Current medicines?'], 'active' => true]);
        $this->actingAs($this->portalUser);
        Organization::setCurrent($this->otherClinic());
    }

    private function payload(): array
    {
        return ['questionnaire_id' => $this->questionnaire->id, 'expected_title' => 'Intake', 'expected_questions' => ['Reason for visit?', 'Current medicines?'], 'answers' => ['Follow-up', 'None']];
    }

    private function url(): string
    {
        return '/portal/patients/'.$this->access->id.'/questionnaires';
    }

    public function test_patient_submits_own_intake_with_patient_reported_provenance(): void
    {
        $this->post($this->url(), $this->payload())->assertRedirect();
        $response = QuestionnaireResponse::withoutGlobalScopes()->firstOrFail();
        $this->assertSame('patient', $response->source);
        $this->assertSame($this->portalUser->id, $response->recorded_by);
        $this->assertSame($this->clinic->id, $response->organization_id);
        $this->assertSame($this->patient->id, $response->patient_id);
        $this->assertSame('Patient account', $response->recorder_name);
        $this->assertSame(['Follow-up', 'None'], $response->answers);
        $this->get('/portal/patients/'.$this->access->id)->assertInertia(fn (Assert $page) => $page->has('questionnaires', 1)->has('questionnaire_responses', 1)->where('questionnaire_responses.0.source', 'patient')->has('encounters', 0)->has('prescriptions', 0));
    }

    public function test_inactive_or_stale_questionnaires_are_rejected_without_recording_answers(): void
    {
        $this->questionnaire->update(['active' => false]);
        $this->post($this->url(), $this->payload())->assertSessionHasErrors('questionnaire_id');
        $this->questionnaire->update(['active' => true, 'questions' => ['Changed question?', 'Current medicines?']]);
        $this->post($this->url(), $this->payload())->assertSessionHasErrors('questionnaire_id');
        $this->assertDatabaseCount('questionnaire_responses', 0);
    }

    public function test_other_tenant_questionnaire_and_other_account_grant_are_rejected(): void
    {
        $foreign = PatientQuestionnaire::create(['title' => 'Foreign', 'questions' => ['Private question?'], 'active' => true]);
        $this->post($this->url(), ['questionnaire_id' => $foreign->id, 'expected_title' => 'Foreign', 'expected_questions' => ['Private question?'], 'answers' => ['Answer']])->assertSessionHasErrors('questionnaire_id');
        $this->access->update(['user_id' => $this->owner->id]);
        $this->post($this->url(), $this->payload())->assertNotFound();
        $this->assertDatabaseCount('questionnaire_responses', 0);
    }

    public function test_expired_or_revoked_grant_and_archived_patient_cannot_submit(): void
    {
        $this->access->update(['expires_at' => now()->subMinute()]);
        $this->post($this->url(), $this->payload())->assertNotFound();
        $this->get('/portal/patients/'.$this->access->id)->assertNotFound();
        $this->access->update(['expires_at' => null, 'revoked_at' => now()]);
        $this->post($this->url(), $this->payload())->assertNotFound();
        $this->access->update(['revoked_at' => null]);
        $this->patient->update(['status' => 'archived']);
        $this->post($this->url(), $this->payload())->assertSessionHasErrors('patient');
        $this->assertDatabaseCount('questionnaire_responses', 0);
    }

    public function test_patient_sees_only_own_patient_reported_responses_and_snapshots_remain_immutable(): void
    {
        $this->post($this->url(), $this->payload())->assertRedirect();
        $this->questionnaire->update(['title' => 'Changed', 'questions' => ['Changed?'], 'active' => false]);
        $base = ['organization_id' => $this->clinic->id, 'patient_id' => $this->patient->id, 'recorded_by' => $this->owner->id, 'recorder_name' => 'Clinician', 'title' => 'Private clinical intake', 'questions' => ['Private?'], 'answers' => ['Clinical answer']];
        QuestionnaireResponse::forceCreate([...$base, 'source' => 'clinician']);
        QuestionnaireResponse::forceCreate([...$base, 'source' => 'patient', 'title' => 'Another account response']);
        $this->get('/portal/patients/'.$this->access->id)->assertInertia(fn (Assert $page) => $page->has('questionnaires', 0)->has('questionnaire_responses', 1)->where('questionnaire_responses.0.title', 'Intake')->where('questionnaire_responses.0.questions.0', 'Reason for visit?')->where('questionnaire_responses.0.answers.0', 'Follow-up'));
    }
}
