<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Somewhere outside Veyra that wants to hear about what happens inside it.
 *
 * Deliveries are made by App\Services\Webhooks\WebhookDispatcher, after the
 * response that caused them, and every attempt is a WebhookDelivery row.
 */
#[Fillable(['url', 'secret', 'events', 'enabled'])]
class WebhookEndpoint extends Model
{
    use BelongsToTenant;

    /**
     * The catalog, and exactly what is emitted — each one is fired by
     * App\Observers\WebhookObserver when the matching record changes,
     * whichever surface or API changed it.
     */
    public const EVENT_DESCRIPTIONS = [
        'contact.created' => 'A contact was created — by an operator, the agent, a lead form or the API.',
        'contact.updated' => 'A contact\'s name, phone, email, company, stage, source, owner or value changed.',
        'contact.deleted' => 'A contact was deleted.',
        'message.created' => 'Any new message on a conversation, inbound or outbound.',
        'message.received' => 'An inbound message arrived, on any channel.',
        'email.received' => 'An inbound email arrived. Also sent as message.received.',
        'fax.received' => 'An inbound fax arrived. Also sent as message.received.',
        'call.started' => 'A call was created — ringing inbound, or placed outbound.',
        'call.ended' => 'A call finished: completed, failed, busy or unanswered.',
        'ticket.created' => 'A ticket was raised — by an operator, the agent or the API.',
        'ticket.updated' => 'A ticket\'s subject, body, status, priority, type or contact changed.',
        'lead.created' => 'A contact was added to a pipeline.',
        'lead.updated' => 'A lead\'s value, source, follow-up date or note changed.',
        'lead.stage_changed' => 'A lead moved to another stage.',
        'run.started' => 'An automation run started.',
        'run.completed' => 'An automation run finished successfully.',
        'run.failed' => 'An automation run failed.',
    ];

    public const EVENTS = [
        'contact.created', 'contact.updated', 'contact.deleted',
        'message.created', 'message.received', 'email.received', 'fax.received',
        'call.started', 'call.ended',
        'ticket.created', 'ticket.updated',
        'lead.created', 'lead.updated', 'lead.stage_changed',
        'run.started', 'run.completed', 'run.failed',
    ];

    protected function casts(): array
    {
        return [
            'secret' => 'encrypted', 'events' => 'array', 'enabled' => 'boolean',
            'last_delivered_at' => 'datetime', 'disabled_at' => 'datetime',
        ];
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class)->latest('id');
    }

    public function subscribesTo(string $event): bool
    {
        return in_array('*', $this->events, true) || in_array($event, $this->events, true);
    }

    /** How many failures in a row turn an endpoint off. */
    public static function disableAfter(): int
    {
        return (int) config('public_api.webhooks.disable_after', 10);
    }

    public function recordSuccess(): void
    {
        $this->forceFill(['last_delivered_at' => now(), 'consecutive_failures' => 0])->saveQuietly();
    }

    /**
     * One more failure; the one that reaches the limit turns the endpoint off
     * and says why, so it does not keep costing a request every event.
     */
    public function recordFailure(): void
    {
        $failures = $this->consecutive_failures + 1;
        $attributes = ['consecutive_failures' => $failures];

        if ($this->enabled && $failures >= static::disableAfter()) {
            $attributes += [
                'enabled' => false,
                'disabled_at' => now(),
                'disabled_reason' => "Turned off after {$failures} failed deliveries in a row.",
            ];
        }

        $this->forceFill($attributes)->saveQuietly();
    }

    /** Turning an endpoint back on is a fresh start. */
    public function setEnabled(bool $enabled): void
    {
        $this->forceFill($enabled
            ? ['enabled' => true, 'disabled_at' => null, 'disabled_reason' => null, 'consecutive_failures' => 0]
            : ['enabled' => false, 'disabled_at' => now(), 'disabled_reason' => null]
        )->save();
    }
}
