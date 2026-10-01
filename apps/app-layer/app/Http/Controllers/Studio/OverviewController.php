<?php

namespace App\Http\Controllers\Studio;

use App\Enums\ToolCallStatus;
use App\Http\Controllers\Controller;
use App\Models\AgentConfig;
use App\Models\Call;
use App\Models\CallTranscript;
use App\Models\Delegation;
use App\Models\Expert;
use App\Models\PhoneNumber;
use App\Models\Skill;
use App\Models\Ticket;
use App\Models\ToolCall;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The agent's health, as a page.
 *
 * Deliberately not a dashboard of totals. An owner opening Studio wants to know
 * whether the agent is behaving, and "142 calls this week" says nothing about
 * that. The three numbers at the top are the three ways it fails a customer:
 * it is slow, it says something happened that did not, or it promises follow-up
 * nobody does.
 */
class OverviewController extends Controller
{
    public function __invoke(): Response
    {
        $since = now()->subDays(7);

        $calls = Call::query()->where('created_at', '>=', $since);
        $callCount = (clone $calls)->count();

        // p95 across calls, not the mean of per-call means. VOICE.md: one
        // four-second turn ruins a call more than ten 1.4-second ones.
        $p95s = CallTranscript::query()
            ->whereIn('call_id', (clone $calls)->select('id'))
            ->get()
            ->map(fn ($t) => $t->metrics['voice_to_voice']['p95'] ?? null)
            ->filter()
            ->sort()
            ->values();
        $p95 = $p95s->isEmpty() ? null : $p95s->get((int) floor(($p95s->count() - 1) * 0.95));

        $reconcile = ToolCall::query()
            ->where('status', ToolCallStatus::Timeout)
            ->whereHas('action', fn ($q) => $q->where('is_idempotent', false))
            // conversation_id must be in the column list or the "Open in Desk"
            // link silently disappears — a partial select on a relation returns
            // null for anything not named.
            ->with(['action:id,name', 'call:id,contact_id,conversation_id', 'call.contact:id,name'])
            ->latest()
            ->limit(8)
            ->get();

        // Actions marked "Needs approval" that the agent asked to run. Not
        // windowed: a request waits until someone decides it.
        $approvals = ToolCall::query()
            ->where('status', ToolCallStatus::AwaitingApproval)
            ->with(['action:id,name,kind,is_durable_write', 'expert:id,name', 'call:id,contact_id,conversation_id', 'call.contact:id,name'])
            ->oldest()
            ->limit(20)
            ->get();
        $approvalCount = ToolCall::query()->where('status', ToolCallStatus::AwaitingApproval)->count();

        $failedDelegations = Delegation::query()
            ->where('created_at', '>=', $since)
            ->whereIn('status', ['failed', 'timeout', 'aborted'])
            ->count();

        $agentTickets = Ticket::query()->unresolved()->raisedByAgent()->count();

        $config = AgentConfig::query()->first();

        return Inertia::render('studio/overview', [
            'window_days' => 7,
            // The greeting names the agent, so the page reads as "how Nora is
            // doing" rather than a generic health report.
            'agent_name' => $config?->display_name,
            'health' => [
                'calls' => $callCount,
                'p95_ms' => $p95,
                'p95_budget_ms' => 1200,
                'failed_delegations' => $failedDelegations,
                'needs_reconciliation' => $reconcile->count(),
                'agent_tickets_open' => $agentTickets,
                'awaiting_approval' => $approvalCount,
            ],
            'approvals' => $approvals->map(fn (ToolCall $t) => [
                'id' => $t->id,
                'action' => $t->action?->name ?? $t->action_slug,
                'kind' => $t->action?->kind->label(),
                'writes' => (bool) $t->action?->is_durable_write,
                'missing' => $t->action === null,
                'expert' => $t->expert?->name,
                'contact' => $t->call?->contact?->name,
                'conversation_id' => $t->call?->conversation_id,
                // What it would do, for the person deciding: the agent's own
                // arguments, minus the plumbing keys.
                'arguments' => collect($t->arguments ?? [])->reject(fn ($v, $k) => str_starts_with((string) $k, '_'))->all() ?: new \stdClass,
                'at' => $t->created_at?->toIso8601String(),
            ])->all(),
            'reconcile' => $reconcile->map(fn (ToolCall $t) => [
                'id' => $t->id,
                'action' => $t->action?->name ?? $t->action_slug,
                'contact' => $t->call?->contact?->name,
                'conversation_id' => $t->call?->conversation_id,
                'at' => $t->created_at?->toIso8601String(),
            ])->all(),
            'setup' => [
                'agent_named' => (bool) $config?->display_name,
                'greeting_set' => (bool) $config?->greeting,
                'voice_set' => (bool) $config?->voice_id,
                'numbers' => PhoneNumber::query()->where('status', 'active')->count(),
                'experts' => Expert::query()->enabled()->count(),
                'skills' => Skill::query()->enabled()->count(),
                'languages' => $config?->languages() ?? ['en'],
            ],
        ]);
    }
}
