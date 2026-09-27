<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A stage is a row, not a string in a JSON array.
 *
 * The old schema stored stages as JSON on the pipeline and the lead's stage as a
 * free string, so renaming a stage orphaned every lead in it and nothing
 * validated that a stage existed at all.
 */
#[Fillable(['pipeline_id', 'name', 'color', 'position'])]
class PipelineStage extends Model
{
    use BelongsToTenant;

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }
}
