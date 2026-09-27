<?php

namespace App\Enums;

enum ToolCallStatus: string
{
    // Recorded *before* dispatch, with the idempotency key, so that an
    // ambiguous timeout leaves a row that says "this may have happened".
    case Running = 'running';
    case Succeeded = 'succeeded';
    case Failed = 'failed';
    case Timeout = 'timeout';
    case Rejected = 'rejected';
    case AwaitingApproval = 'awaiting_approval';

    public function label(): string
    {
        return match ($this) {
            self::Running => 'Running',
            self::Succeeded => 'Succeeded',
            self::Failed => 'Failed',
            self::Timeout => 'Timed out',
            self::Rejected => 'Rejected',
            self::AwaitingApproval => 'Awaiting approval',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::Running => 'info',
            self::Succeeded => 'success',
            self::Failed, self::Timeout => 'danger',
            self::Rejected => 'muted',
            self::AwaitingApproval => 'warning',
        };
    }

    /**
     * Whether this outcome proves the action did NOT take effect.
     *
     * The load-bearing distinction. `failed` and `rejected` are proof of
     * non-occurrence, so the agent may honestly say it could not do the thing.
     * `timeout` proves nothing at all — the action may well have succeeded — so
     * it must never be reported to a caller as either success or failure.
     */
    public function provesNothingHappened(): bool
    {
        return $this === self::Failed || $this === self::Rejected;
    }
}
