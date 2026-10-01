<?php

namespace App\Services\Organization;

use App\Enums\ActionKind;
use App\Enums\AgentRuntime;
use App\Models\Action;
use App\Models\AgentConfig;
use App\Models\BusinessProfile;
use App\Models\Expert;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\TicketType;
use App\Services\Voice\VoiceCatalog;

/**
 * A working agent for a brand-new organization.
 *
 * Without it a new organization had no experts at all: a call or a Studio
 * Talk session connected, and the front desk had no worker behind it to look
 * anything up or raise a ticket. This gives every organization the same two
 * halves a call needs (front desk + operations), the built-in actions that
 * need no connected app, a ticket type and a sales pipeline. Everything is
 * editable in Studio afterwards; nothing is created twice.
 *
 * Runs with the organization as the current tenant.
 */
class StarterAgent
{
    public function provision(Organization $organization): void
    {
        $config = AgentConfig::query()->firstOrCreate([], [
            'display_name' => 'Ava',
            'persona' => 'Warm, brief and practical. Confirms details back before acting on them.',
            'greeting' => "Thanks for calling {$organization->name}, this is Ava. How can I help?",
            'primary_language' => 'en',
        ]);
        // A config created earlier with only defaults has no greeting, and the
        // agent then improvised one from the organization's name ("Hello, this
        // is test"). Give it a real one; never overwrite what someone wrote.
        if (blank($config->greeting)) {
            $name = in_array($config->display_name, [null, '', 'Assistant'], true) ? 'Ava' : $config->display_name;
            $config->forceFill(['display_name' => $name, 'greeting' => "Thanks for calling {$organization->name}, this is {$name}. How can I help?"])->save();
        }
        // An explicit voice from the start, so Studio shows the one callers
        // hear and nothing rests on a provider's hidden default. A provider
        // already chosen keeps its own default voice; otherwise the catalog
        // picks (ElevenLabs when its key works here, else Cartesia).
        if (blank($config->voice_id)) {
            $voice = in_array($config->voice_provider, array_keys(VoiceCatalog::DEFAULTS), true)
                ? app(VoiceCatalog::class)->effective($config->voice_provider, null)
                : app(VoiceCatalog::class)->pickDefault();
            $config->forceFill(['voice_provider' => $voice['provider'], 'voice_id' => $voice['id']])->save();
        }
        BusinessProfile::query()->firstOrCreate([], ['name' => $organization->name, 'timezone' => $organization->timezone]);

        if (Expert::query()->exists()) {
            return;
        }

        $this->expert('front-desk', 'Front desk', AgentRuntime::Talker, 0,
            'Holds the conversation and answers what it can.',
            "You own every word the customer hears.\n\nAnswer business questions from the business information and the knowledge base (search it for anything specific). Delegate anything that must be done: booked, written, changed or submitted. Never promise a ticket, booking or callback that a completed action has not confirmed.");

        $worker = $this->expert('operations', 'Operations', AgentRuntime::Worker, 1,
            'Runs lookups, bookings and tickets.',
            "You do the work. You never speak to the customer.\n\nUse the conversation, the customer's record and the knowledge base before asking for anything. When you need the customer to supply something, say exactly what. Perform the action before reporting that it happened.");

        $this->syncInternalActions($worker, grant: true);

        TicketType::query()->firstOrCreate(['name' => 'General'], ['color' => '#4dcafa', 'description' => 'Anything that needs a person to follow up.', 'position' => 0, 'enabled' => true]);

        if (! Pipeline::query()->exists()) {
            $pipeline = Pipeline::create(['name' => 'Sales', 'is_default' => true]);
            foreach ([['New', '#4dcafa'], ['Contacted', '#ffdd03'], ['Quoted', '#9977ff'], ['Won', '#62f6b5']] as $i => [$name, $color]) {
                $pipeline->stages()->create(['name' => $name, 'color' => $color, 'position' => $i, 'organization_id' => $organization->id]);
            }
        }
    }

    /**
     * The built-in front-desk tools as Studio actions: what the worker may do
     * to the business's own records. Slug => [name, description, parameters,
     * is_idempotent, is_durable_write, granted to the starter worker].
     *
     * The descriptions are what the model chooses tools by, so they say when
     * to use each one. They match the agent layer's built-ins
     * (veyra_harness/actions.py); a test there checks the two stay in step.
     * The agent layer always uses its own input schema for an internal action
     * (the handler defines what it understands); the description here is the
     * owner's to edit.
     *
     * `send_message` is deliberately absent: SMS and email are not delivered
     * yet, and an agent that says "I've texted you" when nothing went out is
     * worse than one that says the team will follow up.
     *
     * @return array<string, array{0: string, 1: string, 2: array, 3: bool, 4: bool, 5: bool}>
     */
    public static function catalog(): array
    {
        $string = ['type' => 'string'];

        return [
            'find_contact' => ['Find contact',
                "Find a customer's record by phone, email or name. Use it before asking for details you may already have, and when a caller says who they are. With no arguments it looks up who this conversation is with. On a call or chat, a record that is not this conversation's customer comes back masked: attach it with link_contact (using the phone or email on file) before reading anything back.",
                ['query' => $string + ['description' => 'A phone number, email address or name.'], 'phone' => $string, 'email' => $string, 'name' => $string], [], true, false, true],
            'create_contact' => ['Create contact',
                'Save the customer as a contact once you know their name (and their phone or email if they gave one). It also attaches this conversation to them. If the phone or email is already on file you get that existing record back, never a duplicate. To change details on a record that exists, use update_contact.',
                ['name' => $string, 'phone' => $string, 'email' => $string, 'company' => $string], [], true, true, true],
            'update_contact' => ['Update contact',
                "Correct or add the customer's name, phone, email or company on their record. Only for the customer in this conversation. Read the new detail back to them before saving.",
                ['name' => $string, 'phone' => $string, 'email' => $string, 'company' => $string], [], true, true, true],
            'link_contact' => ['Link contact',
                'Attach this conversation to an existing customer record when they are calling or chatting from a number or session we do not recognise. Needs the phone number or email on their record, as the customer gives it; a name alone is not enough. Their history and tickets become visible once linked.',
                ['phone' => $string, 'email' => $string], [], true, true, true],
            'add_note' => ['Add note',
                'Leave an internal note for the team: on the customer record (the default) for lasting facts such as preferences, access details or who to ask for, or on this conversation for something about this exchange. Notes are internal; never read them out to the customer.',
                ['text' => $string, 'about' => ['type' => 'string', 'enum' => ['customer', 'conversation']]], ['text'], false, true, true],
            'contact_history' => ['Contact history',
                'Read what has happened with this customer across calls, chats, texts and email: recent conversations with their latest messages, call summaries and tickets. Use it when they refer to an earlier conversation, or before asking them to repeat themselves.',
                ['limit' => ['type' => 'integer']], [], true, false, true],
            'create_ticket' => ['Create ticket',
                'Raise a ticket for the team when something needs a person: what the customer needs, what was done, what is blocked. It is numbered, filed under its type, routed to that type\'s team and linked to this customer and conversation. Only after it succeeds may you say the team has it; give the customer the ticket number. Keep related requests in one ticket; to add to an existing ticket use update_ticket. When the customer asks for a person, use hand_off.',
                ['subject' => $string, 'body' => $string, 'type' => $string, 'priority' => ['type' => 'string', 'enum' => ['low', 'normal', 'high', 'urgent']]], ['subject', 'body'], false, true, true],
            'recent_tickets' => ['Recent tickets',
                "List tickets with their number, status, subject and who has them. On a call or chat it lists only this customer's tickets; set status to open for the unresolved ones.",
                ['status' => ['type' => 'string', 'enum' => ['open', 'all']], 'limit' => ['type' => 'integer']], [], true, false, true],
            'ticket_status' => ['Ticket status',
                "Look up one ticket by its number (the customer may say ticket 12 or #12): status, priority, who has it and when it last changed. On a call or chat only this customer's own tickets can be found.",
                ['reference' => $string], ['reference'], true, false, true],
            'update_ticket' => ['Update ticket',
                'Update an existing ticket: add what the customer just told you as a note, reopen it when they say the problem is back (status open), mark it as waiting on the customer (status pending), or raise its priority. Status resolved is only for withdrawing a ticket you raised in this same conversation. You cannot close tickets or lower a priority the team set: when the customer asks to close one, add their words as a note and say the team will close it. If a change is refused, say the team will review it.',
                ['reference' => $string, 'note' => $string, 'status' => ['type' => 'string', 'enum' => ['open', 'pending', 'resolved']], 'priority' => ['type' => 'string', 'enum' => ['low', 'normal', 'high', 'urgent']], 'type' => $string], ['reference'], false, true, true],
            'summarize_conversation' => ['Summarize conversation',
                'Leave a short summary of this conversation for the team, and optionally tag it (for example billing or new customer). Use it once, near the end of a conversation that had substance.',
                ['summary' => $string, 'tags' => ['type' => 'array', 'items' => $string]], [], false, true, true],
            'set_reminder' => ['Set reminder',
                'Set a follow-up reminder for the team on this conversation, for example call back about the quote tomorrow at 10. Give due_at as an ISO 8601 date-time with a timezone offset, or due_in_minutes. Optionally name the teammate it is for. A reminder is for the team; it does not promise the customer a call at that time.',
                ['text' => $string, 'due_at' => $string, 'due_in_minutes' => ['type' => 'integer'], 'teammate' => $string], ['text'], false, true, true],
            'hand_off' => ['Hand off to a person',
                'Hand this conversation to a person on the team when the customer asks for a person (use this, not just a ticket), is upset, or needs something you cannot do. It assigns the conversation (to the named teammate, or to a team by ticket type), flags it Needs attention in the inbox and notifies them. It is not a live transfer: say the team has been asked to follow up, not that someone is joining now. If the matter needs tracking, also raise a ticket.',
                ['reason' => $string, 'urgency' => ['type' => 'string', 'enum' => ['normal', 'urgent']], 'teammate' => $string, 'team' => $string], ['reason'], false, true, true],
            'save_lead' => ['Save lead',
                'Add a prospect to the sales pipeline, or move their existing lead forward, when someone wants to buy: a quote, an estimate, a new service. Save them as a contact first, and note what they want.',
                ['note' => $string, 'stage' => $string, 'value' => ['type' => 'integer']], [], true, true, true],
            'recent_calls' => ['Recent calls',
                "List recent calls with who called, how long, and what happened. Use since (an ISO date-time) to bound the window. On a call or chat it lists only this customer's calls.",
                ['since' => ['type' => 'string', 'format' => 'date-time'], 'limit' => ['type' => 'integer']], [], true, false, false],
        ];
    }

    /**
     * Descriptions earlier versions shipped. A row still carrying one was
     * never edited by its owner, so it is safe to upgrade to the current text.
     */
    private const STOCK_DESCRIPTIONS = [
        'find_contact' => ['Look up a customer by phone number or email.'],
        'create_ticket' => [
            'Raise a ticket for the team when an issue needs a person and cannot be resolved in the conversation.',
            'Raise a ticket for the team. Use when an issue needs a human and cannot be resolved on the call.',
            'Raise a ticket for the team when something needs a person: what the customer needs, what was done, what is blocked. It is numbered, filed under its type, routed to that type\'s team and linked to this customer and conversation. Only after it succeeds may you say the team has it; give the customer the ticket number. Keep related requests in one ticket; to add to an existing ticket use update_ticket.',
        ],
        'hand_off' => ['Hand this conversation to a person on the team when the customer asks for a human, is upset, or needs something you cannot do. It assigns the conversation (to the named teammate, or to a team by ticket type), flags it Needs attention in the inbox and notifies them. It is not a live transfer: say the team has been asked to follow up, not that someone is joining now. If the matter needs tracking, also raise a ticket.'],
        'update_ticket' => ['Update an existing ticket: add what the customer just told you as a note, reopen it when they say the problem is back (status open), mark it as waiting on the customer (status pending), or raise its priority. Status resolved is only for withdrawing a ticket you raised in this same conversation. You cannot close tickets or lower a priority the team set; if a change is refused, say the team will review it.'],
        'recent_calls' => ['List recent calls with who called, how long, and what happened. Use `since` (ISO date-time) to bound the window.'],
        'recent_tickets' => ['List recent tickets: reference, subject, status, who it is assigned to.'],
    ];

    /**
     * Bring the organization's built-in actions up to the catalog, without
     * undoing anything its owner chose: missing actions are created (and
     * granted to the worker when `$grant` or when the action is new), rows
     * still carrying stock text are upgraded, and edited, disabled or
     * ungranted rows are left exactly as they are. Safe to repeat.
     *
     * @return array{created: list<string>, upgraded: list<string>, granted: list<string>}
     */
    public function syncInternalActions(?Expert $worker = null, bool $grant = false): array
    {
        $worker ??= Expert::query()->where('runtime', AgentRuntime::Worker)->orderByDesc('is_builtin')->orderBy('position')->orderBy('id')->first();
        $report = ['created' => [], 'upgraded' => [], 'granted' => []];

        foreach (self::catalog() as $slug => [$name, $description, $properties, $required, $idempotent, $durable, $granted]) {
            $parameters = array_filter(['type' => 'object', 'properties' => $properties, 'required' => $required ?: null]);
            $action = Action::query()->where('slug', $slug)->first();

            if (! $action) {
                $action = Action::create([
                    'kind' => ActionKind::Internal, 'slug' => $slug, 'name' => $name, 'description' => $description,
                    'parameters' => $parameters, 'is_idempotent' => $idempotent, 'is_durable_write' => $durable,
                ]);
                $report['created'][] = $slug;
                if ($worker && $granted) {
                    $worker->actions()->syncWithoutDetaching([$action->id]);
                    $report['granted'][] = $slug;
                }

                continue;
            }

            if ($action->kind === ActionKind::Internal && in_array($action->description, self::STOCK_DESCRIPTIONS[$slug] ?? [], true)) {
                $action->forceFill(['description' => $description, 'parameters' => $parameters])->save();
                $report['upgraded'][] = $slug;
            }

            if ($grant && $worker && $granted && ! $worker->actions()->whereKey($action->id)->exists()) {
                $worker->actions()->syncWithoutDetaching([$action->id]);
                $report['granted'][] = $slug;
            }
        }

        return $report;
    }

    private function expert(string $slug, string $name, AgentRuntime $runtime, int $position, string $description, string $prompt): Expert
    {
        $expert = new Expert(['slug' => $slug, 'name' => $name, 'description' => $description, 'system_prompt' => $prompt, 'runtime' => $runtime, 'position' => $position, 'enabled' => true]);
        $expert->forceFill(['is_builtin' => true])->save();

        return $expert;
    }
}
