<?php

namespace App\Observers;

use App\Http\Resources\V1\CallResource;
use App\Http\Resources\V1\ContactResource;
use App\Http\Resources\V1\LeadResource;
use App\Http\Resources\V1\MessageResource;
use App\Http\Resources\V1\TicketResource;
use App\Models\AutomationRun;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Ticket;
use App\Services\Webhooks\WebhookDispatcher;
use BackedEnum;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Turns record changes into webhook events, whichever surface made them —
 * Desk, Studio, the agent contract, the public API or a console command.
 *
 * Observing the models rather than dispatching from each controller is the
 * point: there are a dozen write paths for a ticket and no way to keep a
 * dozen dispatch calls in step. The event is emitted after the transaction
 * commits (a rolled-back ticket must not be announced), and the old values
 * are captured now, while the model still has them.
 *
 * Registered in AppServiceProvider. The catalog is WebhookEndpoint::EVENTS.
 */
class WebhookObserver
{
    /** Fields whose change is news. Ordering (`position`) and UI flags are not. */
    private const WATCHED = [
        Contact::class => ['name', 'phone', 'email', 'company', 'stage', 'source', 'owner_id', 'value'],
        Ticket::class => ['subject', 'body', 'status', 'priority', 'ticket_type_id', 'contact_id', 'conversation_id'],
        Lead::class => ['contact_id', 'pipeline_id', 'source', 'value', 'next_response_at', 'outreach_note'],
    ];

    /** A call in one of these has not ended. */
    private const LIVE_CALL = ['queued', 'ringing', 'in-progress', 'transferred'];

    public function __construct(private WebhookDispatcher $webhooks) {}

    public function created(Model $model): void
    {
        match (true) {
            $model instanceof Contact => $this->emit('contact.created', $model),
            $model instanceof Ticket => $this->emit('ticket.created', $model),
            $model instanceof Lead => $this->emit('lead.created', $model),
            $model instanceof Call => $this->emit('call.started', $model),
            $model instanceof Message => $this->messageCreated($model),
            $model instanceof AutomationRun => $this->runChanged($model, null),
            default => null,
        };
    }

    public function updated(Model $model): void
    {
        if ($model instanceof Lead && $model->wasChanged('pipeline_stage_id')) {
            $this->emit('lead.stage_changed', $model, $this->previous($model, ['pipeline_stage_id']));
        }

        if (isset(self::WATCHED[$model::class])) {
            $changed = array_values(array_intersect(self::WATCHED[$model::class], array_keys($model->getChanges())));
            if ($changed) {
                $this->emit(str(class_basename($model))->lower().'.updated', $model, $this->previous($model, $changed));
            }

            return;
        }

        if ($model instanceof Call && $model->wasChanged('status')
            && in_array($model->getOriginal('status'), self::LIVE_CALL, true)
            && ! in_array($model->status, self::LIVE_CALL, true)) {
            $this->emit('call.ended', $model);
        }

        if ($model instanceof AutomationRun && $model->wasChanged('status')) {
            $this->runChanged($model, $model->getOriginal('status'));
        }
    }

    public function deleted(Model $model): void
    {
        if ($model instanceof Contact) {
            $this->emit('contact.deleted', $model);
        }
    }

    private function messageCreated(Message $message): void
    {
        $this->emit('message.created', $message);

        if ($message->isInbound()) {
            $this->emit('message.received', $message);
            match ($message->channel?->value) {
                'email' => $this->emit('email.received', $message),
                'fax' => $this->emit('fax.received', $message),
                default => null,
            };
        }
    }

    private function runChanged(AutomationRun $run, ?string $from): void
    {
        $event = match ($run->status) {
            'running' => $from !== 'running' ? 'run.started' : null,
            'done' => 'run.completed',
            'error' => 'run.failed',
            default => null,
        };

        if ($event) {
            $this->emit($event, $run);
        }
    }

    private function emit(string $event, Model $model, array $previous = []): void
    {
        $organizationId = $model->getAttribute('organization_id');

        // After commit; immediately when there is no transaction.
        DB::afterCommit(fn () => $this->webhooks->emit($event, $organizationId, fn () => $this->payload($model), $previous));
    }

    /** The same shape the API returns for the object, so one parser serves both. */
    private function payload(Model $model): array
    {
        // Contact, Ticket and Lead soft-delete; a deleted one is described as it was.
        $fresh = fn (array $with) => $model->trashed() ? $model : ($model->fresh($with) ?? $model);

        return match (true) {
            $model instanceof Contact => (new ContactResource($fresh(['tags'])))->toPayload(),
            $model instanceof Ticket => (new TicketResource($fresh(['ticketType', 'assignees', 'tags'])))->toPayload(),
            $model instanceof Lead => (new LeadResource($fresh(['contact', 'stage', 'assignees'])))->toPayload(),
            $model instanceof Call => (new CallResource($model->fresh(['transcript']) ?? $model))->toPayload(),
            $model instanceof Message => (new MessageResource($model))->toPayload(),
            $model instanceof AutomationRun => [
                'id' => $model->id, 'object' => 'run', 'automation_id' => $model->automation_id,
                'trigger' => $model->trigger, 'status' => $model->status,
                'result' => $model->result, 'error' => $model->error,
                'started_at' => $model->started_at?->utc()->toIso8601ZuluString(),
                'ended_at' => $model->ended_at?->utc()->toIso8601ZuluString(),
                'created_at' => $model->created_at?->utc()->toIso8601ZuluString(),
                'updated_at' => $model->updated_at?->utc()->toIso8601ZuluString(),
            ],
            default => ['id' => $model->getKey()],
        };
    }

    /** Old values of the changed fields, in the API's formats. */
    private function previous(Model $model, array $keys): array
    {
        $out = [];
        foreach ($keys as $key) {
            $value = $model->getOriginal($key);
            $out[$key] = match (true) {
                $value instanceof BackedEnum => $value->value,
                $value instanceof DateTimeInterface => Carbon::instance($value)->utc()->toIso8601ZuluString(),
                default => $value,
            };
        }

        return $out;
    }
}
