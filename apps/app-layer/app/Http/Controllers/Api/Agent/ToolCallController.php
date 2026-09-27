<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\ActionKind;
use App\Enums\ToolCallStatus;
use App\Http\Controllers\Controller;
use App\Models\Action;
use App\Models\Delegation;
use App\Models\Expert;
use App\Models\Organization;
use App\Models\ToolCall;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Every tool invocation, recorded before it runs and closed when it returns.
 *
 * The record-before-dispatch order is the point. A non-idempotent action
 * carries an idempotency key; if the same key arrives again — because the
 * worker retried after an ambiguous timeout — this route returns the earlier
 * row with `duplicate: true` instead of a fresh one, and the worker reconciles
 * from that row's status rather than executing twice. That is the mechanism
 * behind "the agent handles tool calls reliably".
 */
class ToolCallController extends Controller
{
    public function store(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'action_slug' => ['required', 'string', 'max:120'],
            'kind' => ['nullable', Rule::enum(ActionKind::class)],
            'arguments' => ['nullable', 'array'],
            'idempotency_key' => ['nullable', 'string', 'max:128'],
            'call_id' => ['nullable', 'integer'],
            'delegation_id' => ['nullable', 'integer'],
            'expert_slug' => ['nullable', 'string', 'max:120'],
            'attempt' => ['nullable', 'integer', 'min:1'],
        ]);

        if (! empty($validated['idempotency_key'])) {
            $existing = ToolCall::query()->where('idempotency_key', $validated['idempotency_key'])->first();
            if ($existing) {
                return response()->json(['duplicate' => true, 'tool_call' => $this->row($existing)]);
            }
        }

        $action = Action::query()->where('slug', $validated['action_slug'])->first();
        $delegation = ! empty($validated['delegation_id']) ? Delegation::query()->find($validated['delegation_id']) : null;
        $expert = ! empty($validated['expert_slug']) ? Expert::query()->where('slug', $validated['expert_slug'])->first() : null;

        $toolCall = ToolCall::create([
            'action_id' => $action?->id,
            'call_id' => $validated['call_id'] ?? $delegation?->call_id,
            'delegation_id' => $delegation?->id,
            'expert_id' => $expert?->id,
            'action_slug' => $validated['action_slug'],
            'kind' => $validated['kind'] ?? $action?->kind->value ?? ActionKind::Internal->value,
            'arguments' => $validated['arguments'] ?? [],
            'status' => ToolCallStatus::Running,
            'attempt' => $validated['attempt'] ?? 1,
            'idempotency_key' => $validated['idempotency_key'] ?? null,
        ]);

        return response()->json(['duplicate' => false, 'tool_call' => $this->row($toolCall)], 201);
    }

    public function update(Request $request, Organization $organization, ToolCall $toolCall): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['succeeded', 'failed', 'timeout', 'rejected', 'awaiting_approval'])],
            'result' => ['nullable', 'array'],
            'error' => ['nullable', 'string', 'max:4000'],
            'duration_ms' => ['nullable', 'integer', 'min:0'],
            'attempt' => ['nullable', 'integer', 'min:1'],
        ]);

        $toolCall->fill($validated)->save();

        return response()->json(['tool_call' => $this->row($toolCall->refresh())]);
    }

    private function row(ToolCall $t): array
    {
        return [
            'id' => $t->id,
            'action_slug' => $t->action_slug,
            'kind' => $t->kind->value,
            'status' => $t->status->value,
            'result' => $t->result,
            'error' => $t->error,
            'attempt' => $t->attempt,
            'idempotency_key' => $t->idempotency_key,
            'confirmed_complete' => $t->isConfirmedComplete(),
            'needs_reconciliation' => $t->needsReconciliation(),
            'created_at' => $t->created_at?->toIso8601String(),
        ];
    }
}
