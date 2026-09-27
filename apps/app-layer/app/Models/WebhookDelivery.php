<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['webhook_endpoint_id', 'event', 'payload', 'response_status', 'response_body', 'attempt', 'status'])]
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
