<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['call_id', 'items', 'metrics', 'summary'])]
class CallTranscript extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['items' => 'array', 'metrics' => 'array'];
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }
}
