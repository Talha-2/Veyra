<?php

namespace Database\Seeders;

use App\Enums\ActionKind;
use App\Enums\AgentRuntime;
use App\Enums\Channel;
use App\Enums\ContactStage;
use App\Enums\ConversationStatus;
use App\Enums\IdentifierType;
use App\Enums\SkillExecutionMode;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Enums\ToolCallStatus;
use App\Models\Action;
use App\Models\AgentConfig;
use App\Models\BusinessProfile;
use App\Models\Call;
use App\Models\CallTranscript;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Delegation;
use App\Models\Expert;
use App\Models\Identifier;
use App\Models\Message;
use App\Models\Organization;
use App\Models\PhoneNumber;
use App\Models\Pipeline;
use App\Models\Skill;
use App\Models\Ticket;
use App\Models\ToolCall;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * A workspace with enough real shape to design against.
 *
 * Empty tables make every screen look finished. This seeds the cases that
 * actually decide a layout: a conversation with no contact behind it, an
 * agent-raised ticket, a call where the worker timed out mid-booking, an Urdu
 * thread for RTL, and a skill that is step-gated rather than prose.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $organization = Organization::where('slug', 'northwind')->firstOrFail();
        Organization::setCurrent($organization);

        $owner = User::where('email', 'owner@veyra.test')->firstOrFail();
        $operator = User::where('email', 'operator@veyra.test')->firstOrFail();

        $this->studio($owner);
        $this->desk($owner, $operator);

        Organization::setCurrent(null);
    }

    private function studio(User $owner): void
    {
        BusinessProfile::create([
            'name' => 'Northwind Services',
            'description' => 'Residential HVAC repair and installation across the Chicago metro.',
            'industry' => 'Home services',
            'timezone' => 'America/Chicago',
            'website' => 'https://northwind.example',
            'hours' => collect(['mon', 'tue', 'wed', 'thu', 'fri'])
                ->map(fn ($d) => ['day' => $d, 'opens' => '07:30', 'closes' => '18:00', 'closed' => false])
                ->concat([
                    ['day' => 'sat', 'opens' => '09:00', 'closes' => '13:00', 'closed' => false],
                    ['day' => 'sun', 'opens' => null, 'closes' => null, 'closed' => true],
                ])->all(),
        ]);

        AgentConfig::create([
            'display_name' => 'Nora',
            'persona' => 'Warm, brief, and never oversells. Confirms details back before booking anything.',
            'greeting' => 'Northwind Services, this is Nora. How can I help?',
            'primary_language' => 'en',
            // Urdu is here to exercise the constraint, not as decoration: it runs
            // a different STT and TTS provider and has no semantic turn
            // detection. See docs/urdu-support.md.
            'additional_languages' => ['es', 'ur'],
            'voice_provider' => 'elevenlabs',
        ]);

        PhoneNumber::create([
            'e164' => '+13125550142', 'friendly_name' => 'Main line', 'country' => 'US',
            'capabilities' => ['voice' => true, 'sms' => true, 'mms' => true],
        ]);
        PhoneNumber::create([
            'e164' => '+13125550188', 'friendly_name' => 'Urdu line', 'country' => 'US',
            'capabilities' => ['voice' => true, 'sms' => true],
            'language' => 'ur',
        ]);

        // The two halves of a call.
        $talker = Expert::create([
            'slug' => 'front-desk', 'name' => 'Front desk',
            'description' => 'Holds the conversation and answers what it can.',
            'system_prompt' => "You own every word the caller hears.\n\nAnswer business questions yourself. Delegate only when something must be done — booked, written, changed, submitted. Never promise a ticket, booking or callback that a completed action has not confirmed.",
            'runtime' => AgentRuntime::Talker, 'is_builtin' => true, 'position' => 0,
        ]);

        $worker = Expert::create([
            'slug' => 'operations', 'name' => 'Operations',
            'description' => 'Runs bookings, lookups and ticketing.',
            'system_prompt' => "You do the work. You never speak to the caller.\n\nUse known transcript facts and records before asking for anything. When you need the caller to supply something, say exactly what. Perform the action before reporting that it happened.",
            'runtime' => AgentRuntime::Worker, 'is_builtin' => true, 'position' => 1,
        ]);

        // Internal actions: transactional, idempotent by construction.
        $lookup = Action::create([
            'kind' => ActionKind::Internal, 'slug' => 'find_contact', 'name' => 'Find contact',
            'description' => 'Look up a customer by phone number or email.',
            'parameters' => ['type' => 'object', 'properties' => ['query' => ['type' => 'string']], 'required' => ['query']],
            'is_idempotent' => true,
        ]);

        $ticket = Action::create([
            'kind' => ActionKind::Internal, 'slug' => 'create_ticket', 'name' => 'Create ticket',
            'description' => 'Raise a ticket for the team. Use when an issue needs a human and cannot be resolved on the call.',
            'parameters' => ['type' => 'object', 'properties' => [
                'subject' => ['type' => 'string'], 'body' => ['type' => 'string'],
                'priority' => ['type' => 'string', 'enum' => ['low', 'normal', 'high', 'urgent']],
            ], 'required' => ['subject']],
            'is_durable_write' => true,
        ]);

        // Reads the digest automation needs. Found missing on the first live
        // automation run: asked to summarise overnight calls with no tool
        // that lists calls, the agent could only say so.
        Action::create([
            'kind' => ActionKind::Internal, 'slug' => 'recent_calls', 'name' => 'Recent calls',
            'description' => 'List recent calls with who called, how long, and what happened. Use `since` (ISO date-time) to bound the window.',
            'parameters' => ['type' => 'object', 'properties' => ['since' => ['type' => 'string', 'format' => 'date-time'], 'contact_id' => ['type' => 'integer'], 'limit' => ['type' => 'integer']]],
            'is_idempotent' => true,
        ]);
        Action::create([
            'kind' => ActionKind::Internal, 'slug' => 'recent_tickets', 'name' => 'Recent tickets',
            'description' => 'List recent tickets: reference, subject, status, who it is assigned to.',
            'parameters' => ['type' => 'object', 'properties' => ['contact_id' => ['type' => 'integer'], 'limit' => ['type' => 'integer']]],
            'is_idempotent' => true,
        ]);

        // External: crosses a network, can partially apply, needs a key.
        $booking = Action::create([
            'kind' => ActionKind::Composio, 'slug' => 'book_appointment', 'name' => 'Book appointment',
            'description' => 'Book a service visit in the dispatch calendar. Confirm the date, time window and address with the caller first.',
            'parameters' => ['type' => 'object', 'properties' => [
                'starts_at' => ['type' => 'string', 'format' => 'date-time'],
                'address' => ['type' => 'string'],
                'reason' => ['type' => 'string'],
            ], 'required' => ['starts_at', 'address']],
            'is_idempotent' => false, 'is_durable_write' => true, 'timeout_ms' => 20000,
        ]);

        $worker->actions()->attach([$lookup->id, $ticket->id, $booking->id]);

        $prose = Skill::create([
            'slug' => 'reschedule-a-visit', 'name' => 'Reschedule a visit',
            'description' => 'A customer wants to move an existing appointment.',
            'body' => "Find the existing appointment first — do not ask for details you can look up.\n\nOffer the two nearest windows that fit their stated constraint. If neither works, ask what does rather than listing everything.\n\nConfirm the new date and time window back to them in words before booking. Then book it, and only then say it is moved.",
            'execution_mode' => SkillExecutionMode::Prose,
            'updated_by_id' => $owner->id,
        ]);

        // Gated, because a payment is the case where improvisation is the risk.
        $gated = Skill::create([
            'slug' => 'take-a-deposit', 'name' => 'Take a deposit',
            'description' => 'Collect a card deposit to hold an installation slot.',
            'body' => 'Follow the steps exactly. Do not skip verification, and do not read the card number back.',
            'execution_mode' => SkillExecutionMode::Gated,
            'steps' => [
                ['name' => 'Verify identity', 'instruction' => 'Confirm name and service address against the record.'],
                ['name' => 'State the amount', 'instruction' => 'Say the deposit amount and what it holds. Get an explicit yes.'],
                ['name' => 'Collect card', 'instruction' => 'Take the details. Never repeat the number aloud.'],
                ['name' => 'Confirm', 'instruction' => 'Confirm the charge and the held slot.'],
            ],
            'updated_by_id' => $owner->id,
        ]);

        $worker->skills()->attach([$prose->id, $gated->id]);
    }

    private function desk(User $owner, User $operator): void
    {
        $pipeline = Pipeline::create(['name' => 'Installations', 'is_default' => true]);
        foreach ([['New', '#4dcafa'], ['Quoted', '#ffdd03'], ['Scheduled', '#9977ff'], ['Won', '#62f6b5']] as $i => [$name, $color]) {
            $pipeline->stages()->create(['name' => $name, 'color' => $color, 'position' => $i, 'organization_id' => $pipeline->organization_id]);
        }

        // 1. A known customer, resolved call, agent booked successfully.
        $maria = Contact::create([
            'name' => 'Maria Delgado', 'phone' => '+13125557781', 'email' => 'maria.d@example.com',
            'stage' => ContactStage::Won, 'source' => 'call', 'owner_id' => $operator->id,
            'last_contact_at' => now()->subHours(2),
        ]);
        $this->thread($maria, '+13125557781', Channel::Call, [
            ['inbound', 'Hi, my furnace is making a grinding noise.', now()->subHours(2)],
        ], booked: true);

        // 2. An unknown number — no contact at all. The inbox has to render this
        //    without a name, an avatar or a history, and it is common.
        $unknown = Identifier::resolve(IdentifierType::Phone, '+16305550119');
        $conv = Conversation::create([
            'identifier_id' => $unknown->id, 'channel' => Channel::Sms,
            'status' => ConversationStatus::Open,
        ]);
        $this->message($conv, 'inbound', 'do you guys do ductless mini splits?', now()->subMinutes(14));
        $conv->update(['last_message_at' => now()->subMinutes(14), 'unread_count' => 1]);

        // 3. Urdu thread — RTL rendering, and a language with no semantic turn
        //    detection behind it.
        $ahmed = Contact::create([
            'name' => 'Ahmed Raza', 'phone' => '+13125553094',
            'stage' => ContactStage::Open, 'source' => 'call', 'last_contact_at' => now()->subMinutes(40),
        ]);
        $urdu = $this->thread($ahmed, '+13125553094', Channel::Sms, [
            ['inbound', 'السلام علیکم، کیا آج کوئی ٹیکنیشن آ سکتا ہے؟', now()->subMinutes(42)],
            ['outbound', 'وعلیکم السلام۔ جی، آج شام چار بجے دستیاب ہے۔ کیا یہ وقت مناسب ہے؟', now()->subMinutes(40)],
        ]);
        $urdu->assignees()->attach($operator->id);

        // 4. A call where the worker timed out on a non-idempotent booking.
        //    Nobody knows whether it happened — the case the Desk must surface.
        $tom = Contact::create([
            'name' => 'Tom Byrne', 'phone' => '+17735552210',
            'stage' => ContactStage::Qualified, 'source' => 'call', 'last_contact_at' => now()->subDay(),
        ]);
        $ambiguous = $this->thread($tom, '+17735552210', Channel::Call, [
            ['inbound', 'I need someone out Thursday morning if you have it.', now()->subDay()],
        ], booked: false, timedOut: true);

        Ticket::create([
            'subject' => 'Confirm whether Thursday booking went through',
            'body' => "The booking action timed out. The dispatch calendar may or may not hold a slot for Thursday 9-12. Check before calling the customer back.",
            'status' => TicketStatus::Open, 'priority' => TicketPriority::High,
            'contact_id' => $tom->id, 'conversation_id' => $ambiguous->id,
            'channel' => 'call', 'created_by_agent' => true,
        ])->assignees()->attach($operator->id);

        // 5. A closed email thread, so the list is not uniformly urgent.
        $lena = Contact::create([
            'name' => 'Lena Kowalski', 'email' => 'lena@brightpath.example', 'company' => 'Brightpath Property',
            'stage' => ContactStage::Open, 'source' => 'form', 'last_contact_at' => now()->subDays(3),
        ]);
        $email = $this->thread($lena, 'lena@brightpath.example', Channel::Email, [
            ['inbound', 'Can you quote annual maintenance for six units?', now()->subDays(4)],
            ['outbound', 'Attached — happy to walk through it whenever suits.', now()->subDays(3)],
        ], identifierType: IdentifierType::Email);
        $email->update(['status' => ConversationStatus::Closed, 'subject' => 'Annual maintenance quote — 6 units']);

        Ticket::create([
            'subject' => 'Grinding noise — furnace inspection',
            'body' => 'Customer reports grinding on startup. Booked for tomorrow 8-11.',
            'status' => TicketStatus::InProgress, 'priority' => TicketPriority::Normal,
            'contact_id' => $maria->id, 'channel' => 'call', 'created_by_id' => $operator->id,
        ])->assignees()->attach([$operator->id, $owner->id]);
    }

    /** Build an identifier + conversation + messages, optionally with a call behind it. */
    private function thread(
        Contact $contact,
        string $address,
        Channel $channel,
        array $messages,
        bool $booked = false,
        bool $timedOut = false,
        IdentifierType $identifierType = IdentifierType::Phone,
    ): Conversation {
        $identifier = Identifier::resolve($identifierType, $address);
        $identifier->linkTo($contact);

        $conversation = Conversation::create([
            'identifier_id' => $identifier->id,
            'contact_id' => $contact->id,
            'channel' => $channel,
            'status' => ConversationStatus::Open,
        ]);

        $last = null;
        foreach ($messages as [$direction, $body, $at]) {
            $this->message($conversation, $direction, $body, $at);
            $last = $at;
        }
        $conversation->update(['last_message_at' => $last]);

        if ($channel === Channel::Call) {
            $this->seedCall($conversation, $contact, $address, $booked, $timedOut);
        }

        return $conversation;
    }

    private function message(Conversation $conversation, string $direction, string $body, $at): void
    {
        Message::create([
            'conversation_id' => $conversation->id,
            'channel' => $conversation->channel,
            'direction' => $direction,
            'status' => $direction === 'inbound' ? 'received' : 'sent',
            'from_agent' => $direction === 'outbound',
            'body' => $body,
        ])->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
    }

    private function seedCall(Conversation $conversation, Contact $contact, string $from, bool $booked, bool $timedOut): void
    {
        $call = Call::create([
            'conversation_id' => $conversation->id,
            'contact_id' => $contact->id,
            'direction' => 'inbound',
            'from_number' => $from,
            'to_number' => '+13125550142',
            'provider' => 'twilio',
            'provider_sid' => 'CA'.bin2hex(random_bytes(8)),
            'room' => 'call-'.bin2hex(random_bytes(4)),
            'status' => 'completed',
            'language' => 'en',
        ]);
        $call->forceFill(['duration_sec' => $timedOut ? 214 : 138])->save();

        CallTranscript::create([
            'call_id' => $call->id,
            'items' => [
                ['role' => 'agent', 'text' => 'Northwind Services, this is Nora. How can I help?'],
                ['role' => 'caller', 'text' => $conversation->messages()->first()?->body ?? ''],
            ],
            // p95 is what the product is judged on, so it is stored per call.
            'metrics' => ['voice_to_voice' => ['p50' => 780, 'p95' => $timedOut ? 2140 : 1080]],
            // What the post-call pass writes on a real call; the digest
            // automation reads these, so the demo has them.
            'summary' => $timedOut
                ? 'Asked to book a Thursday morning visit. The booking timed out and is UNCONFIRMED; a ticket was raised for dispatch to check the calendar before calling back.'
                : 'Booked a furnace repair visit for tomorrow 8-11 at the address on file. Confirmed the window with the caller. Nothing outstanding.',
        ]);

        $delegation = Delegation::create([
            'call_id' => $call->id,
            'sequence' => 1,
            'transcript_delta' => "AI: Northwind Services, this is Nora. How can I help?\nHuman: ".($conversation->messages()->first()?->body ?? ''),
            'reply' => $timedOut ? null : 'Booked for tomorrow 8-11. Confirm the window to the caller.',
            'status' => $timedOut ? 'timeout' : 'completed',
            'error' => $timedOut ? 'worker exceeded 20s awaiting book_appointment' : null,
            'duration_ms' => $timedOut ? 20000 : 3400,
            'started_at' => $call->created_at,
            'completed_at' => $call->created_at?->addSeconds($timedOut ? 20 : 3),
        ]);

        if ($booked || $timedOut) {
            $action = Action::where('slug', 'book_appointment')->first();
            ToolCall::create([
                'action_id' => $action?->id,
                'call_id' => $call->id,
                'delegation_id' => $delegation->id,
                'action_slug' => 'book_appointment',
                'kind' => ActionKind::Composio,
                'arguments' => ['starts_at' => now()->addDay()->toIso8601String(), 'address' => '118 W Erie St'],
                'result' => $timedOut ? null : ['booking_id' => 'bk_'.bin2hex(random_bytes(4))],
                'status' => $timedOut ? ToolCallStatus::Timeout : ToolCallStatus::Succeeded,
                'error' => $timedOut ? 'upstream did not respond within 20000ms' : null,
                'duration_ms' => $timedOut ? 20000 : 820,
                // Present precisely because this action is not idempotent: a
                // retry has to be able to ask "did this already happen?"
                'idempotency_key' => 'book_'.bin2hex(random_bytes(6)),
            ]);
        }
    }
}
