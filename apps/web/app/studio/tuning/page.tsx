"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader, SectionCard, Spinner } from "@/components/ui";
import LlmLab, { LatencyBudget, ProviderPicker } from "@/components/LlmLab";
import BusinessProfile from "@/components/BusinessProfile";

type Config = Record<string, any>;

type SectionKey = "business" | "budget" | "persona" | "llm" | "stt" | "tts" | "turn";

/* One long scrolling page hid most of the settings. These are separate views,
   switched from the rail, so each screen is one decision. Voices moved out
   entirely: it has its own page. */
const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
  { key: "business", label: "Business", hint: "Who the agent works for" },
  { key: "budget", label: "Latency budget", hint: "Where the caller's wait goes" },
  { key: "persona", label: "Persona", hint: "Who the agent is" },
  { key: "llm", label: "Language model", hint: "Speed and reasoning" },
  { key: "stt", label: "Speech to text", hint: "Hearing the caller" },
  { key: "tts", label: "Text to speech", hint: "How it sounds" },
  { key: "turn", label: "Turn taking", hint: "Interruptions and pauses" },
];

// vendor declared first audio latency per TTS model, used until a real
// synthesis measures it (VoiceLab reports the measured number back)
const TTS_DECLARED_MS: Record<string, number> = {
  eleven_flash_v2_5: 75,
  eleven_turbo_v2_5: 300,
  eleven_multilingual_v2: 1200,
};

function SliderField({
  label,
  hint,
  value,
  onChange,
  step = 0.05,
  min = 0,
  max = 10,
  unit = "",
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="badge badge-mono tabular">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ "--slider-fill": `${pct}%` } as React.CSSProperties}
        aria-label={label}
      />
      <p className="hint mt-2">{hint}</p>
    </div>
  );
}

export default function TuningPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [abilities, setAbilities] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // measured latencies, fed back by the two benches
  const [llmTtft, setLlmTtft] = useState<number | null>(null);
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const [section, setSection] = useState<SectionKey>("budget");

  useEffect(() => {
    api.get("/api/agent/config").then(setCfg).catch((e) => setError(e.message));
    api.get("/api/abilities").then(setAbilities).catch(() => {});
  }, []);

  const set = (k: string, v: any) => {
    setCfg((c) => ({ ...c!, [k]: v }));
    setSaved(false);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/agent/config", cfg);
      setSaved(true);
      setDirty(false);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    api
      .get("/api/agent/config")
      .then((c) => {
        setCfg(c);
        setDirty(false);
        setSaved(false);
      })
      .catch((e) => setError(e.message));
  };

  if (!cfg)
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Voice Tuning"
          description="How the agent sounds and how fast it responds. Changes apply to the next call."
        />
        {error ? (
          <div
            className="card p-3 text-[13px]"
            style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}
          >
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="skeleton h-48 w-full" />
            <div className="skeleton h-36 w-full" />
            <div className="skeleton h-36 w-full" />
          </div>
        )}
      </div>
    );

  return (
    <div className={`mx-auto max-w-5xl ${dirty ? "pb-24" : ""}`}>
      <PageHeader
        title="Voice Tuning"
        description="Applies to the next call session. Start a new demo call to hear changes."
        actions={
          <>
            {saved && <span className="badge badge-success">Saved</span>}
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner size={16} />}
              Save
            </button>
          </>
        }
      />

      {error && (
        <div
          className="card mb-6 p-3 text-[13px]"
          style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block" aria-label="Sections">
          <div className="sticky top-8 space-y-1">
            {SECTIONS.map((sec) => (
              <button
                key={sec.key}
                onClick={() => setSection(sec.key)}
                className={`tune-nav ${section === sec.key ? "active" : ""}`}
              >
                <span className="tune-nav__label">{sec.label}</span>
                <span className="tune-nav__hint">{sec.hint}</span>
              </button>
            ))}
            <Link href="/studio/voices" className="tune-nav">
              <span className="tune-nav__label">Voices and speech</span>
              <span className="tune-nav__hint">Library, playback, text to speech</span>
            </Link>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {section === "budget" && <div id="budget">
            <LatencyBudget
              endpointingMs={(cfg.min_endpointing_delay ?? 0.4) * 1000}
              llmTtftMs={llmTtft}
              ttsMs={ttsMs ?? TTS_DECLARED_MS[cfg.tts_model] ?? 300}
              ttsMeasured={ttsMs != null}
            />
          </div>}

          {section === "business" && <div id="business"><BusinessProfile /></div>}

          {section === "persona" && <div id="persona">
            <SectionCard title="Persona">
              <div className="space-y-4">
                <div>
                  <label className="label">System prompt</label>
                  <textarea
                    className="textarea min-h-[140px]"
                    value={cfg.system_prompt}
                    onChange={(e) => set("system_prompt", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Greeting</label>
                  <input className="input" value={cfg.greeting} onChange={(e) => set("greeting", e.target.value)} />
                  <p className="hint mt-1.5">Spoken as soon as the call connects.</p>
                </div>
                <div>
                  <label className="label">Conversation workflow</label>
                  <select className="select" value={cfg.ability_id || ""} onChange={(e) => set("ability_id", e.target.value)}>
                    <option value="">None, free form conversation</option>
                    {abilities.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <p className="hint mt-1.5">Attach a structured workflow the agent follows on calls.</p>
                </div>
              </div>
            </SectionCard>
          </div>}

          {section === "llm" && <div id="llm">
            <SectionCard
              title="Language model"
              description="The model that reasons on the call. Pick a provider and model the same way you choose speech to text and text to speech."
            >
              <ProviderPicker />
              <div className="my-5" style={{ borderTop: "1px solid var(--border)" }} />
              <p className="label mb-3">Compare models · time to first token</p>
              <LlmLab
                currentModel={cfg.llm_model || ""}
                onUseModel={(id) => set("llm_model", id)}
                onMeasured={setLlmTtft}
              />
            </SectionCard>
          </div>}

          {section === "stt" && <div id="stt">
            <SectionCard title="Speech to text" description="How the agent hears the caller.">
              <div className="space-y-4">
                <div>
                  <label className="label">Provider</label>
                  <select className="select" value={cfg.stt_provider || "deepgram"} onChange={(e) => set("stt_provider", e.target.value)}>
                    <option value="deepgram">Deepgram · nova-3, keyterm boosting</option>
                    <option value="cartesia">Cartesia Ink · same provider as your voice, tuned for noisy lines</option>
                  </select>
                </div>

                {(cfg.stt_provider || "deepgram") === "cartesia" ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Model</label>
                        <select className="select" value={cfg.cartesia_stt_model || "ink-whisper"} onChange={(e) => set("cartesia_stt_model", e.target.value)}>
                          <option value="ink-whisper">ink-whisper · streaming, noise tuned</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Language</label>
                        <select className="select" value={cfg.stt_language} onChange={(e) => set("stt_language", e.target.value)}>
                          <option value="en">en · English</option>
                          <option value="multi">auto detect</option>
                          <option value="es">es · Spanish</option>
                        </select>
                      </div>
                    </div>
                    <p className="hint">Uses the Cartesia key already set for your voice. Keyterm boosting is Deepgram only.</p>
                  </>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Model</label>
                        <select className="select" value={cfg.stt_model} onChange={(e) => set("stt_model", e.target.value)}>
                          <option value="nova-3">nova-3 · best accuracy and keyterm boosting</option>
                          <option value="nova-2">nova-2 · cheaper, keyword boosting</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Language</label>
                        <select className="select" value={cfg.stt_language} onChange={(e) => set("stt_language", e.target.value)}>
                          <option value="multi">multi · code switching (EN/ES/FR/DE/…)</option>
                          <option value="en">en · English only (slightly better EN accuracy)</option>
                          <option value="es">es · Spanish</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Keyterms</label>
                      <input
                        className="input"
                        placeholder="Vera, nova-3, SKU-12b"
                        value={(cfg.stt_keyterms ?? []).join(", ")}
                        onChange={(e) =>
                          set(
                            "stt_keyterms",
                            e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean)
                          )
                        }
                      />
                      <p className="hint mt-1.5">
                        Comma separated. Brand names, SKUs, and jargon STT would otherwise mangle.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          </div>}

          {section === "tts" && <div id="tts">
            <SectionCard
              title="Voice engine"
              description="How the agent speaks. The cascade is deterministic and scriptable; realtime is the most expressive but does not guarantee word for word output."
            >
              <div className="space-y-4">
                <div className="engine-switch">
                  {[
                    { key: "cascade", name: "Cascade", sub: "STT → LLM → TTS · scriptable, phone tuned" },
                    { key: "realtime", name: "Realtime (speech to speech)", sub: "OpenAI · most expressive, higher cost" },
                  ].map((e) => (
                    <button
                      key={e.key}
                      className={`engine-opt ${(cfg.voice_engine || "cascade") === e.key ? "sel" : ""}`}
                      onClick={() => set("voice_engine", e.key)}
                    >
                      <span className="engine-opt__name">{e.name}</span>
                      <span className="engine-opt__sub">{e.sub}</span>
                    </button>
                  ))}
                </div>

                {(cfg.voice_engine || "cascade") === "cascade" ? (
                  <>
                    <div>
                      <label className="label">Provider</label>
                      <select className="select" value={cfg.tts_provider || "elevenlabs"} onChange={(e) => set("tts_provider", e.target.value)}>
                        <option value="elevenlabs">ElevenLabs</option>
                        <option value="cartesia">Cartesia Sonic · more expressive, low latency</option>
                      </select>
                    </div>

                    {(cfg.tts_provider || "elevenlabs") === "cartesia" ? (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="label">Model</label>
                            <select className="select" value={cfg.cartesia_model || "sonic-3"} onChange={(e) => set("cartesia_model", e.target.value)}>
                              <option value="sonic-3">sonic-3 · recommended</option>
                              <option value="sonic-3.5">sonic-3.5 · newest</option>
                              <option value="sonic-2">sonic-2</option>
                              <option value="sonic-turbo">sonic-turbo · lowest latency</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Voice ID (Cartesia)</label>
                            <input className="input mono" value={cfg.cartesia_voice_id || ""} placeholder="blank = default voice"
                              onChange={(e) => set("cartesia_voice_id", e.target.value)} />
                          </div>
                        </div>
                        <p className="hint">
                          Needs a Cartesia key in the server environment (CARTESIA_API_KEY, free at play.cartesia.ai).
                          Without it the agent falls back to ElevenLabs so calls never go silent. Browse voice IDs in the Cartesia dashboard.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="label">Model</label>
                            <select className="select" value={cfg.tts_model} onChange={(e) => set("tts_model", e.target.value)}>
                              <option value="eleven_flash_v2_5">eleven_flash_v2_5 · fastest, flattest</option>
                              <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 · warmer prosody</option>
                              <option value="eleven_multilingual_v2">eleven_multilingual_v2 · most expressive, slow</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Voice ID (ElevenLabs)</label>
                            <input className="input mono" value={cfg.tts_voice_id} onChange={(e) => set("tts_voice_id", e.target.value)} />
                          </div>
                        </div>
                        <p className="hint">
                          Flash sounds flat by design. If the voice feels robotic, try Turbo, or switch the provider to Cartesia Sonic.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Model</label>
                        <select className="select" value={cfg.realtime_model || "gpt-realtime"} onChange={(e) => set("realtime_model", e.target.value)}>
                          <option value="gpt-realtime">gpt-realtime · flagship</option>
                          <option value="gpt-realtime-mini">gpt-realtime-mini · cheaper</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Voice</label>
                        <select className="select" value={cfg.realtime_voice || "marin"} onChange={(e) => set("realtime_voice", e.target.value)}>
                          {["marin", "cedar", "alloy", "ash", "ballad", "coral", "sage", "verse", "shimmer"].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="engine-note">
                      <b>Most expressive, with trade offs.</b> One speech to speech model replaces the STT, LLM and TTS,
                      so it keeps emotion and prosody and runs its own turn detection. Exact scripted pathway lines are
                      not guaranteed word for word, and it costs materially more per minute than the cascade.
                      Uses the OpenAI key on the server (OPENAI_API_KEY).
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          </div>}

          {section === "turn" && <div id="turn-taking">
            <SectionCard title="Turn taking" description="The knobs that make or break the experience.">
              <div className="space-y-5">
                <SliderField
                  label="VAD min silence"
                  unit="s"
                  hint="Silence needed before a turn is even a candidate for ending. Lower = snappier but clips slow talkers mid thought."
                  value={cfg.vad_min_silence}
                  onChange={(v) => set("vad_min_silence", v)}
                  min={0.1}
                  max={1.5}
                />
                <SliderField
                  label="VAD activation threshold"
                  hint="Speech probability needed to count as talking. Raise toward 0.7 in noisy environments (call centers, kitchens); lower for quiet, soft spoken callers."
                  value={cfg.vad_activation_threshold}
                  onChange={(v) => set("vad_activation_threshold", v)}
                  min={0.2}
                  max={0.9}
                />
                <SliderField
                  label="Min endpointing delay"
                  unit="s"
                  hint="Floor on how long the agent waits after you stop before replying, even when the turn detector is confident. 0.4s feels attentive; 0.2s feels interrupty."
                  value={cfg.min_endpointing_delay}
                  onChange={(v) => set("min_endpointing_delay", v)}
                  min={0.1}
                  max={2.0}
                />
                <SliderField
                  label="Max endpointing delay"
                  unit="s"
                  hint="Ceiling when the semantic turn detector thinks you're mid thought ('my number is…'). Prevents the agent barging in during a pause to remember."
                  value={cfg.max_endpointing_delay}
                  onChange={(v) => set("max_endpointing_delay", v)}
                  min={1}
                  max={10}
                  step={0.5}
                />
                <SliderField
                  label="Min interruption duration"
                  unit="s"
                  hint="Speech shorter than this doesn't count as barge in. 0.55s ignores coughs and 'mm hm' backchannels but catches a real 'wait, stop'."
                  value={cfg.min_interruption_duration}
                  onChange={(v) => set("min_interruption_duration", v)}
                  min={0.1}
                  max={2.0}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Allow barge in</p>
                    <p className="hint mt-0.5">
                      Disable only for compliance disclosures that must play in full.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!cfg.allow_interruptions}
                    aria-label="Allow barge in"
                    className="switch mt-1"
                    onClick={() => set("allow_interruptions", !cfg.allow_interruptions)}
                  />
                </div>
              </div>
            </SectionCard>
          </div>}
        </div>
      </div>

      {dirty && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 px-4 py-3 sm:px-8 md:left-[260px]"
          style={{ background: "var(--surface-overlay)", borderTop: "1px solid var(--border)" }}
        >
          <span className="text-secondary text-[13px]">Unsaved changes</span>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={discard}>
              Discard
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner size={16} />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
