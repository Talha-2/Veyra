<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Per user, per organization: which events reach them and how.
 *
 * Not tenant-scoped — the user owns it, and the same person can want different
 * things in different organizations.
 */
#[Fillable(['user_id', 'organization_id', 'channels'])]
class NotificationPreference extends Model
{
    public const EVENTS = [
        'conversation.assigned' => 'A conversation is assigned to you',
        'conversation.unassigned_new' => 'A new conversation arrives unassigned',
        'ticket.assigned' => 'A ticket is assigned to you',
        'ticket.agent_raised' => 'The agent raises a ticket',
        'action.needs_review' => 'An agent action needs a human to check',
        'automation.failed' => 'An automation run fails',
        'reminder.due' => 'A reminder is due',
    ];

    protected function casts(): array
    {
        return ['channels' => 'array'];
    }

    /** Everything in-app; email only for the one that is a customer-facing risk. */
    public static function defaults(): array
    {
        return collect(self::EVENTS)
            ->mapWithKeys(fn ($_, $key) => [$key => ['in_app' => true, 'email' => $key === 'action.needs_review']])
            ->all();
    }
}
