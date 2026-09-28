<?php

namespace App\Http\Middleware;

use App\Models\ApiKey;
use App\Models\Organization;
use App\Support\PublicApi\ApiError;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use LogicException;
use Symfony\Component\HttpFoundation\Response;

/**
 * The front door of the public API (`/api/v1`).
 *
 * In order, every request:
 *
 * 1. **Authenticates** the bearer key by its hash. Missing, unknown and
 *    revoked keys are 401s that say which, because "unauthorized" alone sends
 *    someone to check the wrong thing.
 * 2. **Sets the tenant** to the key's organization, so TenantScope confines
 *    every query — including route-model binding, which is why this runs
 *    ahead of SubstituteBindings (bootstrap/app.php).
 * 3. **Rate-limits per key** and stamps X-RateLimit-* on every response.
 * 4. **Checks the route's scope** (`->scope('tickets:read')` in
 *    routes/api_v1.php). A route that declares none is a 500, never an open
 *    door: forgetting the scope must fail closed.
 * 5. **Confines publishable keys** to routes marked `->publishable()`.
 */
class AuthenticateApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = (string) $request->bearerToken();

        if ($token === '') {
            return ApiError::make(401, 'No API key. Send it as "Authorization: Bearer vy_sk_…". Create one in Studio › Developer.');
        }

        $key = ApiKey::findByToken($token);

        if (! $key) {
            return ApiError::make(401, 'That API key is not valid. Check it was copied whole; keys start with vy_sk_ or vy_pk_.');
        }
        if (! $key->isActive()) {
            return ApiError::make(401, 'That API key was revoked on '.$key->revoked_at->toDateString().'. Create a new one in Studio › Developer.');
        }

        $organization = Organization::find($key->organization_id);
        if (! $organization) {
            return ApiError::make(401, 'The organization this key belongs to no longer exists.');
        }

        $limit = (int) config('public_api.rate_limit', 120);
        $bucket = "api-v1:key:{$key->id}";

        if (RateLimiter::tooManyAttempts($bucket, $limit)) {
            $retry = RateLimiter::availableIn($bucket);

            $tooMany = ApiError::make(429, "Rate limit of {$limit} requests a minute reached. Retry in {$retry} s.");
            $tooMany->headers->set('Retry-After', (string) $retry);

            return $this->withRateHeaders($tooMany, $limit, 0, $retry);
        }
        RateLimiter::hit($bucket, 60);
        $remaining = max(0, $limit - RateLimiter::attempts($bucket));
        $reset = RateLimiter::availableIn($bucket);

        $route = $request->route();
        $action = $route?->getAction() ?? [];

        if (! array_key_exists('api_scope', $action)) {
            // A route in the v1 group that never said who may call it.
            throw new LogicException("Route {$route?->uri()} declares no API scope. Add ->scope('…') or ->scope(null) in routes/api_v1.php.");
        }

        $response = null;
        if ($key->publishable && empty($action['api_publishable'])) {
            $response = ApiError::make(403, 'Publishable keys (vy_pk_) cannot call this route. Use a server key (vy_sk_) from your backend.');
        } elseif ($action['api_scope'] !== null && ! $key->hasScope($action['api_scope'])) {
            $response = ApiError::make(403, "This key lacks the {$action['api_scope']} scope. Add it by creating a key that has it.", 'insufficient_scope', ['required_scope' => $action['api_scope']]);
        }

        if ($response === null) {
            $key->touchLastUsed();
            Organization::setCurrent($organization);
            $request->attributes->set('api_key', $key);

            try {
                $response = $next($request);
            } finally {
                // Octane-safe: nothing about this request may leak into the next.
                Organization::setCurrent(null);
            }
        }

        return $this->withRateHeaders($response, $limit, $remaining, $reset);
    }

    private function withRateHeaders(Response $response, int $limit, int $remaining, int $reset): Response
    {
        $response->headers->add([
            'X-RateLimit-Limit' => (string) $limit,
            'X-RateLimit-Remaining' => (string) $remaining,
            'X-RateLimit-Reset' => (string) (time() + $reset),
        ]);

        // Webhooks for what this request changed are delivered after the
        // response, in the same worker. A known length lets the client finish
        // reading and move on instead of waiting for the connection to close.
        $content = $response->getContent();
        if (is_string($content) && ! $response->headers->has('Transfer-Encoding')) {
            $response->headers->set('Content-Length', (string) strlen($content));
        }

        return $response;
    }
}
