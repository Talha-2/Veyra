<?php

namespace App\Http\Controllers;

use App\Models\ApiKey;
use App\Models\WebhookEndpoint;
use App\Support\PublicApi\OpenApiSpec;
use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /docs/api — the API reference without signing in, for partners who do
 * not have an account yet. The same spec and the same reference component
 * as Studio › Developer.
 */
class DocsController extends Controller
{
    public function api(): Response
    {
        return Inertia::render('docs/api', [
            'spec' => OpenApiSpec::build(),
            'base_url' => url('/api/v1'),
            'event_descriptions' => WebhookEndpoint::EVENT_DESCRIPTIONS,
            'scope_descriptions' => ApiKey::SCOPE_DESCRIPTIONS,
        ]);
    }
}
