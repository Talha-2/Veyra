<?php

namespace App\Http\Controllers\Desk;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Enums\IdentifierType;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Message;
use App\Models\MessageFeedback;
use App\Models\SavedView;
use App\Models\Ticket;
use App\Models\TicketType;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Everything the inbox does besides reading and replying.
 *
 * Split from InboxController so that file stays about the two hot paths — the
 * list and the thread — and this one holds the long tail: compositions,
 * bulk operations, pins, feedback, block/DND, tags, saved views.
 */
class InboxActionController extends Controller
{
    // ── Compositions: things you create *on* a conversation ─────────────

    public function composeNote(Request $request, Conversation $conversation): RedirectResponse
    {
        $validated = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $conversation->notes()->create([
            'organization_id' => $conversation->organization_id,
            'body' => $validated['body'],
            'author_id' => $request->user()->getKey(),
        ]);
        Activity::log($conversation, 'note_added', 'Added a note', $request->user());

        return back();
    }

    public function composeReminder(Request $request, Conversation $conversation): RedirectResponse
    {
        $validated = $request->validate([
            'text' => ['required', 'string', 'max:500'],
            'due_at' => ['required', 'date', 'after:now'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $conversation->reminders()->create([
            'organization_id' => $conversation->organization_id,
            'text' => $validated['text'],
            'due_at' => $validated['due_at'],
            'user_id' => $validated['user_id'] ?? $request->user()->getKey(),
        ]);
        Activity::log($conversation, 'reminder_set', "Reminder set for {$validated['due_at']}", $request->user());

        return back();
    }

    public function composeTicket(Request $request, Conversation $conversation): RedirectResponse
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['nullable', 'string', 'max:10000'],
            'priority' => ['required', Rule::enum(TicketPriority::class)],
            'ticket_type_id' => ['nullable', 'integer', 'exists:ticket_types,id'],
            'assignee_ids' => ['array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $type = isset($validated['ticket_type_id']) ? TicketType::find($validated['ticket_type_id']) : null;

        $ticket = Ticket::create([
            'subject' => $validated['subject'],
            'body' => $validated['body'] ?? null,
            'priority' => $validated['priority'],
            'ticket_type_id' => $type?->id,
            'status' => TicketStatus::Open,
            'contact_id' => $conversation->contact_id,
            'conversation_id' => $conversation->id,
            'channel' => $conversation->channel->value,
            'created_by_id' => $request->user()->getKey(),
        ]);

        // Explicit assignees win; otherwise the type's defaults, so a ticket
        // of a configured type lands with the right people untouched.
        $assignees = $validated['assignee_ids'] ?: ($type?->default_assignee_ids ?? []);
        $ticket->assignees()->sync($assignees);

        Activity::log($conversation, 'ticket_raised', "Raised ticket {$ticket->reference()}", $request->user());
        Activity::log($ticket, 'created', 'Ticket created from conversation', $request->user());

        return back()->with('success', "Ticket {$ticket->reference()} created.");
    }

    // ── New conversation from scratch (Z360: inbox/new-conversation) ────

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'channel' => ['required', Rule::in(['sms', 'email'])],
            'to' => ['required', 'string', 'max:255'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:10000'],
        ]);

        $channel = Channel::from($validated['channel']);
        $identifier = Identifier::resolve($channel->identifierType(), $validated['to']);

        if ($identifier->isBlocked()) {
            return back()->withErrors(['to' => 'This address is blocked. Unblock it before messaging.']);
        }

        $conversation = Conversation::firstOrCreate(
            ['identifier_id' => $identifier->id, 'channel' => $channel],
            ['contact_id' => $identifier->contact_id, 'status' => ConversationStatus::Open, 'subject' => $validated['subject'] ?? null],
        );

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'channel' => $channel,
            'direction' => 'outbound',
            'status' => 'queued',
            'sent_by_id' => $request->user()->getKey(),
            'from_agent' => false,
            'to_address' => $identifier->value,
            'body' => $validated['body'],
        ]);
        $conversation->touchLastMessage($message);
        $conversation->assignees()->syncWithoutDetaching([$request->user()->getKey()]);

        return redirect()->route('desk.inbox.show', $conversation);
    }

    // ── Bulk (Z360: inbox/bulk-operators) ───────────────────────────────

    public function bulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'max:200'],
            'ids.*' => ['integer'],
            'operation' => ['required', Rule::in(['close', 'reopen', 'favorite', 'unfavorite', 'assign', 'unassign', 'read'])],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        // Tenant-scoped query: ids from another organization simply do not
        // match, so a crafted request cannot reach across.
        $conversations = Conversation::query()->whereIn('id', $validated['ids'])->get();

        foreach ($conversations as $c) {
            match ($validated['operation']) {
                'close' => $c->update(['status' => ConversationStatus::Closed]),
                'reopen' => $c->update(['status' => ConversationStatus::Open]),
                'favorite' => $c->update(['is_favorite' => true]),
                'unfavorite' => $c->update(['is_favorite' => false]),
                'assign' => $c->assignees()->syncWithoutDetaching([$validated['user_id'] ?? $request->user()->getKey()]),
                'unassign' => $c->assignees()->detach(),
                'read' => $c->markRead(),
            };
        }

        return back()->with('success', count($conversations).' conversations updated.');
    }

    // ── Per-conversation toggles ────────────────────────────────────────

    public function favorite(Conversation $conversation): RedirectResponse
    {
        $conversation->update(['is_favorite' => ! $conversation->is_favorite]);

        return back();
    }

    public function tag(Request $request, Conversation $conversation): RedirectResponse
    {
        $validated = $request->validate(['tags' => ['array', 'max:20'], 'tags.*' => ['string', 'max:40']]);
        $conversation->syncTags($validated['tags'] ?? []);

        return back();
    }

    public function assign(Request $request, Conversation $conversation): RedirectResponse
    {
        $validated = $request->validate([
            'assignee_ids' => ['array'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $before = $conversation->assignees()->pluck('users.id')->all();
        $conversation->assignees()->sync($validated['assignee_ids'] ?? []);

        // A transfer note is how the next person knows why they got it.
        if (! empty($validated['note'])) {
            $conversation->notes()->create([
                'organization_id' => $conversation->organization_id,
                'body' => $validated['note'],
                'author_id' => $request->user()->getKey(),
            ]);
        }

        Activity::log($conversation, 'assigned', 'Assignment changed', $request->user(), [
            'from' => $before, 'to' => $validated['assignee_ids'] ?? [],
        ]);

        return back();
    }

    // ── Identifier-level: block / do-not-disturb ────────────────────────

    public function toggleBlock(Request $request, Identifier $identifier): RedirectResponse
    {
        $identifier->update(['blocked_at' => $identifier->isBlocked() ? null : now()]);

        foreach ($identifier->conversations as $c) {
            Activity::log($c, $identifier->isBlocked() ? 'blocked' : 'unblocked',
                $identifier->isBlocked() ? "Blocked {$identifier->value}" : "Unblocked {$identifier->value}", $request->user());
        }

        return back();
    }

    public function toggleDnd(Request $request, Identifier $identifier): RedirectResponse
    {
        $validated = $request->validate(['days' => ['nullable', 'integer', 'between:1,365']]);

        $identifier->update([
            'dnd_until' => $identifier->isDnd() ? null : now()->addDays($validated['days'] ?? 30),
        ]);

        return back();
    }

    // ── Message-level ───────────────────────────────────────────────────

    public function pin(Request $request, Message $message): RedirectResponse
    {
        $message->pinnedBy()->toggle($request->user()->getKey());

        return back();
    }

    public function feedback(Request $request, Message $message): RedirectResponse
    {
        $validated = $request->validate([
            'rating' => ['required', Rule::in(['up', 'down'])],
            'comment' => ['nullable', 'string', 'max:1000'],
        ]);

        // Only agent messages carry feedback; rating a colleague is a
        // different product.
        abort_unless($message->from_agent, 422, 'Feedback is for agent messages.');

        MessageFeedback::updateOrCreate(
            ['message_id' => $message->id, 'user_id' => $request->user()->getKey()],
            ['rating' => $validated['rating'], 'comment' => $validated['comment'] ?? null],
        );

        return back();
    }

    // ── Saved views ─────────────────────────────────────────────────────

    public function storeView(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'surface' => ['required', Rule::in(['inbox', 'tickets', 'contacts', 'leads'])],
            'name' => ['required', 'string', 'max:60'],
            'filters' => ['required', 'array'],
            'sort' => ['nullable', 'array'],
            'is_shared' => ['boolean'],
        ]);

        SavedView::create([
            ...$validated,
            'user_id' => $request->user()->getKey(),
            'position' => SavedView::query()->where('surface', $validated['surface'])->max('position') + 1,
        ]);

        return back()->with('success', 'View saved.');
    }

    public function destroyView(Request $request, SavedView $view): RedirectResponse
    {
        abort_unless(
            $view->user_id === $request->user()->getKey() || $request->user()->can('administer-organization'),
            403,
        );
        $view->delete();

        return back();
    }
}
