<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Knowledge\KnowledgeSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KnowledgeController extends Controller
{
    public function __invoke(Request $request, Organization $organization, KnowledgeSearch $search): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'max:500'],
            'limit' => ['nullable', 'integer', 'between:1,20'],
        ]);

        return response()->json($search->search($validated['q'], (int) ($validated['limit'] ?? 8)));
    }
}
