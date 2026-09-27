<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One talker → worker handoff.
 *
 * The `delegate()` protocol takes no model-provided arguments: the talker
 * serializes the caller-facing conversation since the last delegation and hands
 * over that delta, nothing else. No system prompts, no tool plumbing, no turns
 * already delivered.
 *
 * Two invariants this table makes checkable:
 *
 * 1. **A worker never receives the same segment twice.** The cursor advances
 *    when the delegation begins, so a retry cannot re-send. A duplicate
 *    `sequence` is the signal that it did — hence the unique key.
 *
 * 2. **A worker reply is private guidance, not a script.** `reply` is what the
 *    worker returned; the talker speaks naturally from it rather than reading it
 *    out. When a call goes wrong, comparing this against the transcript shows
 *    whether the talker invented something the worker never said.
 */
#[Fillable([
    'call_id', 'sequence', 'transcript_delta', 'reply',
    'status', 'error', 'is_finalization', 'duration_ms', 'started_at', 'completed_at',
])]
class Delegation extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'is_finalization' => 'boolean',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }

    /** What the worker actually did while handling this delta. */
    public function toolCalls(): HasMany
    {
        return $this->hasMany(ToolCall::class);
    }

    /**
     * Whether this delegation ended without a usable answer.
     *
     * Timeouts, empty replies, tool faults and step-limit exhaustion all land
     * here, and all become the talker's safe fallback line. None of them may
     * become a success claim — which is the rule this predicate exists to make
     * enforceable rather than aspirational.
     */
    public function failed(): bool
    {
        return in_array($this->status, ['failed', 'timeout', 'aborted'], strict: true)
            || ($this->status === 'completed' && blank($this->reply));
    }

    /**
     * Did anything durable actually happen here?
     *
     * The question to ask before believing a reply that says a ticket was
     * raised or a booking made.
     */
    public function completedADurableWrite(): bool
    {
        return $this->toolCalls()
            ->where('status', 'succeeded')
            ->whereHas('action', fn ($q) => $q->where('is_durable_write', true))
            ->exists();
    }
}
