<?php

use App\Http\Middleware\AuthenticateAgent;
use App\Http\Middleware\EnsureSurfaceAccess;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetCurrentOrganization;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        // The agent-layer contract. Stateless, secret-authenticated, versioned
        // in the path. See docs/agent-contract.md.
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // The two product surfaces, registered as two independent route
            // trees. Each file in routes/desk/ and routes/studio/ inherits its
            // surface's prefix, route-name prefix and access gate, so an
            // individual route file cannot accidentally be reachable from the
            // wrong surface or without its gate.
            foreach (['desk', 'studio'] as $surface) {
                Route::middleware(['web', 'auth', 'tenant', "surface:{$surface}"])
                    ->prefix($surface)
                    ->name("{$surface}.")
                    ->group(function () use ($surface) {
                        foreach (glob(__DIR__."/../routes/{$surface}/*.php") as $file) {
                            require $file;
                        }
                    });
            }
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind a hosting proxy (Render, a load balancer) the request reaches
        // PHP as plain http. Trusting the proxy's X-Forwarded-* headers is what
        // makes url() and the Vite asset tags come out as https; without it the
        // browser blocks every script and stylesheet as mixed content.
        $middleware->trustProxies(at: '*');

        $middleware->web(append: [
            AddLinkHeadersForPreloadedAssets::class,
            HandleInertiaRequests::class,
        ]);

        $middleware->alias([
            'tenant' => SetCurrentOrganization::class,
            'surface' => EnsureSurfaceAccess::class,
            'agent.auth' => AuthenticateAgent::class,
        ]);

        // Implicit route-model binding runs in SubstituteBindings, which sits
        // in the `web` group — *before* the route's own `tenant` middleware in
        // declaration order. On the first request after sign-in the session
        // has no tenant yet, so a bound `Document $document` would be resolved
        // with no tenant set: fails closed (a 404 on a deep link) over HTTP,
        // and reads across tenants in test context. Ordering the tenant
        // middleware ahead of binding is what makes `{document}` mean "this
        // organization's document" on every request, including the first.
        // Each call takes one class. Surface goes in first so that when
        // tenant is then prepended before it, the order is tenant → surface
        // → bindings.
        $middleware->prependToPriorityList(SubstituteBindings::class, EnsureSurfaceAccess::class);
        $middleware->prependToPriorityList(EnsureSurfaceAccess::class, SetCurrentOrganization::class);
        // Same rule for the machine credential: the agent names the tenant in
        // the path, and `{call}` must resolve inside that tenant.
        $middleware->prependToPriorityList(SubstituteBindings::class, AuthenticateAgent::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
