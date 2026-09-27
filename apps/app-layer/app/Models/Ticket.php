<?php

namespace App\Models;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Traits\BelongsToTenant;
use App\Traits\Taggable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

/**
 * A support or follow-up item.
 *
 * Tickets carry unusual weight in this system: the reliability rules forbid the
 * agent from telling a caller their issue was handed to the team unless a
 * ticket actually exists. So a row here is not bookkeeping — it is the evidence
 * behind something the agent said out loud to a customer.
 */
#[Fillable([
    'subject', 'body', 'status', 'priority', 'type', 'ticket_type_id', 'position', 'contact_id',
    'conversation_id', 'channel', 'created_by_id', 'created_by_agent',
])]
class Ticket extends Model
{
    use BelongsToTenant, SoftDeletes, Taggable;

    protected function casts(): array
    {
        return [
            'status' => TicketStatus::class,
            'priority' => TicketPriority::class,
            'created_by_agent' => 'boolean',
            'resolved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Per-tenant sequence. Allocated inside a transaction with a row lock so
        // two simultaneous tickets cannot claim the same number — which they
        // will, because the agent creates tickets from concurrent calls.
        static::creating(function (self $ticket) {
            if ($ticket->number === null) {
                $ticket->number = static::nextNumberFor($ticket->organization_id);
            }
        });
    }

    protected static function nextNumberFor(int $organizationId): int
    {
        return DB::transaction(function () use ($organizationId) {
            // Lock the tenant row, not the tickets.
            //
            // The obvious version — `max('number')` with `lockForUpdate()` — is
            // rejected by Postgres, which does not allow FOR UPDATE alongside an
            // aggregate. Locking the organization serializes concurrent inserts
            // for this tenant only, which is exactly the scope the sequence has.
            DB::table('organizations')
                ->where('id', $organizationId)
                ->lockForUpdate()
                ->first();

            // withoutGlobalScopes so soft-deleted tickets still hold their
            // number: reusing one would make two different tickets answer to
            // the same reference in a customer's inbox.
            $max = static::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->max('number');

            return ($max ?? 0) + 1;
        });
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function ticketType(): BelongsTo
    {
        return $this->belongsTo(TicketType::class);
    }

    public function activities(): MorphMany
    {
        return $this->morphMany(Activity::class, 'subject')->latest();
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable')->latest();
    }

    public function scopeUnresolved(Builder $query): void
    {
        $query->whereNotIn('status', [TicketStatus::Resolved, TicketStatus::Closed]);
    }

    public function scopeAssignedTo(Builder $query, User $user): void
    {
        $query->whereHas('assignees', fn ($q) => $q->whereKey($user->getKey()));
    }

    /** Raised by the agent rather than a person — surfaced in the UI, not hidden. */
    public function scopeRaisedByAgent(Builder $query): void
    {
        $query->where('created_by_agent', true);
    }

    public function reference(): string
    {
        return "#{$this->number}";
    }
}
