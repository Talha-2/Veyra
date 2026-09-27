<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

#[Fillable(['text', 'due_at', 'user_id'])]
class Reminder extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['due_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function remindable(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeOutstanding(Builder $query): void
    {
        $query->whereNull('completed_at');
    }

    public function scopeDue(Builder $query): void
    {
        $query->whereNull('completed_at')->where('due_at', '<=', now());
    }
}
