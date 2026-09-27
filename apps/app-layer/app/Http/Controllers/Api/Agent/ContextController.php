<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Agent\CallContextBuilder;
use Illuminate\Http\JsonResponse;

/** The tenant bundle without a call: for text runs, Ask threads and automations. */
class ContextController extends Controller
{
    public function __invoke(Organization $organization, CallContextBuilder $builder): JsonResponse
    {
        return response()->json($builder->forOrganization($organization));
    }
}
