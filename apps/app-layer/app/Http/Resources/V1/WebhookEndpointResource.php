<?php

namespace App\Http\Resources\V1;

use App\Models\WebhookEndpoint;
use Illuminate\Http\Request;

/** @mixin WebhookEndpoint — `secret` only in the response that created it. */
class WebhookEndpointResource extends ApiResource
{
    private ?string $secret = null;

    public function withSecret(string $secret): static
    {
        $this->secret = $secret;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'webhook_endpoint',
            'url' => $this->url,
            'events' => array_values($this->events ?? []),
            'enabled' => (bool) $this->enabled,
            'disabled_reason' => $this->disabled_reason,
            'consecutive_failures' => (int) $this->consecutive_failures,
            'last_delivered_at' => self::time($this->last_delivered_at),
            ...($this->secret !== null ? ['secret' => $this->secret] : []),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
