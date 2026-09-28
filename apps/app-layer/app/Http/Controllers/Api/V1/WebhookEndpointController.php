<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\V1\WebhookEndpointResource;
use App\Models\WebhookEndpoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** The same endpoints Studio › Developer manages, for integrations that register their own. */
class WebhookEndpointController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        return $this->list($request, WebhookEndpoint::query(), WebhookEndpointResource::class);
    }

    public function show(WebhookEndpoint $webhookEndpoint): JsonResponse
    {
        return response()->json(new WebhookEndpointResource($webhookEndpoint));
    }

    /** The signing secret is in this response and never again. */
    public function store(Request $request): JsonResponse
    {
        $v = $this->check($request, [
            'url' => ['required', 'url', 'max:500', 'starts_with:https://'],
            'events' => ['required', 'array', 'min:1'],
            'events.*' => [Rule::in(['*', ...WebhookEndpoint::EVENTS])],
        ], ['url.starts_with' => 'The URL must start with https://.']);

        $secret = 'whsec_'.Str::random(32);
        $endpoint = WebhookEndpoint::create([...$v, 'events' => array_values(array_unique($v['events'])), 'secret' => $secret, 'enabled' => true]);

        return response()->json((new WebhookEndpointResource($endpoint->refresh()))->withSecret($secret), 201);
    }

    public function destroy(WebhookEndpoint $webhookEndpoint): JsonResponse
    {
        $webhookEndpoint->delete();

        return $this->deleted('webhook_endpoint', $webhookEndpoint->id);
    }
}
