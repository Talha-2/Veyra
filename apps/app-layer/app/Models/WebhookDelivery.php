<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One attempt to deliver one event to one endpoint. A retry is a second row. */
#[Fillable(['webhook_endpoint_id', 'event', 'payload', 'response_status', 'response_body', 'attempt', 'duration_ms', 'status'])]
class WebhookDelivery extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }

    public function endpoint(): BelongsTo
    {
        return $this->belongsTo(WebhookEndpoint::class, 'webhook_endpoint_id');
    }
}
