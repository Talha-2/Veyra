<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One retrievable passage.
 *
 * Chunks live in the app layer even though the agent layer does the retrieval —
 * the app owns all data. The agent layer's vector store holds embeddings keyed
 * by chunk id, not the text itself.
 */
#[Fillable(['document_id', 'position', 'content', 'meta'])]
class DocumentChunk extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
