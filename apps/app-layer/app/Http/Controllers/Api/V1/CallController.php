<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\V1\CallResource;
use App\Models\Call;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CallController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $f = $this->check($request, [
            'status' => ['sometimes', 'string', 'max:32'],
            'direction' => ['sometimes', Rule::in(['inbound', 'outbound'])],
            'contact_id' => ['sometimes', 'integer'],
        ]);

        $query = Call::query()->with('transcript:id,call_id,summary')
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['direction'] ?? null, fn ($q, $d) => $q->where('direction', $d))
            ->when($f['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id));

        return $this->list($request, $query, CallResource::class);
    }

    public function show(Call $call): JsonResponse
    {
        return response()->json((new CallResource($call->load(['transcript', 'delegations.toolCalls'])))->detailed());
    }
}
