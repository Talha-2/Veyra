<?php

namespace Tests\Fixtures;

use App\Models\Organization;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Database\Seeder;

class ClinicalDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local') || config('database.default') !== 'sqlite' || basename(config('database.connections.sqlite.database')) !== 'healthcare.sqlite') {
            throw new \RuntimeException('Clinical preview setup requires the isolated local healthcare.sqlite database.');
        }
        $clinic = Organization::where('slug', 'healthcare-preview')->firstOrFail();
        $user = User::where('email', 'demo@healthcare.test')->firstOrFail();
        Organization::setCurrent($clinic);
        try {
            Provider::where('name', 'Dr Ayesha · Demo')->firstOrFail()->update(['user_id' => $user->id]);
        } finally {
            Organization::setCurrent(null);
        }
    }
}
