<?php

/*
|--------------------------------------------------------------------------
| The public REST API (/api/v1) and outbound webhooks
|--------------------------------------------------------------------------
|
| Not the agent contract — that is /api/agent/v1 and config/services.php.
|
*/

return [
    // Requests per minute, per key.
    'rate_limit' => (int) env('API_RATE_LIMIT', 120),

    // List endpoints: default and largest page.
    'page_size' => 25,
    'max_page_size' => 100,

    'webhooks' => [
        // There is no queue worker in production, so deliveries run after the
        // response inside the same PHP worker. Keep them short.
        'timeout' => (int) env('WEBHOOK_TIMEOUT', 5),
        'connect_timeout' => (int) env('WEBHOOK_CONNECT_TIMEOUT', 3),

        // Consecutive failed deliveries before an endpoint is turned off.
        'disable_after' => (int) env('WEBHOOK_DISABLE_AFTER', 10),

        // Deliver to private, loopback and link-local addresses. Off in
        // production so an endpoint URL cannot be used to probe the internal
        // network; on locally so a listener on this machine can be tested.
        'allow_private_urls' => (bool) env('WEBHOOK_ALLOW_PRIVATE_URLS', env('APP_ENV') === 'local'),
    ],
];
