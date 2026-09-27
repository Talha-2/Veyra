<?php

namespace App\Http\ViewModels\Desk;

use App\Models\Activity;
use App\Models\Call;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;

/**
 * One open thread: its timeline, its contact, and what the agent did on it.
 *
 * The timeline interleaves messages and calls, because to an operator they are
 * one conversation — the customer texted, then rang, then texted again. Keeping
 * them as separate lists would push that reconstruction onto the reader.
 */
class ThreadViewModel
{
    public function __construct(
        private readonly Conversation $conversation,
        private readonly User $viewer,
    ) {}

    public function toArray(): array
    {
        $conversation = $this->conversation->load([
            'contact.tags',
            'contact.tickets' => fn ($q) => $q->unresolved()->latest()->limit(5),
            'identifier',
            'tags',
            'assignees:id,name',
            'messages.sentBy:id,name',
            'messages.attachments',
            'messages.pinnedBy:id',
            'messages.feedback',
            'calls.transcript',
            'calls.delegations.toolCalls.action:id,slug,name,is_durable_write,is_idempotent',
            'notes.author:id,name',
            'reminders' => fn ($q) => $q->outstanding()->orderBy('due_at'),
            'tickets' => fn ($q) => $q->latest()->limit(10),
            'activities.user:id,name',
        ]);

        $identifier = $conversation->identifier;

        return [
            'id' => $conversation->id,
            'title' => $conversation->title(),
            'channel' => $conversation->channel->value,
            'channel_label' => $conversation->channel->label(),
            'can_compose' => $conversation->channel->isComposable(),
            'status' => $conversation->status->value,
            'snoozed_until' => $conversation->snoozed_until?->toIso8601String(),
            'is_favorite' => $conversation->is_favorite,
            'subject' => $conversation->subject,
            'tags' => $conversation->tags->pluck('name')->all(),
            'identifier' => $identifier ? [
                'id' => $identifier->id,
                'value' => $identifier->value,
                'type' => $identifier->type->value,
                'blocked' => $identifier->isBlocked(),
                'dnd' => $identifier->isDnd(),
                'dnd_until' => $identifier->dnd_until?->toIso8601String(),
            ] : null,
            'assignees' => $conversation->assignees->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->all(),
            'contact' => $this->contact(),
            'timeline' => $this->timeline(),
            'pinned' => $conversation->messages
                ->filter(fn (Message $m) => $m->pinnedBy->contains('id', $this->viewer->id))
                ->map(fn (Message $m) => ['id' => $m->id, 'body' => str($m->body ?? '')->limit(140)->value(), 'at' => $m->created_at?->toIso8601String()])
                ->values()->all(),
            // The details sidebar's tabs, each with a count so the tab strip
            // can say what is there before it is opened.
            'details' => [
                'notes' => $conversation->notes->map(fn ($n) => [
                    'id' => $n->id, 'body' => $n->body, 'author' => $n->author?->name ?? 'Agent', 'at' => $n->created_at?->toIso8601String(),
                ])->all(),
                'reminders' => $conversation->reminders->map(fn ($r) => [
                    'id' => $r->id, 'text' => $r->text, 'due_at' => $r->due_at?->toIso8601String(), 'overdue' => $r->due_at?->isPast() ?? false,
                    // When it was set, so the thread can place it in the timeline.
                    'at' => $r->created_at?->toIso8601String(),
                ])->all(),
                'tickets' => $conversation->tickets->map(fn ($t) => [
                    'id' => $t->id, 'reference' => $t->reference(), 'subject' => $t->subject,
                    'at' => $t->created_at?->toIso8601String(),
                    'status' => $t->status->value, 'status_label' => $t->status->label(), 'status_tone' => $t->status->tone(),
                    'priority' => $t->priority->value, 'priority_tone' => $t->priority->tone(), 'created_by_agent' => $t->created_by_agent,
                ])->all(),
                'activities' => $conversation->activities->take(30)->map(fn (Activity $a) => [
                    'id' => $a->id, 'actor' => $a->actorLabel(), 'is_agent' => $a->actor === 'agent',
                    'type' => $a->type, 'description' => $a->description, 'at' => $a->created_at?->toIso8601String(),
                ])->all(),
                'attachments' => $conversation->messages->flatMap(fn (Message $m) => $m->attachments)->map(fn ($a) => [
                    'id' => $a->id, 'filename' => $a->filename, 'size_bytes' => $a->size_bytes, 'mime' => $a->mime,
                ])->values()->all(),
            ],
        ];
    }

    private function contact(): ?array
    {
        $contact = $this->conversation->contact;

        if (! $contact) {
            return null;
        }

        return [
            'id' => $contact->id,
            'name' => $contact->displayName(),
            'initials' => $contact->initials(),
            'phone' => $contact->phone,
            'email' => $contact->email,
            'company' => $contact->company,
            'is_favorite' => $contact->is_favorite,
            'stage' => $contact->stage->value,
            'stage_label' => $contact->stage->label(),
            'stage_tone' => $contact->stage->tone(),
            'tags' => $contact->tags->map(fn ($t) => ['name' => $t->name, 'color' => $t->color])->all(),
            'open_tickets' => $contact->tickets->map(fn ($t) => [
                'id' => $t->id, 'reference' => $t->reference(), 'subject' => $t->subject,
                'status' => $t->status->value, 'priority' => $t->priority->value,
                'priority_tone' => $t->priority->tone(), 'created_by_agent' => $t->created_by_agent,
            ])->all(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function timeline(): array
    {
        $messages = $this->conversation->messages->map(fn (Message $m) => [
            'kind' => 'message',
            'id' => $m->id,
            'at' => $m->created_at?->toIso8601String(),
            'direction' => $m->direction,
            'from_agent' => $m->from_agent,
            'author' => $m->authorLabel(),
            'body' => $m->body,
            'status' => $m->status,
            'pinned' => $m->pinnedBy->contains('id', $this->viewer->id),
            'my_feedback' => $m->feedback->firstWhere('user_id', $this->viewer->id)?->rating,
            'feedback_counts' => [
                'up' => $m->feedback->where('rating', 'up')->count(),
                'down' => $m->feedback->where('rating', 'down')->count(),
            ],
            'attachments' => $m->attachments->map(fn ($a) => [
                'id' => $a->id, 'filename' => $a->filename, 'size_bytes' => $a->size_bytes,
            ])->all(),
        ]);

        $calls = $this->conversation->calls->map(fn (Call $c) => [
            'kind' => 'call',
            'id' => $c->id,
            'at' => $c->created_at?->toIso8601String(),
            'direction' => $c->direction,
            'status' => $c->status,
            'duration' => $c->formattedDuration(),
            'language' => $c->language,
            'recording_url' => $c->recording_url,
            'transcript' => $c->transcript?->items,
            'p95_ms' => $c->transcript?->metrics['voice_to_voice']['p95'] ?? null,
            'work' => $this->work($c),
        ]);

        return $messages->concat($calls)->sortBy('at')->values()->all();
    }

    private function work(Call $call): array
    {
        return $call->delegations->map(fn ($d) => [
            'sequence' => $d->sequence,
            'status' => $d->status,
            'failed' => $d->failed(),
            'is_finalization' => $d->is_finalization,
            'duration_ms' => $d->duration_ms,
            'reply' => $d->reply,
            'error' => $d->error,
            'tool_calls' => $d->toolCalls->map(fn ($t) => [
                'id' => $t->id,
                'action' => $t->action?->name ?? $t->action_slug,
                'slug' => $t->action_slug,
                'status' => $t->status->value,
                'status_label' => $t->status->label(),
                'tone' => $t->status->tone(),
                'duration_ms' => $t->duration_ms,
                'error' => $t->error,
                'durable' => (bool) $t->action?->is_durable_write,
                'needs_reconciliation' => $t->needsReconciliation(),
            ])->all(),
        ])->all();
    }
}
