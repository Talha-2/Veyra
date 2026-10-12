<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use App\Models\CareTask;
use App\Models\ClinicInvoice;
use App\Models\ClinicPayment;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\Healthcare\ClinicOperations;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia;
use Tests\HealthcareTestCase;

class ClinicOperationsTest extends HealthcareTestCase
{
    public function test_staff_account_deletion_preserves_payments_stock_and_followup_history(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Patient'], $this->owner);
        $staff = User::factory()->create();
        $this->clinic->addMember($staff, OrganizationRole::Member);
        $ops = app(ClinicOperations::class);
        $invoice = $ops->invoice(['patient_id' => $patient->id, 'lines' => [['description' => 'Visit', 'quantity' => 1, 'unit_price_minor' => 10000]]], $this->owner);
        $ops->issue($invoice, $this->owner);
        $ops->pay($invoice, ['amount_minor' => 10000, 'method' => 'cash', 'reference' => 'retained-payment'], $staff);
        $ops->item(['name' => 'Item', 'unit' => 'unit'], $this->owner);
        $ops->batch(['inventory_item_id' => InventoryItem::firstOrFail()->id, 'batch_number' => 'RETAINED', 'expires_on' => '2099-01-01', 'quantity' => 5], $this->owner);
        $ops->move(InventoryBatch::firstOrFail(), ['kind' => 'dispense', 'patient_id' => $patient->id, 'quantity' => -1, 'reference' => 'retained-stock', 'reason' => 'Dispensed'], $staff);
        $ops->task(['patient_id' => $patient->id, 'assigned_user_id' => $staff->id, 'kind' => 'recall', 'title' => 'Follow-up', 'due_on' => '2026-11-01'], $this->owner);
        $staff->delete();
        $this->assertDatabaseHas('clinic_payments', ['reference' => 'retained-payment', 'user_id' => null]);
        $this->assertDatabaseHas('stock_movements', ['reference' => 'retained-stock', 'user_id' => null]);
        $this->assertDatabaseHas('care_tasks', ['title' => 'Follow-up', 'assigned_user_id' => null]);
    }

    public function test_invoice_payment_is_idempotent_and_cannot_overpay(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 2, 'unit_price_minor' => 125050]]])->assertRedirect();
        $invoice = ClinicInvoice::firstOrFail();
        $this->assertSame(250100, $invoice->total_minor);
        $this->post('/desk/billing/'.$invoice->id.'/issue')->assertRedirect();
        $payment = ['amount_minor' => 100000, 'reference' => 'cash-123', 'method' => 'cash'];
        $this->post('/desk/billing/'.$invoice->id.'/payments', $payment)->assertRedirect();
        $this->post('/desk/billing/'.$invoice->id.'/payments', $payment)->assertRedirect();
        $this->assertSame(1, ClinicPayment::count());
        $this->post('/desk/billing/'.$invoice->id.'/payments', [...$payment, 'reference' => 'other', 'amount_minor' => 150101])->assertSessionHasErrors('amount_minor');
        $this->post('/desk/billing/'.$invoice->id.'/void', ['reason' => 'Mistake'])->assertSessionHasErrors('invoice');
    }

    public function test_stock_cannot_be_negative_or_dispense_expired_batch(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/inventory/items', ['name' => 'Dressings', 'unit' => 'piece'])->assertRedirect();
        $this->post('/desk/inventory/batches', ['inventory_item_id' => InventoryItem::first()->id, 'batch_number' => 'A', 'expires_on' => '2020-01-01', 'quantity' => 5])->assertRedirect();
        $batch = InventoryBatch::firstOrFail();
        $this->post('/desk/inventory/'.$batch->id.'/move', ['quantity' => -1, 'patient_id' => $patient->id, 'reason' => 'Dispense', 'kind' => 'dispense', 'reference' => 'expired'])->assertSessionHasErrors('batch');
        $this->post('/desk/inventory/'.$batch->id.'/move', ['quantity' => -6, 'reason' => 'Correction', 'kind' => 'adjustment', 'reference' => 'negative'])->assertSessionHasErrors('quantity');
        $this->assertSame(5, $batch->fresh()->quantity);
    }

    public function test_staff_can_work_but_cannot_configure_or_void(): void
    {
        $member = User::create(['name' => 'Reception', 'email' => 'staff@example.test', 'password' => 'password']);
        $this->clinic->addMember($member, OrganizationRole::Member);
        $this->actingAs($member);
        $this->get('/desk/billing')->assertOk();
        $this->get('/desk/inventory')->assertOk();
        $this->get('/desk/care-tasks')->assertOk();
        $this->get('/desk/analytics')->assertOk();
        $this->post('/desk/inventory/items', ['name' => 'Test', 'unit' => 'box'])->assertForbidden();
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => 10000]]])->assertRedirect();
        $invoice = ClinicInvoice::first();
        $this->post('/desk/billing/'.$invoice->id.'/void', ['reason' => 'Mistake'])->assertForbidden();
        $this->clinic->membershipFor($member)->revoke(Surface::Desk);
        $this->get('/desk/billing')->assertForbidden();
    }

    public function test_cross_tenant_operations_and_assignees_are_rejected(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $other = $this->otherClinic();
        $foreign = ClinicInvoice::create(['patient_id' => $patient->id, 'lines' => [], 'total_minor' => 100]);
        $foreign->forceFill(['organization_id' => $other->id])->save();
        $this->get('/desk/billing/'.$foreign->id)->assertNotFound();
        $this->post('/desk/billing/'.$foreign->id.'/issue')->assertNotFound();
        $stranger = User::create(['name' => 'Other staff', 'email' => 'other@example.test', 'password' => 'password']);
        $other->addMember($stranger, OrganizationRole::Member);
        $task = ['patient_id' => $patient->id, 'assigned_user_id' => $stranger->id, 'kind' => 'recall', 'title' => 'Call to schedule', 'due_on' => '2026-10-12'];
        $this->post('/desk/care-tasks', $task)->assertSessionHasErrors('assigned_user_id');
        $this->post('/desk/care-tasks', [...$task, 'assigned_user_id' => $this->owner->id])->assertRedirect();
        $id = CareTask::first()->id;
        $this->patch('/desk/care-tasks/'.$id, ['status' => 'done'])->assertRedirect();
        $this->assertDatabaseHas('care_tasks', ['id' => $id, 'status' => 'done']);
        $patient->forceFill(['organization_id' => $other->id])->save();
        $this->get('/desk/billing?patient_id='.$patient->id)->assertNotFound();
        $this->post('/desk/care-tasks', [...$task, 'assigned_user_id' => $this->owner->id])->assertNotFound();
    }

    public function test_invoice_validation_immutability_and_reference_conflicts(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        foreach ([0, 100000001] as $price) {
            $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => $price]]])->assertSessionHasErrors('lines.0.unit_price_minor');
        }
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 0, 'unit_price_minor' => 100]]])->assertSessionHasErrors('lines.0.quantity');
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => 10000]]])->assertRedirect();
        $invoice = ClinicInvoice::first();
        $this->post('/desk/billing/'.$invoice->id.'/issue')->assertRedirect();
        $this->post('/desk/billing/'.$invoice->id.'/issue')->assertSessionHasErrors('invoice');
        $this->patch('/desk/billing/'.$invoice->id, ['lines' => [], 'total_minor' => 0])->assertStatus(405);
        $this->assertSame(10000, $invoice->fresh()->total_minor);
        $payment = ['amount_minor' => 1000, 'reference' => 'ref', 'method' => 'cash'];
        $this->post('/desk/billing/'.$invoice->id.'/payments', $payment)->assertRedirect();
        $this->post('/desk/billing/'.$invoice->id.'/payments', [...$payment, 'amount_minor' => 2000])->assertSessionHasErrors('reference');
        $this->assertSame(1000, $invoice->fresh()->paid_minor);
    }

    public function test_dispense_retries_do_not_double_decrement_and_date_filters_are_validated(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/inventory/items', ['name' => 'Dressings', 'unit' => 'piece']);
        $this->post('/desk/inventory/batches', ['inventory_item_id' => InventoryItem::first()->id, 'batch_number' => 'A', 'expires_on' => '2099-01-01', 'quantity' => 5]);
        $batch = InventoryBatch::first();
        $data = ['quantity' => -2, 'patient_id' => $patient->id, 'reason' => 'Dispense', 'kind' => 'dispense', 'reference' => 'once'];
        $this->post('/desk/inventory/'.$batch->id.'/move', $data)->assertRedirect();
        $this->post('/desk/inventory/'.$batch->id.'/move', $data)->assertRedirect();
        $this->assertSame(3, $batch->fresh()->quantity);
        $this->post('/desk/inventory/'.$batch->id.'/move', [...$data, 'quantity' => -1])->assertSessionHasErrors('reference');
        $this->assertSame(3, $batch->fresh()->quantity);
        $this->get('/desk/analytics?from=invalid')->assertSessionHasErrors('from');
        $this->get('/desk/analytics?from=2026-10-12&to=2026-10-11')->assertSessionHasErrors('to');
    }

    public function test_analytics_uses_clinic_day_and_only_current_tenant_records(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => 10000]]]);
        $invoice = ClinicInvoice::first();
        $this->post('/desk/billing/'.$invoice->id.'/issue');
        $this->post('/desk/billing/'.$invoice->id.'/payments', ['amount_minor' => 2000, 'reference' => 'analytics', 'method' => 'cash']);
        $invoice->update(['issued_at' => '2026-10-10 20:00:00']);
        $payment = ClinicPayment::first();
        $payment->update(['created_at' => '2026-10-10 20:00:00']);
        $this->get('/desk/billing/'.$invoice->id)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->component('desk/billing-invoice')->has('payments', 1)->has('history', 3));
        $this->get('/desk/analytics?from=2026-10-11&to=2026-10-11')->assertInertia(fn (AssertableInertia $page) => $page->where('metrics.invoiced_minor', 10000)->where('metrics.collected_minor', 2000)->where('metrics.outstanding_minor', 8000));
        $this->get('/desk/analytics?from=2026-10-10&to=2026-10-10')->assertInertia(fn (AssertableInertia $page) => $page->where('metrics.invoiced_minor', 0)->where('metrics.collected_minor', 0));
        $other = $this->otherClinic();
        $invoice->forceFill(['organization_id' => $other->id])->save();
        $payment->forceFill(['organization_id' => $other->id])->save();
        $this->get('/desk/analytics?from=2026-10-11&to=2026-10-11')->assertInertia(fn (AssertableInertia $page) => $page->where('metrics.invoiced_minor', 0)->where('metrics.collected_minor', 0)->where('metrics.outstanding_minor', 0));
    }

    public function test_invoice_lines_require_a_list_before_persisting(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => ['consultation' => ['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => 10000]]])->assertSessionHasErrors('lines');
        $this->assertSame(0, ClinicInvoice::count());
    }

    public function test_adjustment_with_patient_context_retries_the_same_normalized_movement(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $this->post('/desk/inventory/items', ['name' => 'Dressings', 'unit' => 'piece']);
        $this->post('/desk/inventory/batches', ['inventory_item_id' => InventoryItem::first()->id, 'batch_number' => 'A', 'expires_on' => '2099-01-01', 'quantity' => 5]);
        $batch = InventoryBatch::first();
        $movement = ['kind' => 'adjustment', 'quantity' => -2, 'patient_id' => $patient->id, 'reason' => 'Count correction', 'reference' => 'adjust-once'];
        $this->post('/desk/inventory/'.$batch->id.'/move', $movement)->assertRedirect()->assertSessionHasNoErrors();
        $this->post('/desk/inventory/'.$batch->id.'/move', $movement)->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame(3, $batch->fresh()->quantity);
        $this->assertDatabaseHas('stock_movements', ['reference' => 'adjust-once', 'patient_id' => null, 'quantity' => -2]);
        $this->assertSame(1, StockMovement::where('reference', 'adjust-once')->count());
    }

    public function test_issued_invoice_receipt_preserves_patient_and_clinic_identity(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
        $mrn = $patient->mrn;
        $this->post('/desk/billing', ['patient_id' => $patient->id, 'lines' => [['description' => 'Consultation', 'quantity' => 1, 'unit_price_minor' => 10000]]]);
        $invoice = ClinicInvoice::first();
        $this->post('/desk/billing/'.$invoice->id.'/issue')->assertRedirect()->assertSessionHasNoErrors();
        $patient->contact->update(['name' => 'Renamed patient']);
        $patient->update(['mrn' => 'CHANGED-MRN']);
        $this->clinic->update(['name' => 'Renamed clinic', 'timezone' => 'UTC']);
        $this->get('/desk/billing/'.$invoice->id)->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->where('patient.name', 'Ali')->where('patient.mrn', $mrn)->where('clinic.name', 'Lahore Clinic')->where('clinic.timezone', 'Asia/Karachi'));
    }
}
