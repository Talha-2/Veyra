<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\Organization\StarterAgent;
use Illuminate\Console\Command;

/** Give organizations created before the starter agent existed a working agent. Safe to repeat. */
class ProvisionAgent extends Command
{
    protected $signature = 'veyra:provision-agent {organization? : id or slug; every organization without experts when omitted}';

    protected $description = 'Create the starter agent (front desk, operations, built-in actions) for organizations that have none';

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
                $this->line(sprintf('%-24s %s', $organization->slug, $after > $before ? 'starter agent created' : 'already has experts'));
            } finally {
                Organization::setCurrent(null);
            }
        }

        return self::SUCCESS;
    }
}
