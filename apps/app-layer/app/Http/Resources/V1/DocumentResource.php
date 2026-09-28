<?php

namespace App\Http\Resources\V1;

use App\Models\Document;
use Illuminate\Http\Request;

/** @mixin Document — the text is included only when fetched singly (`withContent()`). */
class DocumentResource extends ApiResource
{
    private bool $withContent = false;

    public function withContent(): static
    {
        $this->withContent = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'document',
            'name' => $this->name,
            'folder_id' => $this->folder_id,
            'source_type' => $this->source_type,
            'source_url' => $this->source_url,
            'mime' => $this->mime,
            'size_bytes' => (int) $this->size_bytes,
            // processing | ready | error. Only ready documents with chunks are searchable.
            'status' => $this->status,
            'error' => $this->error,
            'chunk_count' => (int) $this->chunk_count,
            'retrievable' => $this->isRetrievable(),
            ...($this->withContent ? ['content' => $this->content] : []),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
