<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\Organization\StarterAgent;
use Illuminate\Console\Command;

/**
 * Give organizations created before the starter agent existed a working
 * agent, and bring every organization's built-in actions up to the current
 * catalog (new front-desk tools created and granted, unedited stock rows
 * upgraded; nothing an owner changed is touched). Safe to repeat.
 */
class ProvisionAgent extends Command
{
    protected $signature = 'veyra:provision-agent {organization? : id or slug; every organization when omitted}';

    protected $description = 'Create the starter agent for organizations that have none, and sync every organization\'s built-in actions';

    public function handle(StarterAgent $starter): int
    {
        $arg = $this->argument('organization');
        $organizations = $arg
            // A slug is compared as text only: Postgres rejects 'test' as an integer id.
            ? Organization::query()->where(ctype_digit((string) $arg) ? 'id' : 'slug', $arg)->get()
            : Organization::query()->get();

        foreach ($organizations as $organization) {
            Organization::setCurrent($organization);
            try {
                $before = \App\Models\Expert::query()->count();
                $starter->provision($organization);
                $after = \App\Models\Expert::query()->count();
                $sync = $starter->syncInternalActions();
                $this->line(sprintf('%-24s %s; actions created: %s; upgraded: %s', $organization->slug,
                    $after > $before ? 'starter agent created' : 'already has experts',
                    implode(', ', $sync['created']) ?: 'none', implode(', ', $sync['upgraded']) ?: 'none'));
            } finally {
                Organization::setCurrent(null);
            }
        }

        return self::SUCCESS;
    }
}
