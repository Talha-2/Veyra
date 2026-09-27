<?php

namespace App\Models;

use App\Enums\ActionKind;
use App\Enums\ToolCallStatus;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A record of one tool invocation.
 *
 * The reason this table exists: the reliability rules say the agent must never
 * claim a ticket was raised, a booking made or a message sent unless a completed
 * action actually returned that result. Without a record of what ran, that rule
 * is a hope. With one, it is checkable — and when a customer says "your agent
 * told me it was booked", there is an answer.
 *
 * It also carries the idempotency key, which is what stops an ambiguous timeout
 * from becoming a double booking.
 */
#[Fillable([
    'action_id', 'call_id', 'delegation_id', 'expert_id', 'action_slug', 'kind',
    'arguments', 'result', 'status', 'error', 'attempt', 'duration_ms', 'idempotency_key',
])]
class ToolCall extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'kind' => ActionKind::class,
            'status' => ToolCallStatus::class,
            'arguments' => 'array',
            'result' => 'array',
            'approved_at' => 'datetime',
        ];
    }

    public function action(): BelongsTo
    {
        return $this->belongsTo(Action::class);
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }

    public function delegation(): BelongsTo
    {
        return $this->belongsTo(Delegation::class);
    }

    public function expert(): BelongsTo
    {
        return $this->belongsTo(Expert::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function scopeFailed(Builder $query): void
    {
        $query->whereIn('status', [ToolCallStatus::Failed, ToolCallStatus::Timeout]);
    }

    public function scopeSlowerThan(Builder $query, int $ms): void
    {
        $query->where('duration_ms', '>', $ms);
    }

    /**
     * Whether this call is safe to cite to a customer as a completed action.
     *
     * Deliberately narrow. A timeout is excluded even though the action may well
     * have succeeded, because "may well have" is not something to say to someone
     * asking whether their appointment is booked.
     */
    public function isConfirmedComplete(): bool
    {
        return $this->status === ToolCallStatus::Succeeded;
    }

    /**
     * A call that needs a human to look at it.
     *
     * Timeouts on non-idempotent actions are the dangerous ones: nobody knows
     * whether they happened, and nothing downstream can safely assume either
     * way. These are what the Desk should surface, not raw error counts.
     */
    public function needsReconciliation(): bool
    {
        return $this->status === ToolCallStatus::Timeout
            && $this->action
            && ! $this->action->is_idempotent;
    }
}
