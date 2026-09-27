<?php

namespace App\Models;

use App\Enums\IdentifierType;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A way of reaching someone, which may not yet be attached to anyone.
 *
 * This is the piece that makes anonymous communication work. Someone calls from
 * a number we have never seen: we record the identifier and start a conversation
 * against it, with no contact. When we later learn who they are, linking the
 * identifier to a contact brings the entire history with it — because the
 * conversations pointed here all along, not at a name we did not have.
 */
#[Fillable(['type', 'value', 'label', 'contact_id', 'blocked_at', 'dnd_until'])]
class Identifier extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['type' => IdentifierType::class, 'blocked_at' => 'datetime', 'dnd_until' => 'datetime'];
    }

    public function isBlocked(): bool
    {
        return $this->blocked_at !== null;
    }

    /** Do-not-disturb: the agent will not place outbound calls or send proactive messages to this identifier. */
    public function isDnd(): bool
    {
        return $this->dnd_until !== null && $this->dnd_until->isFuture();
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    /**
     * Find or create the identifier for an address, normalizing first.
     *
     * Normalization is the whole job: `+1 (415) 555-2671`, `14155552671` and
     * `+14155552671` are one person, and `Ada@Example.com` is the same mailbox
     * as `ada@example.com`. Getting this wrong splits one customer's history
     * into several threads, which is the failure this table exists to prevent.
     */
    public static function resolve(IdentifierType $type, string $value): self
    {
        return static::firstOrCreate(
            ['type' => $type, 'value' => $type->normalize($value)],
        );
    }

    /**
     * Attach this identifier to a contact, bringing its history along.
     *
     * Conversations carry a denormalized contact_id so the inbox list does not
     * have to join through here on every row; that copy has to move too, or the
     * history links but does not appear.
     */
    public function linkTo(Contact $contact): void
    {
        $this->contact()->associate($contact);
        $this->save();

        $conversationIds = $this->conversations()->pluck('id');

        $this->conversations()->update(['contact_id' => $contact->getKey()]);

        if ($conversationIds->isNotEmpty()) {
            Call::whereIn('conversation_id', $conversationIds)
                ->update(['contact_id' => $contact->getKey()]);
        }
    }
}
