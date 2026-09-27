<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A contact placed in a pipeline and moving through it.
 *
 * Separate from Contact because a person can exist without being an active
 * lead — a CRM shows thousands of contacts and far fewer live opportunities.
 */
#[Fillable(['contact_id', 'pipeline_id', 'pipeline_stage_id', 'position', 'source', 'value', 'next_response_at', 'outreach_note'])]
class Lead extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected function casts(): array
    {
        return ['next_response_at' => 'datetime'];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }

    public function stage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'pipeline_stage_id');
    }

    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }

    public function activities(): \Illuminate\Database\Eloquent\Relations\MorphMany
    {
        return $this->morphMany(Activity::class, 'subject')->latest();
    }
}
