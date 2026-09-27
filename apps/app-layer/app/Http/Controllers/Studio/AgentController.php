<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Http\Requests\Studio\UpdateAgentRequest;
use App\Models\AgentConfig;
use App\Models\BusinessProfile;
use App\Services\Agent\AgentGateway;
use App\Support\LanguageCapabilities;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class AgentController extends Controller
{
    public function index(AgentGateway $gateway): Response
    {
        $config = AgentConfig::query()->firstOrCreate([]);
        $profile = BusinessProfile::query()->firstOrCreate([]);
        $capabilities = $gateway->capabilities();

        return Inertia::render('studio/agent', [
            'config' => [
                ...$config->only([
                    'display_name', 'persona', 'greeting', 'primary_language', 'additional_languages',
                    'voice_provider', 'voice_id', 'min_endpointing_ms', 'min_interruption_ms',
                    'allow_interruptions', 'semantic_turn_detection', 'max_call_seconds', 'record_calls',
                ]),
                // "provider:model" references; empty means the agent layer's default.
                'talker_model' => $config->advanced['talker_model'] ?? '',
                'worker_model' => $config->advanced['worker_model'] ?? '',
            ],
            // What the agent layer can run, reported by the layer that holds
            // the keys. Empty when no agent layer is reachable; the section
            // says so.
            'models' => $capabilities,
            'profile' => $profile->only(['name', 'description', 'industry', 'timezone', 'website', 'address']),
            // What each language actually gets, per layer. Rendered next to the
            // language picker so the trade-off is stated where the choice is
            // made, rather than discovered on the first Urdu call.
            'languages' => LanguageCapabilities::all(),
        ]);
    }

    public function update(UpdateAgentRequest $request): RedirectResponse
    {
        $config = AgentConfig::query()->firstOrCreate([]);
        $attributes = $request->agentAttributes();
        $advanced = [...($config->advanced ?? [])];
        foreach (['talker_model', 'worker_model'] as $key) {
            $value = $attributes[$key] ?? null;
            unset($attributes[$key]);
            if ($value) {
                $advanced[$key] = $value;
            } else {
                unset($advanced[$key]);
            }
        }
        $config->fill([...$attributes, 'advanced' => $advanced])->save();

        $profile = BusinessProfile::query()->firstOrCreate([]);
        $profile->fill($request->profileAttributes())->save();

        return back()->with('success', 'Agent updated.');
    }
}
