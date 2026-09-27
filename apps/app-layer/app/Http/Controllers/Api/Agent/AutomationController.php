<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\Automation;
use App\Models\AutomationRun;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The pull side of automations.
 *
 * `claim` hands the agent every run that is due — scheduled ones whose time
 * has come, and manual/webhook ones sitting in `queued` — marks them running
 * and books the next scheduled occurrence, all under a lock so two agent
 * workers polling at once cannot both take the same job. The push path
 * (AgentGateway::startAutomationRun) is for immediacy; this is what makes
 * nothing get lost when the push could not happen.
 *
 * Three entry points, one claim:
 *  - `claim`     one tenant (the path names it)
 *  - `claimAll`  every tenant with work; each run names its tenant
 *  - `claimOne`  one queued run by id, for the push path
 */
class AutomationController extends Controller
{
    public function claim(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate(['limit' => ['nullable', 'integer', 'between:1,20']]);

        $runs = $this->claimForCurrentTenant((int) ($validated['limit'] ?? 5));

        return response()->json(['runs' => $runs->map(fn (AutomationRun $run) => $this->job($run))->all()]);
    }

    /**
     * Across tenants. The only cross-tenant read on the contract besides the
     * inbound call, and for the same reason: at this moment the agent does
     * not know whose work it is.
     */
    public function claimAll(Request $request): JsonResponse
    {
        $validated = $request->validate(['limit' => ['nullable', 'integer', 'between:1,50']]);
        $limit = (int) ($validated['limit'] ?? 5);

        $tenantIds = Automation::withoutGlobalScopes()->due()->pluck('organization_id')
            ->merge(AutomationRun::withoutGlobalScopes()->where('status', 'queued')->pluck('organization_id'))
            ->unique()->values();

        $jobs = collect();
        foreach ($tenantIds as $tenantId) {
            if ($jobs->count() >= $limit) {
                break;
            }
            $organization = Organization::find($tenantId);
            if (! $organization) {
                continue;
            }
            Organization::setCurrent($organization);
            try {
                foreach ($this->claimForCurrentTenant($limit - $jobs->count()) as $run) {
                    $jobs->push([...$this->job($run), 'organization_id' => $tenantId]);
                }
            } finally {
                Organization::setCurrent(null);
            }
        }

        return response()->json(['runs' => $jobs->all()]);
    }

    /** One queued run, by id. 404 when it is not queued: already claimed, or finished. */
    public function claimOne(Organization $organization, AutomationRun $run): JsonResponse
    {
        $claimed = DB::transaction(function () use ($run) {
            $fresh = AutomationRun::query()->whereKey($run->id)->where('status', 'queued')->lockForUpdate()->first();
            if (! $fresh) {
                return null;
            }
            $fresh->forceFill(['status' => 'running', 'started_at' => now()])->save();
            $fresh->automation?->forceFill(['last_run_at' => now()])->save();

            return $fresh;
        });

        if (! $claimed) {
            return response()->json(['error' => 'not_queued', 'message' => 'This run is not queued.'], 404);
        }

        return response()->json(['run' => $this->job($claimed->load('automation'))]);
    }

    public function update(Request $request, Organization $organization, AutomationRun $run): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['done', 'error'])],
            'result' => ['nullable', 'string', 'max:100000'],
            'error' => ['nullable', 'string', 'max:4000'],
            'steps' => ['nullable', 'array', 'max:500'],
            'tokens' => ['nullable', 'integer', 'min:0'],
            'duration_ms' => ['nullable', 'integer', 'min:0'],
        ]);

        $run->fill([...$validated, 'ended_at' => now()])->save();

        return response()->json(['id' => $run->id, 'status' => $run->status]);
    }

    // ── the claim ───────────────────────────────────────────────────────

    private function claimForCurrentTenant(int $limit): Collection
    {
        $runs = DB::transaction(function () use ($limit) {
            $claimed = new Collection;

            // Scheduled: due now. Create the run and advance the schedule
            // before anything else can see it as due.
            foreach (Automation::query()->due()->lockForUpdate()->limit($limit)->get() as $automation) {
                if (! $automation->hasTrigger('schedule')) {
                    $automation->forceFill(['next_run_at' => null])->save();

                    continue;
                }
                $run = AutomationRun::create([
                    'automation_id' => $automation->id, 'trigger' => 'schedule', 'status' => 'running',
                    'input' => $automation->goal, 'started_at' => now(),
                ]);
                $automation->forceFill(['next_run_at' => $automation->computeNextRun(), 'last_run_at' => now()])->save();
                $claimed->push($run);
            }

            // Queued: manual or webhook runs waiting for a worker.
            $remaining = $limit - $claimed->count();
            if ($remaining > 0) {
                foreach (AutomationRun::query()->where('status', 'queued')->oldest()->lockForUpdate()->limit($remaining)->get() as $run) {
                    $run->forceFill(['status' => 'running', 'started_at' => now()])->save();
                    $run->automation?->forceFill(['last_run_at' => now()])->save();
                    $claimed->push($run);
                }
            }

            return $claimed;
        });

        $runs->load('automation');

        return $runs;
    }

    private function job(AutomationRun $run): array
    {
        $automation = $run->automation;

        return [
            'id' => $run->id,
            'trigger' => $run->trigger,
            'input' => $run->input,
            'automation' => [
                'id' => $automation->id,
                'name' => $automation->name,
                'system_prompt' => $automation->system_prompt,
                'goal' => $automation->goal,
                'reasoning' => $automation->reasoning,
                'can_search_knowledge' => $automation->can_search_knowledge,
                'tools' => Action::query()->enabled()->whereIn('id', $automation->allowed_action_ids ?? [])->get()
                    ->map(fn (Action $a) => [...$a->toToolSchema(), 'id' => $a->id, 'kind' => $a->kind->value, 'is_idempotent' => $a->is_idempotent, 'is_durable_write' => $a->is_durable_write, 'requires_approval' => $a->requires_approval, 'timeout_ms' => $a->timeout_ms, 'config' => $a->kind->isExternal() ? ($a->config ?: new \stdClass) : null])
                    ->all(),
            ],
        ];
    }
}
