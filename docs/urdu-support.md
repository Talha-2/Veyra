# Urdu support — what the stack can and cannot do

> Researched 2026-09-26 against current provider documentation. Every claim here
> has a source. Re-check before relying on it: three of these capabilities
> changed within the last eight months.

Urdu is not a translation problem. The UI strings are the easy half; the voice
pipeline is where it gets decided, and **each of the four layers has a different
answer**. This document is the matrix and the consequences.

## The matrix

| Layer | Urdu? | What it costs us |
|---|---|---|
| **STT** — Deepgram Nova-3 | ✅ since Feb 2026 | **Monolingual only.** `language=multi` does not cover it. |
| **TTS** — ElevenLabs Flash v2.5 | ❌ **not supported** | The low-latency model is off the table for Urdu. |
| **TTS** — ElevenLabs v3 | ✅ (74 languages) | Expressive tier, not the ~75 ms flash tier. |
| **TTS** — Azure `ur-PK` | ✅ UzmaNeural, AsadNeural | Streaming needs the WebSocket v2 endpoint. |
| **TTS** — Cartesia Sonic | ❌ **rejected** | Lists Urdu-tagged voices, but `language=ur` returns "Invalid language for model" on sonic-2, sonic-3 and sonic-turbo (tested 2026-09-27 with a live key). Do not be misled by the voice list. |
| **Turn detection** — LiveKit multilingual | ❌ **no Urdu** | Falls back to silence timeout. Hindi is supported; Urdu is not. |
| **LLM** | ✅ | No action needed. |

## Three consequences, in order of how much they hurt

### 1. Turn detection degrades to a silence timer — the biggest quality hit

[VOICE.md](../VOICE.md) §1 is explicit that **the endpointing wait dominates the
latency budget**, and that a semantic turn detector is what lets the floor stay
at 400 ms without cutting people off mid-thought. On Urdu we lose that: the
LiveKit multilingual detector supports Hindi but not Urdu, so an Urdu call falls
back to VAD silence detection and must choose between cutting people off and
feeling sluggish.

**The tempting shortcut, and why it is not free.** Spoken Urdu and Hindi are
close to the same language (Hindustani); the Hindi detector might well classify
Urdu speech correctly. But the detector reads the **transcript text**, and
Deepgram's Urdu model emits Arabic script while the Hindi model was trained on
Devanagari. The script mismatch, not the language, is the blocker. Transliterating
Arabic-script Urdu → Devanagari before the detector is a real option and cheap to
try, but it is **an experiment to run, not a design to assume**. Until it is
measured, Urdu ships on a tuned silence timeout with a longer
`min_endpointing_delay`, and we say so rather than pretending parity.

### 2. Urdu TTS cannot use the flash tier

VOICE.md §4 picks ElevenLabs Flash over the quality tiers because "on a phone
call, 100 ms beats marginally better prosody every single time." Urdu is not
offered that trade — Flash v2.5 has no Urdu at all.

Two real options:

- **Azure `ur-PK`** (UzmaNeural / AsadNeural) over the WebSocket v2 streaming
  endpoint. Purpose-built Pakistani Urdu voices, and streaming keeps
  time-to-first-byte sane. Adds a provider.
- **ElevenLabs v3.** One fewer vendor and one fewer voice-cloning story to
  maintain, but it is the expressive tier, not the latency tier.

Recommendation: **Azure for Urdu, ElevenLabs Flash for everything else**, chosen
per call from the caller's language. The `FallbackAdapter` pattern already in the
stack means a second TTS provider is an existing shape, not a new one.

### 3. Urdu–English code-switching is unsolved, and it is the common case

Deepgram shipped Hebrew, Persian and Urdu as **monolingual, right-to-left
models**. `language=multi` — the thing VOICE.md §5 relies on because
"code-switchers don't announce the switch" — does not include them.

This matters more for Urdu than the matrix suggests. Urdu–English mixing
("Urdish") is not an edge case in Pakistani business speech; it is how people
talk, and numbers, dates, addresses and product names are routinely said in
English mid-sentence. A monolingual `language=ur` model will mangle exactly the
tokens a booking or a ticket depends on.

Mitigations, in the order worth trying:

1. **Keyterm Prompting**, which Deepgram's Urdu model does support — load the
   business's product names, staff names and locations. This is the same
   mechanism that stops "Zendesk" becoming "send desk", and it is the single
   highest-value lever here.
2. **Per-number language configuration.** An Urdu-facing phone number pins
   `language=ur`; a mixed-audience line stays on `multi` and accepts that heavy
   Urdu degrades. Which is right is a *business* decision, so it belongs in
   Studio as configuration, not in a constant.
3. **Confirm-back on anything durable.** Read numbers, dates and names back to
   the caller before the worker commits a write. This is worth doing for every
   language and is not negotiable for Urdu.

## What this means for the architecture

**Language is per-organization and per-phone-number configuration, not a global
setting.** A clinic in Lahore and an agency in Chicago are different tenants of
the same deployment, and one tenant can own numbers with different language
policies. The schema reflects this: language lives on the agent configuration
and can be overridden per phone number.

**The provider choice is derived from the language, not configured next to it.**
Nobody using Studio should have to know that Urdu forces a different TTS vendor.
They pick a language and a voice; the agent layer resolves which provider serves
it. Exposing the constraint in the UI would leak our vendor list into the product.

**Honest capability reporting.** Studio must show what is actually true per
language — that Urdu has no semantic turn detection yet — rather than presenting
every language as equivalent. [PRODUCT.md](../PRODUCT.md) already commits to
"never invent commercial facts"; the same applies to capability claims. The
published "42+ languages streaming multilingual STT" figure describes the `multi`
model and **does not include Urdu**, so Urdu must not be marketed under it.

## UI: right-to-left

Urdu is RTL, and so are Hebrew, Persian and Arabic — so this is one piece of work
that unlocks four languages rather than a one-off.

- `dir="rtl"` on `<html>`, driven by the user's locale.
- Use CSS **logical properties** (`margin-inline-start`, `padding-inline-end`,
  `inset-inline-start`) rather than left/right. Tailwind's `ms-*`/`me-*`/`start-*`/
  `end-*` utilities compile to these, so the work is mostly discipline rather
  than rewriting.
- Things that must **not** flip: phone numbers, timestamps, latency readouts,
  code and log output. Waveforms and progress indicators follow reading
  direction; audio scrubbers do not.
- The Geist Mono label voice in [DESIGN.md](../DESIGN.md) has no Urdu coverage.
  Urdu needs a Nastaliq-capable face (Noto Nastaliq Urdu) for prose, and mono
  labels should stay Latin — they are machine annotation, and transliterating
  them helps nobody.

## Sources

- [Deepgram — Speech-to-Text for Hebrew, Persian, and Urdu on Nova-3](https://deepgram.com/learn/speech-to-text-for-hebrew-persian-urdu-on-nova-3)
- [Deepgram — Urdu Speech to Text](https://deepgram.com/product/speech-to-text/urdu)
- [Deepgram — Languages Support](https://developers.deepgram.com/docs/language)
- [ElevenLabs — Models](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs — What languages do you support?](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support)
- [Azure — Urdu (ur-PK) neural voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
- [Azure — Lower speech synthesis latency (WebSocket v2 streaming)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency)
- [LiveKit — Turn detector plugin](https://docs.livekit.io/agents/build/turns/turn-detector/)
- [LiveKit — Solving end-of-turn detection](https://livekit.com/blog/solving-end-of-turn-detection)
