<?php

namespace App\Enums;

enum TicketStatus: string
{
    case Open = 'open';
    case InProgress = 'in_progress';
    case Pending = 'pending';
    case Resolved = 'resolved';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Open',
            self::InProgress => 'In progress',
            self::Pending => 'Pending',
            self::Resolved => 'Resolved',
            self::Closed => 'Closed',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::Open => 'accent',
            self::InProgress => 'info',
            self::Pending => 'warning',
            self::Resolved, self::Closed => 'success',
        };
    }

    public function isTerminal(): bool
    {
        return $this === self::Resolved || $this === self::Closed;
    }
}
