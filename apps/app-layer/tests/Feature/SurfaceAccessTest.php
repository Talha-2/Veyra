<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Desk and Studio are separate products. These tests are the proof.
 *
 * Every one of them describes a case a role-based permission model would get
 * wrong, which is why surface access lives on the membership.
 */
class SurfaceAccessTest extends TestCase
{
    use RefreshDatabase;

    private function organization(): Organization
    {
        return Organization::create([
            'name' => 'Northwind Services',
            'slug' => 'northwind',
            'timezone' => 'UTC',
        ]);
    }

    private function member(Organization $organization, OrganizationRole $role): User
    {
        $user = User::create([
            'name' => 'Test Person',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password',
        ]);

        $organization->addMember($user, $role);

        return $user;
    }

    public function test_an_owner_reaches_both_surfaces(): void
    {
        $user = $this->member($this->organization(), OrganizationRole::Owner);

        // /desk lands on the dashboard, as in Z360; the inbox is one click away.
        $this->actingAs($user)->get('/desk')->assertRedirect('/desk/dashboard');
        $this->actingAs($user)->get('/desk/dashboard')->assertOk();
        $this->actingAs($user)->get('/desk/inbox')->assertOk();
        $this->actingAs($user)->get('/studio')->assertOk();
    }

    public function test_a_member_is_desk_only_and_is_redirected_away_from_studio(): void
    {
        $user = $this->member($this->organization(), OrganizationRole::Member);

        $this->actingAs($user)->get('/desk/inbox')->assertOk();

        // Redirected, not 403: a stale Studio link is not misconduct, and a
        // permission error would be a dead end for someone who only works Desk.
        $this->actingAs($user)
            ->get('/studio')
            ->assertRedirect('/desk')
            ->assertSessionHas('warning');

        // The surface redirect and the home redirect chain: /studio -> /desk
        // -> /desk/dashboard. Follow it to the end so a broken dashboard
        // cannot hide behind a passing redirect assertion.
        $this->actingAs($user)->followingRedirects()->get('/studio')->assertOk();
    }

    public function test_desk_access_can_be_revoked_from_an_admin(): void
    {
        $organization = $this->organization();
        $user = $this->member($organization, OrganizationRole::Admin);

        $organization->membershipFor($user)->revoke(Surface::Desk);

        $this->actingAs($user)->get('/studio')->assertOk();
        $this->actingAs($user)->get('/desk')->assertRedirect('/studio');
    }

    public function test_a_write_to_a_forbidden_surface_is_rejected_not_redirected(): void
    {
        $user = $this->member($this->organization(), OrganizationRole::Member);

        // Studio has no POST route yet, and an undefined route would 404 before
        // the middleware ever ran — which would make this test pass for the
        // wrong reason. Register one carrying the real middleware stack.
        Route::middleware(['web', 'auth', 'tenant', 'surface:studio'])
            ->post('/studio/probe', fn () => response('ok'));

        // Silently redirecting a POST would look to the caller like it worked.
        $this->actingAs($user)->post('/studio/probe')->assertForbidden();
    }

    public function test_a_member_with_no_surfaces_is_refused_rather_than_looped(): void
    {
        $organization = $this->organization();
        $user = $this->member($organization, OrganizationRole::Member);

        $organization->membershipFor($user)->revoke(Surface::Desk);

        $this->actingAs($user)->get('/desk')->assertForbidden();
        $this->actingAs($user)->get('/')->assertForbidden();
    }

    public function test_the_root_sends_each_user_to_the_surface_they_can_open(): void
    {
        $organization = $this->organization();

        $operator = $this->member($organization, OrganizationRole::Member);
        $this->actingAs($operator)->get('/')->assertRedirect('/desk');

        $builder = $this->member($organization, OrganizationRole::Admin);
        $organization->membershipFor($builder)->revoke(Surface::Desk);
        $this->actingAs($builder)->get('/')->assertRedirect('/studio');
    }

    public function test_only_accessible_surfaces_are_shared_with_the_client(): void
    {
        $organization = $this->organization();
        $operator = $this->member($organization, OrganizationRole::Member);

        // The app switcher renders from this list and nothing else, so a
        // surface leaking into it would put a Studio link in Desk's header.
        $this->actingAs($operator)
            ->get('/desk/inbox')
            ->assertInertia(fn ($page) => $page
                ->has('surfaces', 1)
                ->where('surfaces.0.key', 'desk'));
    }
}
