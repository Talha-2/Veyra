<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\V1\DocumentResource;
use App\Models\Document;
use App\Services\Knowledge\KnowledgeSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The knowledge base the agent answers from. The agent's own memories
 * (Studio › Memory, `source_type = agent`) are not part of it here.
 */
class KnowledgeController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $f = $this->check($request, [
            'status' => ['sometimes', Rule::in(['processing', 'ready', 'error'])],
            'folder_id' => ['sometimes', 'integer'],
            'q' => ['sometimes', 'string', 'max:120'],
        ]);

        $query = $this->documents()
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['folder_id'] ?? null, fn ($q, $id) => $q->where('folder_id', $id))
            ->when($f['q'] ?? null, fn ($q, $t) => $q->whereRaw('lower(name) like ?', ['%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($t)).'%']));

        return $this->list($request, $query, DocumentResource::class);
    }

    public function show(int $document): JsonResponse
    {
        return response()->json((new DocumentResource($this->documents()->findOrFail($document)))->withContent());
    }

    /** Text in, searchable out: the document is chunked before this returns. */
    public function store(Request $request): JsonResponse
    {
        $v = $this->check($request, [
            'name' => ['required', 'string', 'max:200'],
            'content' => ['required', 'string', 'max:500000'],
            'folder_id' => ['nullable', 'integer', $this->ours('folders')],
            'source_url' => ['nullable', 'url', 'max:1000'],
        ]);

        $document = Document::create([...$v, 'source_type' => 'api', 'mime' => 'text/markdown', 'size_bytes' => strlen($v['content'])]);
        $document->reindex();

        return response()->json((new DocumentResource($document->refresh()))->withContent(), 201);
    }

    public function update(Request $request, int $document): JsonResponse
    {
        $document = $this->documents()->findOrFail($document);
        $v = $this->check($request, [
            'name' => ['sometimes', 'string', 'max:200'],
            'content' => ['sometimes', 'string', 'max:500000'],
            'folder_id' => ['sometimes', 'nullable', 'integer', $this->ours('folders')],
            'source_url' => ['sometimes', 'nullable', 'url', 'max:1000'],
        ]);

        $document->fill($v);
        if ($document->isDirty('content')) {
            $document->size_bytes = strlen($document->content ?? '');
        }
        $document->save();
        if ($document->wasChanged('content')) {
            $document->reindex();
        }

        return response()->json((new DocumentResource($document->refresh()))->withContent());
    }

    public function destroy(int $document): JsonResponse
    {
        $document = $this->documents()->findOrFail($document);
        $document->delete();

        return $this->deleted('document', $document->id);
    }

    /** What the agent would retrieve for a query — the same search a call uses. */
    public function search(Request $request, KnowledgeSearch $search): JsonResponse
    {
        $v = $this->check($request, [
            'query' => ['required', 'string', 'min:3', 'max:500'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:20'],
        ]);

        $result = $search->search($v['query'], (int) ($v['limit'] ?? 8), withMemory: false);

        return response()->json([
            'object' => 'search_result',
            'query' => $result['query'],
            'data' => array_map(fn (array $hit) => [
                'object' => 'chunk',
                'document_id' => $hit['document_id'],
                'document_name' => $hit['document'],
                'position' => $hit['position'],
                'score' => $hit['score'],
                'excerpt' => $hit['excerpt'],
                'content' => $hit['content'],
            ], $result['results']),
        ]);
    }

    private function documents()
    {
        return Document::query()->where('source_type', '!=', 'agent');
    }
}
