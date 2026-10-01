<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AgentConfig;
use App\Models\Organization;
use App\Models\User;
use App\Services\Organization\StarterAgent;
use App\Services\Voice\VoiceCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The default voice is explicit: a new organization is given one, Studio
 * shows which voice speaks when none is saved, and the call bundle always
 * names a provider and a voice — never a provider SDK's hidden default.
 */
class VoiceDefaultTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret';

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['services.agent.url' => null, 'services.agent.secret' => self::SECRET, 'services.cartesia.key' => null, 'services.elevenlabs.key' => null]);

        $this->organization = Organization::create(['name' => 'Northwind', 'slug' => 'northwind', 'timezone' => 'UTC']);
        $this->owner = User::create(['name' => 'Ada Owner', 'email' => 'owner@veyra.test', 'password' => 'password']);
        $this->organization->addMember($this->owner, OrganizationRole::Owner);
    }

    private function provision(): AgentConfig
    {
        Organization::setCurrent($this->organization);
        try {
            app(StarterAgent::class)->provision($this->organization);

            return AgentConfig::query()->sole();
        } finally {
            Organization::setCurrent(null);
        }
    }

    private static function elevenVoices(array $ids): array
    {
        return ['voices' => array_map(fn ($id) => ['voice_id' => $id, 'name' => "Voice {$id}", 'category' => 'premade', 'labels' => ['gender' => 'female']], $ids)];
    }

    public function test_a_new_organization_gets_the_elevenlabs_default_when_its_key_works(): void
    {
        config(['services.elevenlabs.key' => 'el-key', 'services.cartesia.key' => 'car-key']);
        Http::fake(['api.elevenlabs.io/v1/voices' => Http::response(self::elevenVoices(['someone-else', VoiceCatalog::DEFAULTS['elevenlabs']['id']]))]);

        $config = $this->provision();

        $this->assertSame('elevenlabs', $config->voice_provider);
        $this->assertSame(VoiceCatalog::DEFAULTS['elevenlabs']['id'], $config->voice_id);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'cartesia'));
    }

    public function test_a_rejected_elevenlabs_key_falls_back_to_cartesia_and_a_missing_default_to_its_first_english_voice(): void
    {
        config(['services.elevenlabs.key' => 'el-key', 'services.cartesia.key' => 'car-key']);
        Http::fake([
            'api.elevenlabs.io/*' => Http::response(['detail' => 'invalid key'], 401),
            'api.cartesia.ai/voices*' => Http::response(['data' => [
                ['id' => 'fr-voice', 'name' => 'Amélie', 'language' => 'fr'],
                ['id' => 'en-voice', 'name' => 'Brooke - Big Sister', 'language' => 'en'],
            ], 'has_more' => false]),
        ]);

        $config = $this->provision();

        $this->assertSame(['cartesia', 'en-voice'], [$config->voice_provider, $config->voice_id]);
    }

    public function test_with_no_reachable_provider_provisioning_still_names_a_voice(): void
    {
        $config = $this->provision();

        $this->assertSame('cartesia', $config->voice_provider);
        $this->assertSame(VoiceCatalog::DEFAULTS['cartesia']['id'], $config->voice_id);
        Http::assertNothingSent();
    }

    public function test_a_chosen_voice_is_never_overwritten_and_a_provider_without_a_voice_gets_its_own_default(): void
    {
        Organization::setCurrent($this->organization);
        AgentConfig::query()->create(['voice_provider' => 'elevenlabs', 'voice_id' => null, 'greeting' => 'Hello.']);
        Organization::setCurrent(null);
        $this->assertSame(VoiceCatalog::DEFAULTS['elevenlabs']['id'], $this->provision()->voice_id);

        Organization::setCurrent($this->organization);
        AgentConfig::query()->sole()->forceFill(['voice_provider' => 'cartesia', 'voice_id' => 'mine'])->save();
        Organization::setCurrent(null);
        $this->assertSame(['cartesia', 'mine'], [$this->provision()->voice_provider, $this->provision()->voice_id]);
    }

    public function test_the_voice_page_shows_the_voice_that_speaks_when_none_is_saved(): void
    {
        Organization::setCurrent($this->organization);
        AgentConfig::query()->create(['voice_provider' => null, 'voice_id' => null]);
        Organization::setCurrent(null);

        $this->actingAs($this->owner)->get('/studio/voice')->assertOk()->assertInertia(fn ($page) => $page
            ->component('studio/voice')
            ->where('voice_id', null)
            ->where('default_voice.provider', 'cartesia')
            ->where('default_voice.id', VoiceCatalog::DEFAULTS['cartesia']['id'])
            ->where('default_voice.name', 'Katie')
            ->where('default_voice.label', 'Cartesia'));

        // With an ElevenLabs key on the deployment, the default is ElevenLabs.
        config(['services.elevenlabs.key' => 'el-key']);
        Cache::put('voices:elevenlabs:status', ['ok' => true, 'error' => null], 60);
        Cache::put('voices:elevenlabs:list', [], 60);
        $this->actingAs($this->owner)->get('/studio/voice')->assertOk()->assertInertia(fn ($page) => $page
            ->where('default_voice.provider', 'elevenlabs')
            ->where('default_voice.name', 'Jessica'));
    }

    public function test_the_call_bundle_always_names_a_provider_and_a_voice(): void
    {
        $catalog = app(VoiceCatalog::class);
        $this->assertSame(['cartesia', VoiceCatalog::DEFAULTS['cartesia']['id'], true], array_values(collect($catalog->effective(null, null))->only(['provider', 'id', 'is_default'])->all()));
        $this->assertSame(['cartesia', VoiceCatalog::DEFAULTS['cartesia']['id']], array_values(collect($catalog->effective('curated', 'nora'))->only(['provider', 'id'])->all()));
        $this->assertSame(['elevenlabs', VoiceCatalog::DEFAULTS['elevenlabs']['id']], array_values(collect($catalog->effective('elevenlabs', ''))->only(['provider', 'id'])->all()));
        $this->assertSame(['elevenlabs', 'v9', false], array_values(collect($catalog->effective('elevenlabs', 'v9'))->only(['provider', 'id', 'is_default'])->all()));

        // Through the contract: a Studio Talk room's bundle carries the explicit voice.
        config(['services.livekit' => ['url' => 'wss://example.livekit.cloud', 'key' => 'APIkey', 'secret' => 'livekit-secret']]);
        Organization::setCurrent($this->organization);
        AgentConfig::query()->create(['voice_provider' => null, 'voice_id' => null]);
        Organization::setCurrent(null);
        $room = $this->actingAs($this->owner)->postJson('/studio/talk/voice')->assertOk()->json('room');
        $bundle = $this->withToken(self::SECRET)->postJson('/api/agent/v1/calls/web', ['room' => $room])->assertCreated();
        $this->assertSame('cartesia', $bundle->json('agent.voice.provider'));
        $this->assertSame(VoiceCatalog::DEFAULTS['cartesia']['id'], $bundle->json('agent.voice.id'));
    }
}
