<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['url', 'secret', 'events', 'enabled'])]
class WebhookEndpoint extends Model
{
    use BelongsToTenant;

    /** The catalog. Ported from the old server's event bus so it cannot drift from what is emitted. */
    public const EVENTS = [
        'call.started', 'call.ended', 'message.received', 'email.received', 'fax.received',
        'lead.created', 'ticket.created', 'run.started', 'run.completed', 'run.failed',
    ];

    protected function casts(): array
    {
        return ['secret' => 'encrypted', 'events' => 'array', 'enabled' => 'boolean', 'last_delivered_at' => 'datetime'];
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class)->latest();
    }

    public function subscribesTo(string $event): bool
    {
        return in_array('*', $this->events, true) || in_array($event, $this->events, true);
    }
}
