<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Tickets and leads: the three views, adding from a column, and bulk changes. */
class DeskBoardsTest extends TestCase
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

    /** @return array<int, Ticket> */
    private function seedTickets(): array
    {
        Organization::setCurrent($this->organization);
        $a = Ticket::create(['subject' => 'Refund the deposit', 'status' => TicketStatus::Open, 'priority' => TicketPriority::Urgent, 'channel' => 'manual']);
        $b = Ticket::create(['subject' => 'Call back about parking', 'status' => TicketStatus::Pending, 'priority' => TicketPriority::Low, 'channel' => 'call', 'created_by_agent' => true]);
        $c = Ticket::create(['subject' => 'Old question', 'status' => TicketStatus::Resolved, 'priority' => TicketPriority::Normal, 'channel' => 'manual']);
        Organization::setCurrent(null);

        return [$a, $b, $c];
    }

    public function test_tickets_render_as_board_list_or_table(): void
    {
        $this->seedTickets();
        $as = $this->actingAs($this->owner);

        $as->get('/desk/tickets?view=board')->assertOk()->assertInertia(fn ($page) => $page
            ->component('desk/tickets')->where('layout', 'board')->where('scope', 'open')->has('tickets.data', 2));

        $as->get('/desk/tickets?view=list')->assertOk()->assertInertia(fn ($page) => $page
            ->where('layout', 'list')->has('tickets.data', 2));

        $as->get('/desk/tickets?view=table&sort=subject&dir=asc')->assertOk()->assertInertia(fn ($page) => $page
            ->where('layout', 'table')->where('sort.key', 'subject')
            ->where('tickets.data.0.subject', 'Call back about parking')
            ->has('tickets.last_page'));
    }

    public function test_old_links_that_put_the_filter_in_view_still_work(): void
    {
        $this->seedTickets();

        $this->actingAs($this->owner)->get('/desk/tickets?view=agent')->assertOk()->assertInertia(fn ($page) => $page
            ->where('scope', 'agent')->where('layout', 'list')->has('tickets.data', 1));

        $this->actingAs($this->owner)->get('/desk/tickets?scope=resolved&view=table')->assertOk()->assertInertia(fn ($page) => $page
            ->where('scope', 'resolved')->has('tickets.data', 1));
    }

    public function test_a_ticket_added_from_a_column_starts_in_that_status(): void
    {
        $this->actingAs($this->owner)->post('/desk/tickets', ['subject' => 'Chase the invoice', 'priority' => 'normal', 'status' => 'pending'])->assertRedirect();

        Organization::setCurrent($this->organization);
        $this->assertSame(TicketStatus::Pending, Ticket::query()->where('subject', 'Chase the invoice')->first()->status);
    }

    public function test_bulk_changes_every_selected_ticket(): void
    {
        [$a, $b] = $this->seedTickets();

        $this->actingAs($this->owner)->post('/desk/tickets/bulk', ['ids' => [$a->id, $b->id], 'status' => 'resolved', 'assignee_ids' => [$this->owner->id]])
            ->assertRedirect()->assertSessionHas('success');

        Organization::setCurrent($this->organization);
        foreach ([$a, $b] as $t) {
            $t->refresh();
            $this->assertSame(TicketStatus::Resolved, $t->status);
            $this->assertNotNull($t->resolved_at);
            $this->assertSame([$this->owner->id], $t->assignees()->pluck('users.id')->all());
        }
    }

    public function test_leads_render_every_view_and_bulk_move_between_stages(): void
    {
        Organization::setCurrent($this->organization);
        $pipeline = Pipeline::create(['name' => 'Sales', 'is_default' => true]);
        $new = PipelineStage::create(['pipeline_id' => $pipeline->id, 'name' => 'New', 'color' => '#0a84ff', 'position' => 0]);
        $won = PipelineStage::create(['pipeline_id' => $pipeline->id, 'name' => 'Won', 'color' => '#34c759', 'position' => 1]);
        $leads = collect(['Tom', 'Ana'])->map(fn ($name) => Lead::create([
            'contact_id' => Contact::create(['name' => $name])->id, 'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $new->id, 'source' => 'manual', 'value' => 100,
        ]));
        Organization::setCurrent(null);

        $as = $this->actingAs($this->owner);
        foreach (['board', 'list', 'table'] as $view) {
            $as->get("/desk/leads?view={$view}")->assertOk()->assertInertia(fn ($page) => $page->where('view', $view)->has('leads', 2));
        }
        $as->get('/desk/leads?view=kanban')->assertOk()->assertInertia(fn ($page) => $page->where('view', 'board'));

        $as->post('/desk/leads/bulk', ['ids' => $leads->pluck('id')->all(), 'action' => 'stage', 'pipeline_stage_id' => $won->id])->assertRedirect();

        Organization::setCurrent($this->organization);
        $this->assertSame(2, Lead::query()->where('pipeline_stage_id', $won->id)->count());
        Organization::setCurrent(null);

        $as->post('/desk/leads/bulk', ['ids' => [$leads[0]->id], 'action' => 'delete'])->assertRedirect();
        Organization::setCurrent($this->organization);
        $this->assertSame(1, Lead::query()->count());
        $this->assertSame(2, Contact::query()->count());
    }
}
