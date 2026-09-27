<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class TeamController extends Controller
{
    /**
     * Who is on the team and what they are carrying.
     *
     * Desk's version of the team page answers a shift question — who is loaded
     * up, who can take the next one — not an administrative one. Inviting people
     * and changing their access is Studio's business, and this page links there
     * rather than duplicating it.
     */
    public function index(Request $request): Response
    {
        $organization = Organization::current();

        $memberships = Membership::query()
            ->where('organization_id', $organization->getKey())
            ->with('user:id,name,email')
            ->get();

        // Presence, from the one signal we already keep: the last request each
        // person's session made. Only the database driver records it; under
        // any other driver presence is simply unknown rather than guessed.
        $lastActive = config('session.driver') === 'database'
            ? DB::table('sessions')
                ->whereIn('user_id', $memberships->pluck('user_id'))
                ->groupBy('user_id')
                ->selectRaw('user_id, max(last_activity) as last_activity')
                ->pluck('last_activity', 'user_id')
            : collect();

        $members = $memberships
            ->map(function (Membership $membership) use ($lastActive) {
                $user = $membership->user;
                $seen = $lastActive[$user->id] ?? null;

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $membership->role->label(),
                    'extension' => $membership->extension,
                    'phone' => $membership->phone,
                    'color' => $membership->avatar_color,
                    'open_conversations' => $user->assignedConversationCount(),
                    'open_tickets' => $user->openTicketCount(),
                    'last_active_at' => $seen ? Carbon::createFromTimestamp((int) $seen)->toIso8601String() : null,
                    'surfaces' => array_map(fn ($s) => $s->label(), $membership->accessibleSurfaces()),
                ];
            })
            ->sortByDesc('open_conversations')
            ->values()
            ->all();

        return Inertia::render('desk/team', [
            'members' => $members,
            // Desk cannot change access; only an admin in Studio can. Saying so
            // is better than showing controls that 403.
            'can_manage' => $request->user()->can('administer-organization'),
        ]);
    }
}
