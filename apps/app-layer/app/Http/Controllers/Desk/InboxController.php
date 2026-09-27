<?php

namespace App\Http\Controllers\Desk;

use App\Enums\ConversationStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Desk\SendMessageRequest;
use App\Http\ViewModels\Desk\InboxViewModel;
use App\Http\ViewModels\Desk\ThreadViewModel;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InboxController extends Controller
{
    public function index(Request $request, ?Conversation $conversation = null): Response
    {
        $inbox = new InboxViewModel($request, $request->user());

        return Inertia::render('desk/inbox', [
            ...$inbox->toArray(),
            // The thread is a separate prop so selecting a conversation is a
            // partial reload — the list and the rail counts do not re-query
            // every time someone clicks a row.
            'thread' => $conversation?->exists
                ? (new ThreadViewModel($conversation, $request->user()))->toArray()
                : null,
        ]);
    }

    public function show(Request $request, Conversation $conversation): Response
    {
        $conversation->markRead();

        return $this->index($request, $conversation);
    }

    public function send(SendMessageRequest $request, Conversation $conversation): RedirectResponse
    {
        $message = new Message($request->validated());
        $message->conversation_id = $conversation->getKey();
        $message->channel = $conversation->channel;
        $message->direction = 'outbound';
        $message->status = 'queued';
        $message->sent_by_id = $request->user()->getKey();
        // A human wrote this. The distinction matters in the thread: an operator
        // must never mistake their colleague's promise for the agent's.
        $message->from_agent = false;
        $message->save();

        $conversation->touchLastMessage($message);

        // Reopening on reply is deliberate. Someone answering a closed thread
        // has resumed the conversation, and leaving it closed means the
        // customer's next reply lands nowhere anyone is looking.
        if ($conversation->status === ConversationStatus::Closed) {
            $conversation->update(['status' => ConversationStatus::Open]);
        }

        return back();
    }

    public function update(Request $request, Conversation $conversation): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'string', 'in:open,snoozed,closed'],
            'is_favorite' => ['sometimes', 'boolean'],
            // A snooze without a wake time would hide the thread for good: the
            // inbox scope only brings a snoozed conversation back once
            // snoozed_until has passed.
            'snoozed_until' => ['nullable', 'required_if:status,snoozed', 'date', 'after:now'],
            'assignee_ids' => ['sometimes', 'array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $conversation->fill(collect($validated)->only('status')->all());

        // Neither column is in #[Fillable], and fill() drops unknown keys
        // silently, so these are set explicitly.
        if (array_key_exists('is_favorite', $validated)) {
            $conversation->forceFill(['is_favorite' => $validated['is_favorite']]);
        }
        if (array_key_exists('status', $validated)) {
            $conversation->forceFill([
                'snoozed_until' => $validated['status'] === 'snoozed' ? $validated['snoozed_until'] : null,
            ]);
        }

        $conversation->save();

        if (array_key_exists('assignee_ids', $validated)) {
            $conversation->assignees()->sync($validated['assignee_ids']);
        }

        return back();
    }
}
