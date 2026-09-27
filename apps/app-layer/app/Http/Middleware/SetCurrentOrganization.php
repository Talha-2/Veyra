<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guarantees an active organization on every tenant-facing request.
 *
 * TenantScope fails closed when there is no tenant, so without this middleware a
 * signed-in user with no organization selected would see empty lists everywhere
 * rather than an error — the most confusing possible failure. This resolves the
 * tenant up front and, when it cannot, sends them somewhere that can fix it.
 *
 * It also re-checks membership on every request. A session can outlive the
 * access it was granted: if someone's membership is revoked while they are
 * signed in, the stale session id would otherwise keep reading that tenant until
 * the session expired.
 */
class SetCurrentOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        $current = Organization::current();

        // Selected, but no longer theirs — or never was. Drop it and reselect;
        // this is the revoked-membership case.
        if ($current && ! $user->memberships()->where('organization_id', $current->getKey())->exists()) {
            Organization::forget();
            $current = null;
        }

        if (! $current) {
            // The organization they joined first, not the first alphabetically.
            // Alphabetical is arbitrary — it put an owner into an empty second
            // workspace because "Lakeside" sorts before "Northwind". The one
            // someone created or was invited to first is almost always their
            // home; the picker is one click away for the rest.
            $first = $user->organizations()->orderBy('memberships.created_at')->first();

            if (! $first) {
                // No organization at all. Onboarding owns this case; sending
                // them into a surface would only render empty shells.
                return redirect()->route('onboarding.organization');
            }

            $first->switchTo();
        }

        return $next($request);
    }
}
