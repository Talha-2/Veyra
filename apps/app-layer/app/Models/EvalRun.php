<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['name', 'status', 'scenario', 'persona', 'language', 'turns', 'scores', 'latency', 'started_by_id'])]
class EvalRun extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['turns' => 'array', 'scores' => 'array', 'latency' => 'array'];
    }

    public function startedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'started_by_id');
    }

    /**
     * The number that matters.
     *
     * VOICE.md: "p95 is the product, p50 is the demo." One four-second turn
     * ruins a call more than ten 1.4-second turns, so the list shows p95 and
     * never a mean.
     */
    public function p95VoiceToVoiceMs(): ?int
    {
        return $this->latency['voice_to_voice']['p95'] ?? null;
    }
}
