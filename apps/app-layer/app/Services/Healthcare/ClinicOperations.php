<?php

namespace App\Services\Healthcare;

use App\Enums\Surface;
use App\Models\Activity;
use App\Models\CareTask;
use App\Models\ClinicInvoice;
use App\Models\ClinicPayment;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClinicOperations
{
    public function assertStaff(User $actor): void
    {
        abort_unless(Organization::current()?->membershipFor($actor)?->canAccess(Surface::Desk), 403);
    }

    public function isAdmin(User $actor): bool
    {
        return Organization::current()?->membershipFor($actor)?->role->administersOrganization() ?? false;
    }

    public function assertAdmin(User $actor): void
    {
        $this->assertStaff($actor);
        abort_unless($this->isAdmin($actor), 403);
    }

    public function patient(int $id): Patient
    {
        $p = Patient::lockForUpdate()->findOrFail($id);
        if ($p->status !== 'active') {
            throw ValidationException::withMessages(['patient_id' => 'Choose an active patient.']);
        }

        return $p;
    }

    public function invoice(array $input, User $actor): ClinicInvoice
    {
        $this->assertStaff($actor);
        $data = Validator::make($input, ['patient_id' => 'required|integer', 'lines' => 'required|array|list|min:1|max:50', 'lines.*.description' => 'required|string|max:200', 'lines.*.quantity' => 'required|integer|min:1|max:10000', 'lines.*.unit_price_minor' => 'required|integer|min:1|max:100000000'])->validate();

        return DB::transaction(function () use ($data, $actor) {
            $this->patient($data['patient_id']);
            $lines = array_map(fn ($line) => ['description' => $line['description'], 'quantity' => (int) $line['quantity'], 'unit_price_minor' => (int) $line['unit_price_minor'], 'total_minor' => (int) $line['quantity'] * (int) $line['unit_price_minor']], $data['lines']);
            $invoice = ClinicInvoice::create(['patient_id' => $data['patient_id'], 'lines' => $lines, 'total_minor' => array_sum(array_column($lines, 'total_minor'))]);
            Activity::log($invoice, 'invoice.created', 'Draft invoice created', $actor);

            return $invoice;
        });
    }

    public function issue(ClinicInvoice $invoice, User $actor): void
    {
        $this->assertStaff($actor);
        DB::transaction(function () use ($invoice, $actor) {
            $i = ClinicInvoice::lockForUpdate()->findOrFail($invoice->id);
            if ($i->status !== 'draft') {
                throw ValidationException::withMessages(['invoice' => 'Only a draft can be issued.']);
            }
            $patient = Patient::with('contact')->lockForUpdate()->findOrFail($i->patient_id);
            $clinic = Organization::whereKey(Organization::currentId())->firstOrFail();
            $i->update(['status' => 'issued', 'issued_at' => now(), 'identity_snapshot' => [
                'patient' => ['id' => $patient->id, 'name' => $patient->contact?->displayName(), 'mrn' => $patient->mrn],
                'clinic' => $clinic->only(['name', 'timezone']),
            ]]);
            Activity::log($i, 'invoice.issued', 'Invoice issued', $actor);
        });
    }

    public function pay(ClinicInvoice $invoice, array $input, User $actor): void
    {
        $this->assertStaff($actor);
        $d = Validator::make($input, ['amount_minor' => 'required|integer|min:1|max:100000000000', 'reference' => 'required|string|max:100', 'method' => ['required', Rule::in(['cash', 'bank', 'card'])]])->validate();
        DB::transaction(function () use ($invoice, $d, $actor) {
            Organization::whereKey(Organization::currentId())->lockForUpdate()->firstOrFail();
            $i = ClinicInvoice::lockForUpdate()->findOrFail($invoice->id);
            $existing = ClinicPayment::where('reference', $d['reference'])->first();
            if ($existing) {
                if ($existing->clinic_invoice_id !== $i->id || $existing->amount_minor !== (int) $d['amount_minor'] || $existing->method !== $d['method']) {
                    throw ValidationException::withMessages(['reference' => 'Reference already belongs to another payment.']);
                }

                return;
            }
            if ($i->status !== 'issued') {
                throw ValidationException::withMessages(['invoice' => 'Payments require an issued invoice.']);
            }
            if ((int) $d['amount_minor'] > $i->total_minor - $i->paid_minor) {
                throw ValidationException::withMessages(['amount_minor' => 'Payment exceeds the remaining balance.']);
            }
            ClinicPayment::create([...$d, 'clinic_invoice_id' => $i->id, 'user_id' => $actor->id]);
            $i->increment('paid_minor', (int) $d['amount_minor']);
            Activity::log($i, 'invoice.payment', 'Payment recorded', $actor, ['amount_minor' => (int) $d['amount_minor'], 'reference' => $d['reference']]);
        });
    }

    public function void(ClinicInvoice $invoice, array $input, User $actor): void
    {
        $this->assertAdmin($actor);
        $d = Validator::make($input, ['reason' => 'required|string|max:1000'])->validate();
        DB::transaction(function () use ($invoice, $d, $actor) {
            Organization::whereKey(Organization::currentId())->lockForUpdate()->firstOrFail();
            $i = ClinicInvoice::lockForUpdate()->findOrFail($invoice->id);
            if ($i->status === 'void' || $i->paid_minor > 0) {
                throw ValidationException::withMessages(['invoice' => 'Paid or already void invoices cannot be voided.']);
            }
            $i->update(['status' => 'void', 'void_reason' => $d['reason']]);
            Activity::log($i, 'invoice.voided', 'Invoice voided', $actor, $d);
        });
    }

    public function item(array $input, User $actor): void
    {
        $this->assertAdmin($actor);
        $d = Validator::make($input, ['name' => 'required|string|max:200', 'unit' => 'required|string|max:40'])->validate();
        $item = InventoryItem::create($d);
        Activity::log($item, 'inventory.item.created', 'Inventory item configured', $actor);
    }

    public function batch(array $input, User $actor): void
    {
        $this->assertAdmin($actor);
        $d = Validator::make($input, ['inventory_item_id' => 'required|integer', 'batch_number' => 'required|string|max:100', 'expires_on' => 'required|date_format:Y-m-d', 'quantity' => 'required|integer|min:0|max:1000000'])->validate();
        DB::transaction(function () use ($d, $actor) {
            Organization::whereKey(Organization::currentId())->lockForUpdate()->firstOrFail();
            InventoryItem::findOrFail($d['inventory_item_id']);
            if (InventoryBatch::where('inventory_item_id', $d['inventory_item_id'])->where('batch_number', $d['batch_number'])->exists()) {
                throw ValidationException::withMessages(['batch_number' => 'Batch already exists. Adjust its stock instead.']);
            }
            $batch = InventoryBatch::create($d);
            StockMovement::create(['inventory_batch_id' => $batch->id, 'user_id' => $actor->id, 'quantity' => $d['quantity'], 'kind' => 'receipt', 'reason' => 'Opening stock']);
            Activity::log($batch, 'inventory.received', 'Batch received', $actor, ['quantity' => $d['quantity']]);
        });
    }

    public function move(InventoryBatch $batch, array $input, User $actor): void
    {
        $this->assertStaff($actor);
        $d = Validator::make($input, ['kind' => ['required', Rule::in(['adjustment', 'dispense'])], 'quantity' => 'required|integer|not_in:0|between:-1000000,1000000', 'reason' => 'required|string|max:200', 'patient_id' => 'nullable|integer', 'reference' => 'required|string|max:100'])->validate();
        if ($d['kind'] === 'adjustment') {
            $this->assertAdmin($actor);
            $d['patient_id'] = null;
        }
        DB::transaction(function () use ($batch, $d, $actor) {
            Organization::whereKey(Organization::currentId())->lockForUpdate()->firstOrFail();
            $b = InventoryBatch::lockForUpdate()->findOrFail($batch->id);
            $existing = StockMovement::where('reference', $d['reference'])->first();
            if ($existing) {
                if ($existing->inventory_batch_id !== $b->id || $existing->quantity !== (int) $d['quantity'] || $existing->kind !== $d['kind'] || (int) $existing->patient_id !== (int) ($d['patient_id'] ?? 0) || $existing->reason !== $d['reason']) {
                    throw ValidationException::withMessages(['reference' => 'Reference already belongs to another stock movement.']);
                }

                return;
            }
            if ($d['kind'] === 'dispense') {
                if (empty($d['patient_id'])) {
                    throw ValidationException::withMessages(['patient_id' => 'Select a patient.']);
                }
                $this->patient($d['patient_id']);
                if ($b->expires_on->format('Y-m-d') <= now(Organization::current()->timezone)->format('Y-m-d')) {
                    throw ValidationException::withMessages(['batch' => 'This batch is expired.']);
                }
                if ($d['quantity'] >= 0) {
                    throw ValidationException::withMessages(['quantity' => 'Dispensing must reduce stock.']);
                }
            }
            if ($b->quantity + (int) $d['quantity'] < 0) {
                throw ValidationException::withMessages(['quantity' => 'Insufficient stock.']);
            }
            $b->increment('quantity', (int) $d['quantity']);
            StockMovement::create([...$d, 'inventory_batch_id' => $b->id, 'user_id' => $actor->id]);
            Activity::log($b, 'inventory.'.$d['kind'], 'Stock '.$d['kind'].' recorded', $actor, $d);
        });
    }

    public function task(array $input, User $actor): CareTask
    {
        $this->assertStaff($actor);
        $d = Validator::make($input, ['patient_id' => 'required|integer', 'assigned_user_id' => 'required|integer', 'kind' => ['required', Rule::in(['task', 'recall'])], 'title' => 'required|string|max:200', 'due_on' => 'required|date_format:Y-m-d'])->validate();

        return DB::transaction(function () use ($d, $actor) {
            $this->patient($d['patient_id']);
            $member = Organization::current()->memberships()->where('user_id', $d['assigned_user_id'])->lockForUpdate()->first();
            if (! $member?->canAccess(Surface::Desk)) {
                throw ValidationException::withMessages(['assigned_user_id' => 'Choose a current Desk team member.']);
            }
            $task = CareTask::create($d);
            Activity::log($task, 'care_task.created', 'Patient '.$d['kind'].' created', $actor);

            return $task;
        });
    }

    public function taskStatus(CareTask $task, array $input, User $actor): void
    {
        $this->assertStaff($actor);
        $d = Validator::make($input, ['status' => ['required', Rule::in(['pending', 'done', 'cancelled'])]])->validate();
        DB::transaction(function () use ($task, $d, $actor) {
            $t = CareTask::lockForUpdate()->findOrFail($task->id);
            $t->update($d);
            Activity::log($t, 'care_task.status', 'Care task marked '.$d['status'], $actor);
        });
    }
}
