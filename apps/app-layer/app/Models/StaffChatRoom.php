<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class StaffChatRoom extends Model
{
    use BelongsToTenant;

    protected $fillable = ['kind', 'name', 'direct_key', 'created_by'];

    public function participants(): HasMany
    {
        return $this->hasMany(StaffChatParticipant::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(StaffChatMessage::class);
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(StaffChatMessage::class)->latestOfMany();
    }
}
