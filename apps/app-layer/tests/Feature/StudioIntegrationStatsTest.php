<?php

namespace Tests\Feature;

use App\Models\Action;
use App\Models\ToolCall;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\HealthcareTestCase;

class StudioIntegrationStatsTest extends HealthcareTestCase
{
    private function action(string $name = 'Test action'): Action
    {
        return Action::create(['slug' => str_replace(' ', '-', strtolower($name)), 'name' => $name, 'description' => 'Synthetic test action', 'kind' => 'internal']);
    }

    private function invocation(Action $action, string $status, ?int $duration): ToolCall
    {
        return ToolCall::create(['action_id' => $action->id, 'action_slug' => $action->slug, 'kind' => 'internal', 'status' => $status, 'duration_ms' => $duration]);
    }

    public function test_integrations_load_without_calls_on_sqlite(): void
    {
        $this->action();
        $this->get('/studio/integrations')->assertOk()->assertInertia(fn (Assert $page) => $page->component('studio/actions')->where('actions.0.calls_7d', 0)->where('actions.0.success_rate', null)->where('actions.0.p95_ms', null));
    }

    public function test_statistics_use_interpolated_percentiles_and_scoped_recent_outcomes(): void
    {
        $action = $this->action();
        foreach ([100, 200, 300, null] as $duration) {
            $this->invocation($action, 'succeeded', $duration);
        }
        foreach ([600, 1000] as $duration) {
            $this->invocation($action, 'failed', $duration);
        }
        $this->invocation($action, 'timeout', 900);
        $this->invocation($action, 'timeout', 9000)->forceFill(['created_at' => now()->subDays(8)])->save();
        $this->invocation($action, 'timeout', 8000)->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/studio/integrations')->assertOk()->assertInertia(fn (Assert $page) => $page->where('actions.0.id', $action->id)->where('actions.0.calls_7d', 7)->where('actions.0.success_rate', 57)->where('actions.0.timeouts_7d', 1)->where('actions.0.p95_ms', 980));
    }

    public function test_zero_duration_is_preserved_and_unknown_duration_is_null(): void
    {
        $zero = $this->action('A zero');
        $unknown = $this->action('B unknown');
        $this->invocation($zero, 'succeeded', 0);
        $this->invocation($zero, 'succeeded', null);
        $this->invocation($unknown, 'timeout', null);
        $this->get('/studio/integrations')->assertInertia(fn (Assert $page) => $page->where('actions.0.p95_ms', 0)->where('actions.0.success_rate', 100)->where('actions.1.p95_ms', null)->where('actions.1.timeouts_7d', 1));
    }
}
