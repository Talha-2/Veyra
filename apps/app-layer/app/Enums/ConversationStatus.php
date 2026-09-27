<?php

namespace App\Enums;

/**
 * Note what is absent: there is no "deleted".
 *
 * A conversation is a record of something that actually happened to a real
 * customer. Closing it is reversible and truthful; deleting it would destroy
 * the only evidence of a call or a promise. Archive is the closed state.
 */
enum ConversationStatus: string
{
    case Open = 'open';
    case Snoozed = 'snoozed';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Open',
            self::Snoozed => 'Snoozed',
            self::Closed => 'Closed',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::Open => 'accent',
            self::Snoozed => 'warning',
            self::Closed => 'muted',
        };
    }
}
