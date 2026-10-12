<?php

namespace Tests\Feature;

use App\Models\CareTask;
use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class DiagnosticFollowUpTest extends SchedulingTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->provider->update(['user_id' => $this->owner->id]);
    }

    private function returnedOrder(array $attributes = []): DiagnosticOrder
    {
        return DiagnosticOrder::create([...['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Dr Ayesha', 'author_name' => $this->owner->name, 'kind' => 'lab', 'name' => 'Recorded test', 'indication' => 'Recorded indication', 'status' => 'resulted', 'ordered_at' => '2026-10-09T04:00:00Z', 'resulted_at' => '2026-10-10T04:00:00Z', 'result' => 'Private clinical result', 'result_flag' => 'critical'], ...$attributes]);
    }

    private function review(): array
    {
        return ['version' => 1, 'action' => 'review', 'review_note' => 'Private clinical review', 'patient_contact_status' => 'attempted', 'follow_up' => ['assigned_user_id' => $this->owner->id, 'due_on' => '2026-10-12']];
    }

    public function test_review_creates_one_administrative_recall_and_can_be_completed_by_staff(): void
    {
        $order = $this->returnedOrder();
        $url = '/desk/diagnostics/'.$order->id.'/transition';
        $this->post($url, $this->review())->assertRedirect();
        $this->assertSame('reviewed', $order->fresh()->status);
        $this->assertSame('attempted', $order->fresh()->patient_contact_status);
        $task = CareTask::sole();
        $this->assertSame($task->id, $order->fresh()->follow_up_task_id);
        $this->assertSame('Arrange provider follow-up', $task->title);
        $this->assertSame('recall', $task->kind);
        $this->post($url, $this->review())->assertSessionHasErrors('version');
        $this->assertDatabaseCount('care_tasks', 1);
        $this->provider->update(['user_id' => null]);
        $this->get('/desk/care-tasks')->assertInertia(fn (Assert $page) => $page->has('tasks.data', 1)->where('tasks.data.0.title', 'Arrange provider follow-up')->missing('tasks.data.0.result')->missing('tasks.data.0.review_note'));
        $this->patch('/desk/care-tasks/'.$task->id, ['status' => 'done'])->assertRedirect();
        $this->assertSame('done', $task->fresh()->status);
        $this->provider->update(['user_id' => $this->owner->id]);
        $this->get('/desk/labs?status=reviewed')->assertInertia(fn (Assert $page) => $page->where('records.data.0.follow_up_task.id', $task->id)->where('records.data.0.follow_up_task.status', 'done')->where('counts.awaiting_review', 0));
    }

    public function test_invalid_assignee_and_past_date_roll_back_review_and_task(): void
    {
        $order = $this->returnedOrder();
        $outsider = User::factory()->create();
        $this->post('/desk/diagnostics/'.$order->id.'/transition', [...$this->review(), 'follow_up' => ['assigned_user_id' => $outsider->id, 'due_on' => '2026-10-12']])->assertSessionHasErrors('follow_up.assigned_user_id');
        $this->assertSame('resulted', $order->fresh()->status);
        $this->assertNull($order->fresh()->review_note);
        $this->post('/desk/diagnostics/'.$order->id.'/transition', [...$this->review(), 'follow_up' => ['assigned_user_id' => $this->owner->id, 'due_on' => '2026-10-10']])->assertSessionHasErrors('follow_up.due_on');
        $this->assertDatabaseCount('care_tasks', 0);
        $this->assertSame(1, $order->fresh()->version);
    }

    public function test_queue_sorts_critical_first_and_excludes_private_linked_drafts(): void
    {
        $normal = $this->returnedOrder(['name' => 'Normal finding', 'result_flag' => 'normal']);
        $critical = $this->returnedOrder(['name' => 'Critical finding', 'resulted_at' => '2026-10-11T02:00:00Z']);
        $other = Provider::create(['name' => 'Other clinician']);
        $private = ClinicalEncounter::create(['patient_id' => $this->patient->id, 'provider_id' => $other->id, 'author_user_id' => $this->owner->id, 'provider_name' => 'Other clinician', 'author_name' => 'Author', 'occurred_at' => now()]);
        $this->returnedOrder(['provider_id' => $other->id, 'clinical_encounter_id' => $private->id]);
        $this->get('/desk/labs?status=resulted')->assertInertia(fn (Assert $page) => $page->where('counts.awaiting_review', 2)->where('counts.critical', 1)->where('records.total', 2)->where('records.data.0.id', $critical->id)->where('records.data.1.id', $normal->id));
        $this->get('/desk/labs?status=resulted&flag=critical&search=CRITICAL&mine=1')->assertInertia(fn (Assert $page) => $page->where('records.total', 1)->where('filters.search', 'CRITICAL')->where('filters.mine', '1'));
    }

    public function test_archived_results_can_be_reviewed_but_cannot_create_new_recall(): void
    {
        $order = $this->returnedOrder();
        $this->patient->update(['status' => 'archived']);
        $this->post('/desk/diagnostics/'.$order->id.'/transition', $this->review())->assertSessionHasErrors('follow_up');
        $this->assertSame('resulted', $order->fresh()->status);
        $this->post('/desk/diagnostics/'.$order->id.'/transition', ['version' => 1, 'action' => 'review', 'review_note' => 'Historical record reviewed'])->assertRedirect();
        $this->assertSame('not_recorded', $order->fresh()->patient_contact_status);
        $this->assertDatabaseCount('care_tasks', 0);
    }

    public function test_other_author_cannot_review_visible_results_or_create_follow_up(): void
    {
        $order = $this->returnedOrder();
        $this->provider->update(['user_id' => null]);
        Provider::create(['name' => 'Other linked clinician', 'user_id' => $this->owner->id]);
        $this->get('/desk/labs')->assertInertia(fn (Assert $page) => $page->where('records.data.0.can_edit', false));
        $this->post('/desk/diagnostics/'.$order->id.'/transition', $this->review())->assertForbidden();
        $this->assertSame('resulted', $order->fresh()->status);
        $this->assertDatabaseCount('care_tasks', 0);
    }

    public function test_diagnostic_queue_is_scoped_to_patient_kind_and_tenant(): void
    {
        $own = $this->returnedOrder();
        $this->returnedOrder(['kind' => 'imaging']);
        $otherPatient = app(PatientRegistry::class)->register(['name' => 'Another patient'], $this->owner);
        $this->returnedOrder(['patient_id' => $otherPatient->id]);
        $foreign = $this->returnedOrder();
        $foreign->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/labs?status=resulted&patient_id='.$this->patient->id)->assertInertia(fn (Assert $page) => $page->where('records.total', 1)->where('records.data.0.id', $own->id)->where('counts.critical', 1));
        $this->post('/desk/diagnostics/'.$foreign->id.'/transition', $this->review())->assertNotFound();
        $this->assertDatabaseCount('care_tasks', 0);
    }
}
