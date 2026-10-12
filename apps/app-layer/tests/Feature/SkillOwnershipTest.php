<?php

namespace Tests\Feature;

use App\Enums\AgentRuntime;
use App\Enums\OrganizationRole;
use App\Models\Action;
use App\Models\Expert;
use App\Models\Organization;
use App\Models\Skill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SkillOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    private Expert $expert;

    private Expert $other;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.url' => null, 'services.agent.secret' => 'ownership-test']);
        $this->organization = Organization::create(['name' => 'Clinic', 'slug' => 'ownership-clinic', 'timezone' => 'Asia/Karachi']);
        $this->owner = User::create(['name' => 'Owner', 'email' => 'ownership@example.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
        $this->expert = $this->tenant(fn () => Expert::create(['slug' => 'billing', 'name' => 'Billing specialist', 'description' => 'Billing work.', 'runtime' => AgentRuntime::Worker]));
        $this->other = $this->tenant(fn () => Expert::create(['slug' => 'referrals', 'name' => 'Referrals specialist', 'description' => 'Referrals.', 'runtime' => AgentRuntime::Worker]));
    }

    private function tenant(callable $work): mixed
    {
        Organization::setCurrent($this->organization);
        try {
            return $work();
        } finally {
            Organization::setCurrent(null);
        }
    }

    private function createPrivate(): Skill
    {
        $this->actingAs($this->owner)->post('/studio/skills', ['name' => 'Private billing', 'description' => 'When billing needs review.', 'execution_mode' => 'prose', 'private_expert_id' => $this->expert->id])->assertSessionHasNoErrors();

        return $this->tenant(fn () => Skill::where('slug', 'private-billing')->firstOrFail());
    }

    private function api(string $path)
    {
        return $this->withToken('ownership-test')->getJson('/api/agent/v1/organizations/'.$this->organization->id.$path);
    }

    public function test_core_reads_include_shared_but_never_private_skills(): void
    {
        $shared = $this->tenant(fn () => Skill::create(['slug' => 'book', 'name' => 'Book', 'description' => 'Book visits.', 'body' => 'Shared procedure']));
        $private = $this->createPrivate();
        $this->tenant(fn () => $private->update(['body' => 'EXPERT_PRIVATE_SECRET']));
        $this->api('/skills')->assertOk()->assertJsonCount(1, 'skills')->assertJsonPath('skills.0.slug', 'book');
        $this->api('/skills/'.$shared->slug)->assertOk()->assertJsonPath('markdown', $shared->toMarkdown());
        $this->api('/skills/'.$private->slug)->assertNotFound();
        $context = $this->api('/context')->assertOk();
        $context->assertJsonCount(1, 'skills');
        $this->assertStringNotContainsString('private-billing', $context->getContent());
        $this->assertStringNotContainsString('EXPERT_PRIVATE_SECRET', $context->getContent());
    }

    public function test_private_creation_has_one_owner_and_studio_reports_it(): void
    {
        $skill = $this->createPrivate();
        $this->assertSame($this->expert->id, $skill->private_expert_id);
        $this->assertSame([$this->expert->id], $this->tenant(fn () => $skill->experts()->pluck('experts.id')->all()));
        $this->actingAs($this->owner)->get('/studio/skills')->assertOk()->assertInertia(fn ($page) => $page->where('skills.0.private_expert.id', $this->expert->id));
        $this->actingAs($this->owner)->get('/studio/skills/'.$skill->id)->assertOk()->assertInertia(fn ($page) => $page->where('skill.private_expert.id', $this->expert->id));
    }

    public function test_foreign_and_builtin_owners_are_rejected(): void
    {
        $foreignOrg = Organization::create(['name' => 'Foreign', 'slug' => 'foreign-ownership']);
        Organization::setCurrent($foreignOrg);
        $foreign = Expert::create(['slug' => 'foreign', 'name' => 'Foreign', 'description' => 'Foreign.', 'runtime' => AgentRuntime::Worker]);
        Organization::setCurrent(null);
        $builtin = $this->tenant(function () {
            $expert = Expert::create(['slug' => 'builtin', 'name' => 'Built-in', 'description' => 'Core.', 'runtime' => AgentRuntime::Worker]);
            $expert->forceFill(['is_builtin' => true])->save();

            return $expert;
        });
        foreach ([$foreign->id, $builtin->id, 999999] as $id) {
            $this->actingAs($this->owner)->post('/studio/skills', ['name' => 'Invalid', 'description' => 'Invalid owner.', 'execution_mode' => 'prose', 'private_expert_id' => $id])->assertSessionHasErrors('private_expert_id');
        }
        $this->assertSame(0, $this->tenant(fn () => Skill::where('name', 'Invalid')->count()));
    }

    public function test_privatising_a_shared_skill_removes_all_other_grants(): void
    {
        $skill = $this->tenant(function () {
            $skill = Skill::create(['slug' => 'existing', 'name' => 'Existing', 'description' => 'Existing skill.']);
            $skill->experts()->sync([$this->expert->id, $this->other->id]);

            return $skill;
        });
        $this->actingAs($this->owner)->patch('/studio/skills/'.$skill->id, ['private_expert_id' => $this->expert->id])->assertSessionHasNoErrors();
        $this->assertSame([$this->expert->id], $this->tenant(fn () => $skill->experts()->pluck('experts.id')->all()));
        $this->api('/skills/existing')->assertNotFound();
    }

    public function test_another_expert_cannot_attach_private_skills(): void
    {
        $skill = $this->createPrivate();
        $this->actingAs($this->owner)->patch('/studio/experts/'.$this->other->id, ['skill_ids' => [$skill->id]])->assertSessionHasErrors('skill_ids.0');
        $this->assertSame(0, $this->tenant(fn () => $this->other->skills()->count()));
        $this->actingAs($this->owner)->get('/studio/experts/'.$this->other->id)->assertOk()->assertInertia(fn ($page) => $page->has('all_skills', 0));
        $this->actingAs($this->owner)->patch('/studio/experts/'.$this->expert->id, ['skill_ids' => [$skill->id]])->assertSessionHasNoErrors();
    }

    public function test_owner_deletion_cannot_turn_a_retained_private_skill_shared(): void
    {
        $skill = $this->createPrivate();
        $this->tenant(fn () => $skill->delete());
        $this->actingAs($this->owner)->delete('/studio/experts/'.$this->expert->id)->assertSessionHasErrors('expert');
        $this->assertTrue($this->tenant(fn () => Expert::whereKey($this->expert->id)->exists()));
        $this->assertSame($this->expert->id, $this->tenant(fn () => Skill::withTrashed()->findOrFail($skill->id)->private_expert_id));
    }

    public function test_explicit_sharing_and_reassignment_preserve_the_document(): void
    {
        $skill = $this->createPrivate();
        $this->tenant(fn () => $skill->update(['body' => 'Keep this procedure.']));
        $this->actingAs($this->owner)->patch('/studio/skills/'.$skill->id, ['private_expert_id' => $this->other->id])->assertSessionHasNoErrors();
        $this->assertSame([$this->other->id], $this->tenant(fn () => $skill->experts()->pluck('experts.id')->all()));
        $this->actingAs($this->owner)->patch('/studio/skills/'.$skill->id, ['private_expert_id' => null])->assertSessionHasNoErrors();
        $this->api('/skills/private-billing')->assertOk();
        $this->assertNull($skill->refresh()->private_expert_id);
        $this->assertSame('Keep this procedure.', $skill->body);
    }

    public function test_private_skill_with_disabled_owner_is_blocked_without_calling_the_gateway(): void
    {
        $skill = $this->createPrivate();
        $this->tenant(fn () => $this->expert->update(['enabled' => false]));
        $this->actingAs($this->owner)->post('/studio/skills/'.$skill->id.'/test', ['scenario' => 'Try private billing.'])->assertSessionHasErrors('scenario');
    }

    public function test_deleted_private_skill_can_be_restored_reassigned_and_its_previous_owner_deleted(): void
    {
        $skill = $this->createPrivate();
        $this->actingAs($this->owner)->delete('/studio/skills/'.$skill->id)->assertRedirect('/studio/skills');
        $this->actingAs($this->owner)->get('/studio/experts/'.$this->expert->id)->assertOk()->assertInertia(fn ($page) => $page->where('retired_private_skills.0.id', $skill->id));
        $this->actingAs($this->owner)->post('/studio/skills/'.$skill->id.'/restore')->assertRedirect('/studio/skills/'.$skill->id);
        $this->assertFalse($skill->refresh()->trashed());
        $this->assertSame($this->expert->id, $skill->private_expert_id);
        $this->api('/skills/'.$skill->slug)->assertNotFound();
        $this->actingAs($this->owner)->patch('/studio/skills/'.$skill->id, ['private_expert_id' => $this->other->id])->assertSessionHasNoErrors();
        $this->actingAs($this->owner)->delete('/studio/experts/'.$this->expert->id)->assertRedirect('/studio/experts');
        $this->assertSame($this->other->id, $skill->refresh()->private_expert_id);
    }

    public function test_foreign_skill_grants_actions_and_restore_requests_are_rejected(): void
    {
        $foreignOrg = Organization::create(['name' => 'Other clinic', 'slug' => 'other-ownership']);
        Organization::setCurrent($foreignOrg);
        $foreignSkill = Skill::create(['slug' => 'foreign-skill', 'name' => 'Foreign skill', 'description' => 'Foreign instructions.']);
        $foreignAction = Action::create(['slug' => 'foreign-action', 'name' => 'Foreign action', 'description' => 'Foreign action.', 'kind' => 'internal']);
        $foreignSkill->delete();
        Organization::setCurrent(null);
        $this->actingAs($this->owner)->patch('/studio/experts/'.$this->expert->id, ['skill_ids' => [$foreignSkill->id]])->assertSessionHasErrors('skill_ids.0');
        $this->actingAs($this->owner)->patch('/studio/experts/'.$this->expert->id, ['action_ids' => [$foreignAction->id]])->assertSessionHasErrors('action_ids.0');
        $this->actingAs($this->owner)->post('/studio/skills/'.$foreignSkill->id.'/restore')->assertNotFound();
        $this->api('/skills/foreign-skill')->assertNotFound();
        Organization::setCurrent($foreignOrg);
        $this->assertTrue(Skill::withTrashed()->findOrFail($foreignSkill->id)->trashed());
        Organization::setCurrent(null);
    }
}
