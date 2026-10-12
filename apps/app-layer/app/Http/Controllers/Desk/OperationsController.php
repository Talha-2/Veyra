<?php

namespace App\Http\Controllers\Desk;

use App\Enums\Surface;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Appointment;
use App\Models\CareTask;
use App\Models\ClinicInvoice;
use App\Models\ClinicPayment;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\StockMovement;
use App\Services\Healthcare\ClinicOperations;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OperationsController extends Controller
{
    public function __construct(private ClinicOperations $operations) {}

    private function patients(): array
    {
        return Patient::with('contact')->where('status', 'active')->orderBy('mrn')->get()->map(fn ($p) => ['id' => $p->id, 'name' => $p->contact?->displayName(), 'mrn' => $p->mrn])->all();
    }

    private function context(Request $r): ?int
    {
        if (! $r->query('patient_id')) {
            return null;
        }
        $r->validate(['patient_id' => 'integer']);

        return Patient::findOrFail($r->query('patient_id'))->id;
    }

    public function billing(Request $r): Response
    {
        $this->operations->assertStaff($r->user());
        $patient = $this->context($r);
        $invoices = ClinicInvoice::when($patient, fn ($q) => $q->where('patient_id', $patient))->latest()->paginate(30)->withQueryString();

        return Inertia::render('desk/billing', ['invoices' => $invoices, 'patients' => $this->patients(), 'patient_id' => $patient, 'can_configure' => $this->operations->isAdmin($r->user())]);
    }

    public function invoice(Request $r, ClinicInvoice $invoice): Response
    {
        $this->operations->assertStaff($r->user());
        $patient = Patient::with('contact')->findOrFail($invoice->patient_id);

        return Inertia::render('desk/billing-invoice', ['invoice' => $invoice, 'patient' => $invoice->identity_snapshot['patient'] ?? ['id' => $patient->id, 'name' => $patient->contact?->displayName(), 'mrn' => $patient->mrn], 'clinic' => $invoice->identity_snapshot['clinic'] ?? Organization::current()->only(['name', 'timezone']), 'payments' => ClinicPayment::where('clinic_invoice_id', $invoice->id)->oldest()->get(), 'history' => Activity::where('subject_type', $invoice->getMorphClass())->where('subject_id', $invoice->id)->with('user:id,name')->latest()->get()->map(fn ($a) => ['id' => $a->id, 'description' => $a->description, 'actor' => $a->actorLabel(), 'at' => $a->created_at->toIso8601String()]), 'can_configure' => $this->operations->isAdmin($r->user())]);
    }

    public function storeInvoice(Request $r): RedirectResponse
    {
        $i = $this->operations->invoice($r->all(), $r->user());

        return redirect()->route('desk.billing.show', $i)->with('success', 'Draft invoice created.');
    }

    public function issue(Request $r, ClinicInvoice $invoice): RedirectResponse
    {
        $this->operations->issue($invoice, $r->user());

        return back()->with('success', 'Invoice issued.');
    }

    public function payment(Request $r, ClinicInvoice $invoice): RedirectResponse
    {
        $this->operations->pay($invoice, $r->all(), $r->user());

        return back()->with('success', 'Payment recorded.');
    }

    public function void(Request $r, ClinicInvoice $invoice): RedirectResponse
    {
        $this->operations->void($invoice, $r->all(), $r->user());

        return back()->with('success', 'Invoice voided.');
    }

    public function inventory(Request $r): Response
    {
        $this->operations->assertStaff($r->user());
        $patient = $this->context($r);

        return Inertia::render('desk/inventory', ['items' => InventoryItem::orderBy('name')->get(), 'batches' => InventoryBatch::orderBy('expires_on')->get(), 'movements' => StockMovement::with('user:id,name')->when($patient, fn ($q) => $q->where('patient_id', $patient))->latest()->paginate(30)->withQueryString(), 'patients' => $this->patients(), 'patient_id' => $patient, 'can_configure' => $this->operations->isAdmin($r->user()), 'clinic_date' => now(Organization::current()->timezone)->format('Y-m-d')]);
    }

    public function item(Request $r): RedirectResponse
    {
        $this->operations->item($r->all(), $r->user());

        return back()->with('success', 'Item added.');
    }

    public function batch(Request $r): RedirectResponse
    {
        $this->operations->batch($r->all(), $r->user());

        return back()->with('success', 'Batch received.');
    }

    public function move(Request $r, InventoryBatch $batch): RedirectResponse
    {
        $this->operations->move($batch, $r->all(), $r->user());

        return back()->with('success', 'Stock movement recorded.');
    }

    public function tasks(Request $r): Response
    {
        $this->operations->assertStaff($r->user());
        $patient = $this->context($r);
        $r->validate(['status' => 'nullable|in:pending,done,cancelled,all', 'mine' => 'nullable|in:1']);
        $status = $r->query('status', 'pending');

        return Inertia::render('desk/care-tasks', ['tasks' => CareTask::when($patient, fn ($q) => $q->where('patient_id', $patient))->when($status !== 'all', fn ($q) => $q->where('status', $status))->when($r->query('mine'), fn ($q) => $q->where('assigned_user_id', $r->user()->id))->orderBy('due_on')->paginate(30)->withQueryString(), 'patients' => $this->patients(), 'patient_id' => $patient, 'members' => Organization::current()->members()->get()->filter(fn ($u) => $u->pivot->canAccess(Surface::Desk))->map(fn ($u) => $u->only(['id', 'name']))->values(), 'actor_id' => $r->user()->id, 'filters' => ['status' => $status, 'mine' => $r->query('mine')], 'clinic_date' => now(Organization::current()->timezone)->format('Y-m-d')]);
    }

    public function task(Request $r): RedirectResponse
    {
        $this->operations->task($r->all(), $r->user());

        return back()->with('success', 'Patient task created.');
    }

    public function taskStatus(Request $r, CareTask $task): RedirectResponse
    {
        $this->operations->taskStatus($task, $r->all(), $r->user());

        return back()->with('success', 'Task updated.');
    }

    public function analytics(Request $r): Response
    {
        $this->operations->assertStaff($r->user());
        $r->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from']);
        $tz = Organization::current()->timezone;
        $from = $r->query('from', now($tz)->startOfMonth()->format('Y-m-d'));
        $to = $r->query('to', now($tz)->format('Y-m-d'));
        $r->merge(['from' => $from, 'to' => $to]);
        $r->validate(['to' => 'after_or_equal:from']);
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $from, $tz)->utc();
        $end = CarbonImmutable::createFromFormat('!Y-m-d', $to, $tz)->addDay()->utc();
        $appointments = Appointment::where('starts_at', '>=', $start)->where('starts_at', '<', $end)->get();

        return Inertia::render('desk/analytics', ['filters' => ['from' => $from, 'to' => $to], 'timezone' => $tz, 'metrics' => ['appointments' => $appointments->count(), 'appointment_statuses' => $appointments->countBy('status'), 'invoiced_minor' => (int) ClinicInvoice::where('status', 'issued')->where('issued_at', '>=', $start)->where('issued_at', '<', $end)->sum('total_minor'), 'collected_minor' => (int) ClinicPayment::where('created_at', '>=', $start)->where('created_at', '<', $end)->sum('amount_minor'), 'outstanding_minor' => (int) ClinicInvoice::where('status', 'issued')->sum(DB::raw('total_minor - paid_minor'))]]);
    }
}
