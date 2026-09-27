<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A connected mailbox the inbox reads from and replies through. */
#[Fillable(['provider', 'address', 'from_name', 'credentials', 'status', 'default_assignee_ids'])]
class EmailAccount extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected function casts(): array
    {
        return [
            'credentials' => 'encrypted:array',
            'default_assignee_ids' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }

    public function isConnected(): bool
    {
        return $this->status === 'connected';
    }
}
