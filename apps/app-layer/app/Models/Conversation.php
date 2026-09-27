<?php

namespace App\Models;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Traits\BelongsToTenant;
use App\Traits\Taggable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One thread with one identifier on one channel.
 *
 * A real row, not a projection over messages. The previous design derived
 * threads from telephony records, which meant assignment, status and "delete"
 * had nowhere to live and no honest meaning.
 */
#[Fillable(['identifier_id', 'contact_id', 'channel', 'subject', 'status'])]
class Conversation extends Model
{
    use BelongsToTenant, Taggable;

    protected function casts(): array
    {
        return [
            'channel' => Channel::class,
            'status' => ConversationStatus::class,
            'is_favorite' => 'boolean',
            'last_message_at' => 'datetime',
            'snoozed_until' => 'datetime',
        ];
    }

    public function identifier(): BelongsTo
    {
        return $this->belongsTo(Identifier::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function calls(): HasMany
    {
        return $this->hasMany(Call::class);
    }

    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function activities(): \Illuminate\Database\Eloquent\Relations\MorphMany
    {
        return $this->morphMany(Activity::class, 'subject')->latest();
    }

    public function notes(): \Illuminate\Database\Eloquent\Relations\MorphMany
    {
        return $this->morphMany(Note::class, 'notable')->latest();
    }

    public function reminders(): \Illuminate\Database\Eloquent\Relations\MorphMany
    {
        return $this->morphMany(Reminder::class, 'remindable');
    }

    // ── scopes: the inbox's built-in views ────────────────────────────────

    public function scopeOpen(Builder $query): void
    {
        $query->where('status', ConversationStatus::Open);
    }

    public function scopeUnassigned(Builder $query): void
    {
        $query->whereDoesntHave('assignees');
    }

    public function scopeAssignedTo(Builder $query, User $user): void
    {
        $query->whereHas('assignees', fn ($q) => $q->whereKey($user->getKey()));
    }

    public function scopeUnread(Builder $query): void
    {
        $query->where('unread_count', '>', 0);
    }

    /**
     * A snoozed conversation whose time has come is open again.
     *
     * Expressed in the query rather than swept by a scheduled job: a job that
     * has not run yet leaves conversations invisible, and "why is this not in my
     * inbox" is a much worse bug than a slightly longer WHERE clause.
     */
    public function scopeInbox(Builder $query): void
    {
        $query->where(function (Builder $q) {
            $q->where('status', ConversationStatus::Open)
                ->orWhere(fn (Builder $s) => $s
                    ->where('status', ConversationStatus::Snoozed)
                    ->where('snoozed_until', '<=', now()));
        });
    }

    /** Title for the thread list, falling back through what we know. */
    public function title(): string
    {
        return $this->contact?->displayName()
            ?? $this->identifier?->value
            ?? 'Unknown';
    }

    /**
     * Clear the unread badge and stamp the messages that caused it.
     *
     * Both halves matter: the counter drives the rail, and `read_at` is what
     * lets a thread show where someone last left off.
     */
    public function markRead(): void
    {
        if ($this->unread_count === 0) {
            return;
        }

        $this->messages()
            ->whereNull('read_at')
            ->where('direction', 'inbound')
            ->update(['read_at' => now()]);

        $this->update(['unread_count' => 0]);
    }

    /**
     * Move this conversation to the top of the inbox.
     *
     * `last_message_at` is denormalized precisely so the list never has to
     * aggregate messages to sort itself — which means every write path has to
     * remember to call this. Inbound ingestion increments the unread count too;
     * an outbound reply does not.
     */
    public function touchLastMessage(Message $message): void
    {
        $this->forceFill([
            'last_message_at' => $message->created_at ?? now(),
            // `?? 0`: a conversation created moments ago carries only what
            // was filled, not the column default, until it is re-read.
            'unread_count' => $message->isInbound()
                ? ($this->unread_count ?? 0) + 1
                : ($this->unread_count ?? 0),
        ])->save();
    }
}
