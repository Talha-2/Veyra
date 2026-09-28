<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // Agent-side providers. Presence of a key switches a Studio page from its
    // curated stub to the live catalog; the page says which mode it is in.
    'composio' => ['key' => env('COMPOSIO_API_KEY')],
    'elevenlabs' => ['key' => env('ELEVENLABS_API_KEY')],
    'cartesia' => ['key' => env('CARTESIA_API_KEY')],
    // Used by Composio for Google toolkits whose managed OAuth is not offered:
    // the org's own OAuth app.
    'google' => ['client_id' => env('GOOGLE_CLIENT_ID'), 'client_secret' => env('GOOGLE_CLIENT_SECRET')],

    // The agent layer. One shared secret authenticates both directions of the
    // contract: the agent sends it to /api/agent/v1/*, and AgentGateway sends
    // it to the agent's gateway. `url` unset means "no agent layer": Studio
    // pages that need one say so instead of pretending.
    // LiveKit: the browser joins a room with a token signed here, and the
    // voice worker (same agent as phone calls) answers in it. Studio's Talk.
    'livekit' => [
        'url' => env('LIVEKIT_URL'),
        'key' => env('LIVEKIT_API_KEY'),
        'secret' => env('LIVEKIT_API_SECRET'),
    ],

    'agent' => [
        'url' => env('AGENT_GATEWAY_URL'),
        'secret' => env('AGENT_SHARED_SECRET'),
        'timeout' => (int) env('AGENT_GATEWAY_TIMEOUT', 10),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
