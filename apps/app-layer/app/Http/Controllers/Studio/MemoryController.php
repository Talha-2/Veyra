<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Document;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The agent's long-term memory, as a page. Z360 has one; the harness stores
 * memories through `StoreBackend` under `/memories/{org,user}/…`.
 *
 * Until the contract exposes the store, memory is a special folder of
 * knowledge documents named `memory/*` — which is also how the harness reads
 * it (a memory is a markdown file on the same filesystem-shaped backend as a
 * skill). So this page is real, and the path stays the same when the agent
 * layer takes over the writes.
 */
class MemoryController extends Controller
{
    public function index(): Response
    {
        $memories = Document::query()->where('source_type', 'agent')->orderByDesc('updated_at')->get();

        return Inertia::render('studio/memory', [
            'memories' => $memories->map(fn (Document $d) => [
                'id' => $d->id, 'name' => $d->name, 'content' => $d->content, 'updated_at' => $d->updated_at?->toIso8601String(),
            ])->all(),
            'contacts_with_history' => Contact::query()->has('conversations')->count(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate(['name' => ['required', 'string', 'max:120'], 'content' => ['required', 'string', 'max:20000']]);
        Document::create([...$validated, 'source_type' => 'agent', 'mime' => 'text/markdown', 'size_bytes' => strlen($validated['content']), 'status' => 'ready']);

        return back()->with('success', 'Memory saved. The agent reads it on the next call.');
    }

    public function update(Request $request, Document $document): RedirectResponse
    {
        abort_unless($document->source_type === 'agent', 404);
        $validated = $request->validate(['content' => ['required', 'string', 'max:20000']]);
        $document->update([...$validated, 'size_bytes' => strlen($validated['content'])]);

        return back()->with('success', 'Memory updated.');
    }

    public function destroy(Document $document): RedirectResponse
    {
        abort_unless($document->source_type === 'agent', 404);
        $document->delete();

        return back();
    }
}
