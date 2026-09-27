<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['folder_id', 'name', 'source_type', 'source_url', 'mime', 'size_bytes', 'content', 'content_rich', 'status'])]
class Document extends Model
{
    use BelongsToTenant, SoftDeletes;

    /** Target chunk size in characters. Roughly 300 tokens of English, fewer of Urdu. */
    public const CHUNK_CHARS = 1200;

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    public function chunks(): HasMany
    {
        return $this->hasMany(DocumentChunk::class)->orderBy('position');
    }

    public function scopeReady(Builder $query): void
    {
        $query->where('status', 'ready');
    }

    /**
     * Whether the agent can actually retrieve from this document.
     *
     * A document that uploaded successfully but produced no chunks is worse than
     * a failed one: it looks present in the UI and is invisible to retrieval.
     */
    public function isRetrievable(): bool
    {
        return $this->status === 'ready' && $this->chunk_count > 0;
    }

    /**
     * Rebuild the chunks retrieval reads from.
     *
     * Paragraph-aware: paragraphs are packed into chunks of about CHUNK_CHARS,
     * and when a chunk fills up the last paragraph is carried into the next one
     * so a fact that straddles the boundary is found from either side. The
     * agent layer will replace this with token-aware chunking plus embeddings;
     * what it must keep is the invariant that a chunk never splits a paragraph,
     * because half a sentence retrieved out of context is how the agent
     * confidently misquotes a policy.
     *
     * One definition, used by the controller and the seeders, so what the
     * search test on the Knowledge page shows is what the demo data has.
     */
    public function reindex(): static
    {
        $paragraphs = preg_split('/\n\s*\n/', trim((string) $this->content)) ?: [];
        $chunks = [];
        $buffer = '';
        $previous = '';

        foreach ($paragraphs as $paragraph) {
            $paragraph = trim($paragraph);
            if ($paragraph === '') {
                continue;
            }
            if ($buffer !== '' && mb_strlen($buffer) + mb_strlen($paragraph) > self::CHUNK_CHARS) {
                $chunks[] = $buffer;
                $buffer = $previous."\n\n".$paragraph;
            } else {
                $buffer = $buffer === '' ? $paragraph : $buffer."\n\n".$paragraph;
            }
            $previous = $paragraph;
        }
        if ($buffer !== '') {
            $chunks[] = $buffer;
        }

        $this->chunks()->delete();
        foreach ($chunks as $i => $text) {
            $this->chunks()->create(['organization_id' => $this->organization_id, 'position' => $i, 'content' => $text]);
        }

        $this->forceFill([
            'chunk_count' => count($chunks),
            'status' => $chunks ? 'ready' : 'error',
            'error' => $chunks ? null : 'No text could be extracted.',
        ])->save();

        return $this;
    }
}
