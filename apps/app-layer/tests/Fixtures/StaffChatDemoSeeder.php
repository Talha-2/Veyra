<?php

namespace Tests\Fixtures;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\StaffChatRoom;
use App\Models\User;
use App\Services\StaffChat;
use Illuminate\Database\Seeder;

class StaffChatDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local') || config('database.default') !== 'sqlite' || basename(config('database.connections.sqlite.database')) !== 'healthcare.sqlite') {
            throw new \RuntimeException('Staff chat demo requires the isolated local healthcare.sqlite database.');
        }
        $clinic = Organization::where('slug', 'healthcare-preview')->firstOrFail();
        $owner = User::where('email', 'demo@healthcare.test')->firstOrFail();
        Organization::setCurrent($clinic);
        try {
            $team = [];
            foreach ([['Reception · Demo', 'reception@healthcare.test'], ['Nurse Maryam · Demo', 'nurse@healthcare.test']] as [$name, $email]) {
                $user = User::firstOrCreate(['email' => $email], ['name' => $name, 'password' => 'healthcare-demo-only']);
                if (! $clinic->membershipFor($user)) {
                    $clinic->addMember($user, OrganizationRole::Member);
                }
                $team[] = $user;
            }
            $chat = app(StaffChat::class);
            $room = StaffChatRoom::where('name', 'Clinic handover · Demo')->first() ?? $chat->create($owner, ['kind' => 'channel', 'name' => 'Clinic handover · Demo', 'member_ids' => array_map(fn ($u) => $u->id, $team)]);
            $chat->send($team[0], $room, ['body' => 'Morning team. The provider calendars are ready for the clinic schedule. Please share shift updates here.', 'client_id' => 'demo-handover-1']);
            $chat->send($team[1], $room, ['body' => 'Thanks. I’ll coordinate with reception here between appointments.', 'client_id' => 'demo-handover-2']);
            $chat->send($team[0], $room, ['body' => 'Reception update: the next shift can use the shared provider calendar.', 'client_id' => 'demo-handover-live-update']);
            $direct = $chat->create($owner, ['kind' => 'direct', 'member_ids' => [$team[0]->id]]);
            $chat->send($team[0], $direct, ['body' => 'The afternoon handover is ready for your review.', 'client_id' => 'demo-direct-1']);
        } finally {
            Organization::setCurrent(null);
        }
    }
}
