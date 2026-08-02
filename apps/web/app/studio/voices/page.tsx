"use client";

/* Voices — the library and the synthesis bench.

   Two jobs. Library: hear every voice, filter to the one that fits, make it the
   agent's voice. Studio: type anything, generate it, and see how long the first
   audio actually took, because that number is a third of the voice to voice
   budget on a live call. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, Check, Download, Gauge, KeyRound, Loader2, Pause,
  Copy, Play, Search, Sparkles, Volume2,
} from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { PageHeader, Spinner } from "@/components/ui";
import { toast } from "@/components/Toasts";

type Voice = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  category?: string;
  preview_url?: string | null;
  description?: string;
  best_for?: string;
  provider?: string;
};
type Provider = { id: string; name: string; kind: string; licence: string; available: boolean; note: string };
type Model = { id: string; label: string; latency_ms: number; note: string };

const SAMPLE = "Hi, thanks for calling Northwind. How can I help you today?";

/* Which voice is live depends on the engine: the Realtime engine has its own
   voice, and the cascade's voice depends on the chosen provider. This keeps the
   "in use" badge honest across all of them. */
function activeVoiceId(c: any): string {
  if ((c.voice_engine || "cascade") === "realtime") return c.realtime_voice || "";
  if ((c.tts_provider || "elevenlabs") === "cartesia") return c.cartesia_voice_id || "";
  return c.tts_voice_id || "";
}

/* Section order + labels. Cartesia leads because it is the recommended cascade
   voice; Orpheus is preview only until it is wired into the call path. */
const PROVIDER_META: Record<string, { title: string; blurb: string; usable: boolean }> = {
  cartesia: { title: "Cartesia Sonic", blurb: "Expressive and low latency. The recommended call voice.", usable: true },
  elevenlabs: { title: "ElevenLabs", blurb: "Broad range, paid per character.", usable: true },
  openai: { title: "OpenAI · Realtime voices", blurb: "Speech to speech. Choosing one switches the agent to the Realtime engine.", usable: true },
  groq: { title: "Orpheus · open source", blurb: "Apache 2.0 weights. Preview only for now.", usable: false },
};
const PROVIDER_ORDER = ["cartesia", "elevenlabs", "openai", "groq"];

/* Synthesis goes through our server so the ElevenLabs key never reaches the
   browser. The server reports how long it took in a header. */
async function synth(body: any): Promise<{ url: string; ms: number; blob: Blob }> {
  const t0 = performance.now();
  const resp = await fetch(`${API_URL}/api/voice/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let msg = `${resp.status}`;
    try { msg = (await resp.json()).detail || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : "Synthesis failed");
  }
  const ms = Number(resp.headers.get("X-Synth-Ms")) || Math.round(performance.now() - t0);
  const blob = await resp.blob();
  return { url: URL.createObjectURL(blob), ms, blob };
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="v-tag">{children}</span>;
}

export default function VoicesPage() {
  const [tab, setTab] = useState<"library" | "studio">("library");
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [currentId, setCurrentId] = useState<string>("");

  // library filters
  const [q, setQ] = useState("");
  const [gender, setGender] = useState("");
  const [accent, setAccent] = useState("");

  // playback
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // studio
  const [text, setText] = useState(SAMPLE);
  const [model, setModel] = useState("eleven_flash_v2_5");
  const [studioVoice, setStudioVoice] = useState("");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [gen, setGen] = useState<{ url: string; ms: number; voice: string; text: string }[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get("/api/voice/voices").then((d) => {
      setVoices(d.voices || []);
      setModels(d.models || []);
      setNote(d.note || null);
      setConfigured(!!d.configured);
      setProviders(d.providers || []);
      if (d.voices?.[0]) setStudioVoice((v: string) => v || d.voices[0].voice_id);
    }).catch((e) => { setVoices([]); setNote(e.message); });
    api.get("/api/agent/config").then((c) => setCurrentId(activeVoiceId(c))).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }, []);

  const play = useCallback((url: string, tag: string) => {
    stop();
    const a = new Audio(url);
    audioRef.current = a;
    setPlaying(tag);
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
  }, [stop]);

  const preview = async (v: Voice) => {
    if (playing === v.voice_id) return stop();
    setBusy(v.voice_id);
    try {
      if (v.preview_url) play(v.preview_url, v.voice_id);
      else {
        const { url } = await synth({ voice_id: v.voice_id, provider: v.provider, text: SAMPLE, model });
        play(url, v.voice_id);
      }
    } catch (e: any) {
      toast.error("Could not play that voice", { description: e.message });
    } finally { setBusy(null); }
  };

  const useForAgent = async (v: Voice) => {
    const prov = v.provider || "elevenlabs";
    if (!PROVIDER_META[prov]?.usable) {
      toast.error("Preview only for now", { description: `${PROVIDER_META[prov]?.title || prov} voices are not yet wired into live calls.` });
      return;
    }
    try {
      const cfg = await api.get("/api/agent/config");
      let patch: any;
      if (prov === "openai") patch = { voice_engine: "realtime", realtime_voice: v.voice_id };
      else if (prov === "cartesia") patch = { voice_engine: "cascade", tts_provider: "cartesia", cartesia_voice_id: v.voice_id };
      else patch = { voice_engine: "cascade", tts_provider: "elevenlabs", tts_voice_id: v.voice_id };
      await api.put("/api/agent/config", { ...cfg, ...patch });
      setCurrentId(v.voice_id);
      const how = prov === "openai" ? "Realtime speech to speech engine" : `${PROVIDER_META[prov].title} on the cascade`;
      toast.success(`${v.name} is now the agent's voice`, { description: `Switched to the ${how}.` });
    } catch (e: any) {
      toast.error("Could not set the voice", { description: e.message });
    }
  };

  const generate = async () => {
    if (!text.trim() || !studioVoice) return;
    setGenerating(true);
    try {
      const { url, ms } = await synth({
        voice_id: studioVoice, provider: voices?.find((v) => v.voice_id === studioVoice)?.provider,
        text, model, stability, similarity, style, speed,
      });
      const name = voices?.find((v) => v.voice_id === studioVoice)?.name || studioVoice;
      setGen((g) => [{ url, ms, voice: name, text }, ...g].slice(0, 8));
      play(url, "studio");
    } catch (e: any) {
      toast.error("Generation failed", { description: e.message });
    } finally { setGenerating(false); }
  };

  const genders = useMemo(
    () => Array.from(new Set((voices || []).map((v) => v.labels?.gender).filter(Boolean))) as string[],
    [voices]);
  const accents = useMemo(
    () => Array.from(new Set((voices || []).map((v) => v.labels?.accent).filter(Boolean))) as string[],
    [voices]);

  const filtered = (voices || []).filter((v) => {
    const ql = q.trim().toLowerCase();
    if (ql && !(`${v.name} ${v.description || ""} ${Object.values(v.labels || {}).join(" ")}`.toLowerCase().includes(ql))) return false;
    if (gender && v.labels?.gender !== gender) return false;
    if (accent && v.labels?.accent !== accent) return false;
    return true;
  });

  const modelMeta = models.find((m) => m.id === model);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Voices"
        description="Hear every voice, pick the one that fits the business, and generate speech to check how it handles your actual script."
      />

      {!configured && (
        <div className="card mb-6 flex items-start gap-3 p-4" style={{ borderColor: "var(--warning-border)" }}>
          <KeyRound size={18} className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
          <div className="text-[13px]">
            <b>No ElevenLabs key configured.</b> Add <span className="kbd">ELEVEN_API_KEY</span> to{" "}
            <span className="kbd">.env</span> and restart the server to play and generate voices.
          </div>
        </div>
      )}
      {note && configured && (
        <div className="card mb-6 flex items-start gap-3 p-4" style={{ borderColor: "var(--border-accent)" }}>
          <KeyRound size={18} className="mt-0.5 shrink-0" style={{ color: "var(--accent-text)" }} />
          <div className="text-[13px]">{note}</div>
        </div>
      )}

      <div className="mb-6 flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {([["library", "Library"], ["studio", "Text to speech"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="relative px-4 py-2.5 text-[14px] font-medium"
            style={{ color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {label}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5" style={{ background: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        <>
          {providers.length > 0 && (
            <div className="v-providers">
              {providers.map((p) => (
                <div key={p.id} className={`v-provider ${p.available ? "on" : ""}`}>
                  <span className="v-provider__dot" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold">{p.name}</span>
                      <span className="badge badge-mono">{p.licence}</span>
                    </div>
                    <p className="v-provider__note">{p.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold">Voices</h2>
            <span className="text-tertiary text-[12.5px]">
              {voices === null ? "loading" : `${filtered.length} of ${voices.length}`}
            </span>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="input pl-9" placeholder="Search voices" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="select w-auto" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Any voice</option>
              {genders.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="select w-auto" value={accent} onChange={(e) => setAccent(e.target.value)}>
              <option value="">Any accent</option>
              {accents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {voices === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[168px] w-full rounded-[var(--radius-md)]" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-tertiary py-16 text-center text-sm">No voices match those filters.</p>
          ) : (
            <div className="space-y-7">
              {PROVIDER_ORDER.map((prov) => {
                const group = filtered.filter((v) => (v.provider || "elevenlabs") === prov);
                if (!group.length) return null;
                const meta = PROVIDER_META[prov];
                return (
                  <div key={prov}>
                    <div className="v-section">
                      <div className="v-section__title">
                        {meta?.title || prov}
                        <span className="v-section__count">{group.length}</span>
                      </div>
                      {meta?.blurb && <p className="v-section__blurb">{meta.blurb}</p>}
                    </div>
                    <div className="v-list">
                      {group.map((v) => {
                        const isCurrent = v.voice_id === currentId;
                        const isPlaying = playing === v.voice_id;
                        const open = prov === "groq";
                        const usable = meta?.usable !== false;
                        return (
                          <div key={v.voice_id} className={`v-row ${isCurrent ? "current" : ""}`}>
                            <span className={`v-avatar ${open ? "open" : ""}`}><Volume2 size={15} /></span>

                            <div className="v-row__main">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[14px] font-semibold">{v.name}</span>
                                {v.labels?.gender && <span className="text-tertiary text-[11.5px]">{v.labels.gender}</span>}
                                {open && <span className="badge badge-mono">open source</span>}
                                {isCurrent && <span className="badge badge-success"><Check size={11} /> in use</span>}
                              </div>
                              {v.description && <p className="v-row__desc">{v.description}</p>}
                            </div>

                            <button
                              className="v-copy"
                              title="Copy voice id"
                              onClick={() => { navigator.clipboard.writeText(v.voice_id); toast.success("Voice id copied"); }}
                            >
                              <Copy size={13} />
                            </button>

                            <div className="v-row__tags">
                              {Object.entries(v.labels || {}).slice(0, 4).map(([k, val]) => <Tag key={k}>{val}</Tag>)}
                            </div>

                            <div className="v-row__actions">
                              <button className="btn btn-secondary btn-sm" onClick={() => preview(v)} disabled={busy === v.voice_id}>
                                {busy === v.voice_id ? <Spinner size={13} /> : isPlaying ? <Pause size={13} /> : <Play size={13} />}
                                {isPlaying ? "Stop" : "Play"}
                              </button>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setStudioVoice(v.voice_id); setTab("studio"); }} title="Open in text to speech">
                                <Sparkles size={13} />
                              </button>
                              <button className="btn btn-primary btn-sm" onClick={() => useForAgent(v)} disabled={isCurrent || !usable}
                                title={usable ? "Use for calls" : "Preview only for now"}>Use</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="card p-5">
              <label className="label">What should we say?</label>
              <textarea
                className="textarea min-h-[160px]"
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the line your agent actually says, not a demo sentence."
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="hint">Test your real greeting, including numbers and names. That is where voices fall apart.</p>
                <span className="text-tertiary mono text-[11px] tabular-nums">{text.length}/1000</span>
              </div>

              <button className="btn btn-primary mt-4 w-full" onClick={generate} disabled={generating || !text.trim() || !configured}>
                {generating ? <Loader2 size={15} className="animate-spin" /> : <AudioLines size={15} />}
                {generating ? "Generating" : "Generate speech"}
              </button>
            </div>

            {gen.length > 0 && (
              <div className="mt-5">
                <div className="label mb-2">Generations</div>
                <div className="space-y-2">
                  {gen.map((g, i) => (
                    <div key={i} className="v-gen">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => (playing === `g${i}` ? stop() : play(g.url, `g${i}`))}>
                        {playing === `g${i}` ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px]">{g.text}</div>
                        <div className="text-tertiary text-[11px]">{g.voice}</div>
                      </div>
                      <span className="badge badge-mono tabular-nums">{g.ms} ms</span>
                      <a className="btn btn-ghost btn-icon btn-sm" href={g.url} download={`${g.voice}-${i}.mp3`} title="Download">
                        <Download size={14} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <label className="label">Voice</label>
              <select className="select" value={studioVoice} onChange={(e) => setStudioVoice(e.target.value)}>
                {PROVIDER_ORDER.map((prov) => {
                  const group = (voices || []).filter((v) => (v.provider || "elevenlabs") === prov);
                  if (!group.length) return null;
                  return (
                    <optgroup key={prov} label={PROVIDER_META[prov]?.title || prov}>
                      {group.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                    </optgroup>
                  );
                })}
              </select>

              <label className="label mt-4">Model</label>
              <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              {modelMeta && (
                <p className="hint mt-1.5 flex items-center gap-1.5">
                  <Gauge size={12} /> about {modelMeta.latency_ms} ms declared · {modelMeta.note}
                </p>
              )}
            </div>

            <div className="card p-4">
              <div className="label mb-3">Delivery</div>
              {([
                ["Stability", stability, setStability, "Low varies more, high stays flat."],
                ["Similarity", similarity, setSimilarity, "How closely it holds the original timbre."],
                ["Style", style, setStyle, "Adds expressiveness, costs a little latency."],
              ] as const).map(([label, val, set, hint]) => (
                <div key={label} className="mb-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12.5px] font-medium">{label}</span>
                    <span className="mono text-tertiary text-[11px] tabular-nums">{(val as number).toFixed(2)}</span>
                  </div>
                  <input
                    type="range" className="slider" min={0} max={1} step={0.05} value={val as number}
                    onChange={(e) => (set as any)(parseFloat(e.target.value))}
                    style={{ "--slider-fill": `${(val as number) * 100}%` } as React.CSSProperties}
                  />
                  <p className="hint mt-1">{hint}</p>
                </div>
              ))}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12.5px] font-medium">Speed</span>
                  <span className="mono text-tertiary text-[11px] tabular-nums">{speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range" className="slider" min={0.7} max={1.2} step={0.05} value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  style={{ "--slider-fill": `${((speed - 0.7) / 0.5) * 100}%` } as React.CSSProperties}
                />
                <p className="hint mt-1">Slightly under 1 often reads clearer on a phone line.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
