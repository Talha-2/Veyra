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

        $actions = collect([
            ['find_contact', 'Find contact', 'Look up a customer by phone number or email.', ['query' => ['type' => 'string']], ['query'], true, false],
            ['create_ticket', 'Create ticket', 'Raise a ticket for the team when an issue needs a person and cannot be resolved in the conversation.', ['subject' => ['type' => 'string'], 'body' => ['type' => 'string'], 'priority' => ['type' => 'string', 'enum' => ['low', 'normal', 'high', 'urgent']]], ['subject'], false, true],
            ['recent_calls', 'Recent calls', 'List recent calls with who called, how long, and what happened. Use `since` (ISO date-time) to bound the window.', ['since' => ['type' => 'string', 'format' => 'date-time'], 'contact_id' => ['type' => 'integer'], 'limit' => ['type' => 'integer']], [], true, false],
            ['recent_tickets', 'Recent tickets', 'List recent tickets: reference, subject, status, who it is assigned to.', ['contact_id' => ['type' => 'integer'], 'limit' => ['type' => 'integer']], [], true, false],
        ])->map(fn ($a) => Action::query()->firstOrCreate(['slug' => $a[0]], [
            'kind' => ActionKind::Internal,
            'name' => $a[1],
            'description' => $a[2],
            'parameters' => array_filter(['type' => 'object', 'properties' => $a[3], 'required' => $a[4] ?: null]),
            'is_idempotent' => $a[5],
            'is_durable_write' => $a[6],
        ]));

        $worker->actions()->syncWithoutDetaching($actions->whereIn('slug', ['find_contact', 'create_ticket'])->pluck('id')->all());

        TicketType::query()->firstOrCreate(['name' => 'General'], ['color' => '#4dcafa', 'description' => 'Anything that needs a person to follow up.', 'position' => 0, 'enabled' => true]);

        if (! Pipeline::query()->exists()) {
            $pipeline = Pipeline::create(['name' => 'Sales', 'is_default' => true]);
            foreach ([['New', '#4dcafa'], ['Contacted', '#ffdd03'], ['Quoted', '#9977ff'], ['Won', '#62f6b5']] as $i => [$name, $color]) {
                $pipeline->stages()->create(['name' => $name, 'color' => $color, 'position' => $i, 'organization_id' => $organization->id]);
            }
        }
    }

    private function expert(string $slug, string $name, AgentRuntime $runtime, int $position, string $description, string $prompt): Expert
    {
        $expert = new Expert(['slug' => $slug, 'name' => $name, 'description' => $description, 'system_prompt' => $prompt, 'runtime' => $runtime, 'position' => $position, 'enabled' => true]);
        $expert->forceFill(['is_builtin' => true])->save();

        return $expert;
    }
}
