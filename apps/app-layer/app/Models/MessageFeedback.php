<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An operator's verdict on one agent message.
 *
 * The cheapest quality signal the product has: whoever is reading the thread
 * already knows whether the reply was right. A run of downs on one skill is
 * how a prompt problem gets found before a customer complains.
 */
#[Fillable(['message_id', 'user_id', 'rating', 'comment'])]
class MessageFeedback extends Model
{
    use BelongsToTenant;

    protected $table = 'message_feedback';

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
