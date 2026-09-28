<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Which key this is, whose it is and what it may do — the first call to make. */
class MeController extends ApiController
{
    public function __invoke(Request $request): JsonResponse
    {
        $key = $this->key($request);
        $organization = Organization::current();

        return response()->json([
            'object' => 'api_key',
            'id' => $key->id,
            'name' => $key->name,
            'prefix' => $key->prefix,
            'type' => $key->publishable ? 'publishable' : 'server',
            'scopes' => array_values($key->scopes ?? []),
            'organization' => [
                'id' => $organization->id,
                'object' => 'organization',
                'name' => $organization->name,
                'slug' => $organization->slug,
                'timezone' => $organization->timezone,
            ],
            'created_at' => $key->created_at?->utc()->toIso8601ZuluString(),
            'last_used_at' => $key->last_used_at?->utc()->toIso8601ZuluString(),
        ]);
    }
}
