"use client";

/* Language model bench.

   On a call the only latency number that matters for the model is time to first
   token: everything after it streams and overlaps with speech. So we stream a
   real completion from each selected model and time the first token, rather than
   quoting vendor marketing numbers. */

import { useEffect, useState } from "react";
import { Check, Gauge, Play, TriangleAlert, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { toast } from "@/components/Toasts";

type Bench = {
  model: string;
  ttft_ms?: number;
  total_ms?: number;
  chars?: number;
  output?: string;
  error?: string;
};

const DEFAULT_PROMPT = "A caller asks what your opening hours are. Answer in one short sentence.";

export function LatencyBudget({
  endpointingMs, llmTtftMs, ttsMs, ttsMeasured,
}: {
  endpointingMs: number;
  llmTtftMs: number | null;
  ttsMs: number;
  ttsMeasured: boolean;
}) {
  const llm = llmTtftMs ?? 0;
  const total = endpointingMs + llm + ttsMs;
  const parts = [
    { label: "Endpointing", ms: endpointingMs, color: "#0d9488", note: "your setting" },
    { label: "LLM first token", ms: llm, color: "#2563eb", note: llmTtftMs == null ? "run the bench" : "measured" },
    { label: "TTS first audio", ms: ttsMs, color: "#7c3aed", note: ttsMeasured ? "measured" : "declared" },
  ];
  const verdict =
    total < 800 ? { text: "Callers will not notice the agent is AI", cls: "badge-success" }
      : total < 1200 ? { text: "Acceptable, but tighten it if you can", cls: "badge-warning" }
        : { text: "Too slow, every pause will feel like a freeze", cls: "badge-danger" };

  return (
    <div className="lat">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge size={16} style={{ color: "var(--accent)" }} />
          <span className="text-[14px] font-semibold">Voice to voice budget</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mono text-[18px] font-semibold tabular-nums">{Math.round(total)} ms</span>
          <span className={`badge ${verdict.cls}`}>{verdict.text}</span>
        </div>
      </div>

      <div className="lat__bar">
        {parts.map((p) => (
          <div
            key={p.label}
            className="lat__seg"
            style={{ width: `${total ? (p.ms / total) * 100 : 0}%`, background: p.color }}
            title={`${p.label}: ${Math.round(p.ms)} ms`}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
            <span className="text-secondary text-[12px]">{p.label}</span>
            <span className="mono ml-auto text-[12px] font-semibold tabular-nums">{Math.round(p.ms)} ms</span>
            <span className="text-tertiary text-[10.5px]">{p.note}</span>
          </div>
        ))}
      </div>

      <p className="hint mt-3">
        Under 800 ms is the line where callers stop noticing they are talking to a machine. The three parts are
        sequential: the agent must decide you stopped, think, then start speaking.
      </p>
    </div>
  );
}


type Provider = {
  id: string; name: string; base_url: string; model: string;
  models?: string[]; free: string; note: string; key_url: string;
};

/* Switching provider is a base URL and a key, so it belongs in the product
   rather than in a .env edit. The Test button streams a real completion and
   reports first token latency, because that is the number that decides whether
   a model can hold a phone call. */
/* Provider + model as two dropdowns, the same shape as the Speech to text and
   Text to speech sections — one consistent way to choose a model. Reads the live
   agent config so "in use" reflects what actually answers calls. */
export function ProviderPicker({ onSwitched }: { onSwitched?: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [active, setActive] = useState("");
  const [selId, setSelId] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/voice/llm/providers").then((d) => {
      setProviders(d.providers || []);
      setActive(d.active || "");
      setSelId(d.active && d.active !== "custom" ? d.active : (d.providers?.[0]?.id || ""));
      setModel(d.model || "");
    }).catch(() => {});
  }, []);

  const sel = providers.find((p) => p.id === selId) || null;
  // model options: the provider's curated list, plus the live model if it's a custom one
  const modelOpts = sel
    ? Array.from(new Set([...(sel.models || [sel.model]), ...(model ? [model] : [])]))
    : [];

  const pickProvider = (id: string) => {
    const p = providers.find((x) => x.id === id);
    setSelId(id);
    setModel(p?.models?.[0] || p?.model || "");
    setResult(null);
  };

  const test = async () => {
    if (!sel) return;
    setTesting(true); setResult(null);
    try {
      const r = await api.post("/api/voice/llm/providers/test", { base_url: sel.base_url, api_key: key, model });
      setResult(r);
      if (r.ok) toast.success(`First token in ${r.ttft_ms} ms`);
      else toast.error(r.error?.slice(0, 90) || "Test failed");
    } catch (e: any) { toast.error(e.message); }
    finally { setTesting(false); }
  };

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const cfg = await api.get("/api/agent/config");
      await api.put("/api/agent/config", {
        ...cfg, llm_base_url: sel.base_url, llm_model: model,
        ...(key ? { llm_api_key: key } : {}),
      });
      setActive(sel.id);
      toast.success(`${sel.name} · ${model} is now the call model`, { description: "Applies to the next call." });
      onSwitched?.();
    } catch (e: any) { toast.error("Could not switch", { description: e.message }); }
    finally { setSaving(false); }
  };

  const inUse = active === selId;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Provider</label>
          <select className="select" value={selId} onChange={(e) => pickProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{active === p.id ? " · in use" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Model</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {modelOpts.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {sel && <p className="hint">{sel.note}{sel.free ? ` · ${sel.free}` : ""}</p>}

      <div>
        <label className="label">API key</label>
        <input className="input mono h-9 text-[12.5px]" type="password" value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={inUse ? "unchanged (using the saved key)" : "paste the key"} />
        {sel && (
          <p className="hint mt-1">
            No key yet? Get one at <a href={sel.key_url} target="_blank" rel="noreferrer" className="underline">{sel.key_url.replace(/^https?:\/\//, "")}</a>. Stored server side, never sent to the browser on a call.
          </p>
        )}
      </div>

      {result && (
        <div className="prov-result">
          {result.ok ? (
            <><Check size={14} style={{ color: "var(--success)" }} />
              <span className="text-[12.5px]"><b>{result.ttft_ms} ms</b> to first token · “{result.output}”</span></>
          ) : (
            <><TriangleAlert size={14} style={{ color: "var(--danger)" }} />
              <span className="text-[12.5px]">{result.error}</span></>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn btn-secondary flex-1" onClick={test} disabled={testing || !key}>
          {testing ? <Spinner size={15} /> : <Play size={15} />} Test latency
        </button>
        <button className="btn btn-primary flex-1" onClick={save} disabled={saving || (!key && inUse)}>
          {saving ? <Spinner size={15} /> : <Check size={15} />} Use for calls
        </button>
      </div>
    </div>
  );
}

export default function LlmLab({
  currentModel, onUseModel, onMeasured,
}: {
  currentModel: string;
  onUseModel: (id: string) => void;
  onMeasured: (ttftMs: number | null) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [provModel, setProvModel] = useState("");
  const [configured, setConfigured] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Bench[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/voice/llm/models").then((d) => {
      setModels(d.models || []);
      setBaseUrl(d.base_url || "");
      setProvModel(d.current || "");
      setConfigured(!!d.configured);
      // preselect what the agent actually runs today, plus one heavier model
      const seed = [d.current, ...(d.models || []).filter((m: string) => m !== d.current)].slice(0, 2);
      setPicked(seed.filter(Boolean));
    }).catch((e) => setErr(e.message));
  }, []);

  const toggle = (m: string) =>
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : p.length >= 6 ? p : [...p, m]));

  const run = async () => {
    setRunning(true); setErr(null); setRows(null);
    try {
      const r = await api.post("/api/voice/llm/bench", { models: picked, prompt });
      setRows(r.results);
      const best = r.results.filter((x: Bench) => x.ttft_ms).map((x: Bench) => x.ttft_ms!);
      onMeasured(best.length ? Math.min(...best) : null);
    } catch (e: any) {
      setErr(e.message);
    } finally { setRunning(false); }
  };

  const fastest = rows?.filter((r) => r.ttft_ms).reduce<number | null>(
    (m, r) => (m === null || r.ttft_ms! < m ? r.ttft_ms! : m), null);

  if (!configured) {
    return <p className="hint">No language model key configured. Set LLM_API_KEY (and LLM_BASE_URL) in .env to benchmark models.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-mono">{baseUrl.replace(/^https?:\/\//, "")}</span>
        <span className="text-tertiary text-[12px]">{models.length} models available · agent runs {provModel}</span>
      </div>

      <div>
        <label className="label">Models to compare</label>
        <div className="flex flex-wrap gap-1.5">
          {models.map((m) => (
            <button
              key={m}
              onClick={() => toggle(m)}
              className={`badge ${picked.includes(m) ? "badge-accent" : "badge-mono"}`}
              title={m}
            >
              {picked.includes(m) && <Check size={11} />} {m}
            </button>
          ))}
        </div>
        <p className="hint mt-1.5">Pick up to six. They run one at a time so they do not compete for bandwidth.</p>
      </div>

      <div>
        <label className="label">Test prompt</label>
        <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>

      <button className="btn btn-primary" onClick={run} disabled={running || picked.length === 0}>
        {running ? <Spinner size={15} /> : <Play size={15} />} Run benchmark
      </button>

      {err && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}

      {rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">First token</th>
                <th className="text-right">Total</th>
                <th>What it said</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model}>
                  <td className="mono text-[12px] font-medium">{r.model}</td>
                  {r.error ? (
                    <td colSpan={3} className="text-[12px]" style={{ color: "var(--warning)" }}>
                      <TriangleAlert size={12} className="mr-1 inline" />{r.error}
                    </td>
                  ) : (
                    <>
                      <td className="mono text-right tabular-nums text-[13px] font-semibold">
                        {r.ttft_ms === fastest && <Zap size={12} className="mr-1 inline" style={{ color: "var(--success)" }} />}
                        {r.ttft_ms} ms
                      </td>
                      <td className="mono text-tertiary text-right tabular-nums text-[12px]">{r.total_ms} ms</td>
                      <td className="text-secondary max-w-[240px] truncate text-[12px]">{r.output}</td>
                    </>
                  )}
                  <td className="text-right">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onUseModel(r.model)}
                      disabled={currentModel === r.model}
                    >
                      {currentModel === r.model ? "In use" : "Use"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && (
        <p className="hint">
          A model that streams nothing cannot be used for voice: the caller hears silence until the whole answer is
          ready. Reasoning models usually behave this way.
        </p>
      )}
    </div>
  );
}
