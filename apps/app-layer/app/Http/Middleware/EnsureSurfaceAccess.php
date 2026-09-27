<?php

namespace App\Http\Middleware;

use App\Enums\Surface;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards one product surface. Registered as `surface:desk` / `surface:studio`.
 *
 * It **redirects rather than 403s**, which is the whole reason it exists instead
 * of Laravel's `can:` middleware. A Desk-only operator who follows a stale
 * Studio link has done nothing wrong, and a permission error is a dead end for
 * them; the other surface is where they were going to end up anyway.
 *
 * A 403 is still the right answer for a non-GET request — silently redirecting a
 * form post would look like it succeeded.
 */
class EnsureSurfaceAccess
{
    public function handle(Request $request, Closure $next, string $surface): Response
    {
        $target = Surface::from($surface);
        $user = $request->user();

        if ($user?->canAccessSurface($target)) {
            return $next($request);
        }

        if (! $request->isMethod('GET')) {
            abort(403, "You do not have access to {$target->label()}.");
        }

        $fallback = $user?->landingSurface();

        // Has the other surface — send them there and say why, so the
        // redirect does not look like the link was broken.
        if ($fallback && $fallback !== $target) {
            return redirect($fallback->home())
                ->with('warning', "You do not have access to {$target->label()}.");
        }

        // Signed in, in an organization, but granted no surface at all. Only an
        // admin can fix that, so say so rather than bouncing them in a loop.
        abort(403, 'Your account has no product access in this organization. Ask an owner or admin to grant it.');
    }
}
