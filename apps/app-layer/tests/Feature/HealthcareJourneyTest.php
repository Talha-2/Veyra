<?php

namespace Tests\Feature;

use App\Models\ClinicalEncounter;
use App\Models\ClinicInvoice;
use App\Models\DiagnosticOrder;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\PatientDocument;
use App\Models\PatientPortalAccess;
use App\Models\PatientQuestionnaire;
use App\Models\PatientReferral;
use App\Models\Prescription;
use App\Services\Healthcare\BookingService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class HealthcareJourneyTest extends SchedulingTestCase
{
    public function test_visit_to_clinical_orders_payment_stock_followup_and_patient_portal(): void
    {
        Storage::fake('local');
        $this->provider->update(['user_id' => $this->owner->id]);
        $base = '/desk/patients/'.$this->patient->id;
        $appointment = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->post('/desk/appointments/'.$appointment->id.'/status', ['status' => 'checked_in'])->assertRedirect();
        $this->post($base.'/problems', ['name' => 'Recorded condition'])->assertRedirect();
        $this->post($base.'/allergies', ['allergen' => 'Recorded allergen', 'reaction' => 'Recorded reaction', 'severity' => 'unknown'])->assertRedirect();
        $this->post($base.'/encounters', ['appointment_id' => $appointment->id])->assertRedirect();
        $encounter = ClinicalEncounter::firstOrFail();
        $this->patch('/desk/encounters/'.$encounter->id, ['version' => 1, 'chief_complaint' => 'Follow-up consultation', 'allergy_status' => 'known', 'allergies' => 'Recorded allergen and reaction reviewed', 'assessment' => 'Provider assessment recorded', 'plan' => 'Follow-up care documented', 'vitals' => ['pulse_bpm' => 72]])->assertRedirect();
        $this->post('/desk/encounters/'.$encounter->id.'/sign', ['version' => 2])->assertRedirect();
        $this->post($base.'/prescriptions', ['encounter_id' => $encounter->id, 'items' => [['medicine' => 'Demo medicine', 'dose' => 'Recorded dose', 'route' => 'Recorded route', 'frequency' => 'Recorded frequency', 'duration_days' => 7, 'quantity' => 7]]])->assertRedirect();
        $rx = Prescription::firstOrFail();
        $this->post('/desk/prescriptions/'.$rx->id.'/issue', ['version' => 1, 'reviewed' => true])->assertRedirect();
        $this->post('/desk/diagnostics', ['patient_id' => $this->patient->id, 'clinical_encounter_id' => $encounter->id, 'kind' => 'lab', 'name' => 'Demo test', 'indication' => 'Recorded indication', 'priority' => 'routine'])->assertRedirect();
        $order = DiagnosticOrder::firstOrFail();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'order'])->assertRedirect();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 2, 'action' => 'result', 'result' => 'Recorded result', 'result_flag' => 'not_applicable'])->assertRedirect();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 3, 'action' => 'review', 'review_note' => 'Provider review recorded'])->assertRedirect();
        $this->post('/desk/referrals', ['patient_id' => $this->patient->id, 'clinical_encounter_id' => $encounter->id, 'recipient' => 'Recipient practice', 'reason' => 'Referral purpose', 'letter' => 'Referral letter'])->assertRedirect();
        $referral = PatientReferral::firstOrFail();
        $this->post('/desk/referrals/'.$referral->id.'/transition', ['version' => 1, 'action' => 'issue'])->assertRedirect();
        $this->post('/desk/documents', ['patient_id' => $this->patient->id, 'clinical_encounter_id' => $encounter->id, 'title' => 'Outside report', 'category' => 'outside_record', 'file' => UploadedFile::fake()->createWithContent('record.pdf', "%PDF-1.4\n%%EOF")])->assertRedirect();
        $document = PatientDocument::firstOrFail();
        $this->get('/desk/documents/'.$document->id.'/download')->assertOk();
        $this->post('/desk/billing', ['patient_id' => $this->patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => 250000]]])->assertRedirect();
        $invoice = ClinicInvoice::firstOrFail();
        $this->post('/desk/billing/'.$invoice->id.'/issue')->assertRedirect();
        $this->post('/desk/billing/'.$invoice->id.'/payments', ['amount_minor' => 250000, 'reference' => 'journey-payment', 'method' => 'cash'])->assertRedirect();
        $this->post('/desk/inventory/items', ['name' => 'Clinic consumable', 'unit' => 'unit'])->assertRedirect();
        $item = InventoryItem::firstOrFail();
        $this->post('/desk/inventory/batches', ['inventory_item_id' => $item->id, 'batch_number' => 'JOURNEY-1', 'expires_on' => '2099-01-01', 'quantity' => 10])->assertRedirect();
        $batch = InventoryBatch::firstOrFail();
        $this->post('/desk/inventory/'.$batch->id.'/move', ['kind' => 'dispense', 'patient_id' => $this->patient->id, 'quantity' => -1, 'reason' => 'Recorded dispensing', 'reference' => 'journey-stock'])->assertRedirect();
        $this->post('/desk/care-tasks', ['patient_id' => $this->patient->id, 'assigned_user_id' => $this->owner->id, 'kind' => 'recall', 'title' => 'Follow-up call', 'due_on' => '2026-11-01'])->assertRedirect();
        $this->post('/desk/appointments/'.$appointment->id.'/status', ['status' => 'completed'])->assertRedirect();
        $this->post($base.'/portal/invitations', ['email' => $this->owner->email, 'share_clinical' => true])->assertRedirect();
        $invitation = $this->app['session']->get('patient_portal_invitation_url');
        $this->post($invitation)->assertRedirect();
        $grant = PatientPortalAccess::firstOrFail();
        $questionnaire = PatientQuestionnaire::create(['title' => 'Visit intake', 'questions' => ['Reason for visit?'], 'active' => true]);
        $this->post('/portal/patients/'.$grant->id.'/questionnaires', ['questionnaire_id' => $questionnaire->id, 'expected_title' => 'Visit intake', 'expected_questions' => ['Reason for visit?'], 'answers' => ['Recorded patient response']])->assertRedirect(route('portal.patient', ['access' => $grant->id]));
        $this->get('/portal/patients/'.$grant->id)->assertOk()->assertInertia(fn (Assert $page) => $page->component('portal/patient')->has('encounters', 1)->has('prescriptions', 1)->has('appointments', 1)->has('questionnaire_responses', 1)->where('share_clinical', true));
        $this->assertSame('reviewed', $order->fresh()->status);
        $this->assertSame(250000, $invoice->fresh()->paid_minor);
        $this->assertSame(9, $batch->fresh()->quantity);
        $this->assertDatabaseHas('care_tasks', ['patient_id' => $this->patient->id, 'kind' => 'recall', 'status' => 'pending']);
    }
}
