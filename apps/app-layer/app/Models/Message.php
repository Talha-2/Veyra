<?php

namespace App\Models;

use App\Enums\Channel;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One message on one conversation, whatever the channel.
 *
 * Replaces four near-identical tables (sms / email / web chat / fax) that the
 * inbox had to UNION. Channel-specific fields are nullable columns; anything
 * genuinely per-channel lives in `meta`.
 */
#[Fillable([
    'conversation_id', 'channel', 'direction', 'status', 'sent_by_id', 'from_agent',
    'body', 'body_html', 'from_address', 'to_address', 'provider', 'provider_sid', 'meta',
])]
class Message extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'channel' => Channel::class,
            'meta' => 'array',
            'from_agent' => 'boolean',
            'read_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    public function pinnedBy(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(User::class, 'message_pins')->withTimestamps();
    }

    public function feedback(): HasMany
    {
        return $this->hasMany(MessageFeedback::class);
    }

    public function isInbound(): bool
    {
        return $this->direction === 'inbound';
    }

    /**
     * Who the Desk should show as the author.
     *
     * Three cases, and conflating them is how an operator ends up thinking a
     * colleague promised something the agent did.
     */
    public function authorLabel(): string
    {
        if ($this->isInbound()) {
            return $this->conversation?->title() ?? 'Customer';
        }

        return $this->from_agent
            ? 'Agent'
            : ($this->sentBy?->name ?? 'Team');
    }
}
