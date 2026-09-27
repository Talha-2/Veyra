<?php

namespace Database\Seeders;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use App\Models\Activity;
use App\Models\ApiKey;
use App\Models\Automation;
use App\Models\AutomationRun;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Invitation;
use App\Models\Message;
use App\Models\MessageFeedback;
use App\Models\Organization;
use App\Models\SavedView;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Models\User;
use App\Models\WebhookEndpoint;
use Illuminate\Database\Seeder;

/**
 * Data for the second wave of pages — runs after DemoDataSeeder.
 *
 * Same principle: each row is here because a screen needs it to be honest.
 * An automation with a failed run, a thumbs-down on an agent message, a ticket
 * type with default assignees, a pending invitation.
 */
class ProductionShapeSeeder extends Seeder
{
    public function run(): void
    {
        $organization = Organization::where('slug', 'northwind')->firstOrFail();
        Organization::setCurrent($organization);

        $owner = User::where('email', 'owner@veyra.test')->firstOrFail();
        $operator = User::where('email', 'operator@veyra.test')->firstOrFail();

        // Ticket types, with the defaults the agent will use.
        $types = collect([
            ['name' => 'Service call', 'color' => '#4dcafa', 'default_assignee_ids' => [$operator->id]],
            ['name' => 'Billing', 'color' => '#ffdd03', 'default_assignee_ids' => [$owner->id]],
            ['name' => 'Complaint', 'color' => '#f87171', 'default_assignee_ids' => [$owner->id, $operator->id]],
            ['name' => 'Follow-up', 'color' => '#62f6b5', 'default_assignee_ids' => []],
        ])->map(fn ($t, $i) => TicketType::create([...$t, 'position' => $i]));

        Ticket::query()->where('subject', 'like', 'Confirm whether%')->update(['ticket_type_id' => $types[3]->id]);
        Ticket::query()->where('subject', 'like', 'Grinding%')->update(['ticket_type_id' => $types[0]->id]);

        // Activity on the timed-out call's contact and conversation.
        $tom = Contact::where('name', 'Tom Byrne')->first();
        $tomConv = $tom?->conversations()->first();
        if ($tom && $tomConv) {
            Activity::log($tom, 'created', 'Contact created from inbound call', actor: 'system');
            Activity::log($tomConv, 'delegated', 'Agent handed the request to the worker', actor: 'agent');
            Activity::log($tomConv, 'action_timeout', 'Book appointment timed out after 20s — unconfirmed', actor: 'agent',
                meta: ['action' => 'book_appointment']);
            Activity::log($tomConv, 'ticket_raised', 'Agent raised ticket #1 for the team', actor: 'agent');
        }

        $maria = Contact::where('name', 'Maria Delgado')->first();
        if ($maria) {
            Activity::log($maria, 'stage_changed', 'Stage moved to Won', $operator, ['from' => 'qualified', 'to' => 'won']);
            $maria->update(['is_favorite' => true]);
        }

        // Feedback: the Urdu reply gets a thumbs up; the ambiguous one a down.
        // Postgres regex takes the literal range; \x{...} is Perl syntax and is
        // rejected as an invalid escape.
        $urduReply = Message::query()->where('from_agent', true)->whereRaw("body ~ '[\u{0600}-\u{06FF}]'")->first();
        if ($urduReply) {
            MessageFeedback::create(['message_id' => $urduReply->id, 'user_id' => $operator->id, 'rating' => 'up']);
            $urduReply->pinnedBy()->attach($operator->id);
        }

        // Tags on a conversation.
        Conversation::query()->whereHas('contact', fn ($q) => $q->where('name', 'Maria Delgado'))->first()
            ?->syncTags(['furnace', 'repeat customer']);

        // A saved view someone shared with the team.
        SavedView::create([
            'user_id' => $owner->id, 'surface' => 'inbox', 'name' => 'Urdu line',
            'filters' => ['channel' => 'sms', 'search' => null], 'is_shared' => true, 'position' => 0,
        ]);

        // An automation — the thing the old server called an Expert.
        $digest = Automation::create([
            'name' => 'Morning dispatch digest',
            'description' => 'Every weekday at 7am, summarise overnight calls and open tickets for the dispatch lead.',
            'system_prompt' => 'You write for a dispatcher who has three minutes. Lead with anything unconfirmed.',
            'goal' => 'Summarise calls since 6pm yesterday: who called, what they wanted, what was booked, what needs a human.',
            'triggers' => ['schedule', 'manual'],
            'schedule' => ['kind' => 'daily', 'at' => '07:00', 'tz' => 'America/Chicago'],
            'reasoning' => 'balanced',
            'allowed_action_ids' => \App\Models\Action::query()->whereIn('slug', ['find_contact', 'recent_calls', 'recent_tickets'])->pluck('id')->all(),
            'can_search_knowledge' => true,
            'enabled' => true,
            'created_by_id' => $owner->id,
        ]);
        $digest->forceFill(['next_run_at' => now()->addDay()->setTime(7, 0), 'last_run_at' => now()->subDay()->setTime(7, 0)])->save();

        AutomationRun::create([
            'automation_id' => $digest->id, 'trigger' => 'schedule', 'status' => 'done',
            'input' => $digest->goal,
            'result' => "3 calls overnight. 1 booking confirmed (Delgado, furnace, tomorrow 8-11). 1 UNCONFIRMED: Byrne Thursday booking timed out — check dispatch calendar before calling back. 0 complaints.",
            'steps' => [
                ['type' => 'tool_call', 'name' => 'find_contact', 'args' => ['query' => 'since:yesterday']],
                ['type' => 'tool_result', 'name' => 'find_contact', 'summary' => '3 contacts'],
                ['type' => 'final'],
            ],
            'tokens' => 2140, 'duration_ms' => 6800,
            'started_at' => now()->subDay()->setTime(7, 0), 'ended_at' => now()->subDay()->setTime(7, 0)->addSeconds(7),
        ]);
        AutomationRun::create([
            'automation_id' => $digest->id, 'trigger' => 'schedule', 'status' => 'error',
            'input' => $digest->goal, 'error' => 'find_contact: upstream 503 after 2 retries',
            'steps' => [['type' => 'tool_call', 'name' => 'find_contact', 'args' => ['query' => 'since:yesterday']]],
            'tokens' => 410, 'duration_ms' => 31000,
            'started_at' => now()->subDays(2)->setTime(7, 0), 'ended_at' => now()->subDays(2)->setTime(7, 0)->addSeconds(31),
        ]);

        Automation::create([
            'name' => 'Missed-call text back',
            'description' => 'When a call goes unanswered, text the caller within a minute.',
            'goal' => 'Send a short SMS apologising for the missed call and offering a callback window.',
            'triggers' => ['app_event'],
            'app_trigger' => ['event' => 'call.missed'],
            'reasoning' => 'fast',
            'allowed_action_ids' => [],
            'enabled' => false,
            'created_by_id' => $owner->id,
        ]);

        // Knowledge: two documents so search-test and the chunk viewer have
        // something to show, plus one agent memory.
        $kb = \App\Models\Folder::create(['name' => 'Policies']);
        foreach ([
            ['Service area', "We serve the Chicago metro: Cook, DuPage, Lake and Will counties.\n\nEvanston, Oak Park and Naperville are inside the area. We do not currently go to Rockford or Milwaukee.\n\nSame-day service is available inside the city when a technician is free; suburbs are next-day."],
            ['Pricing and deposits', "A diagnostic visit is \$89, waived if the customer proceeds with the repair.\n\nInstallations require a 20% deposit to hold the slot. Deposits are refundable up to 48 hours before the appointment.\n\nWe accept card and ACH. We do not accept cash on site."],
        ] as [$name, $content]) {
            \App\Models\Document::create(['folder_id' => $kb->id, 'name' => $name, 'source_type' => 'created', 'mime' => 'text/markdown', 'size_bytes' => strlen($content), 'content' => $content])->reindex();
        }
        \App\Models\Document::create(['name' => 'Scheduling rules', 'source_type' => 'agent', 'mime' => 'text/markdown', 'status' => 'ready',
            'content' => "Never book an installation on a Friday — the crew does maintenance calls only.\n\nThe owner (Ada) handles complaints personally; raise a ticket to her rather than offering a discount.", 'size_bytes' => 180]);

        // Developer surface.
        ApiKey::mint('Website booking widget', ['calls:write', 'contacts:read'], publishable: false, by: $owner);
        WebhookEndpoint::create([
            'url' => 'https://hooks.northwind.example/veyra', 'secret' => 'whsec_'.bin2hex(random_bytes(12)),
            'events' => ['call.ended', 'ticket.created'], 'enabled' => true,
        ]);

        // A pending invitation.
        Invitation::issue('dispatch@northwind.example', OrganizationRole::Member, [Surface::Desk->value], $owner);

        // Leads across the pipeline, so the kanban has its real shape: one
        // column busy, one empty, one overdue.
        $pipeline = \App\Models\Pipeline::query()->with('stages')->first();
        if ($pipeline) {
            $stages = $pipeline->stages->keyBy('name');
            $lena = Contact::where('name', 'Lena Kowalski')->first();
            $rows = [
                [$tom, 'New', 'call', 1800, null],
                [$maria, 'Scheduled', 'call', 4200, null],
                [$lena, 'Quoted', 'form', 12600, now()->subDays(2)],
                [Contact::create(['name' => 'Priya Nair', 'company' => 'Nair Dental', 'phone' => '+13125550999', 'source' => 'website']), 'New', 'website', 9500, now()->addDay()],
            ];
            foreach ($rows as $i => [$contact, $stageName, $source, $value, $next]) {
                if (! $contact || ! isset($stages[$stageName])) continue;
                $lead = \App\Models\Lead::create([
                    'contact_id' => $contact->id, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stages[$stageName]->id,
                    'position' => $i, 'source' => $source, 'value' => $value, 'next_response_at' => $next,
                ]);
                $lead->assignees()->attach($i % 2 ? $owner->id : $operator->id);
            }
        }

        // Notifications for the operator: one unread that matters, one read.
        $operator->notifications()->create([
            'id' => (string) \Illuminate\Support\Str::uuid(), 'type' => 'action.needs_review',
            'data' => ['organization_id' => $organization->id, 'type' => 'needs review', 'title' => 'Book appointment for Tom Byrne timed out',
                'body' => 'The dispatch calendar may or may not hold Thursday 9-12. Check before calling back.', 'url' => $tomConv ? "/desk/inbox/{$tomConv->id}" : null],
        ]);
        $operator->notifications()->create([
            'id' => (string) \Illuminate\Support\Str::uuid(), 'type' => 'conversation.assigned',
            'data' => ['organization_id' => $organization->id, 'type' => 'assigned', 'title' => 'Ahmed Raza was assigned to you', 'body' => null, 'url' => null],
            'read_at' => now()->subHour(),
        ]);

        Organization::setCurrent(null);
    }
}
