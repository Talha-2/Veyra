<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffChatParticipant extends Model
{
    use BelongsToTenant;

    protected $fillable = ['staff_chat_room_id', 'user_id', 'last_read_message_id'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
