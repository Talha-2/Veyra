<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentChunk;
use App\Models\Folder;
use App\Services\Knowledge\KnowledgeSearch;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Inertia\Response;

class KnowledgeController extends Controller
{
    public function index(Request $request, KnowledgeSearch $search): Response
    {
        $folderId = $request->query('folder');
        $current = $folderId ? Folder::query()->findOrFail($folderId) : null;

        return Inertia::render('studio/knowledge', [
            'folder' => $current ? ['id' => $current->id, 'name' => $current->name, 'parent_id' => $current->parent_id] : null,
            'breadcrumbs' => $this->breadcrumbs($current),
            'folders' => Folder::query()->where('parent_id', $current?->id)->withCount('documents')->orderBy('name')->get()
                ->map(fn ($f) => ['id' => $f->id, 'name' => $f->name, 'documents_count' => $f->documents_count])->all(),
            'all_folders' => Folder::query()->orderBy('name')->get(['id', 'name', 'parent_id'])->all(),
            'documents' => Document::query()->where('folder_id', $current?->id)->orderBy('name')->get()
                ->map(fn (Document $d) => $this->row($d))->all(),
            'totals' => [
                'documents' => Document::query()->count(),
                'retrievable' => Document::query()->ready()->where('chunk_count', '>', 0)->count(),
                'processing' => Document::query()->where('status', 'processing')->count(),
                // Named on its own so the page can say "failed" rather than
                // infer it from the gap between the other two.
                'failed' => Document::query()->where('status', 'error')->count(),
            ],
            // Same implementation the agent's /knowledge/search route uses,
            // so the test box shows exactly what a call would retrieve.
            'search' => $request->query('search') ? $search->search((string) $request->query('search')) : null,
        ]);
    }

    public function show(Document $document): Response
    {
        $document->load(['folder', 'chunks' => fn ($q) => $q->limit(200)]);

        return Inertia::render('studio/document', [
            'document' => [
                ...$this->row($document),
                'content' => $document->content,
                'content_rich' => $document->content_rich,
                'source_url' => $document->source_url,
                'folder' => $document->folder ? ['id' => $document->folder->id, 'name' => $document->folder->name] : null,
                // What retrieval actually sees. An author reading their own
                // chunks is the fastest way to learn why the agent answered
                // from the wrong paragraph.
                'chunks' => $document->chunks->map(fn (DocumentChunk $c) => ['id' => $c->id, 'position' => $c->position, 'content' => $c->content])->all(),
            ],
        ]);
    }

    public function storeFolder(Request $request): RedirectResponse
    {
        $validated = $request->validate(['name' => ['required', 'string', 'max:120'], 'parent_id' => ['nullable', 'integer', 'exists:folders,id']]);
        Folder::create($validated);

        return back();
    }

    public function renameFolder(Request $request, Folder $folder): RedirectResponse
    {
        $folder->update($request->validate(['name' => ['required', 'string', 'max:120']]));

        return back();
    }

    public function destroyFolder(Folder $folder): RedirectResponse
    {
        // Documents survive: they move to the parent rather than vanish with
        // a folder that was only ever organisation for humans.
        Document::query()->where('folder_id', $folder->id)->update(['folder_id' => $folder->parent_id]);
        Folder::query()->where('parent_id', $folder->id)->update(['parent_id' => $folder->parent_id]);
        $folder->delete();

        return back();
    }

    public function storeDocument(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'content' => ['required', 'string', 'max:500000'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $document = Document::create([...$validated, 'source_type' => 'created', 'mime' => 'text/markdown', 'size_bytes' => strlen($validated['content'])]);
        $this->chunk($document);

        return back()->with('success', 'Document created and indexed.');
    }

    public function upload(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'files' => ['required', 'array', 'max:20'],
            'files.*' => ['file', 'max:20480', 'mimes:txt,md,csv,pdf,docx,html'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $count = 0;
        foreach ($validated['files'] as $file) {
            $mime = $file->getMimeType() ?? 'application/octet-stream';
            // Plain-text formats are read here; binary ones are stored and
            // extracted by the agent layer, which has the parsers.
            $text = in_array($file->getClientOriginalExtension(), ['txt', 'md', 'csv', 'html'], true) ? file_get_contents($file->getRealPath()) : null;

            $document = Document::create([
                'name' => $file->getClientOriginalName(),
                'folder_id' => $validated['folder_id'] ?? null,
                'source_type' => 'upload',
                'mime' => $mime,
                'size_bytes' => $file->getSize(),
                'content' => $text ? ($mime === 'text/html' ? strip_tags($text) : $text) : null,
                'status' => $text ? 'ready' : 'processing',
            ]);
            if ($text) {
                $this->chunk($document);
            }
            $count++;
        }

        return back()->with('success', "{$count} file".($count === 1 ? '' : 's').' uploaded.');
    }

    /** Fetch a page, strip it to text, index it. The stub of a crawler; one page, no follow. */
    public function scrape(Request $request): RedirectResponse
    {
        $validated = $request->validate(['url' => ['required', 'url', 'max:1000'], 'folder_id' => ['nullable', 'integer', 'exists:folders,id']]);

        try {
            $html = Http::timeout(15)->get($validated['url'])->throw()->body();
        } catch (\Throwable $e) {
            return back()->withErrors(['url' => 'Could not fetch that page: '.$e->getMessage()]);
        }

        preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m);
        $title = trim(html_entity_decode($m[1] ?? parse_url($validated['url'], PHP_URL_HOST) ?? 'Page'));
        $html = preg_replace('/<(script|style|nav|footer|header)\b[^>]*>.*?<\/\1>/is', ' ', $html);
        $text = trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($html))));

        $document = Document::create([
            'name' => str($title)->limit(120)->value(),
            'folder_id' => $validated['folder_id'] ?? null,
            'source_type' => 'scrape',
            'source_url' => $validated['url'],
            'mime' => 'text/plain',
            'size_bytes' => strlen($text),
            'content' => $text,
        ]);
        $this->chunk($document);

        return back()->with('success', "Imported \"{$document->name}\" ({$document->chunk_count} chunks).");
    }

    public function updateDocument(Request $request, Document $document): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:200'],
            'content' => ['sometimes', 'string', 'max:500000'],
            'folder_id' => ['sometimes', 'nullable', 'integer', 'exists:folders,id'],
        ]);

        $document->fill($validated);
        if ($document->isDirty('content')) {
            $document->size_bytes = strlen($document->content ?? '');
        }
        $document->save();

        if ($document->wasChanged('content')) {
            $this->chunk($document);
        }

        return back()->with('success', 'Saved and re-indexed.');
    }

    public function reindex(Document $document): RedirectResponse
    {
        if (! $document->content) {
            return back()->with('error', 'Nothing to index — the content has not been extracted yet.');
        }
        $this->chunk($document);

        return back()->with('success', "Re-indexed into {$document->chunk_count} chunks.");
    }

    public function move(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'document_ids' => ['array'], 'document_ids.*' => ['integer', 'exists:documents,id'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);
        Document::query()->whereIn('id', $validated['document_ids'] ?? [])->update(['folder_id' => $validated['folder_id']]);

        return back();
    }

    public function destroyDocument(Document $document): RedirectResponse
    {
        $document->delete();

        return back();
    }

    public function bulkDestroy(Request $request): RedirectResponse
    {
        $validated = $request->validate(['document_ids' => ['required', 'array'], 'document_ids.*' => ['integer']]);
        Document::query()->whereIn('id', $validated['document_ids'])->delete();

        return back()->with('success', count($validated['document_ids']).' documents deleted.');
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private function chunk(Document $document): void
    {
        $document->reindex();
    }

    private function breadcrumbs(?Folder $folder): array
    {
        $trail = [];
        while ($folder) {
            array_unshift($trail, ['id' => $folder->id, 'name' => $folder->name]);
            $folder = $folder->parent;
        }

        return $trail;
    }

    private function row(Document $d): array
    {
        return [
            'id' => $d->id, 'name' => $d->name, 'source_type' => $d->source_type, 'mime' => $d->mime,
            'size_bytes' => $d->size_bytes, 'status' => $d->status, 'error' => $d->error,
            'chunk_count' => $d->chunk_count, 'retrievable' => $d->isRetrievable(),
            'updated_at' => $d->updated_at?->toIso8601String(),
        ];
    }
}
