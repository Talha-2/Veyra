<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenancyTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $email = 'person@veyra.test'): User
    {
        return User::create([
            'name' => 'Test Person',
            'email' => $email,
            'password' => 'password',
        ]);
    }

    private function organization(string $slug = 'northwind'): Organization
    {
        return Organization::create([
            'name' => ucfirst($slug),
            'slug' => $slug,
            'timezone' => 'UTC',
        ]);
    }

    public function test_a_user_with_no_organization_is_sent_to_onboarding(): void
    {
        $this->actingAs($this->user())
            ->get('/')
            ->assertRedirect(route('onboarding.organization'));
    }

    public function test_the_first_organization_is_selected_automatically(): void
    {
        $user = $this->user();
        $organization = $this->organization();
        $organization->addMember($user, OrganizationRole::Owner);

        $this->actingAs($user)->get('/')->assertRedirect('/studio');

        $this->assertSame($organization->id, session(Organization::SESSION_KEY));
    }

    public function test_switching_to_an_organization_you_do_not_belong_to_is_refused(): void
    {
        $user = $this->user();
        $mine = $this->organization('mine');
        $mine->addMember($user, OrganizationRole::Owner);

        $theirs = $this->organization('theirs');

        // Route-model binding resolves any organization by id, so this is the
        // check that stops an id guess being a working cross-tenant switch.
        $this->actingAs($user)
            ->post("/organizations/{$theirs->id}/switch")
            ->assertForbidden();

        $this->assertSame($mine->id, session(Organization::SESSION_KEY));
    }

    public function test_a_revoked_membership_does_not_survive_in_the_session(): void
    {
        $user = $this->user();
        $first = $this->organization('first');
        $second = $this->organization('second');
        $first->addMember($user, OrganizationRole::Owner);
        $second->addMember($user, OrganizationRole::Owner);

        $this->actingAs($user)->post("/organizations/{$second->id}/switch");
        $this->assertSame($second->id, session(Organization::SESSION_KEY));

        // Access is taken away while they are signed in. The session still
        // names that organization; the next request must not honour it.
        $second->memberships()->where('user_id', $user->id)->delete();

        $this->actingAs($user)->get('/')->assertRedirect('/studio');
        $this->assertSame($first->id, session(Organization::SESSION_KEY));
    }

    public function test_signing_in_does_not_inherit_the_previous_session_tenant(): void
    {
        $alice = $this->user('alice@veyra.test');
        $bob = $this->user('bob@veyra.test');

        $alices = $this->organization('alices');
        $alices->addMember($alice, OrganizationRole::Owner);

        $bobs = $this->organization('bobs');
        $bobs->addMember($bob, OrganizationRole::Owner);

        $this->actingAs($alice)->get('/');
        $this->assertSame($alices->id, session(Organization::SESSION_KEY));

        $this->post('/logout');
        $this->post('/login', ['email' => 'bob@veyra.test', 'password' => 'password']);

        $this->assertNotSame($alices->id, session(Organization::SESSION_KEY));
    }

    public function test_creating_an_organization_makes_the_creator_its_owner(): void
    {
        $user = $this->user();

        $this->actingAs($user)->post('/onboarding/organization', [
            'name' => 'Lakeside Clinic',
            'timezone' => 'America/New_York',
        ])->assertRedirect(route('home'));

        $organization = Organization::where('slug', 'lakeside-clinic')->firstOrFail();

        // An organization with no members is unreachable by anyone, including
        // the person who just created it.
        $this->assertSame(
            OrganizationRole::Owner,
            $organization->membershipFor($user)->role,
        );
    }

    public function test_organization_slugs_do_not_collide(): void
    {
        $user = $this->user();

        $this->actingAs($user)->post('/onboarding/organization', [
            'name' => 'Northwind', 'timezone' => 'UTC',
        ]);
        $this->actingAs($user)->post('/onboarding/organization', [
            'name' => 'Northwind', 'timezone' => 'UTC',
        ]);

        $this->assertSame(2, Organization::where('slug', 'like', 'northwind%')->count());
        $this->assertTrue(Organization::where('slug', 'northwind-2')->exists());
    }
}
