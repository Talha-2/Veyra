<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Load the demo workspace into a deployed app, once.
 *
 * Runs only against an empty database (no organizations yet), so a restart or
 * redeploy never duplicates anything. On a public URL the seeder's
 * "password" password would let anyone in, so this refuses to run unless
 * DEMO_PASSWORD is set, and gives every demo account that password instead.
 */
class SeedDemo extends Command
{
    protected $signature = 'veyra:seed-demo';

    protected $description = 'Seed the demo workspace into an empty database, with DEMO_PASSWORD for the demo accounts';

    public function handle(): int
    {
        if (Organization::query()->withoutGlobalScopes()->exists()) {
            $this->info('Demo data skipped: the database already has organizations.');

            return self::SUCCESS;
        }

        $password = (string) env('DEMO_PASSWORD', '');
        if (strlen($password) < 12) {
            $this->error('Demo data skipped: set DEMO_PASSWORD (12+ characters) so the demo accounts are not open to anyone.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($password) {
            $this->callSilently('db:seed', ['--class' => DatabaseSeeder::class, '--force' => true]);
            User::query()->whereIn('email', ['owner@veyra.test', 'operator@veyra.test', 'builder@veyra.test'])
                ->get()->each(fn (User $u) => $u->forceFill(['password' => $password])->save());
        });

        $this->info('Demo data loaded. Sign in as owner@veyra.test with DEMO_PASSWORD.');

        return self::SUCCESS;
    }
}
