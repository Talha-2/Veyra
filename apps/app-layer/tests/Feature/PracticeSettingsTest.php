<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\ClinicalTemplate;
use App\Models\Organization;
use App\Models\PatientQuestionnaire;
use App\Models\Provider;
use App\Models\QuestionnaireResponse;
use App\Models\User;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\HealthcareTestCase;

class PracticeSettingsTest extends HealthcareTestCase
{
    public function test_admin_saves_organization_and_reusable_templates(): void
    {
        $this->patch('/desk/practice', ['name' => 'Care Clinic', 'timezone' => 'Asia/Karachi'])->assertRedirect();
        $this->assertSame('Care Clinic', $this->clinic->fresh()->name);
        $this->post('/desk/practice/templates', ['name' => 'Follow-up', 'kind' => 'note', 'active' => true, 'history' => 'Review history', 'plan' => 'Follow up'])->assertRedirect();
        $template = ClinicalTemplate::firstOrFail();
        $this->getJson('/desk/practice/templates/options')->assertOk()->assertJsonPath('templates.0.history', 'Review history');
        $this->patch('/desk/practice/templates/'.$template->id, ['name' => 'Inactive', 'kind' => 'note', 'active' => false])->assertRedirect();
        $this->getJson('/desk/practice/templates/options')->assertJsonCount(0, 'templates');
        $this->delete('/desk/practice/templates/'.$template->id)->assertRedirect();
        $this->assertDatabaseCount('clinical_templates', 0);
    }

    public function test_clinical_provider_reads_templates_but_cannot_change_practice(): void
    {
        $user = User::create(['name' => 'Clinician', 'email' => 'doctor@example.test', 'password' => 'password']);
        $this->clinic->addMember($user, OrganizationRole::Member);
        Provider::create(['name' => 'Doctor', 'user_id' => $user->id, 'active' => true]);
        $this->actingAs($user);
        $this->getJson('/desk/practice/templates/options')->assertOk();
        $this->patch('/desk/practice', ['name' => 'Changed', 'timezone' => 'UTC'])->assertForbidden();
        $this->post('/desk/practice/templates', ['name' => 'Changed', 'kind' => 'note', 'active' => true])->assertForbidden();
    }

    public function test_templates_are_tenant_scoped_and_staff_without_provider_are_denied(): void
    {
        $foreign = ClinicalTemplate::forceCreate(['organization_id' => $this->otherClinic()->id, 'name' => 'Foreign', 'kind' => 'note', 'active' => true]);
        $this->getJson('/desk/practice/templates/options')->assertJsonCount(0, 'templates');
        $this->delete('/desk/practice/templates/'.$foreign->id)->assertNotFound();
        $user = User::create(['name' => 'Reception', 'email' => 'reception@example.test', 'password' => 'password']);
        $this->clinic->addMember($user, OrganizationRole::Member);
        $this->actingAs($user);
        $this->getJson('/desk/practice/templates/options')->assertForbidden();
    }

    public function test_questionnaire_response_preserves_snapshot_and_requires_provider(): void
    {
        $this->post('/desk/practice/questionnaires', ['title' => 'Intake', 'questions' => ['What brings you in?', 'Current medications?'], 'active' => true])->assertRedirect();
        $questionnaire = PatientQuestionnaire::firstOrFail();
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient', 'phone' => '+923001234567'], $this->owner);
        $url = '/desk/patients/'.$patient->id.'/questionnaires';
        $this->get($url)->assertForbidden();
        Provider::create(['name' => 'Doctor', 'user_id' => $this->owner->id, 'active' => true]);
        $this->post($url, ['questionnaire_id' => $questionnaire->id, 'expected_questions' => $questionnaire->questions, 'expected_title' => $questionnaire->title, 'answers' => ['Pain', 'None']])->assertRedirect();
        $this->patch('/desk/practice/questionnaires/'.$questionnaire->id, ['title' => 'Revised', 'questions' => ['Different question'], 'active' => false])->assertRedirect();
        $response = QuestionnaireResponse::firstOrFail();
        $this->assertSame('Intake', $response->title);
        $this->assertSame(['What brings you in?', 'Current medications?'], $response->questions);
        $this->assertSame(['Pain', 'None'], $response->answers);
        $this->post($url, ['questionnaire_id' => $questionnaire->id, 'expected_questions' => $questionnaire->questions, 'expected_title' => $questionnaire->title, 'answers' => ['Answer']])->assertSessionHasErrors('questionnaire_id');
        $this->delete('/desk/practice/questionnaires/'.$questionnaire->id)->assertRedirect();
        $this->assertDatabaseCount('questionnaire_responses', 1);
    }

    public function test_questionnaires_validate_questions_and_response_count(): void
    {
        $this->post('/desk/practice/questionnaires', ['title' => 'Intake', 'questions' => [], 'active' => true])->assertSessionHasErrors('questions');
        $questionnaire = PatientQuestionnaire::create(['title' => 'Intake', 'questions' => ['Why?'], 'active' => true]);
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient', 'phone' => '+923009876543'], $this->owner);
        Provider::create(['name' => 'Doctor', 'user_id' => $this->owner->id, 'active' => true]);
        $this->post('/desk/patients/'.$patient->id.'/questionnaires', ['questionnaire_id' => $questionnaire->id, 'expected_questions' => $questionnaire->questions, 'expected_title' => $questionnaire->title, 'answers' => []])->assertSessionHasErrors('answers');
    }

    public function test_questionnaire_changed_while_answering_cannot_relabel_answers(): void
    {
        $questionnaire = PatientQuestionnaire::create(['title' => 'Intake', 'questions' => ['Old question?'], 'active' => true]);
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        Provider::create(['name' => 'Doctor', 'user_id' => $this->owner->id, 'active' => true]);
        $questionnaire->update(['questions' => ['New question?']]);
        $this->post('/desk/patients/'.$patient->id.'/questionnaires', ['questionnaire_id' => $questionnaire->id, 'expected_questions' => ['Old question?'], 'expected_title' => 'Intake', 'answers' => ['Old answer']])->assertSessionHasErrors('questionnaire_id');
        $this->assertDatabaseCount('questionnaire_responses', 0);
    }

    public function test_questionnaires_cannot_cross_tenants_or_record_for_archived_patients(): void
    {
        $other = $this->otherClinic();
        Organization::setCurrent($other);
        $foreignQuestionnaire = PatientQuestionnaire::create(['title' => 'Private', 'questions' => ['Private question?'], 'active' => true]);
        $foreignPatient = app(PatientRegistry::class)->register(['name' => 'Foreign patient'], $this->owner);
        Organization::setCurrent($this->clinic);
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        Provider::create(['name' => 'Doctor', 'user_id' => $this->owner->id, 'active' => true]);
        $this->get('/desk/patients/'.$foreignPatient->id.'/questionnaires')->assertNotFound();
        $this->patch('/desk/practice/questionnaires/'.$foreignQuestionnaire->id, ['title' => 'Changed', 'questions' => ['Changed?'], 'active' => true])->assertNotFound();
        $this->post('/desk/patients/'.$patient->id.'/questionnaires', ['questionnaire_id' => $foreignQuestionnaire->id, 'expected_title' => 'Private', 'expected_questions' => ['Private question?'], 'answers' => ['No']])->assertSessionHasErrors('questionnaire_id');
        $local = PatientQuestionnaire::create(['title' => 'Intake', 'questions' => ['Question?'], 'active' => true]);
        $patient->update(['status' => 'archived']);
        $this->post('/desk/patients/'.$patient->id.'/questionnaires', ['questionnaire_id' => $local->id, 'expected_title' => 'Intake', 'expected_questions' => ['Question?'], 'answers' => ['No']])->assertSessionHasErrors('patient');
        $this->assertDatabaseCount('questionnaire_responses', 0);
    }

    public function test_practice_page_and_patient_response_page_render_real_data(): void
    {
        $this->get('/desk/practice')->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/practice')->where('can_manage', true)->where('organization.name', 'Lahore Clinic'));
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        Provider::create(['name' => 'Doctor', 'user_id' => $this->owner->id, 'active' => true]);
        PatientQuestionnaire::create(['title' => 'Intake', 'questions' => ['Question?'], 'active' => true]);
        $this->get('/desk/patients/'.$patient->id.'/questionnaires')->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/practice-questionnaires')->where('patient.name', 'Patient')->has('questionnaires', 1)->has('responses.data', 0));
    }
}
