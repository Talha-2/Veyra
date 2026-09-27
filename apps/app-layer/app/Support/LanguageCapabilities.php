<?php

namespace App\Support;

/**
 * What each language actually gets from the voice pipeline.
 *
 * This is the single source for the capability table Studio shows next to the
 * language picker, and for the provider the agent layer resolves per call. It
 * exists because the honest answer differs per language and per layer — see
 * docs/urdu-support.md — and a picker that lists every language as an equal
 * option would be a lie the customer discovers on their first call.
 *
 * Provider names are internal. Studio shows "low-latency voice: yes/no", never
 * "ElevenLabs Flash"; the vendor list is not the product.
 */
class LanguageCapabilities
{
    /**
     * @return array<string, array{
     *   label: string, native: string, rtl: bool,
     *   stt: string, stt_multi: bool, tts_low_latency: bool, tts_provider: string,
     *   semantic_turns: bool, caveats: list<string>
     * }>
     */
    public static function all(): array
    {
        // Which realtime TTS engine serves the common languages depends on
        // which key is configured. Cartesia Sonic covers the Latin-script
        // languages plus Hindi at the flash tier. It lists Urdu-tagged
        // voices but rejects `language=ur` on every model ("Invalid language
        // for model", tested 2026-09-27), and ElevenLabs Flash has no Urdu
        // either — so Urdu stays on Azure, as docs/urdu-support.md says.
        $cartesia = filled(config('services.cartesia.key'));
        $fast = $cartesia ? 'cartesia-sonic' : 'elevenlabs-flash';
        $noTurns = 'No semantic turn detection: the agent waits for silence rather than for the end of a thought.';

        return [
            'en' => self::entry('English', 'English', stt: 'nova-3', multi: true, fastTts: true, tts: $fast, turns: true),
            'es' => self::entry('Spanish', 'Español', stt: 'nova-3', multi: true, fastTts: true, tts: $fast, turns: true),
            'fr' => self::entry('French', 'Français', stt: 'nova-3', multi: true, fastTts: true, tts: $fast, turns: true),
            'de' => self::entry('German', 'Deutsch', stt: 'nova-3', multi: true, fastTts: true, tts: $fast, turns: true),
            'pt' => self::entry('Portuguese', 'Português', stt: 'nova-3', multi: true, fastTts: true, tts: $fast, turns: true),
            'hi' => self::entry('Hindi', 'हिन्दी', stt: 'nova-3', multi: true, fastTts: true, tts: $fast, turns: true),
            // Arabic: ElevenLabs Flash covers it; Cartesia does not.
            'ar' => self::entry('Arabic', 'العربية', rtl: true, stt: 'nova-3', multi: true, fastTts: true, tts: 'elevenlabs-flash', turns: false, caveats: [$noTurns]),
            'ur' => self::entry('Urdu', 'اردو', rtl: true, stt: 'nova-3-ur', multi: false, fastTts: false, tts: 'azure-ur-pk', turns: false,
                caveats: [
                    $noTurns,
                    'Speech recognition is Urdu-only on this line. Callers who switch into English mid-sentence — common for numbers, dates and names — will be transcribed less reliably.',
                    'Uses a different voice engine (Azure ur-PK) than the other languages; the voice picked above does not apply.',
                ]),
        ];
    }

    public static function for(string $code): ?array
    {
        return self::all()[$code] ?? null;
    }

    /** Whether this language degrades any layer relative to English. */
    public static function isDegraded(string $code): bool
    {
        $entry = self::for($code);

        return $entry ? ! ($entry['stt_multi'] && $entry['tts_low_latency'] && $entry['semantic_turns']) : true;
    }

    private static function entry(
        string $label, string $native, bool $rtl = false,
        string $stt = 'nova-3', bool $multi = true, bool $fastTts = true,
        string $tts = 'elevenlabs-flash', bool $turns = true, array $caveats = [],
    ): array {
        return [
            'label' => $label, 'native' => $native, 'rtl' => $rtl,
            'stt' => $stt, 'stt_multi' => $multi,
            'tts_low_latency' => $fastTts, 'tts_provider' => $tts,
            'semantic_turns' => $turns, 'caveats' => $caveats,
        ];
    }
}
