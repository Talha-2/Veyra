<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\Automation;
use App\Models\AutomationRun;
use App\Models\WebhookEndpoint;
use App\Services\Agent\AgentGateway;
use App\Services\Agent\AgentUnavailable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Automations — what the retired server called Experts.
 *
 * A job the agent runs on its own: on a schedule, when a signed webhook
 * arrives, on an app event, or when someone presses the button. Distinct from
 * the harness Expert, which is one half of a live call.
 */
class AutomationController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('studio/automations', [
            'automations' => Automation::query()
                ->withCount([
                    'runs',
                    'runs as failed_runs_count' => fn ($q) => $q->where('status', 'error'),
                    // The last week, for the strip above the list: what is
                    // happening now, not what has ever happened.
                    'runs as recent_runs_count' => fn ($q) => $q->where('created_at', '>=', now()->subDays(7)),
                    'runs as recent_failed_runs_count' => fn ($q) => $q->where('status', 'error')->where('created_at', '>=', now()->subDays(7)),
                ])
                ->addSelect(['last_run_status' => AutomationRun::query()->select('status')
                    ->whereColumn('automation_runs.automation_id', 'automations.id')
                    ->latest()->limit(1)])
                ->with('createdBy:id,name')
                ->orderByDesc('enabled')->orderBy('name')
                ->get()
                ->map(fn (Automation $a) => [
                    'id' => $a->id,
                    'name' => $a->name,
                    'description' => $a->description,
                    'triggers' => $a->triggers,
                    'schedule_label' => $a->scheduleLabel(),
                    'app_event' => $a->app_trigger['event'] ?? null,
                    'reasoning' => $a->reasoning,
                    'enabled' => $a->enabled,
                    'runs_count' => $a->runs_count,
                    'failed_runs_count' => $a->failed_runs_count,
                    'recent_runs_count' => $a->recent_runs_count,
                    'recent_failed_runs_count' => $a->recent_failed_runs_count,
                    'last_run_status' => $a->last_run_status,
                    'next_run_at' => $a->next_run_at?->toIso8601String(),
                    'last_run_at' => $a->last_run_at?->toIso8601String(),
                    'created_by' => $a->createdBy?->name,
                ])->all(),
            'events' => WebhookEndpoint::EVENTS,
        ]);
    }

    public function show(Automation $automation): Response
    {
        $automation->load(['runs' => fn ($q) => $q->limit(30)]);

        return Inertia::render('studio/automation', [
            'automation' => [
                'id' => $automation->id,
                'name' => $automation->name,
                'description' => $automation->description,
                'system_prompt' => $automation->system_prompt,
                'goal' => $automation->goal,
                'triggers' => $automation->triggers,
                'schedule' => $automation->schedule ?? ['kind' => 'daily', 'at' => '09:00', 'weekday' => 'monday', 'interval_minutes' => 60, 'tz' => 'UTC'],
                'app_trigger' => $automation->app_trigger,
                'reasoning' => $automation->reasoning,
                'allowed_action_ids' => $automation->allowed_action_ids ?? [],
                'can_search_knowledge' => $automation->can_search_knowledge,
                'enabled' => $automation->enabled,
                // The URL an external system posts to, shown once the webhook
                // trigger is on. The secret signs the payload.
                'webhook_url' => $automation->hasTrigger('webhook') ? url("/hooks/automations/{$automation->id}") : null,
                'webhook_secret' => $automation->webhook_secret,
                'next_run_at' => $automation->next_run_at?->toIso8601String(),
                'runs' => $automation->runs->map(fn (AutomationRun $r) => [
                    'id' => $r->id, 'trigger' => $r->trigger, 'status' => $r->status,
                    'result' => $r->result ? str($r->result)->limit(300)->value() : null,
                    'error' => $r->error, 'tokens' => $r->tokens, 'duration_ms' => $r->duration_ms,
                    'steps' => $r->steps ?? [], 'started_at' => $r->started_at?->toIso8601String(),
                ])->all(),
            ],
            'actions' => Action::query()->enabled()->orderBy('name')->get()
                ->map(fn ($a) => ['id' => $a->id, 'name' => $a->name, 'kind' => $a->kind->label(), 'durable' => $a->is_durable_write])->all(),
            'events' => WebhookEndpoint::EVENTS,
            'triggers' => Automation::TRIGGERS,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:300'],
        ]);

        $automation = Automation::create([
            ...$validated,
            'triggers' => ['manual'],
            'reasoning' => 'balanced',
            'created_by_id' => $request->user()->getKey(),
        ]);

        return redirect()->route('studio.automations.show', $automation);
    }

    public function update(Request $request, Automation $automation): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'description' => ['sometimes', 'nullable', 'string', 'max:300'],
            'system_prompt' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'goal' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'triggers' => ['sometimes', 'array', 'min:1'],
            'triggers.*' => [Rule::in(Automation::TRIGGERS)],
            'schedule' => ['sometimes', 'nullable', 'array'],
            'schedule.kind' => ['nullable', Rule::in(['hourly', 'daily', 'weekly', 'interval'])],
            'schedule.at' => ['nullable', 'date_format:H:i'],
            'schedule.weekday' => ['nullable', Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])],
            'schedule.interval_minutes' => ['nullable', 'integer', 'between:5,1440'],
            'schedule.tz' => ['nullable', 'timezone'],
            'app_trigger' => ['sometimes', 'nullable', 'array'],
            'app_trigger.event' => ['nullable', Rule::in(WebhookEndpoint::EVENTS)],
            'reasoning' => ['sometimes', Rule::in(['fast', 'balanced', 'deep'])],
            'allowed_action_ids' => ['sometimes', 'array'],
            'allowed_action_ids.*' => ['integer', 'exists:actions,id'],
            'can_search_knowledge' => ['sometimes', 'boolean'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        // Turning the webhook trigger on for the first time mints a secret;
        // turning it off does not revoke it, so a re-enable keeps working.
        if (in_array('webhook', $validated['triggers'] ?? $automation->triggers ?? [], true) && ! $automation->webhook_secret) {
            $automation->webhook_secret = 'whsec_'.Str::random(32);
        }

        $automation->fill($validated);

        // Enabling with a schedule sets the first run; disabling clears it.
        if ($automation->enabled && $automation->hasTrigger('schedule') && $automation->schedule) {
            $automation->next_run_at = $automation->computeNextRun();
        } elseif (! $automation->enabled) {
            $automation->next_run_at = null;
        }

        $automation->save();

        return back()->with('success', 'Automation saved.');
    }

    /**
     * Queue a manual run, and push it to the agent layer if one is listening.
     *
     * Queued first, pushed second: if the push fails the row is still there for
     * the agent's claim loop, so pressing the button never silently does
     * nothing. The message says which of the two happened.
     */
    public function run(Automation $automation, AgentGateway $gateway): RedirectResponse
    {
        $run = AutomationRun::create([
            'automation_id' => $automation->id,
            'trigger' => 'manual',
            'status' => 'queued',
            'input' => $automation->goal,
        ]);

        try {
            $gateway->startAutomationRun($run);

            return back()->with('success', 'Run started.');
        } catch (AgentUnavailable) {
            return back()->with('success', 'Run queued. It will start when the agent layer next checks for work.');
        }
    }

    public function destroy(Automation $automation): RedirectResponse
    {
        $automation->delete();

        return redirect()->route('studio.automations');
    }
}
