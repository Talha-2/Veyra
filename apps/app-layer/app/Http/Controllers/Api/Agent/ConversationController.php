<?php

namespace App\Http\Controllers\Api\Agent;

use App\Enums\ConversationStatus;
use App\Enums\OrganizationRole;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Organization;
use App\Models\Tag;
use App\Models\User;
use App\Services\Agent\ActingFor;
use App\Services\Agent\CallContextBuilder;
use App\Services\Contacts\ContactDirectory;
use App\Services\Tickets\TicketDesk;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * What the agent does to the conversation it is having: say who it is with,
 * leave notes and a summary for the team, set a follow-up, and hand it to a
 * person. Each lands where Desk already shows it — notes, reminders, tags,
 * assignees and the activity timeline on the thread — with `actor = agent`.
 *
 * On a customer conversation the path must name that same conversation
 * (ActingFor::ensureConversation); a staff run may act on any of them.
 */
class ConversationController extends Controller
{
    /** The tag a hand-off puts on the thread, so the team can filter for it. */
    public const NEEDS_ATTENTION = 'Needs attention';

    public function __construct(private readonly ContactDirectory $directory, private readonly CallContextBuilder $builder) {}

    /**
     * Link the person in this conversation to an existing contact.
     *
     * Takes the phone or email on that contact's record as proof: the agent
     * cannot attach a caller to a record just because they gave its name.
     */
    public function link(Request $request, Organization $organization, Conversation $conversation): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required_without:email', 'nullable', 'string', 'max:32'],
            'email' => ['required_without:phone', 'nullable', 'email', 'max:255'],
            'contact_id' => ['nullable', 'integer'],
        ], ['phone.required_without' => 'Give the phone number or email the customer has on file.']);
        ActingFor::from($request)->ensureConversation($conversation);

        $contact = $this->directory->findByPhoneOrEmail($validated['phone'] ?? null, $validated['email'] ?? null);
        if (! $contact || (! empty($validated['contact_id']) && $contact->id !== (int) $validated['contact_id'])) {
            throw ValidationException::withMessages([isset($validated['phone']) ? 'phone' : 'email' => 'No customer record has that '.(isset($validated['phone']) ? 'phone number' : 'email address').'. Check it with the customer, or register them as new.']);
        }

        $mode = DB::transaction(fn () => $this->directory->attachConversation($conversation, $contact));

        return response()->json(['linked' => true, 'mode' => $mode, 'contact' => $this->builder->contact($contact->refresh())]);
    }

    public function storeNote(Request $request, Organization $organization, Conversation $conversation): JsonResponse
    {
        $validated = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        ActingFor::from($request)->ensureConversation($conversation);

        $note = $conversation->notes()->create(['body' => $validated['body']]);
        Activity::log($conversation, 'note_added', 'Agent added a note', actor: 'agent', meta: ['note_id' => $note->id]);

        return response()->json(['note' => ['id' => $note->id, 'subject' => 'conversation', 'subject_id' => $conversation->id, 'body' => $note->body, 'created_at' => $note->created_at?->toIso8601String()]], 201);
    }

    /**
     * A summary for the team and a few tags. The summary is a note (Desk shows
     * it on the thread, marked as the agent's); tags are added, never removed,
     * and matched to the business's existing tags before a new one is made.
     */
    public function summary(Request $request, Organization $organization, Conversation $conversation): JsonResponse
    {
        $validated = $request->validate([
            'summary' => ['required_without:tags', 'nullable', 'string', 'max:2000'],
            'tags' => ['required_without:summary', 'nullable', 'array', 'max:5'],
            'tags.*' => ['string', 'min:1', 'max:40'],
        ]);
        ActingFor::from($request)->ensureConversation($conversation);

        $added = DB::transaction(function () use ($conversation, $validated) {
            if (! empty($validated['summary'])) {
                $conversation->notes()->create(['body' => "Summary: {$validated['summary']}"]);
                Activity::log($conversation, 'summarized', 'Agent summarised the conversation', actor: 'agent');
            }

            $existing = Tag::query()->get();
            $tags = collect($validated['tags'] ?? [])->map(fn ($t) => trim($t))->filter()->unique(fn ($t) => mb_strtolower($t))
                ->map(fn ($t) => $existing->first(fn (Tag $e) => mb_strtolower($e->name) === mb_strtolower($t)) ?? Tag::create(['name' => $t]));
            $new = $tags->reject(fn (Tag $t) => $conversation->tags()->whereKey($t->id)->exists());
            if ($new->isNotEmpty()) {
                $conversation->tags()->syncWithoutDetaching($new->pluck('id')->all());
                Activity::log($conversation, 'tagged', 'Agent tagged it '.$new->pluck('name')->join(', '), actor: 'agent');
            }

            return $new->pluck('name')->values()->all();
        });

        return response()->json(['summarized' => ! empty($validated['summary']), 'tags_added' => $added, 'tags' => $conversation->tags()->pluck('name')->all()]);
    }

    /**
     * A reminder for the team on this conversation: `due_at`, or `due_in_minutes`
     * when the model has a duration rather than a clock time. For a named
     * teammate when one is given and matches; otherwise whoever has the
     * conversation; otherwise unowned (it still shows on the thread).
     */
    public function reminder(Request $request, Organization $organization, Conversation $conversation): JsonResponse
    {
        $validated = $request->validate([
            'text' => ['required', 'string', 'max:500'],
            'due_at' => ['required_without:due_in_minutes', 'nullable', 'date'],
            'due_in_minutes' => ['required_without:due_at', 'nullable', 'integer', 'between:5,525600'],
            'teammate' => ['nullable', 'string', 'max:120'],
        ], ['due_at.required_without' => 'Say when: a date and time, or how many minutes from now.']);
        ActingFor::from($request)->ensureConversation($conversation);

        $due = ! empty($validated['due_at']) ? Carbon::parse($validated['due_at']) : now()->addMinutes((int) $validated['due_in_minutes']);
        if ($due->isPast() || $due->isAfter(now()->addYear())) {
            throw ValidationException::withMessages(['due_at' => 'A reminder must be in the future and within a year.']);
        }

        [$matched] = $this->teammates($organization, $validated['teammate'] ?? null);
        $owner = $matched->first() ?? $conversation->assignees()->first();

        $reminder = $conversation->reminders()->create(['text' => $validated['text'], 'due_at' => $due, 'user_id' => $owner?->id]);
        Activity::log($conversation, 'reminder_set', 'Agent set a reminder for '.$due->toDayDateTimeString().($owner ? " ({$owner->name})" : ''), actor: 'agent', meta: ['reminder_id' => $reminder->id]);

        return response()->json(['reminder' => [
            'id' => $reminder->id, 'text' => $reminder->text, 'due_at' => $due->toIso8601String(),
            'for' => $owner?->name, 'teammate_matched' => isset($validated['teammate']) ? $matched->isNotEmpty() : null,
        ]], 201);
    }

    /**
     * Hand the conversation to a person.
     *
     * Assigns it to the named teammate, or to the given ticket type's team;
     * keeps whoever already had it; tags it "Needs attention", reopens it and
     * marks it unread so it rises in the inbox; leaves the reason as a note;
     * and notifies the people it went to — or, when nobody could be chosen,
     * the owners and admins, so it is never handed to no one.
     */
    public function handoff(Request $request, Organization $organization, Conversation $conversation, TicketDesk $desk): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
            'urgency' => ['nullable', Rule::in(['normal', 'urgent'])],
            'teammate' => ['nullable', 'string', 'max:120'],
            'ticket_type' => ['nullable', 'string', 'max:60'],
        ]);
        ActingFor::from($request)->ensureConversation($conversation);
        $urgent = ($validated['urgency'] ?? 'normal') === 'urgent';

        [$targets, $candidates] = $this->teammates($organization, $validated['teammate'] ?? null);
        if ($targets->isEmpty() && ! empty($validated['ticket_type'])) {
            [$type] = $desk->resolveType($validated['ticket_type']);
            $ids = collect($type?->default_assignee_ids ?? [])->map(fn ($id) => (int) $id);
            $targets = $ids->isEmpty() ? collect() : $organization->members()->whereIn('users.id', $ids)->get();
        }

        $result = DB::transaction(function () use ($conversation, $organization, $validated, $urgent, $targets) {
            if ($targets->isNotEmpty()) {
                $conversation->assignees()->syncWithoutDetaching($targets->pluck('id')->all());
            }
            $assignees = $conversation->assignees()->get();

            $tag = Tag::query()->whereRaw('lower(name) = ?', [mb_strtolower(self::NEEDS_ATTENTION)])->first() ?? Tag::create(['name' => self::NEEDS_ATTENTION, 'color' => '#f97316']);
            $conversation->tags()->syncWithoutDetaching([$tag->id]);

            $conversation->forceFill([
                'status' => ConversationStatus::Open,
                'snoozed_until' => null,
                'unread_count' => max(1, (int) $conversation->unread_count),
            ])->save();

            $conversation->notes()->create(['body' => ($urgent ? 'Urgent hand-off' : 'Hand-off').' from the agent: '.$validated['reason']]);
            Activity::log($conversation, 'handed_off', ($urgent ? 'Agent asked for a person urgently' : 'Agent handed this to the team').($targets->isNotEmpty() ? ': '.$targets->pluck('name')->join(', ') : ''),
                actor: 'agent', meta: ['assignees' => $targets->pluck('id')->all(), 'urgent' => $urgent]);

            // Somebody always hears about it.
            $recipients = $assignees->isNotEmpty()
                ? $assignees
                : $organization->members()->wherePivotIn('role', [OrganizationRole::Owner->value, OrganizationRole::Admin->value])->get();
            foreach ($recipients as $user) {
                $user->notifications()->create([
                    'id' => (string) Str::uuid(),
                    'type' => 'conversation.handoff',
                    'data' => [
                        'organization_id' => $organization->id, 'type' => 'conversation.assigned',
                        'title' => ($urgent ? 'Urgent: ' : '').'The agent needs a person on '.$conversation->title(),
                        'body' => str($validated['reason'])->limit(140)->value(),
                        'url' => "/desk/inbox/{$conversation->id}",
                    ],
                ]);
            }

            return ['assignees' => $assignees, 'notified' => $recipients];
        });

        return response()->json([
            'handed_off' => true,
            'assigned_to' => $result['assignees']->pluck('name')->all(),
            'notified' => $result['notified']->pluck('name')->all(),
            'teammate_matched' => isset($validated['teammate']) ? $targets->isNotEmpty() && $candidates->count() <= 1 : null,
            'teammate_candidates' => $candidates->count() > 1 ? $candidates->pluck('name')->all() : [],
            'tag' => self::NEEDS_ATTENTION,
        ]);
    }

    /**
     * Members matching a spoken name: the full name, else a unique first name
     * or a unique partial. Ambiguity matches nobody and returns the candidates.
     *
     * @return array{0: Collection<int, User>, 1: Collection<int, User>}
     */
    private function teammates(Organization $organization, ?string $name): array
    {
        $name = mb_strtolower(trim((string) $name));
        if ($name === '') {
            return [collect(), collect()];
        }
        $members = $organization->members()->get();
        $exact = $members->filter(fn (User $u) => mb_strtolower($u->name) === $name);
        if ($exact->count() === 1) {
            return [$exact->values(), $exact->values()];
        }
        $first = $members->filter(fn (User $u) => mb_strtolower(Str::before($u->name, ' ')) === $name);
        $partial = $first->isNotEmpty() ? $first : $members->filter(fn (User $u) => str_contains(mb_strtolower($u->name), $name));

        return [$partial->count() === 1 ? $partial->values() : collect(), $partial->values()];
    }
}
