<?php

namespace Tests\Feature;

use App\Enums\ActionKind;
use App\Enums\OrganizationRole;
use App\Enums\ToolCallStatus;
use App\Models\Action;
use App\Models\Call;
use App\Models\CallTranscript;
use App\Models\Contact;
use App\Models\Delegation;
use App\Models\Organization;
use App\Models\ToolCall;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Desk call log: what happened, and the calls a person must look at. */
class DeskCallsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.url' => null]);
        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
    }

    private function seedCall(bool $timedOut): Call
    {
        Organization::setCurrent($this->organization);
        $contact = Contact::query()->firstOrCreate(['phone' => '+17735550111'], ['name' => 'Tom Byrne']);
        $book = Action::query()->firstOrCreate(['slug' => 'book_appointment'], ['kind' => ActionKind::Composio, 'name' => 'Book', 'description' => 'Book.', 'is_idempotent' => false, 'is_durable_write' => true]);
        $call = Call::create(['contact_id' => $contact->id, 'direction' => 'inbound', 'from_number' => '+17735550111', 'to_number' => '+13125550142', 'status' => 'completed', 'language' => 'en']);
        $call->forceFill(['duration_sec' => 214])->save();
        CallTranscript::create(['call_id' => $call->id, 'items' => [['role' => 'agent', 'text' => 'Hello'], ['role' => 'caller', 'text' => 'Move my visit']], 'metrics' => ['voice_to_voice' => ['p50' => 700, 'p95' => 2100]], 'summary' => 'Wanted Thursday.']);
        $delegation = Delegation::create(['call_id' => $call->id, 'sequence' => 1, 'transcript_delta' => 'Human: Move my visit', 'reply' => $timedOut ? 'Could not confirm.' : 'Booked.', 'status' => 'completed']);
        ToolCall::create(['action_id' => $book->id, 'call_id' => $call->id, 'delegation_id' => $delegation->id, 'action_slug' => 'book_appointment', 'kind' => ActionKind::Composio, 'arguments' => ['at' => '9'], 'status' => $timedOut ? ToolCallStatus::Timeout : ToolCallStatus::Succeeded, 'error' => $timedOut ? 'no response' : null, 'duration_ms' => 20000]);
        Organization::setCurrent(null);

        return $call;
    }

    public function test_the_log_flags_calls_whose_durable_action_timed_out(): void
    {
        $bad = $this->seedCall(timedOut: true);
        $good = $this->seedCall(timedOut: false);

        $this->actingAs($this->owner)->get('/desk/calls')->assertOk()->assertInertia(fn ($page) => $page
            ->component('desk/calls')
            ->has('calls.data', 2)
            ->where('counts.review', 1)
            ->where('calls.data.0.summary', 'Wanted Thursday.')
            ->where('calls.data.0.p95', 2100));

        $this->actingAs($this->owner)->get('/desk/calls?view=review')->assertOk()->assertInertia(fn ($page) => $page
            ->has('calls.data', 1)
            ->where('calls.data.0.id', $bad->id)
            ->where('calls.data.0.needs_review', true));

        $this->actingAs($this->owner)->get('/desk/calls?search=Byrne')->assertOk()->assertInertia(fn ($page) => $page->has('calls.data', 2));
        $this->assertNotSame($bad->id, $good->id);
    }

    public function test_the_detail_shows_the_handoff_with_its_tool_call_and_the_reconciliation_flag(): void
    {
        $call = $this->seedCall(timedOut: true);

        $this->actingAs($this->owner)->get("/desk/calls/{$call->id}")->assertOk()->assertInertia(fn ($page) => $page
            ->component('desk/call')
            ->where('call.contact.name', 'Tom Byrne')
            ->where('call.duration', '3:34')
            ->has('call.transcript', 2)
            ->has('call.delegations', 1)
            ->where('call.delegations.0.durable', false)
            ->where('call.delegations.0.tool_calls.0.status', 'timeout')
            ->where('call.delegations.0.tool_calls.0.needs_reconciliation', true)
            ->where('call.metrics.voice_to_voice.p95', 2100));
    }

    public function test_a_call_in_another_organization_is_not_found(): void
    {
        $call = $this->seedCall(timedOut: false);
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'UTC']);
        $stranger = User::create(['name' => 'S', 'email' => 's@other.test', 'password' => 'password']);
        $other->addMember($stranger, OrganizationRole::Owner);

        $this->actingAs($stranger)->get("/desk/calls/{$call->id}")->assertNotFound();
    }
}
