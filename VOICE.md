# VOICE.md — why most voice agents break, and what this stack does about it

Opinions below are load-bearing. They're encoded in the defaults of this repo.

## 1. The latency budget is a budget, not a vibe

A conversation feels human below ~1.2s voice-to-voice (user stops → agent audio starts).
At 1.5s people start saying "hello?"; at 2s+ they talk over the agent, which cascades into
interruption chaos. You cannot fix this at the end — you allocate it up front:

| Stage | Budget | Our choice |
|---|---|---|
| Endpointing wait | 400–700 ms | Silero VAD + LiveKit semantic turn detector, `min_endpointing_delay=0.4s` |
| STT finalization | ~100–200 ms | Deepgram nova-3, streaming with interim results |
| LLM first token | 250–500 ms | grok-3-mini for realtime (never the big model), `preemptive_generation=true` |
| TTS first byte | 75–200 ms | ElevenLabs `eleven_flash_v2_5` |

Two corollaries people get wrong:

- **The endpointing wait dominates.** Everyone micro-optimizes LLM TTFT and then waits
  700ms of hardcoded silence-timeout. A *semantic* turn detector lets you keep the floor at
  400ms without cutting people off mid-thought, because it extends the wait only when the
  text looks unfinished ("my card number is…").
- **p95 is the product, p50 is the demo.** One 4-second turn ruins a call more than ten
  1.4-second turns. That's why the worker publishes per-turn `eou/ttft/ttfb` to the room
  and the eval harness reports p95 — if you only look at averages you will ship a stack
  that embarrasses you on every tenth turn.

## 2. Audio formats: boring, and the #1 silent quality killer

- **Telephony is 8kHz μ-law. Period.** Your gorgeous 44.1kHz TTS gets crushed to G.711 on
  a PSTN call. Test your voice *through the codec* — a voice that sounds warm at 44.1kHz
  can sound muddy at 8kHz. This is why demos sound great and phone calls don't.
- **WebRTC (this repo's browser demo) negotiates Opus at 48kHz** — LiveKit handles
  resampling; don't fight it, and don't ship raw PCM over websockets to "save latency"
  unless you enjoy reimplementing jitter buffers badly.
- **Never transcode more than once.** Every hop (TTS→PCM→μ-law→Opus) adds artifacts and
  milliseconds. Pick a pipeline where the media server does the one necessary conversion.
- 16kHz is the sweet spot for STT input; feeding 48kHz to STT wastes bandwidth for zero
  accuracy gain.

## 3. Interruptions: barge-in is easy, *not* over-triggering is hard

Naive barge-in (any VAD activity kills TTS) fails twice:

1. **False positives** — coughs, "mm-hm" backchannels, a door slamming. Fix:
   `min_interruption_duration=0.55s` (real interruptions carry words) and
   `resume_false_interruption` — if the "interruption" produced no transcript, the agent
   resumes its sentence instead of standing there dead.
2. **Stale context** — user interrupts, agent stops… and its chat history still contains
   the full sentence it never finished saying. Next turn it references things the caller
   never heard. LiveKit's session truncates the assistant message to what was actually
   spoken; if you roll your own pipeline you MUST do this or the agent slowly goes insane.

Also: disable barge-in *selectively* (compliance disclosures, payment confirmation), never
globally. A per-workflow `allow_interruptions` override exists for exactly this.

## 4. Provider tradeoffs (as configured here)

- **STT — Deepgram nova-3**: best streaming latency/accuracy trade, `language=multi`
  handles mid-sentence code-switching, and keyterm boosting is how you stop "Zendesk"
  becoming "send desk". Whisper-class batch models are irrelevant here: streaming partials
  are what let you pre-warm the LLM.
- **LLM — xAI grok-3-mini for the call, grok-4 for everything offline** (deep agent,
  judge, simulated callers). Using your biggest model in the realtime loop is the classic
  mistake: you pay 800ms+ TTFT so the agent can be smart in ways callers never notice.
  Voice answers are three sentences; a fast model with good retrieval beats a slow genius.
- **TTS — ElevenLabs flash primary, Inworld failover** via `FallbackAdapter`. TTS is the
  most outage-prone link in the chain, and a TTS outage without failover is a dead phone
  line, not a degraded experience. Flash over turbo/quality tiers: on a phone call, 100ms
  beats marginally better prosody every single time.
- **Transport — LiveKit**: WebRTC does echo cancellation, jitter, packet loss recovery,
  and gives the same agent session a SIP door to the PSTN. Rolling your own
  websocket-audio transport means rebuilding all of that, worse.

## 5. Multilingual & accents

- Code-switchers don't announce the switch. `language=multi` at the STT layer, one
  multilingual turn-detector model, and a TTS voice that can render both languages —
  language handling belongs in the *pipeline*, not in a "press 2 for Spanish" workflow.
- Accent robustness is mostly an *eval* problem: you don't fix it with prompts, you
  measure it. That's what the `accent_heavy` persona (18% simulated STT corruption) is
  for — your agent must pursue clarification instead of confidently answering the wrong
  question.
- RAG must survive mangled queries: hybrid retrieval (dense + BM25 + RRF) exists here
  because embeddings absorb paraphrase while BM25 rescues the exact tokens STT got right.

## 6. Why voice agents break when real users start calling

Demo users are polite, speak in complete sentences, and want the happy path. Real callers:

- ramble, bury the question, change their mind mid-call (→ `rambler`, `interrupter` personas)
- interrupt constantly and expect the agent to *remember what it was cut off saying*
- have accents, background noise, kids, speakerphones (→ VAD threshold tuning, BVC noise cancellation)
- ask things outside the KB and get angry at hedging (→ hard rule: retrieve-or-transfer, never improvise)
- hit you during a provider incident (→ TTS fallback, backend-down defaults, transfer paths that fail loudly to a human)

Hence the operating rule of this repo: **every conversational behavior is a tunable
config, every failure path degrades to a human, and nothing ships without simulated
callers beating on it first.** The evals page runs the same prompt/RAG/workflow stack as
the live call — if the interrupter persona scores 2/5 on conversation quality, real
callers were about to find that out for you.
