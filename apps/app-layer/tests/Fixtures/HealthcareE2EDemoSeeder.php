<?php

namespace Tests\Fixtures;

use App\Models\CareTask;
use App\Models\ClinicalTemplate;
use App\Models\ClinicInvoice;
use App\Models\DiagnosticOrder;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MedicationAdministration;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\PatientDocument;
use App\Models\PatientProblem;
use App\Models\PatientQuestionnaire;
use App\Models\PatientReferral;
use App\Models\Prescription;
use App\Models\User;
use App\Services\Healthcare\ClinicalAncillary;
use App\Services\Healthcare\ClinicalCare;
use App\Services\Healthcare\ClinicOperations;
use Illuminate\Database\Seeder;
use Illuminate\Http\UploadedFile;

class HealthcareE2EDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local') || config('database.default') !== 'sqlite' || basename(config('database.connections.sqlite.database')) !== 'healthcare.sqlite') {
            throw new \RuntimeException('EHR demo setup requires isolated local healthcare.sqlite.');
        }
        $clinic = Organization::where('slug', 'healthcare-preview')->firstOrFail();
        $user = User::where('email', 'demo@healthcare.test')->firstOrFail();
        Organization::setCurrent($clinic);
        try {
            $patient = Patient::with('contact')->whereHas('contact', fn ($q) => $q->where('name', 'Ali Ahmed · Demo'))->firstOrFail();
            $care = app(ClinicalCare::class);
            $ancillary = app(ClinicalAncillary::class);
            $ops = app(ClinicOperations::class);
            ClinicalTemplate::firstOrCreate(['name' => 'General consultation · Demo'], ['kind' => 'note', 'active' => true, 'history' => 'Review medical, surgical, family and social history.', 'subjective' => 'Document the patient’s symptoms and concerns.', 'objective' => 'Record examination findings.', 'assessment' => 'Record the provider’s assessment.', 'plan' => 'Record the agreed plan and follow-up.']);
            ClinicalTemplate::firstOrCreate(['name' => 'Follow-up reminder · Demo'], ['kind' => 'quick_text', 'active' => true, 'plan' => 'Discuss follow-up timing and return precautions with the patient.']);
            PatientQuestionnaire::firstOrCreate(['title' => 'Visit preparation · Demo'], ['questions' => ['What would you like to discuss today?', 'Which medications are you currently taking?', 'Have you noticed any new allergies or reactions?'], 'active' => true]);
            if (! PatientProblem::where('patient_id', $patient->id)->where('name', 'Synthetic previous condition · Demo')->exists()) {
                $care->add($patient, $user, 'problem', ['name' => 'Synthetic previous condition · Demo', 'notes' => 'Demonstration only. Not a clinical diagnosis.']);
            }
            if (! PatientAllergy::where('patient_id', $patient->id)->where('allergen', 'Synthetic allergen · Demo')->exists()) {
                $care->add($patient, $user, 'allergy', ['allergen' => 'Synthetic allergen · Demo', 'reaction' => 'Synthetic reaction for UI demonstration', 'severity' => 'unknown']);
            }
            if (! Prescription::where('patient_id', $patient->id)->exists()) {
                $rx = $care->draft($patient, $user, ['items' => [['medicine' => 'Synthetic medication · Demo', 'strength' => 'Demonstration only', 'dose' => 'Recorded dose', 'route' => 'Recorded route', 'frequency' => 'Recorded frequency', 'duration_days' => 7, 'quantity' => 7, 'instructions' => 'Synthetic data only — not a clinical prescription.']]]);
                $care->change($rx->fresh(), $user, ['version' => 1, 'reviewed' => true], 'issue');
            }
            if (! MedicationAdministration::where('patient_id', $patient->id)->exists()) {
                $care->administer($patient, $user, ['kind' => 'vaccine', 'name' => 'Synthetic vaccine · Demo', 'dose' => 'Recorded amount', 'route' => 'Recorded route', 'occurred_at' => now()->subDay()->toIso8601String(), 'next_due_date' => now()->addMonth()->format('Y-m-d'), 'lot_number' => 'DEMO-2026', 'notes' => 'Synthetic administration for UI demonstration.']);
            }
            foreach (['lab' => 'Synthetic lab panel · Demo', 'imaging' => 'Synthetic imaging report · Demo'] as $kind => $name) {
                if (! DiagnosticOrder::where('patient_id', $patient->id)->where('name', $name)->exists()) {
                    $order = $ancillary->createOrder(['patient_id' => $patient->id, 'kind' => $kind, 'name' => $name, 'indication' => 'Synthetic demonstration only', 'priority' => 'routine'], $user);
                    $ancillary->transitionOrder($order->fresh(), ['version' => 1, 'action' => 'order'], $user);
                    $ancillary->transitionOrder($order->fresh(), ['version' => 2, 'action' => 'result', 'result' => 'Demonstration report only. No diagnostic information.', 'result_flag' => 'not_applicable'], $user);
                    $ancillary->transitionOrder($order->fresh(), ['version' => 3, 'action' => 'review', 'review_note' => 'Reviewed synthetic demonstration report.'], $user);
                }
            }
            if (! PatientReferral::where('patient_id', $patient->id)->exists()) {
                $referral = $ancillary->createReferral(['patient_id' => $patient->id, 'recipient' => 'Demonstration specialist', 'reason' => 'Synthetic referral workflow', 'letter' => 'This is a synthetic referral letter for local UI demonstration.'], $user);
                $ancillary->transitionReferral($referral->fresh(), ['version' => 1, 'action' => 'issue'], $user);
            }
            if (! PatientDocument::where('patient_id', $patient->id)->exists()) {
                $ancillary->upload(['patient_id' => $patient->id, 'title' => 'Synthetic outside record · Demo', 'category' => 'outside_record', 'file' => UploadedFile::fake()->createWithContent('synthetic-record.pdf', "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF")], $user);
            }
            if (! ClinicInvoice::where('patient_id', $patient->id)->exists()) {
                $invoice = $ops->invoice(['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation · Demo', 'quantity' => 1, 'unit_price_minor' => 250000]]], $user);
                $ops->issue($invoice, $user);
                $ops->pay($invoice->fresh(), ['amount_minor' => 100000, 'method' => 'cash', 'reference' => 'DEMO-RECEIPT-1'], $user);
            }
            if (! InventoryItem::where('name', 'Clinic consumables · Demo')->exists()) {
                $ops->item(['name' => 'Clinic consumables · Demo', 'unit' => 'unit'], $user);
                $item = InventoryItem::where('name', 'Clinic consumables · Demo')->firstOrFail();
                $ops->batch(['inventory_item_id' => $item->id, 'batch_number' => 'DEMO-BATCH-1', 'expires_on' => now()->addYear()->format('Y-m-d'), 'quantity' => 100], $user);
                $batch = InventoryBatch::where('inventory_item_id', $item->id)->firstOrFail();
                $ops->move($batch, ['kind' => 'dispense', 'patient_id' => $patient->id, 'quantity' => -2, 'reference' => 'DEMO-STOCK-1', 'reason' => 'Synthetic dispensing workflow'], $user);
            }
            if (! CareTask::where('patient_id', $patient->id)->exists()) {
                $ops->task(['patient_id' => $patient->id, 'assigned_user_id' => $user->id, 'kind' => 'recall', 'title' => 'Follow-up call · Demo', 'due_on' => now()->addWeek()->format('Y-m-d')], $user);
            }
        } finally {
            Organization::setCurrent(null);
        }
    }
}
