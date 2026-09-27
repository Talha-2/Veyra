<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\AgentConfig;
use App\Services\Voice\VoiceCatalog;
use App\Support\LanguageCapabilities;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The voice page: pick a voice, hear it, see the latency tier it comes with.
 *
 * Voices come live from the configured providers (VoiceCatalog). With none
 * configured the curated list stands in and the page says so; with a key
 * that is rejected the page says that too, per provider, because "the voice
 * list is short" is not a message anyone can act on.
 */
class VoiceController extends Controller
{
    /** Vendor-published latency figures, labelled as such. Not our measurements. */
    public const TTS_MODELS = [
        ['id' => 'flash', 'label' => 'Flash', 'latency_ms' => 90, 'note' => 'The realtime tier: Cartesia Sonic-2 or ElevenLabs Flash. Use this unless a language rules it out.'],
        ['id' => 'turbo', 'label' => 'Turbo', 'latency_ms' => 300, 'note' => 'Balanced. Noticeably slower on a phone call.'],
        ['id' => 'expressive', 'label' => 'Expressive', 'latency_ms' => 1200, 'note' => 'Highest fidelity, not realtime.'],
    ];

    /** Shown only when no provider is configured, so the page still explains itself. */
    public const CURATED = [
        ['id' => 'nora', 'name' => 'Nora', 'gender' => 'female', 'accent' => 'American', 'style' => 'Warm, measured', 'languages' => ['en', 'es'], 'provider' => 'curated'],
        ['id' => 'james', 'name' => 'James', 'gender' => 'male', 'accent' => 'American', 'style' => 'Calm, low', 'languages' => ['en'], 'provider' => 'curated'],
        ['id' => 'priya', 'name' => 'Priya', 'gender' => 'female', 'accent' => 'Indian', 'style' => 'Bright, quick', 'languages' => ['en', 'hi'], 'provider' => 'curated'],
        ['id' => 'uzma', 'name' => 'Uzma', 'gender' => 'female', 'accent' => 'Pakistani', 'style' => 'Clear', 'languages' => ['ur'], 'provider' => 'curated'],
    ];

    public function index(VoiceCatalog $catalog): Response
    {
        $config = AgentConfig::query()->firstOrCreate([]);
        $languages = $config->languages();
        $providers = $catalog->providers();
        $live = collect($providers)->contains('ok', true);
        $voices = $live ? $catalog->voices() : self::CURATED;

        return Inertia::render('studio/voice', [
            'voice_id' => $config->voice_id,
            'voice_provider' => $config->voice_provider,
            'tts_model' => $config->advanced['tts_model'] ?? 'flash',
            'languages' => $languages,
            'providers' => $providers,
            'live' => $live,
            'voices' => collect($voices)->map(fn ($v) => [
                ...$v,
                'own' => $v['own'] ?? false,
                // A voice that covers none of the agent's languages is shown
                // but flagged, not hidden — hiding it would make the list look
                // like the whole catalog.
                'covers' => array_values(array_intersect($v['languages'], $languages)),
            ])->all(),
            'models' => self::TTS_MODELS,
            // Which of the agent's languages force a different engine.
            'engine_overrides' => collect($languages)
                ->filter(fn ($c) => ! (LanguageCapabilities::for($c)['tts_low_latency'] ?? true))
                ->map(fn ($c) => LanguageCapabilities::for($c)['label'])
                ->values()->all(),
        ]);
    }

    public function update(Request $request, VoiceCatalog $catalog): RedirectResponse
    {
        $validated = $request->validate([
            'voice_id' => ['required', 'string', 'max:120'],
            'voice_provider' => ['required', Rule::in(['cartesia', 'elevenlabs', 'curated'])],
            'tts_model' => ['required', Rule::in(array_column(self::TTS_MODELS, 'id'))],
        ]);

        $known = $validated['voice_provider'] === 'curated'
            ? collect(self::CURATED)->contains('id', $validated['voice_id'])
            : $catalog->find($validated['voice_provider'], $validated['voice_id']) !== null;
        if (! $known) {
            return back()->withErrors(['voice_id' => 'That voice is not in the catalog any more. Pick another.']);
        }

        $config = AgentConfig::query()->firstOrCreate([]);
        $config->fill([
            'voice_id' => $validated['voice_id'],
            'voice_provider' => $validated['voice_provider'],
            'advanced' => [...($config->advanced ?? []), 'tts_model' => $validated['tts_model']],
        ])->save();

        return back()->with('success', 'Voice saved.');
    }

    /** A short sample in the requested language, as MP3. Cached on disk per voice. */
    public function preview(Request $request, VoiceCatalog $catalog): HttpResponse
    {
        $validated = $request->validate([
            'provider' => ['required', Rule::in(['cartesia', 'elevenlabs'])],
            'voice' => ['required', 'string', 'max:120'],
            'lang' => ['nullable', 'string', 'max:8'],
        ]);

        abort_unless($catalog->find($validated['provider'], $validated['voice']), 404, 'Unknown voice.');

        try {
            $bytes = $catalog->preview($validated['provider'], $validated['voice'], $validated['lang'] ?? 'en');
        } catch (\Throwable $e) {
            abort(502, 'The voice provider did not return audio: '.str($e->getMessage())->limit(120));
        }

        return response($bytes, 200, ['Content-Type' => 'audio/mpeg', 'Cache-Control' => 'private, max-age=86400']);
    }
}
