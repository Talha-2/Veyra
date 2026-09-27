<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The machine credential for the agent layer.
 *
 * One shared secret, compared in constant time. There is no user: the caller
 * is the agent layer as a whole, and the tenant it acts for is named in the
 * path (`/organizations/{organization}/…`), never inferred. A route without an
 * organization segment is one that resolves the tenant itself — the inbound
 * call route, which finds it from the dialled number.
 *
 * Runs ahead of route-model binding (see bootstrap/app.php) so that `{call}`,
 * `{skill}` and the rest are resolved inside the named tenant. Without that, a
 * bound model would be looked up with no tenant set and fail closed as a 404
 * on every request.
 */
class AuthenticateAgent
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.agent.secret');
        $given = (string) $request->bearerToken();

        if ($expected === '' || $given === '' || ! hash_equals($expected, $given)) {
            // 401 with a body: the agent logs this verbatim, and "unauthorized"
            // alone sends someone to check the wrong thing.
            return response()->json([
                'error' => 'unauthenticated',
                'message' => $expected === ''
                    ? 'AGENT_SHARED_SECRET is not set on the app layer.'
                    : 'Bearer token does not match AGENT_SHARED_SECRET.',
            ], 401);
        }

        $organizationId = $request->route('organization');

        if ($organizationId !== null) {
            $organization = Organization::find((int) $organizationId);

            if (! $organization) {
                return response()->json(['error' => 'unknown_organization'], 404);
            }

            Organization::setCurrent($organization);
        }

        try {
            return $next($request);
        } finally {
            // Octane-safe: nothing about this request may leak into the next.
            Organization::setCurrent(null);
        }
    }
}
