<?php

namespace Tests\Feature;

use App\Models\CareTask;
use App\Services\Healthcare\BookingService;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class DeskHomeDashboardTest extends SchedulingTestCase
{
    public function test_desk_opens_workspace_home_and_exposes_only_operational_counts(): void
    {
        $this->get('/desk')->assertRedirect('/desk/modules');
        CareTask::create(['patient_id' => $this->patient->id, 'assigned_user_id' => $this->owner->id, 'kind' => 'recall', 'title' => 'Arrange visit', 'due_on' => '2026-10-10']);
        $this->get('/desk/modules')->assertInertia(fn (Assert $page) => $page->component('desk/healthcare-modules')->where('organization.name', 'Lahore Clinic')->where('clinic_date', '2026-10-11')->where('counts.patients', 1)->where('counts.overdue_tasks', 1)->where('can_access_clinical', false)->missing('summary')->missing('encounters'));
    }

    public function test_graphs_use_clinic_days_real_recorded_wait_and_selected_filters(): void
    {
        $visit = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $visit->forceFill(['starts_at' => '2026-10-10T20:00:00Z', 'status' => 'completed', 'checked_in_at' => '2026-10-10T19:30:00Z', 'consultation_started_at' => '2026-10-10T19:45:00Z'])->save();
        $this->get('/desk/dashboard?stage=scheduled')->assertInertia(fn (Assert $page) => $page->has('visuals.trend', 7)->where('visuals.trend.6.date', '2026-10-11')->where('visuals.trend.6.completed', 1)->where('visuals.provider_load.0.name', 'Dr Ayesha')->where('visuals.wait.samples', 1)->where('visuals.wait.mean_minutes', 15)->where('appointments.total', 0));
        $this->get('/desk/dashboard?search=unmatched')->assertInertia(fn (Assert $page) => $page->where('visuals.trend.6.total', 0)->has('visuals.provider_load', 0)->where('visuals.wait.mean_minutes', null));
        $visit->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('visuals.trend.6.total', 0)->has('visuals.provider_load', 0));
    }

    public function test_empty_dashboard_graphs_have_no_invented_wait_or_activity(): void
    {
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->has('visuals.trend', 7)->where('visuals.trend.0.total', 0)->where('visuals.wait.samples', 0)->where('visuals.wait.mean_minutes', null)->has('visuals.provider_load', 0));
    }
}
