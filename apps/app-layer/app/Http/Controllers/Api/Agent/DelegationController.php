<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Call;
use App\Models\Delegation;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The audit trail of the delegate() protocol.
 *
 * Opened when the talker hands a transcript delta to the worker, closed when
 * the worker answers. The unique (call, sequence) pair is the invariant: a
 * worker must never receive the same segment twice, and a 409 here is how
 * that shows up rather than as a doubled booking.
 */
class DelegationController extends Controller
{
    public function store(Request $request, Organization $organization, Call $call): JsonResponse
    {
        $validated = $request->validate([
            'sequence' => ['required', 'integer', 'min:1'],
            'transcript_delta' => ['required', 'string', 'max:20000'],
            'is_finalization' => ['boolean'],
        ]);

        if (Delegation::query()->where('call_id', $call->id)->where('sequence', $validated['sequence'])->exists()) {
            return response()->json(['error' => 'duplicate_sequence', 'message' => "Delegation {$validated['sequence']} already exists on this call."], 409);
        }

        $delegation = Delegation::create([
            'call_id' => $call->id,
            'sequence' => $validated['sequence'],
            'transcript_delta' => $validated['transcript_delta'],
            'is_finalization' => $validated['is_finalization'] ?? false,
            'status' => 'running',
            'started_at' => now(),
        ]);

        return response()->json(['id' => $delegation->id, 'sequence' => $delegation->sequence, 'status' => $delegation->status], 201);
    }

    public function update(Request $request, Organization $organization, Call $call, Delegation $delegation): JsonResponse
    {
        abort_unless($delegation->call_id === $call->id, 404);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['completed', 'failed', 'timeout', 'aborted'])],
            'reply' => ['nullable', 'string', 'max:20000'],
            'error' => ['nullable', 'string', 'max:2000'],
            'duration_ms' => ['nullable', 'integer', 'min:0'],
        ]);

        $delegation->fill([...$validated, 'completed_at' => now()])->save();

        return response()->json([
            'id' => $delegation->id,
            'status' => $delegation->status,
            // The talker's decision, made here rather than re-derived on the
            // Python side from the same fields: may it claim a result?
            'failed' => $delegation->failed(),
            'completed_durable_write' => $delegation->completedADurableWrite(),
        ]);
    }
}
