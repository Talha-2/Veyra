<?php

namespace App\Http\Controllers\Studio;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use App\Http\Controllers\Controller;
use App\Models\Invitation;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Settings, on Z360's three-way split: organization (account), product, user.
 *
 * One controller because every page here is a small form over one model;
 * splitting it into nine would be nine files of the same shape.
 */
class SettingsController extends Controller
{
    // ── Organization ────────────────────────────────────────────────────

    public function organization(): Response
    {
        $org = Organization::current();

        return Inertia::render('studio/settings/organization', [
            'organization' => $org->only(['name', 'slug', 'timezone']),
        ]);
    }

    public function updateOrganization(Request $request): RedirectResponse
    {
        $this->authorize('administer-organization');
        $validated = $request->validate(['name' => ['required', 'string', 'max:120'], 'timezone' => ['required', 'timezone']]);
        $organization = Organization::current();
        $oldName = $organization->name;

        if ($validated['name'] !== $oldName) {
            // The identifier follows the name. Nothing looks an organization
            // up by it (the agent layer and the API use the numeric id), so
            // a rename cannot orphan anything.
            $validated['slug'] = Organization::uniqueSlug($validated['name'], $organization->id);

            // Carry the new name to where the agent says it, but only where
            // it still says the old one: never overwrite what someone wrote.
            $profile = \App\Models\BusinessProfile::query()->first();
            if ($profile && ($profile->name === null || $profile->name === $oldName)) {
                $profile->update(['name' => $validated['name']]);
            }
            $config = \App\Models\AgentConfig::query()->first();
            if ($config && filled($config->greeting) && str_contains($config->greeting, $oldName)) {
                $config->update(['greeting' => str_replace($oldName, $validated['name'], $config->greeting)]);
            }
        }
        $organization->update($validated);

        return back()->with('success', isset($validated['slug']) ? "Organization renamed. Its identifier is now {$validated['slug']}." : 'Organization updated.');
    }

    public function team(): Response
    {
        $org = Organization::current();

        return Inertia::render('studio/settings/team', [
            'members' => Membership::query()->where('organization_id', $org->id)->with('user:id,name,email')->get()->map(fn (Membership $m) => [
                'id' => $m->id, 'user_id' => $m->user_id, 'name' => $m->user->name, 'email' => $m->user->email,
                'role' => $m->role->value, 'role_label' => $m->role->label(), 'surfaces' => $m->surfaces ?? [],
                'extension' => $m->extension, 'phone' => $m->phone, 'joined_at' => $m->created_at?->toIso8601String(),
            ])->all(),
            'invitations' => Invitation::query()->pending()->with('invitedBy:id,name')->latest()->get()->map(fn (Invitation $i) => [
                'id' => $i->id, 'email' => $i->email, 'role' => $i->role->label(), 'surfaces' => $i->surfaces,
                'invited_by' => $i->invitedBy?->name, 'expires_at' => $i->expires_at->toIso8601String(),
                'link' => url("/invitations/{$i->token}"),
            ])->all(),
            'roles' => collect(OrganizationRole::cases())->map(fn ($r) => ['value' => $r->value, 'label' => $r->label(), 'default_surfaces' => array_map(fn ($s) => $s->value, $r->defaultSurfaces())])->all(),
            // Not `surfaces`: that name is the shared prop the shell and palette read.
            'surface_options' => collect(Surface::cases())->map(fn ($s) => ['value' => $s->value, 'label' => $s->label(), 'tagline' => $s->tagline()])->all(),
            'can_manage' => request()->user()->can('administer-organization'),
            'me' => request()->user()->getKey(),
        ]);
    }

    public function invite(Request $request): RedirectResponse
    {
        $this->authorize('administer-organization');
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'role' => ['required', Rule::enum(OrganizationRole::class)],
            'surfaces' => ['required', 'array', 'min:1'],
            'surfaces.*' => [Rule::enum(Surface::class)],
        ]);

        $email = mb_strtolower($validated['email']);
        if (Membership::query()->whereHas('user', fn ($q) => $q->where('email', $email))->exists()) {
            return back()->withErrors(['email' => 'That person is already on the team.']);
        }
        if (Invitation::query()->pending()->where('email', $email)->exists()) {
            return back()->withErrors(['email' => 'An invitation is already pending for that address.']);
        }

        Invitation::issue($email, OrganizationRole::from($validated['role']), $validated['surfaces'], $request->user());

        return back()->with('success', "Invitation sent to {$email}.");
    }

    public function revokeInvitation(Invitation $invitation): RedirectResponse
    {
        $this->authorize('administer-organization');
        $invitation->delete();

        return back();
    }

    public function updateMember(Request $request, Membership $membership): RedirectResponse
    {
        $this->authorize('administer-organization');
        abort_unless($membership->organization_id === Organization::currentId(), 404);

        $validated = $request->validate([
            'role' => ['sometimes', Rule::enum(OrganizationRole::class)],
            'surfaces' => ['sometimes', 'array', 'min:1'],
            'surfaces.*' => [Rule::enum(Surface::class)],
            'extension' => ['sometimes', 'nullable', 'string', 'max:10'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);

        // The last owner cannot demote themselves; there must always be one.
        if (isset($validated['role']) && $membership->role === OrganizationRole::Owner && $validated['role'] !== 'owner') {
            $owners = Membership::query()->where('organization_id', $membership->organization_id)->where('role', OrganizationRole::Owner)->count();
            if ($owners <= 1) {
                return back()->withErrors(['role' => 'An organization needs at least one owner.']);
            }
        }

        $membership->update($validated);

        return back()->with('success', 'Member updated.');
    }

    public function removeMember(Request $request, Membership $membership): RedirectResponse
    {
        $this->authorize('administer-organization');
        abort_unless($membership->organization_id === Organization::currentId(), 404);
        abort_if($membership->user_id === $request->user()->getKey(), 422, 'You cannot remove yourself.');

        $membership->delete();

        return back()->with('success', 'Removed from the team.');
    }

    // ── Product ─────────────────────────────────────────────────────────

    public function ticketTypes(): Response
    {
        return Inertia::render('studio/settings/ticket-types', [
            'types' => TicketType::query()->withCount('tickets')->orderBy('position')->get()->map(fn (TicketType $t) => [
                'id' => $t->id, 'name' => $t->name, 'color' => $t->color, 'description' => $t->description,
                'default_assignee_ids' => $t->default_assignee_ids ?? [], 'enabled' => $t->enabled, 'tickets_count' => $t->tickets_count,
            ])->all(),
            'team' => User::whereHas('memberships')->get(['id', 'name'])->all(),
        ]);
    }

    public function storeTicketType(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:60'], 'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'description' => ['nullable', 'string', 'max:300'], 'default_assignee_ids' => ['array'], 'default_assignee_ids.*' => ['integer', 'exists:users,id'],
        ]);
        TicketType::create([...$validated, 'position' => TicketType::query()->max('position') + 1]);

        return back();
    }

    public function updateTicketType(Request $request, TicketType $type): RedirectResponse
    {
        $type->update($request->validate([
            'name' => ['sometimes', 'string', 'max:60'], 'color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'description' => ['sometimes', 'nullable', 'string', 'max:300'], 'default_assignee_ids' => ['sometimes', 'array'],
            'default_assignee_ids.*' => ['integer', 'exists:users,id'], 'enabled' => ['sometimes', 'boolean'],
        ]));

        return back();
    }

    public function destroyTicketType(TicketType $type): RedirectResponse
    {
        $type->delete();

        return back();
    }

    public function pipelines(): Response
    {
        return Inertia::render('studio/settings/pipelines', [
            'pipelines' => Pipeline::query()->with('stages')->withCount('leads')->orderByDesc('is_default')->get()->map(fn (Pipeline $p) => [
                'id' => $p->id, 'name' => $p->name, 'is_default' => $p->is_default, 'leads_count' => $p->leads_count,
                'stages' => $p->stages->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'color' => $s->color, 'position' => $s->position])->all(),
            ])->all(),
        ]);
    }

    public function storePipeline(Request $request): RedirectResponse
    {
        $validated = $request->validate(['name' => ['required', 'string', 'max:80']]);
        $pipeline = Pipeline::create(['name' => $validated['name'], 'is_default' => ! Pipeline::query()->exists()]);
        foreach ([['New', '#4dcafa'], ['Contacted', '#ffdd03'], ['Won', '#62f6b5'], ['Lost', '#71717a']] as $i => [$n, $c]) {
            $pipeline->stages()->create(['organization_id' => $pipeline->organization_id, 'name' => $n, 'color' => $c, 'position' => $i]);
        }

        return back();
    }

    public function updatePipeline(Request $request, Pipeline $pipeline): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'stages' => ['sometimes', 'array', 'min:1', 'max:12'],
            'stages.*.id' => ['nullable', 'integer'],
            'stages.*.name' => ['required', 'string', 'max:60'],
            'stages.*.color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        if (isset($validated['name'])) {
            $pipeline->update(['name' => $validated['name']]);
        }

        if (isset($validated['stages'])) {
            $keep = [];
            foreach ($validated['stages'] as $i => $s) {
                $stage = $s['id'] ? $pipeline->stages()->find($s['id']) : null;
                $stage = $stage
                    ? tap($stage)->update(['name' => $s['name'], 'color' => $s['color'], 'position' => $i])
                    : $pipeline->stages()->create(['organization_id' => $pipeline->organization_id, 'name' => $s['name'], 'color' => $s['color'], 'position' => $i]);
                $keep[] = $stage->id;
            }
            // A removed stage's leads go to the first stage rather than
            // disappearing off the board.
            $first = $keep[0];
            $pipeline->leads()->whereNotIn('pipeline_stage_id', $keep)->update(['pipeline_stage_id' => $first]);
            $pipeline->stages()->whereNotIn('id', $keep)->delete();
        }

        return back()->with('success', 'Pipeline saved.');
    }

    // ── User ────────────────────────────────────────────────────────────

    public function profile(Request $request): Response
    {
        return Inertia::render('studio/settings/profile', [
            'user' => $request->user()->only(['name', 'email']),
        ]);
    }

    public function updateProfile(Request $request): RedirectResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user->id)],
        ]);
        $user->update($validated);

        return back()->with('success', 'Profile saved.');
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);
        $request->user()->update(['password' => Hash::make($validated['password'])]);

        return back()->with('success', 'Password changed.');
    }

    public function sessions(Request $request): Response
    {
        $sessions = \DB::table('sessions')->where('user_id', $request->user()->getKey())->orderByDesc('last_activity')->get()
            ->map(fn ($s) => [
                'id' => $s->id, 'ip' => $s->ip_address, 'agent' => str($s->user_agent ?? '')->limit(80)->value(),
                'last_active' => \Carbon\Carbon::createFromTimestamp($s->last_activity)->toIso8601String(),
                'current' => $s->id === $request->session()->getId(),
            ])->all();

        return Inertia::render('studio/settings/sessions', ['sessions' => $sessions]);
    }

    public function logoutOtherSessions(Request $request): RedirectResponse
    {
        $request->validate(['password' => ['required', 'current_password']]);
        Auth::logoutOtherDevices($request->input('password'));
        \DB::table('sessions')->where('user_id', $request->user()->getKey())->where('id', '!=', $request->session()->getId())->delete();

        return back()->with('success', 'Other sessions signed out.');
    }
}
