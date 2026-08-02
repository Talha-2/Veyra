"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pause, Play, Search, Volume2 } from "lucide-react";
import { API_URL, api } from "@/lib/api";

type Voice = { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string | null; category?: string };
type Model = { id: string; label: string; latency_ms: number; note: string };

async function synthesize(body: any): Promise<{ url: string; ms: number }> {
  const t0 = performance.now();
  const resp = await fetch(`${API_URL}/api/voice/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error((await resp.text()).slice(0, 200) || `HTTP ${resp.status}`);
  const serverMs = Number(resp.headers.get("X-Synth-Ms")) || Math.round(performance.now() - t0);
  const blob = await resp.blob();
  return { url: URL.createObjectURL(blob), ms: serverMs };
}

export default function VoiceLab({
  currentVoiceId,
  onUseVoice,
  settings,
  onMeasured,
}: {
  currentVoiceId: string;
  onUseVoice: (id: string) => void;
  settings: { stability: number; similarity: number; style: number; speed: number };
  /** report real synthesis latency up, so the page's budget stops guessing */
  onMeasured?: (ms: number) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [configured, setConfigured] = useState(true);
  const [q, setQ] = useState("");
  const [text, setText] = useState("Hi, thanks for calling. How can I help you today?");
  const [model, setModel] = useState("eleven_flash_v2_5");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ab, setAb] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const [abResult, setAbResult] = useState<Record<"a" | "b", { ms: number } | null>>({ a: null, b: null });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/voice/voices").then((d) => {
      setVoices(d.voices || []);
      setModels(d.models || []);
      setConfigured(d.configured);
      if (d.voices?.[0]) setAb({ a: currentVoiceId || d.voices[0].voice_id, b: d.voices[1]?.voice_id || d.voices[0].voice_id });
    }).catch((e) => setError(e.message));
    return () => { audioRef.current?.pause(); };
  }, [currentVoiceId]);

  const play = (url: string, tag: string) => {
    audioRef.current?.pause();
    const a = new Audio(url);
    audioRef.current = a;
    setPlaying(tag);
    a.onended = () => setPlaying(null);
    a.play();
  };

  const previewVoice = async (v: Voice, tag: string) => {
    setError(null);
    if (playing === tag) { audioRef.current?.pause(); setPlaying(null); return; }
    setBusy(tag);
    try {
      if (v.preview_url) { play(v.preview_url, tag); }
      else {
        const { url } = await synthesize({ voice_id: v.voice_id, text, model, ...settings });
        play(url, tag);
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const runAB = async () => {
    setError(null);
    setBusy("ab");
    setAbResult({ a: null, b: null });
    try {
      const [ra, rb] = await Promise.all([
        synthesize({ voice_id: ab.a, text, model, ...settings }),
        synthesize({ voice_id: ab.b, text, model, ...settings }),
      ]);
      setAbResult({ a: { ms: ra.ms }, b: { ms: rb.ms } });
      onMeasured?.(Math.min(ra.ms, rb.ms)); // real synthesis latency for the budget
      (window as any).__abUrls = { a: ra.url, b: rb.url };
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const filtered = voices.filter((v) => !q || v.name?.toLowerCase().includes(q.toLowerCase()));
  const voiceById = (id: string) => voices.find((v) => v.voice_id === id);

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="card flex items-start gap-3 p-4" style={{ borderColor: "var(--border-accent)" }}>
          <Volume2 size={18} className="mt-0.5 shrink-0" style={{ color: "var(--accent-text)" }} />
          <div className="text-[13px]">Preview and comparison use ElevenLabs. Set <span className="kbd">ELEVEN_API_KEY</span> in <span className="kbd">.env</span> to synthesize real samples. Showing a curated voice list meanwhile.</div>
        </div>
      )}
      {error && <div className="card p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>{error}</div>}

      {/* sample text + model */}
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div>
          <label className="label">Sample text</label>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <label className="label">Model</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label} · ~{m.latency_ms}ms</option>)}
          </select>
        </div>
      </div>
      <p className="hint">{models.find((m) => m.id === model)?.note}</p>

      {/* A/B compare */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold">A / B compare</span>
          <button className="btn btn-primary btn-sm" onClick={runAB} disabled={busy === "ab" || !ab.a || !ab.b}>
            {busy === "ab" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Synthesize both
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((slot) => (
            <div key={slot} className="rounded-[var(--radius-md)] p-3" style={{ background: "var(--surface-sunken)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="mono text-[11px] uppercase tracking-wider text-tertiary">Voice {slot.toUpperCase()}</span>
                {abResult[slot] && <span className="badge badge-mono">{abResult[slot]!.ms}ms</span>}
              </div>
              <select className="select" value={ab[slot]} onChange={(e) => setAb({ ...ab, [slot]: e.target.value })}>
                {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
              </select>
              {abResult[slot] && (
                <button className="btn btn-secondary btn-sm mt-2 w-full" onClick={() => play((window as any).__abUrls?.[slot], `ab-${slot}`)}>
                  {playing === `ab-${slot}` ? <Pause size={13} /> : <Play size={13} />} Play {voiceById(ab[slot])?.name}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* voice library */}
      <div>
        <div className="relative mb-3">
          <Search size={15} className="text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Search voices" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const tag = `voice-${v.voice_id}`;
            const active = v.voice_id === currentVoiceId;
            return (
              <div key={v.voice_id} className="card flex items-center gap-3 p-3">
                <button className="btn btn-secondary btn-icon" onClick={() => previewVoice(v, tag)} disabled={busy === tag} aria-label="Preview">
                  {busy === tag ? <Loader2 size={15} className="animate-spin" /> : playing === tag ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{v.name}</div>
                  <div className="text-tertiary truncate text-[11px]">{Object.values(v.labels || {}).slice(0, 2).join(" · ") || v.category}</div>
                </div>
                <button className={`btn btn-sm ${active ? "btn-secondary" : "btn-ghost"}`} onClick={() => onUseVoice(v.voice_id)} disabled={active}>
                  {active ? <><Check size={13} /> In use</> : "Use"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
