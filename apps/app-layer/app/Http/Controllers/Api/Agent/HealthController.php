<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Services\Agent\CallContextBuilder;
use Illuminate\Http\JsonResponse;

/** Reachability plus the contract version, so a mismatched deploy is visible in one request. */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            'contract' => CallContextBuilder::CONTRACT,
            'app' => config('app.name'),
            'time' => now()->toIso8601String(),
        ]);
    }
}
