<?php

namespace Tests\Feature;

use App\Enums\ActionKind;
use App\Enums\AgentRuntime;
use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Enums\IdentifierType;
use App\Enums\OrganizationRole;
use App\Enums\TicketStatus;
use App\Models\Action;
use App\Models\Activity;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Expert;
use App\Models\Identifier;
use App\Models\Lead;
use App\Models\Note;
use App\Models\Organization;
use App\Models\PhoneNumber;
use App\Models\Pipeline;
use App\Models\Reminder;
use App\Models\Tag;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Models\User;
use App\Services\Agent\CallContextBuilder;
use App\Services\Organization\StarterAgent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The agent's front-desk tools on the v1 contract: contacts, tickets,
 * conversations and leads, with the guardrails that make them safe to hand
 * a model that is talking to a stranger.
 *
 * The rule under most of these tests: with `X-Veyra-Conversation` set the
 * agent acts for the customer in that conversation, and nobody else.
 */
class AgentFrontDeskToolsTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-shared-secret';

    private Organization $organization;

    private User $owner;

    private User $sam;

    private Contact $tom;

    private Contact $maria;

    private Conversation $chat;

    private TicketType $billing;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.secret' => self::SECRET]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'America/Chicago']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->sam = User::create(['name' => 'Sam Rivera', 'email' => 'sam@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
        $this->organization->addMember($this->sam, OrganizationRole::Member);

        Organization::setCurrent($this->organization);
        PhoneNumber::create(['e164' => '+13125550142', 'friendly_name' => 'Main line', 'language' => 'en']);
        Expert::create(['slug' => 'ops', 'name' => 'Operations', 'description' => 'Works.', 'system_prompt' => 'Work.', 'runtime' => AgentRuntime::Worker]);
        TicketType::create(['name' => 'General', 'color' => '#4dcafa', 'default_assignee_ids' => [$this->owner->id], 'position' => 0]);
        $this->billing = TicketType::create(['name' => 'Billing', 'color' => '#ffdd03', 'default_assignee_ids' => [$this->sam->id], 'position' => 1]);

        $this->tom = Contact::create(['name' => 'Tom Byrne', 'phone' => '+17735550111', 'email' => 'tom@example.test']);
        Identifier::resolve(IdentifierType::Phone, '+17735550111')->linkTo($this->tom);
        $this->maria = Contact::create(['name' => 'Maria Delgado', 'phone' => '+17735550199', 'email' => 'maria@example.test']);
        Identifier::resolve(IdentifierType::Phone, '+17735550199')->linkTo($this->maria);

        // An anonymous website visitor.
        $visitor = Identifier::resolve(IdentifierType::WebSession, 'visitor-abc');
        $this->chat = Conversation::create(['identifier_id' => $visitor->id, 'channel' => Channel::WebChat, 'status' => ConversationStatus::Open]);
        Organization::setCurrent(null);
    }

    private function agent(?Conversation $actingFor = null): static
    {
        // Headers set on the test case persist between requests: start clean,
        // or a staff request would still carry the last conversation.
        $request = $this->flushHeaders()->withToken(self::SECRET)->withHeader('Accept', 'application/json');

        return $actingFor ? $request->withHeader('X-Veyra-Conversation', (string) $actingFor->id) : $request;
    }

    private function org(string $path): string
    {
        return "/api/agent/v1/organizations/{$this->organization->id}{$path}";
    }

    /** A call from Tom's number: a conversation already linked to Tom. */
    private function tomsCall(): Conversation
    {
        $id = $this->agent()->postJson('/api/agent/v1/calls/inbound', ['to' => '+13125550142', 'from' => '+17735550111', 'provider' => 'twilio', 'provider_sid' => 'CA-tom'])->assertCreated()->json('call.conversation_id');

        return Conversation::withoutGlobalScopes()->findOrFail($id);
    }

    private function ticket(array $attributes): Ticket
    {
        Organization::setCurrent($this->organization);
        try {
            return Ticket::create(['subject' => 'Something', 'body' => 'x', ...$attributes]);
        } finally {
            Organization::setCurrent(null);
        }
    }

    // ── Scope ───────────────────────────────────────────────────────────

    public function test_an_unknown_or_foreign_conversation_header_is_a_404(): void
    {
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        Organization::setCurrent($other);
        $foreign = Conversation::create(['identifier_id' => Identifier::resolve(IdentifierType::WebSession, 'x')->id, 'channel' => Channel::WebChat]);
        Organization::setCurrent(null);

        $this->agent($foreign)->getJson($this->org('/tickets'))->assertNotFound()->assertJsonPath('error', 'unknown_conversation');
        $this->withToken(self::SECRET)->withHeader('X-Veyra-Conversation', 'abc')->getJson($this->org('/tickets'))->assertNotFound();
    }

    // ── Contacts ────────────────────────────────────────────────────────

    public function test_lookup_by_name_finds_matches_and_masks_strangers_on_a_customer_conversation(): void
    {
        // Staff (Ask): the record in full.
        $this->agent()->getJson($this->org('/contacts/lookup?name=tom'))->assertOk()
            ->assertJsonPath('found', true)->assertJsonPath('matched_by', 'name')->assertJsonPath('masked', false)
            ->assertJsonPath('contact.email', 'tom@example.test');

        // Several matches come back as a list.
        Organization::setCurrent($this->organization);
        Contact::create(['name' => 'Tomasz Nowak']);
        Organization::setCurrent(null);
        $this->agent()->getJson($this->org('/contacts/lookup?name=tom'))->assertOk()->assertJsonPath('found', false)->assertJsonCount(2, 'matches');

        // An anonymous visitor naming Tom gets a masked record and no history.
        $this->agent($this->chat)->getJson($this->org('/contacts/lookup?name=Tom%20Byrne'))->assertOk()
            ->assertJsonPath('found', true)->assertJsonPath('linked', false)->assertJsonPath('masked', true)
            ->assertJsonPath('contact.phone', '•••0111')->assertJsonPath('contact.email', 't•••@example.test')
            ->assertJsonPath('open_tickets', [])->assertJsonPath('conversations', []);

        // And cannot reach a record by id at all.
        $this->agent($this->chat)->getJson($this->org("/contacts/lookup?contact_id={$this->tom->id}"))->assertOk()->assertJsonPath('found', false);

        // Tom on his own call sees himself, by default identifier or by id.
        $call = $this->tomsCall();
        $this->agent($call)->getJson($this->org("/contacts/lookup?contact_id={$this->tom->id}"))->assertOk()
            ->assertJsonPath('found', true)->assertJsonPath('linked', true)->assertJsonPath('contact.phone', '+17735550111');
    }

    public function test_registering_a_chat_visitor_links_the_conversation_and_never_duplicates(): void
    {
        $this->agent($this->chat)->postJson($this->org('/contacts'), ['name' => 'Priya Shah', 'email' => 'Priya@Example.test'])->assertCreated()
            ->assertJsonPath('created', true)->assertJsonPath('conversation_linked', true)->assertJsonPath('contact.email', 'priya@example.test');

        $priya = Contact::withoutGlobalScopes()->where('name', 'Priya Shah')->sole();
        $this->assertSame($priya->id, $this->chat->refresh()->contact_id);
        $this->assertSame($priya->id, $this->chat->identifier()->withoutGlobalScopes()->first()->contact_id, 'the web session joins her record');
        $this->assertDatabaseHas('activities', ['subject_type' => (new Conversation)->getMorphClass(), 'subject_id' => $this->chat->id, 'type' => 'contact_linked', 'actor' => 'agent']);

        // The model asks again with only a name: the conversation's person comes back.
        $this->agent($this->chat)->postJson($this->org('/contacts'), ['name' => 'Priya'])->assertOk()
            ->assertJsonPath('created', false)->assertJsonPath('reason', 'already_linked')->assertJsonPath('contact.id', $priya->id);
        $this->assertSame(3, Contact::withoutGlobalScopes()->count());
    }

    public function test_registering_with_a_known_phone_returns_that_person_and_links_this_conversation(): void
    {
        $this->agent($this->chat)->postJson($this->org('/contacts'), ['name' => 'Maria', 'phone' => '(773) 555-0199'] /* no country code: matched on the national number */)->assertOk()
            ->assertJsonPath('created', false)->assertJsonPath('reason', 'matched')->assertJsonPath('contact.id', $this->maria->id)
            ->assertJsonPath('contact.name', 'Maria Delgado'); // never overwritten by what the model heard

        $this->assertSame($this->maria->id, $this->chat->refresh()->contact_id);
    }

    public function test_updating_a_contact_is_limited_to_the_person_in_the_conversation(): void
    {
        $call = $this->tomsCall();

        $this->agent($call)->patchJson($this->org("/contacts/{$this->maria->id}"), ['name' => 'Hacked'])->assertForbidden()->assertJsonPath('error', 'not_permitted');
        $this->assertSame('Maria Delgado', $this->maria->refresh()->name);

        // Someone else's email is refused in words the agent can repeat.
        $this->agent($call)->patchJson($this->org("/contacts/{$this->tom->id}"), ['email' => 'maria@example.test'])->assertStatus(422)
            ->assertJsonFragment(['email' => ["That email is already on another customer's record, so it was not changed. The team can merge the records."]]);

        $this->agent($call)->patchJson($this->org("/contacts/{$this->tom->id}"), ['phone' => '+1 312 555 0100', 'company' => 'Byrne Builders'])->assertOk()
            ->assertJsonPath('contact.phone', '+13125550100')->assertJsonPath('contact.company', 'Byrne Builders');
        $this->assertSame($this->tom->id, Identifier::withoutGlobalScopes()->where('value', '+13125550100')->value('contact_id'), 'the new number joins his history');
        $this->assertDatabaseHas('activities', ['subject_id' => $this->tom->id, 'type' => 'updated', 'actor' => 'agent']);

        // An anonymous chat cannot edit anybody.
        $this->agent($this->chat)->patchJson($this->org("/contacts/{$this->tom->id}"), ['name' => 'x'])->assertForbidden();
    }

    public function test_notes_and_history_respect_the_conversation(): void
    {
        $call = $this->tomsCall();
        $this->agent($call)->postJson($this->org("/contacts/{$this->tom->id}/notes"), ['body' => 'Gate code 4411.'])->assertCreated();
        $this->agent($call)->postJson($this->org("/contacts/{$this->maria->id}/notes"), ['body' => 'x'])->assertForbidden();
        $this->agent($call)->postJson($this->org("/conversations/{$call->id}/notes"), ['body' => 'Asked about the invoice.'])->assertCreated();
        $this->agent($call)->postJson($this->org("/conversations/{$this->chat->id}/notes"), ['body' => 'x'])->assertForbidden();
        $this->assertSame(2, Note::withoutGlobalScopes()->whereNull('author_id')->count());

        $this->ticket(['subject' => 'Grinding noise', 'contact_id' => $this->tom->id]);

        // The customer-facing history has no internal notes.
        $this->agent($call)->getJson($this->org("/contacts/{$this->tom->id}/history"))->assertOk()
            ->assertJsonPath('contact.id', $this->tom->id)->assertJsonPath('tickets.0.subject', 'Grinding noise')
            ->assertJsonPath('conversations.0.current', true)->assertJsonPath('notes', []);
        $this->agent()->getJson($this->org("/contacts/{$this->tom->id}/history"))->assertOk()->assertJsonPath('notes.0.body', 'Gate code 4411.');
        $this->agent($call)->getJson($this->org("/contacts/{$this->maria->id}/history"))->assertNotFound();
    }

    public function test_linking_a_conversation_takes_the_phone_or_email_on_file(): void
    {
        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/link"), ['email' => 'nobody@example.test'])->assertStatus(422);
        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/link"), ['phone' => '773-555-0111', 'contact_id' => $this->maria->id])->assertStatus(422);
        $this->assertNull($this->chat->refresh()->contact_id);

        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/link"), ['phone' => '773-555-0111'])->assertOk()
            ->assertJsonPath('linked', true)->assertJsonPath('mode', 'identifier')->assertJsonPath('contact.id', $this->tom->id);
        $this->assertSame($this->tom->id, $this->chat->refresh()->contact_id);

        // Now linked, Tom's own record is visible on the chat.
        $this->agent($this->chat)->getJson($this->org("/contacts/lookup?contact_id={$this->tom->id}"))->assertJsonPath('linked', true);

        // A call from Tom's number claiming to be Maria: the number stays Tom's.
        $call = $this->tomsCall();
        $this->agent($call)->postJson($this->org("/conversations/{$call->id}/link"), ['email' => 'maria@example.test'])->assertOk()->assertJsonPath('mode', 'conversation');
        $this->assertSame($this->maria->id, $call->refresh()->contact_id);
        $this->assertSame($this->tom->id, Identifier::withoutGlobalScopes()->where('value', '+17735550111')->value('contact_id'));
        $this->assertSame($this->maria->id, Call::withoutGlobalScopes()->where('conversation_id', $call->id)->value('contact_id'));
    }

    // ── Tickets ─────────────────────────────────────────────────────────

    public function test_a_ticket_from_a_conversation_is_typed_routed_and_tied_to_that_customer(): void
    {
        $call = $this->tomsCall();

        $this->agent($call)->postJson($this->org('/tickets'), ['subject' => 'x', 'body' => 'x', 'contact_id' => $this->maria->id])->assertForbidden();

        $this->agent($call)->postJson($this->org('/tickets'), ['subject' => 'Double charge', 'body' => 'Charged twice in September.', 'type' => 'BILLING', 'priority' => 'high'])->assertCreated()
            ->assertJsonPath('ticket.type', 'Billing')->assertJsonPath('ticket.assignees', ['Sam Rivera'])->assertJsonPath('type_note', null);
        $ticket = Ticket::withoutGlobalScopes()->where('subject', 'Double charge')->sole();
        $this->assertSame([$this->tom->id, $call->id], [$ticket->contact_id, $ticket->conversation_id]);
        $this->assertSame(1, $this->sam->notifications()->count());

        // A type the business does not have is filed under the default, and says so.
        $this->agent($call)->postJson($this->org('/tickets'), ['subject' => 'Leak', 'body' => 'x', 'type' => 'Plumbing'])->assertCreated()
            ->assertJsonPath('ticket.type', 'General')->assertJsonPath('ticket.assignees', ['Ada Owner'])
            ->assertJsonPath('type_note', '"Plumbing" is not one of this business\'s ticket types, so it was filed as General.');
    }

    public function test_ticket_status_by_number_is_only_the_customers_own(): void
    {
        $call = $this->tomsCall();
        $toms = $this->ticket(['subject' => 'Grinding noise', 'contact_id' => $this->tom->id, 'status' => TicketStatus::Pending]);
        $marias = $this->ticket(['subject' => 'Refund', 'contact_id' => $this->maria->id]);

        $this->agent($call)->getJson($this->org("/tickets/{$toms->number}"))->assertOk()
            ->assertJsonPath('ticket.reference', "#{$toms->number}")->assertJsonPath('ticket.status', 'pending')->assertJsonPath('ticket.status_label', 'Pending');
        $this->agent($call)->getJson($this->org("/tickets/{$marias->number}"))->assertNotFound()
            ->assertJsonPath('message', "There is no ticket #{$marias->number} on this customer's record.");
        $this->agent($call)->getJson($this->org('/tickets/999'))->assertNotFound();
        $this->agent()->getJson($this->org("/tickets/{$marias->number}"))->assertOk()->assertJsonPath('ticket.subject', 'Refund');

        // The list follows the same rule.
        $this->agent($call)->getJson($this->org('/tickets?status=open'))->assertOk()->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.subject', 'Grinding noise');
        $this->agent($this->chat)->getJson($this->org('/tickets'))->assertOk()->assertJsonCount(0, 'tickets');
        $this->agent()->getJson($this->org('/tickets'))->assertOk()->assertJsonCount(2, 'tickets');

        // Another tenant's path cannot see it either.
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        $this->agent()->getJson("/api/agent/v1/organizations/{$other->id}/tickets/{$toms->number}")->assertNotFound();
    }

    public function test_the_agent_can_reopen_and_add_to_a_ticket_but_not_close_the_teams_work(): void
    {
        $call = $this->tomsCall();
        $ticket = $this->ticket(['subject' => 'No heat', 'contact_id' => $this->tom->id, 'status' => TicketStatus::Resolved, 'priority' => 'high']);
        Organization::setCurrent($this->organization);
        $ticket->assignees()->sync([$this->sam->id]);
        Organization::setCurrent(null);
        $path = $this->org("/tickets/{$ticket->number}");

        $this->agent($call)->patchJson($path, [])->assertStatus(422)->assertJsonPath('error', 'nothing_to_change');
        $this->agent($call)->patchJson($path, ['status' => 'closed'])->assertStatus(422)->assertJsonPath('errors.status.0', 'Only the team can close a ticket.');
        $this->agent($call)->patchJson($path, ['status' => 'in_progress'])->assertStatus(422);
        $this->agent($call)->patchJson($path, ['priority' => 'low'])->assertStatus(422);
        $this->agent($call)->patchJson($path, ['type' => 'Billing'])->assertStatus(422);

        $this->agent($call)->patchJson($path, ['status' => 'open', 'priority' => 'urgent', 'note' => 'Heat went out again this morning.'])->assertOk()
            ->assertJsonPath('ticket.status', 'open')->assertJsonPath('ticket.priority', 'urgent')
            ->assertJsonPath('changes', ['status Resolved → Open', 'priority Urgent', 'note added']);
        $ticket->refresh();
        $this->assertNull($ticket->resolved_at);
        $this->assertSame('Heat went out again this morning.', Note::withoutGlobalScopes()->where('notable_id', $ticket->id)->value('body'));
        $this->assertSame(1, $this->sam->notifications()->where('type', 'ticket.reopened')->count());
        $this->assertSame(['status_changed', 'priority_changed', 'note_added'], Activity::withoutGlobalScopes()->where('subject_id', $ticket->id)->where('actor', 'agent')->orderBy('id')->pluck('type')->all());

        // Waiting on the customer, and back.
        $this->agent($call)->patchJson($path, ['status' => 'pending'])->assertOk()->assertJsonPath('ticket.status', 'pending');

        // Resolving is only for withdrawing the agent's own ticket on this conversation.
        $this->agent($call)->patchJson($path, ['status' => 'resolved'])->assertStatus(422);
        $own = $this->agent($call)->postJson($this->org('/tickets'), ['subject' => 'Book a tune-up', 'body' => 'x'])->json('ticket.number');
        $this->agent($this->chat)->patchJson($this->org("/tickets/{$own}"), ['status' => 'resolved'])->assertNotFound();
        $this->agent($call)->patchJson($this->org("/tickets/{$own}"), ['status' => 'resolved', 'note' => 'Customer booked online instead.'])->assertOk()->assertJsonPath('ticket.status', 'resolved');

        // Closed is final for the agent.
        $closed = $this->ticket(['subject' => 'Old', 'contact_id' => $this->tom->id, 'status' => TicketStatus::Closed]);
        $this->agent($call)->patchJson($this->org("/tickets/{$closed->number}"), ['status' => 'open'])->assertStatus(422)
            ->assertJsonPath('errors.status.0', "Ticket #{$closed->number} is closed and only the team can reopen it. Raise a new ticket that mentions #{$closed->number} instead.");
    }

    public function test_an_unassigned_ticket_is_routed_to_its_types_team_when_the_agent_touches_it(): void
    {
        $ticket = $this->ticket(['subject' => 'Invoice copy', 'contact_id' => $this->tom->id, 'ticket_type_id' => $this->billing->id, 'type' => 'Billing']);

        // The model echoes the current type and priority back: not a change, so not refused.
        $this->agent()->patchJson($this->org("/tickets/{$ticket->number}"), ['note' => 'Wants it emailed.', 'type' => 'billing', 'priority' => 'normal'])->assertOk()
            ->assertJsonPath('ticket.assignees', ['Sam Rivera'])->assertJsonPath('changes', ['assigned to Sam Rivera', 'note added']);
        $this->assertSame(1, $this->sam->notifications()->where('type', 'ticket.assigned')->count());
    }

    // ── Conversations ───────────────────────────────────────────────────

    public function test_summary_tags_and_reminders_land_on_the_thread(): void
    {
        Organization::setCurrent($this->organization);
        Tag::create(['name' => 'Billing']);
        Organization::setCurrent(null);

        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/summary"), ['summary' => 'Asked for an invoice copy.', 'tags' => ['billing', 'invoice', 'billing']])->assertOk()
            ->assertJsonPath('tags_added', ['Billing', 'invoice']);
        $this->assertSame(2, Tag::withoutGlobalScopes()->count(), 'the existing tag was reused');
        $this->assertSame('Summary: Asked for an invoice copy.', Note::withoutGlobalScopes()->where('notable_id', $this->chat->id)->value('body'));

        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/reminders"), ['text' => 'Send the invoice', 'due_in_minutes' => 120, 'teammate' => 'sam'])->assertCreated()
            ->assertJsonPath('reminder.for', 'Sam Rivera')->assertJsonPath('reminder.teammate_matched', true);
        $this->assertSame($this->sam->id, Reminder::withoutGlobalScopes()->sole()->user_id);

        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/reminders"), ['text' => 'x', 'due_at' => now()->subDay()->toIso8601String()])->assertStatus(422);
        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/reminders"), ['text' => 'x'])->assertStatus(422);
    }

    public function test_a_hand_off_assigns_flags_and_notifies_someone(): void
    {
        $this->agent($this->chat)->postJson($this->org("/conversations/{$this->chat->id}/handoff"), ['reason' => 'Wants to talk to Sam about a refund.', 'teammate' => 'Sam'])->assertOk()
            ->assertJsonPath('assigned_to', ['Sam Rivera'])->assertJsonPath('teammate_matched', true)->assertJsonPath('tag', 'Needs attention');

        $chat = $this->chat->refresh();
        $this->assertSame(['Sam Rivera'], $chat->assignees()->pluck('name')->all());
        Organization::setCurrent($this->organization);
        $this->assertSame(['Needs attention'], $chat->tags()->pluck('name')->all());
        Organization::setCurrent(null);
        $this->assertSame(1, $chat->unread_count);
        $this->assertSame(1, $this->sam->notifications()->where('type', 'conversation.handoff')->count());
        $this->assertDatabaseHas('activities', ['subject_id' => $chat->id, 'type' => 'handed_off', 'actor' => 'agent']);

        // Nobody named, nobody assigned: the owners hear about it instead.
        $call = $this->tomsCall();
        Organization::setCurrent($this->organization);
        $call->update(['status' => ConversationStatus::Closed]);
        Organization::setCurrent(null);
        $this->agent($call)->postJson($this->org("/conversations/{$call->id}/handoff"), ['reason' => 'Upset about the bill.', 'urgency' => 'urgent', 'teammate' => 'Zed'])->assertOk()
            ->assertJsonPath('assigned_to', [])->assertJsonPath('notified', ['Ada Owner'])->assertJsonPath('teammate_matched', false);
        $this->assertSame(ConversationStatus::Open, $call->refresh()->status, 'a hand-off reopens the thread');

        // A team by ticket type.
        $this->agent($call)->postJson($this->org("/conversations/{$call->id}/handoff"), ['reason' => 'Billing question.', 'ticket_type' => 'billing'])->assertOk()->assertJsonPath('assigned_to', ['Sam Rivera']);

        // Only the conversation the agent is having.
        $this->agent($call)->postJson($this->org("/conversations/{$this->chat->id}/handoff"), ['reason' => 'x'])->assertForbidden();
    }

    // ── Leads ───────────────────────────────────────────────────────────

    public function test_a_prospect_is_put_in_the_pipeline_once_and_only_moved_forward(): void
    {
        Organization::setCurrent($this->organization);
        $pipeline = Pipeline::create(['name' => 'Sales', 'is_default' => true]);
        foreach (['New', 'Contacted', 'Quoted', 'Won'] as $i => $name) {
            $pipeline->stages()->create(['name' => $name, 'position' => $i]);
        }
        Organization::setCurrent(null);

        // An unidentified visitor has no contact to put in the pipeline.
        $this->agent($this->chat)->postJson($this->org('/leads'), ['note' => 'Wants a quote'])->assertForbidden();

        $call = $this->tomsCall();
        $this->agent($call)->postJson($this->org('/leads'), ['note' => 'Wants a quote for a new furnace.'])->assertCreated()->assertJsonPath('lead.stage', 'New');
        $this->agent($call)->postJson($this->org('/leads'), ['stage' => 'quoted'])->assertOk()->assertJsonPath('created', false)->assertJsonPath('moved', true)->assertJsonPath('lead.stage', 'Quoted');
        $this->agent($call)->postJson($this->org('/leads'), ['stage' => 'New'])->assertOk()->assertJsonPath('moved', false)->assertJsonPath('lead.stage', 'Quoted')
            ->assertJsonPath('note', 'The lead is already at Quoted; the agent only moves leads forward.');
        $this->agent($call)->postJson($this->org('/leads'), ['stage' => 'Won'])->assertStatus(422)->assertJsonPath('errors.stage.0', 'Only the team moves a lead to Won.');
        $this->agent($call)->postJson($this->org('/leads'), ['contact_id' => $this->maria->id])->assertForbidden();

        $this->assertSame(1, Lead::withoutGlobalScopes()->count());
        $this->assertSame('Wants a quote for a new furnace.', Lead::withoutGlobalScopes()->sole()->outreach_note);
    }

    // ── Calls ───────────────────────────────────────────────────────────

    public function test_recent_calls_on_a_customer_conversation_are_only_theirs(): void
    {
        $call = $this->tomsCall();
        $this->agent()->postJson('/api/agent/v1/calls/inbound', ['to' => '+13125550142', 'from' => '+17735550199', 'provider' => 'twilio', 'provider_sid' => 'CA-maria'])->assertCreated();

        $this->agent()->getJson($this->org('/calls'))->assertOk()->assertJsonCount(2, 'calls');
        $this->agent($call)->getJson($this->org('/calls'))->assertOk()->assertJsonCount(1, 'calls')->assertJsonPath('calls.0.contact_id', $this->tom->id);
        $this->agent($this->chat)->getJson($this->org('/calls'))->assertOk()->assertJsonCount(0, 'calls');
    }

    // ── Context and provisioning ────────────────────────────────────────

    public function test_the_bundle_names_the_chat_session_and_the_actions_an_owner_switched_off(): void
    {
        Organization::setCurrent($this->organization);
        try {
            Action::create(['kind' => ActionKind::Internal, 'slug' => 'hand_off', 'name' => 'Hand off', 'description' => 'x', 'enabled' => false]);
            $bundle = app(CallContextBuilder::class)->forConversation($this->chat);
        } finally {
            Organization::setCurrent(null);
        }

        $this->assertSame(['conversation_id' => $this->chat->id, 'channel' => 'web_chat'], $bundle['session']);
        $this->assertSame(['hand_off'], $bundle['disabled_actions']);
    }

    public function test_the_starter_worker_gets_the_front_desk_tools_and_existing_orgs_are_upgraded_without_undoing_owner_choices(): void
    {
        Organization::setCurrent($this->organization);
        try {
            $worker = Expert::query()->where('slug', 'ops')->sole();
            // What an organization provisioned before this change looks like…
            $stock = Action::create(['kind' => ActionKind::Internal, 'slug' => 'find_contact', 'name' => 'Find contact', 'description' => 'Look up a customer by phone number or email.', 'is_idempotent' => true]);
            $edited = Action::create(['kind' => ActionKind::Internal, 'slug' => 'create_ticket', 'name' => 'Create ticket', 'description' => 'Our own words.', 'is_durable_write' => true]);
            // …and an owner who switched one tool off and ungranted another.
            Action::create(['kind' => ActionKind::Internal, 'slug' => 'save_lead', 'name' => 'Save lead', 'description' => 'x', 'enabled' => false]);
            $worker->actions()->attach([$stock->id, $edited->id]);
        } finally {
            Organization::setCurrent(null);
        }

        $this->artisan('veyra:provision-agent', ['organization' => 'northwind'])->assertSuccessful();
        $this->artisan('veyra:provision-agent', ['organization' => 'northwind'])->assertSuccessful();

        Organization::setCurrent($this->organization);
        try {
            $this->assertStringStartsWith("Find a customer's record by phone, email or name.", $stock->refresh()->description, 'stock text upgraded');
            $this->assertArrayHasKey('name', $stock->parameters['properties']);
            $this->assertSame('Our own words.', $edited->refresh()->description, 'an edited description is the owner\'s');
            $this->assertFalse(Action::query()->where('slug', 'save_lead')->sole()->enabled, 'switched off stays off');
            $this->assertSame(count(StarterAgent::catalog()), Action::query()->count(), 'nothing created twice');
            $granted = $worker->actions()->pluck('slug')->sort()->values()->all();
            $this->assertContains('hand_off', $granted);
            $this->assertContains('ticket_status', $granted);
            $this->assertNotContains('save_lead', $granted, 'an existing row is not re-granted on a backfill');
            $this->assertNotContains('send_message', Action::query()->pluck('slug')->all());
        } finally {
            Organization::setCurrent(null);
        }
    }
}
