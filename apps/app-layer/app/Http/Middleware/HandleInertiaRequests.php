<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Middleware;

/**
 * What every page gets without asking.
 *
 * **Every tenant-dependent prop here is a closure, and that is load-bearing.**
 * Inertia calls share() on the way *in* (Middleware::handle, before
 * `$next($request)`), and this middleware lives in the `web` group — so it runs
 * *before* the route middleware that resolves the tenant. Computing a value
 * eagerly here reads the tenant before SetCurrentOrganization has set it, which
 * yields null on the first request after sign-in and empty surfaces in tests.
 * Closures are resolved when the response renders, by which point every route
 * middleware has run.
 *
 * Kept deliberately small otherwise: shared props are serialized on every
 * Inertia response, including partial reloads. Page data belongs in the
 * controller or a ViewModel.
 */
class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function share(Request $request): array
    {
        return [
            ...parent::share($request),

            'auth' => fn () => [
                'user' => $request->user() ? [
                    'id' => $request->user()->id,
                    'name' => $request->user()->name,
                    'email' => $request->user()->email,
                ] : null,
            ],

            'tenant' => function () use ($request) {
                if (! $request->user() || ! ($organization = Organization::current())) {
                    return null;
                }

                return [
                    'current' => [
                        'id' => $organization->id,
                        'name' => $organization->name,
                        'slug' => $organization->slug,
                    ],
                ];
            },

            // Only the organization picker needs this, and only once opened, so
            // it is an optional prop fetched on request rather than a query on
            // every navigation.
            //
            // Top-level rather than nested under `tenant` on purpose: a partial
            // reload selects props by key, and the client asks for exactly this
            // one — `router.reload({ only: ['organizations'] })`.
            'organizations' => Inertia::optional(
                fn () => $request->user()?->organizations()
                    ->orderBy('name')
                    ->get(['organizations.id', 'organizations.name', 'organizations.slug'])
            ),

            // Drives the app switcher, and nothing else. A surface the user
            // cannot open must not appear in either product's navigation, so
            // this is the one list the client is allowed to render from.
            'surfaces' => fn () => array_map(fn ($surface) => [
                'key' => $surface->value,
                'label' => $surface->label(),
                'tagline' => $surface->tagline(),
                'home' => $surface->home(),
            ], $request->user()?->accessibleSurfaces() ?? []),

            'flash' => fn () => [
                'success' => $request->session()->get('success'),
                'warning' => $request->session()->get('warning'),
                'error' => $request->session()->get('error'),
                // One-shot secrets and test results. Shown once, then gone.
                'new_key' => $request->session()->get('new_key'),
                'new_webhook_secret' => $request->session()->get('new_webhook_secret'),
                'test_result' => $request->session()->get('test_result'),
                'skill_test' => $request->session()->get('skill_test'),
            ],
        ];
    }
}
