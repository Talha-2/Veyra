<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A deep-agent conversation, for the Studio side panel.
 *
 * The agent's working state (todos, files, checkpoints) lives in the agent
 * layer keyed by external_id; this holds only the readable history so the
 * sidebar can list and reopen threads without calling the agent layer.
 */
#[Fillable(['user_id', 'title', 'external_id', 'messages'])]
class AgentThread extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['messages' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
