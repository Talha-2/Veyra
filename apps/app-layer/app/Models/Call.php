<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * One phone call. Belongs to a conversation so calls and texts share a timeline,
 * but keeps its own table: a call has duration, a recording, a live room and a
 * turn-by-turn transcript, none of which a message has.
 */
#[Fillable([
    'conversation_id', 'phone_number_id', 'contact_id', 'direction', 'from_number',
    'to_number', 'provider', 'provider_sid', 'room', 'status', 'language',
])]
class Call extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['transferred' => 'boolean'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function phoneNumber(): BelongsTo
    {
        return $this->belongsTo(PhoneNumber::class);
    }

    public function transcript(): HasOne
    {
        return $this->hasOne(CallTranscript::class);
    }

    public function transferredTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'transferred_to_id');
    }

    /**
     * Every talker -> worker handoff on this call, in order.
     *
     * Reading these in sequence reconstructs what the agent actually did, which
     * is the only way to check a promise it made to the caller.
     */
    public function delegations(): HasMany
    {
        return $this->hasMany(Delegation::class)->orderBy('sequence');
    }

    public function toolCalls(): HasMany
    {
        return $this->hasMany(ToolCall::class);
    }

    public function scopeCompleted(Builder $query): void
    {
        $query->where('status', 'completed');
    }

    public function isLive(): bool
    {
        return in_array($this->status, ['ringing', 'in-progress'], strict: true);
    }

    /** "4:07". Zero-duration calls read as a dash, not "0:00". */
    public function formattedDuration(): string
    {
        if ($this->duration_sec < 1) {
            return '—';
        }

        return sprintf('%d:%02d', intdiv($this->duration_sec, 60), $this->duration_sec % 60);
    }
}
