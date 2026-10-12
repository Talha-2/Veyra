<?php

namespace Tests\Feature;

use App\Enums\AgentRuntime;
use App\Enums\OrganizationRole;
use App\Models\Action;
use App\Models\AgentConfig;
use App\Models\Expert;
use App\Models\Organization;
use App\Models\Provider;
use App\Models\Skill;
use App\Models\User;
use App\Services\Healthcare\HealthcareActions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CoreRuntimeTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.url' => null, 'services.agent.secret' => 'core-test']);
        $this->organization = Organization::create(['name' => 'Clinic', 'slug' => 'core-clinic']);
        $this->owner = User::create(['name' => 'Owner', 'email' => 'core@example.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
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

    private function api(string $path): TestResponse
    {
        return $this->withToken('core-test')->getJson('/api/agent/v1/organizations/'.$this->organization->id.$path);
    }

    private function expert(string $slug, array $attributes = []): Expert
    {
        return $this->tenant(fn () => Expert::create([...['slug' => $slug, 'name' => $slug, 'description' => 'Specialist', 'runtime' => AgentRuntime::Worker], ...$attributes]));
    }

    public function test_zero_experts_discovers_shared_skills_and_grants_only_safe_internal_actions(): void
    {
        $this->tenant(fn () => Skill::create(['slug' => 'shared', 'name' => 'Shared', 'description' => 'Shared work.']));
        $this->tenant(fn () => Action::create(['slug' => 'danger', 'name' => 'Danger', 'description' => 'External.', 'kind' => 'http', 'config' => ['url' => 'https://example.test']]));
        $response = $this->api('/context')->assertOk()->assertJsonPath('architecture', 'skills-first')
            ->assertJsonPath('core.taker.slug', 'core-taker')->assertJsonPath('core.worker.slug', 'core-worker')
            ->assertJsonPath('core.taker.tools', [])->assertJsonCount(0, 'experts')->assertJsonPath('core.worker.skills.0.slug', 'shared');
        $tools = collect($response->json('core.worker.tools'));
        $this->assertContains('create_ticket', $tools->pluck('name')->all());
        $this->assertNotContains('danger', $tools->pluck('name')->all());
        $this->assertSame(0, $this->tenant(fn () => Expert::count()));
    }

    public function test_builtin_settings_copy_once_without_custom_profiles_becoming_core(): void
    {
        $builtin = $this->expert('operations', ['system_prompt' => 'Owner edited worker', 'model' => 'openai:custom', 'reasoning_effort' => 'high']);
        $this->tenant(fn () => $builtin->forceFill(['is_builtin' => true])->save());
        $action = $this->tenant(fn () => Action::create(['slug' => 'review', 'name' => 'Review', 'description' => 'Review.', 'kind' => 'internal', 'requires_approval' => true]));
        $this->tenant(fn () => $builtin->actions()->attach($action));
        $this->expert('custom', ['system_prompt' => 'Never use as core']);
        $this->api('/context')->assertOk()->assertJsonPath('core.worker.system_prompt', 'Owner edited worker')->assertJsonPath('core.worker.model', 'openai:custom')->assertJsonCount(1, 'core.worker.tools')->assertJsonPath('core.worker.tools.0.requires_approval', true);
        $this->tenant(fn () => $builtin->update(['system_prompt' => 'Later change']));
        $this->api('/context')->assertJsonPath('core.worker.system_prompt', 'Owner edited worker')->assertJsonCount(1, 'experts');
        $this->assertSame('Later change', $builtin->refresh()->system_prompt);
    }

    public function test_expert_descriptor_is_private_and_execution_reads_only_shared_and_owned_skills(): void
    {
        $expert = $this->expert('billing', ['system_prompt' => 'PRIVATE PROMPT']);
        $other = $this->expert('other');
        $this->tenant(function () use ($expert, $other) {
            Skill::create(['slug' => 'shared', 'name' => 'Shared', 'description' => 'Shared']);
            Skill::create(['slug' => 'own', 'name' => 'Own', 'description' => 'Private metadata', 'private_expert_id' => $expert->id, 'body' => 'OWN SECRET']);
            Skill::create(['slug' => 'sibling', 'name' => 'Sibling', 'description' => 'Sibling', 'private_expert_id' => $other->id]);
            Skill::create(['slug' => 'disabled', 'name' => 'Disabled', 'description' => 'Disabled', 'enabled' => false, 'private_expert_id' => $expert->id]);
        });
        $context = $this->api('/context')->assertOk()->assertJsonPath('experts.0.tools', [])->assertJsonPath('experts.0.skills', [])->assertJsonPath('experts.0.system_prompt', null);
        $this->assertStringNotContainsString('PRIVATE PROMPT', $context->getContent());
        $this->assertStringNotContainsString('Private metadata', $context->getContent());
        $this->api('/experts/billing/execution')->assertOk()->assertJsonPath('expert.id', $expert->id)->assertJsonPath('expert.system_prompt', 'PRIVATE PROMPT')->assertJsonCount(2, 'expert.skills');
        $this->api('/experts/billing/skills')->assertOk()->assertJsonCount(2, 'skills');
        $this->api('/experts/billing/skills/own')->assertOk();
        $this->api('/experts/billing/skills/shared')->assertOk();
        $this->api('/experts/billing/skills/sibling')->assertNotFound();
        $this->api('/experts/billing/skills/disabled')->assertNotFound();
        $this->api('/skills/own?expert=billing')->assertNotFound();
        $this->tenant(fn () => $expert->update(['enabled' => false]));
        foreach (['execution', 'skills', 'skills/own'] as $path) {
            $this->api('/experts/billing/'.$path)->assertNotFound();
        }
        $this->tenant(fn () => $other->forceFill(['is_builtin' => true])->save());
        $this->api('/experts/other/execution')->assertNotFound();
        $foreign = Organization::create(['name' => 'Foreign', 'slug' => 'foreign-core']);
        Organization::setCurrent($foreign);
        Expert::create(['slug' => 'foreign', 'name' => 'Foreign', 'description' => 'Foreign', 'runtime' => 'worker']);
        Organization::setCurrent(null);
        $this->api('/experts/foreign/execution')->assertNotFound();
    }

    public function test_runtime_settings_validate_tenant_actions_and_preserve_unrelated_settings(): void
    {
        $this->tenant(fn () => AgentConfig::create(['advanced' => ['tts_model' => 'custom-voice']]));
        $foreign = Organization::create(['name' => 'Foreign', 'slug' => 'settings-foreign']);
        Organization::setCurrent($foreign);
        $action = Action::create(['slug' => 'foreign', 'name' => 'Foreign', 'description' => 'Foreign', 'kind' => 'internal']);
        Organization::setCurrent(null);
        $this->actingAs($this->owner)->patch('/studio/runtime', ['action_ids' => [$action->id]])->assertSessionHasErrors('action_ids.0');
        $this->actingAs($this->owner)->patch('/studio/runtime', ['worker_model' => 'bad model'])->assertSessionHasErrors('worker_model');
        $this->actingAs($this->owner)->patch('/studio/runtime', ['worker_prompt' => 'Core work', 'worker_model' => 'openai:gpt-5', 'worker_reasoning_effort' => 'high', 'action_ids' => []])->assertSessionHasNoErrors();
        $this->api('/context')->assertJsonPath('core.worker.system_prompt', 'Core work')->assertJsonPath('core.worker.tools', [])->assertJsonPath('agent.advanced.tts_model', 'custom-voice');
        $this->actingAs($this->owner)->get('/studio/runtime')->assertOk()->assertInertia(fn ($page) => $page->component('studio/runtime')->where('runtime.worker_model', 'openai:gpt-5'));
    }

    public function test_healthcare_initial_grants_preserve_approvals_disabled_state_and_explicit_owner_removal(): void
    {
        $this->tenant(function () {
            Provider::create(['name' => 'Clinician']);
            HealthcareActions::sync();
            Action::where('slug', 'book_appointment')->update(['requires_approval' => true]);
            Action::where('slug', 'cancel_appointment')->update(['enabled' => false]);
        });
        $tools = collect($this->api('/context')->assertOk()->json('core.worker.tools'));
        $this->assertNotNull($tools->firstWhere('name', 'book_appointment'));
        $this->assertTrue($tools->firstWhere('name', 'book_appointment')['requires_approval']);
        $this->assertNotContains('cancel_appointment', $tools->pluck('name')->all());
        $this->actingAs($this->owner)->patch('/studio/runtime', ['action_ids' => []])->assertSessionHasNoErrors();
        $this->api('/context')->assertJsonPath('core.worker.tools', []);
    }

    public function test_studio_separates_legacy_profiles_and_specialists_have_no_primary(): void
    {
        $this->expert('legacy', ['runtime' => 'talker']);
        $builtin = $this->expert('stock');
        $this->tenant(fn () => $builtin->forceFill(['is_builtin' => true])->save());
        $this->expert('specialist');
        $this->actingAs($this->owner)->get('/studio/experts')->assertOk()->assertInertia(fn ($page) => $page
            ->has('experts', 1)->where('experts.0.slug', 'specialist')->where('experts.0.primary', false)->has('legacy_experts', 2)->has('runtimes', 2));
        $this->actingAs($this->owner)->post('/studio/experts', ['name' => 'Unsupported', 'description' => 'Cannot own conversation', 'runtime' => 'talker'])->assertSessionHasErrors('runtime');
        $legacy = $this->tenant(fn () => Expert::where('slug', 'legacy')->firstOrFail());
        $this->actingAs($this->owner)->post('/studio/skills', ['name' => 'Invalid private', 'description' => 'Talkers cannot execute', 'execution_mode' => 'prose', 'private_expert_id' => $legacy->id])->assertSessionHasErrors('private_expert_id');
        $this->api('/experts/legacy/execution')->assertNotFound();
    }

    public function test_private_test_uses_only_enabled_owner_identity(): void
    {
        $expert = $this->expert('billing');
        $skill = $this->tenant(fn () => Skill::create(['slug' => 'private', 'name' => 'Private', 'description' => 'Private', 'private_expert_id' => $expert->id]));
        config(['services.agent.url' => 'http://gateway.test']);
        Cache::forget('agent-gateway:available');
        Http::fake(['http://gateway.test/v1/health' => Http::response(['ok' => true]), 'http://gateway.test/v1/skills/test' => Http::response(['reply' => 'Checked', 'steps' => []])]);
        $this->actingAs($this->owner)->get('/studio/skills/'.$skill->id)->assertOk()->assertInertia(fn ($page) => $page->where('skill.test_available', true));
        $this->actingAs($this->owner)->post('/studio/skills/'.$skill->id.'/test', ['scenario' => 'Try', 'expert' => 'forged'])->assertSessionHasNoErrors()->assertSessionHas('skill_test.reply', 'Checked');
        Http::assertSent(fn ($request) => $request->url() === 'http://gateway.test/v1/skills/test' && $request['expert'] === 'billing' && $request['skill'] === 'private');
        $this->tenant(fn () => $expert->update(['enabled' => false]));
        Http::fake();
        $this->actingAs($this->owner)->get('/studio/skills/'.$skill->id)->assertOk()->assertInertia(fn ($page) => $page->where('skill.test_available', false));
        $this->actingAs($this->owner)->post('/studio/skills/'.$skill->id.'/test', ['scenario' => 'Try'])->assertSessionHasErrors('scenario');
        Http::assertNothingSent();
    }
}
