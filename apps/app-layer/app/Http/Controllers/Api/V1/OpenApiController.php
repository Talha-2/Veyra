<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\PublicApi\OpenApiSpec;
use Illuminate\Http\JsonResponse;

/** GET /api/v1/openapi.json — public, so partners can read it before they have a key. */
class OpenApiController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(OpenApiSpec::build(), 200, ['Cache-Control' => 'public, max-age=300'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
