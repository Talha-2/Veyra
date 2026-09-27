<?php

namespace App\Services\Voice;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * The voices Studio can offer, and a way to hear them.
 *
 * Two providers, read live and cached: Cartesia (Sonic — ~90 ms, 15
 * languages including Urdu, Arabic and Hindi) and ElevenLabs (Flash). A
 * provider with no key is absent; one whose key is rejected is listed with
 * the error, so a dead key shows on the page instead of as a silent
 * fallback to the curated voices.
 *
 * Previews are synthesised once per voice and language and kept on disk:
 * an author clicking through twenty voices should not cost twenty API
 * calls a second time.
 */
class VoiceCatalog
{
    /**
     * Languages Cartesia's Sonic models actually synthesise. The voice list
     * carries more (Urdu, Arabic, Hebrew, Thai, Odia tags), but a request
     * in those languages is rejected with "Invalid language for model"
     * (tested 2026-09-27), so those voices are not offered.
     */
    public const CARTESIA_LANGUAGES = ['en', 'fr', 'de', 'es', 'pt', 'zh', 'ja', 'hi', 'it', 'ko', 'nl', 'pl', 'ru', 'sv', 'tr'];

    public const SAMPLES = [
        'en' => 'Hi, thanks for calling. I can book that for you — what day works best?',
        'es' => 'Hola, gracias por llamar. Puedo reservar eso para usted. ¿Qué día le viene mejor?',
        'fr' => 'Bonjour, merci d’avoir appelé. Je peux réserver cela pour vous. Quel jour vous convient ?',
        'de' => 'Hallo, danke für Ihren Anruf. Ich kann das für Sie buchen. Welcher Tag passt Ihnen?',
        'pt' => 'Olá, obrigado por ligar. Posso agendar isso para você. Qual dia é melhor?',
        'hi' => 'नमस्ते, कॉल करने के लिए धन्यवाद। मैं इसे आपके लिए बुक कर सकती हूँ — कौन सा दिन ठीक रहेगा?',
        'ar' => 'مرحباً، شكراً لاتصالك. يمكنني حجز ذلك لك، أي يوم يناسبك؟',
        'ur' => 'السلام علیکم، کال کرنے کا شکریہ۔ میں یہ آپ کے لیے بک کر سکتی ہوں، کون سا دن مناسب رہے گا؟',
    ];

    /** @return list<array{id:string,label:string,configured:bool,ok:bool,error:?string}> */
    public function providers(): array
    {
        $out = [];
        foreach (['cartesia' => 'Cartesia Sonic', 'elevenlabs' => 'ElevenLabs'] as $id => $label) {
            $configured = filled(config("services.{$id}.key"));
            $status = $configured ? $this->status($id) : ['ok' => false, 'error' => null];
            $out[] = ['id' => $id, 'label' => $label, 'configured' => $configured, 'ok' => $status['ok'], 'error' => $status['error']];
        }

        return $out;
    }

    /** @return list<array{id:string,name:string,gender:string,accent:string,style:string,languages:list<string>,provider:string}> */
    public function voices(): array
    {
        $voices = [];
        foreach ($this->providers() as $provider) {
            if ($provider['ok']) {
                $voices = [...$voices, ...$this->voicesFor($provider['id'])];
            }
        }

        return $voices;
    }

    public function find(string $provider, string $id): ?array
    {
        foreach ($this->voicesFor($provider) as $voice) {
            if ($voice['id'] === $id) {
                return $voice;
            }
        }

        return null;
    }

    /** MP3 bytes for a short sample in the given language, from disk when already made. */
    public function preview(string $provider, string $voiceId, string $language): string
    {
        $language = array_key_exists($language, self::SAMPLES) ? $language : 'en';
        $path = "voice-previews/{$provider}-".preg_replace('/[^a-zA-Z0-9_-]/', '_', $voiceId)."-{$language}.mp3";
        if (Storage::exists($path)) {
            return Storage::get($path);
        }

        $bytes = match ($provider) {
            'cartesia' => $this->cartesiaTts($voiceId, self::SAMPLES[$language], $language),
            'elevenlabs' => $this->elevenTts($voiceId, self::SAMPLES[$language]),
            default => throw new \InvalidArgumentException("Unknown provider {$provider}."),
        };
        Storage::put($path, $bytes);

        return $bytes;
    }

    // ── providers ───────────────────────────────────────────────────────

    private function status(string $provider): array
    {
        return Cache::remember("voices:{$provider}:status", now()->addMinutes(10), function () use ($provider) {
            try {
                $this->voicesFor($provider);

                return ['ok' => true, 'error' => null];
            } catch (Throwable $e) {
                $message = $e instanceof RequestException ? "HTTP {$e->response->status()}" : $e->getMessage();
                Log::warning('voices.provider_unavailable', ['provider' => $provider, 'error' => $message]);

                return ['ok' => false, 'error' => $message === 'HTTP 401' ? 'The API key was rejected.' : "Could not reach the provider ({$message})."];
            }
        });
    }

    private function voicesFor(string $provider): array
    {
        return Cache::remember("voices:{$provider}:list", now()->addHour(), fn () => match ($provider) {
            'cartesia' => $this->cartesiaVoices(),
            'elevenlabs' => $this->elevenVoices(),
            default => [],
        });
    }

    /**
     * Cartesia's `accents` entries are objects, not strings; rendering one
     * printed "[object Object]" on every voice card. Take its name, or fall
     * back to the country.
     */
    private static function accentOf(array $voice): string
    {
        $accent = $voice['accents'][0] ?? null;
        if (is_array($accent)) {
            $accent = $accent['name'] ?? $accent['label'] ?? $accent['display_name'] ?? $accent['accent'] ?? null;
        }

        return is_string($accent) && $accent !== '' ? $accent : (is_string($voice['country'] ?? null) ? $voice['country'] : '');
    }

    private function cartesiaVoices(): array
    {
        $items = [];
        $page = null;
        do {
            $body = $this->cartesia()->get('/voices', array_filter(['limit' => 100, 'starting_after' => $page]))->throw()->json();
            $data = $body['data'] ?? (is_array($body) ? $body : []);
            $items = [...$items, ...$data];
            $page = ($body['has_more'] ?? false) ? ($body['next_page'] ?? null) : null;
        } while ($page && count($items) < 400);

        return collect($items)
            ->filter(fn ($v) => ($v['status'] ?? 'ready') !== 'deleted' && in_array($v['language'] ?? 'en', self::CARTESIA_LANGUAGES, true))
            ->map(fn ($v) => [
                'id' => $v['id'],
                'name' => str($v['name'])->before(' - ')->value(),
                'gender' => $v['gender'] ?? 'unspecified',
                'accent' => self::accentOf($v),
                'style' => $v['tagline'] ?? str($v['description'] ?? '')->limit(90)->value(),
                'languages' => [$v['language'] ?? 'en'],
                'provider' => 'cartesia',
                'own' => (bool) ($v['is_owner'] ?? false),
            ])
            ->sortBy([['own', 'desc'], ['languages.0', 'asc'], ['name', 'asc']])
            ->values()->all();
    }

    private function elevenVoices(): array
    {
        $body = $this->eleven()->get('/voices')->throw()->json();

        return collect($body['voices'] ?? [])->map(fn ($v) => [
            'id' => $v['voice_id'],
            'name' => $v['name'],
            'gender' => $v['labels']['gender'] ?? 'unspecified',
            'accent' => $v['labels']['accent'] ?? '',
            'style' => trim(($v['labels']['description'] ?? '').' '.($v['labels']['use_case'] ?? '')),
            // Flash v2.5 covers these; the account's list does not say per voice.
            'languages' => ['en', 'es', 'fr', 'de', 'pt', 'hi', 'ar'],
            'provider' => 'elevenlabs',
            'own' => ($v['category'] ?? '') !== 'premade',
        ])->values()->all();
    }

    private function cartesiaTts(string $voiceId, string $text, string $language): string
    {
        if (! in_array($language, self::CARTESIA_LANGUAGES, true)) {
            throw new \InvalidArgumentException("Cartesia cannot synthesise {$language}.");
        }
        $response = $this->cartesia()->post('/tts/bytes', [
            'model_id' => 'sonic-2',
            'transcript' => $text,
            'voice' => ['mode' => 'id', 'id' => $voiceId],
            'output_format' => ['container' => 'mp3', 'bit_rate' => 64000, 'sample_rate' => 44100],
            'language' => $language,
        ])->throw();

        return $response->body();
    }

    private function elevenTts(string $voiceId, string $text): string
    {
        return $this->eleven()->withOptions(['query' => ['output_format' => 'mp3_44100_64']])
            ->post("/text-to-speech/{$voiceId}", ['text' => $text, 'model_id' => 'eleven_flash_v2_5'])->throw()->body();
    }

    private function cartesia()
    {
        return Http::baseUrl('https://api.cartesia.ai')->withHeaders(['X-API-Key' => config('services.cartesia.key'), 'Cartesia-Version' => '2025-04-16'])->timeout(20);
    }

    private function eleven()
    {
        return Http::baseUrl('https://api.elevenlabs.io/v1')->withHeaders(['xi-api-key' => config('services.elevenlabs.key')])->timeout(20);
    }
}
