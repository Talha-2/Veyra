<?php

namespace App\Providers;

use App\Services\Agent\AgentGateway;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(AgentGateway::class);
    }

    public function boot(): void
    {
        // The only API client is the agent layer, and one live call is many
        // requests: transcript pushes, tool-call records, delegations. The
        // framework default of 60/min per IP would throttle a single busy
        // call. Keyed by tenant so one organization's traffic cannot starve
        // another's.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(1200)
            ->by($request->route('organization') ?? $request->ip()));
    }
}
