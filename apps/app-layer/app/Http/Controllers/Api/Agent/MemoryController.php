<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The agent remembers something. Upsert by name; the Memory page in Studio shows it. */
class MemoryController extends Controller
{
    public function __invoke(Request $request, Organization $organization): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'content' => ['required', 'string', 'max:20000'],
        ]);

        $memory = Document::query()->where('source_type', 'agent')->where('name', $validated['name'])->first();
        $created = ! $memory;

        $memory ??= new Document(['name' => $validated['name'], 'source_type' => 'agent', 'mime' => 'text/markdown', 'status' => 'ready']);
        $memory->fill(['content' => $validated['content'], 'size_bytes' => strlen($validated['content'])])->save();

        return response()->json(['id' => $memory->id, 'name' => $memory->name], $created ? 201 : 200);
    }
}
