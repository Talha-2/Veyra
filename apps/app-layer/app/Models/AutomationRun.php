<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['automation_id', 'trigger', 'status', 'input', 'result', 'steps', 'error', 'tokens', 'duration_ms', 'started_at', 'ended_at'])]
class AutomationRun extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['steps' => 'array', 'started_at' => 'datetime', 'ended_at' => 'datetime'];
    }

    public function automation(): BelongsTo
    {
        return $this->belongsTo(Automation::class);
    }
}
