<?php

namespace App\Providers;

use App\Models\AutomationRun;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Ticket;
use App\Observers\WebhookObserver;
use App\Services\Agent\AgentGateway;
use App\Services\Webhooks\WebhookDispatcher;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(AgentGateway::class);
        $this->app->singleton(WebhookDispatcher::class);
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

        // Agent chat sends (routes/api_v1.php): 30 a minute per key and
        // session, so one busy visitor cannot use up a backend's allowance for
        // every other session, and nothing is shared with other throttles.
        RateLimiter::for('chat-send', fn (Request $request) => Limit::perMinute(30)
            ->by('chat-send:'.($request->attributes->get('api_key')?->getKey() ?? $request->ip()).':'.$request->route('session')));

        // Public API (routes/api_v1.php): every route states the scope it
        // needs — `null` for "any valid key" — and AuthenticateApiKey refuses
        // a route that states none. `publishable()` opens a route to vy_pk_
        // keys, which are otherwise refused everywhere.
        Route::macro('apiScope', function (?string $scope) {
            /** @var Route $this */
            $this->action['api_scope'] = $scope;

            return $this;
        });
        Route::macro('publishable', function () {
            /** @var Route $this */
            $this->action['api_publishable'] = true;

            return $this;
        });

        // Outbound webhooks fire from the models, so every write path —
        // Desk, Studio, the agent contract, the public API — emits them.
        foreach ([Contact::class, Ticket::class, Lead::class, Call::class, Message::class, AutomationRun::class] as $model) {
            $model::observe(WebhookObserver::class);
        }
    }
}
