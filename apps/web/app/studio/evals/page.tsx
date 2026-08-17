"use client";

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Play, Scale } from "lucide-react";
import { api, EvalRunRow } from "@/lib/api";
import { EmptyState, Modal, PageHeader, SectionCard, Spinner, StatusBadge } from "@/components/ui";

type Catalog = {
  personas: { key: string; label: string; stt_noise: number }[];
  scenarios: { name: string; goal: string }[];
};

const SCORE_KEYS = ["task_completion", "groundedness", "conversation_quality", "safety"];

export default function EvalsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [runs, setRuns] = useState<EvalRunRow[]>([]);
  const [persona, setPersona] = useState("polite_customer");
  const [scenario, setScenario] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<EvalRunRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRuns(await api.get("/api/evals"));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    api.get("/api/evals/catalog").then((c: Catalog) => {
      setCatalog(c);
      setScenario(c.scenarios[0]?.name ?? "");
    }).catch((e) => setError(e.message));
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const launch = async (all = false) => {
    setBusy(true);
    setError(null);
    try {
      const personas = all ? catalog!.personas.map((p) => p.key) : [persona];
      for (const p of personas) {
        await api.post("/api/evals/run", customGoal.trim()
          ? { persona: p, goal: customGoal.trim() }
          : { persona: p, scenario_name: scenario });
      }
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Evals & Simulations"
        description="Simulated callers exercise the same prompt, retrieval, and workflow stack as live calls. Run them before changes ship."
      />

      {error && (
        <div
          className="card mb-6 p-3 text-[13px]"
          style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <SectionCard title="Run a simulation" className="mb-8">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Persona</label>
              <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
                {catalog?.personas.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                    {p.stt_noise > 0 ? ` · ${Math.round(p.stt_noise * 100)}% STT noise` : ""}
                  </option>
                ))}
              </select>
              <p className="hint mt-1.5">The failure mode to stress.</p>
            </div>
            <div>
              <label className="label">Scenario</label>
              <select
                className="select"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                disabled={!!customGoal.trim()}
              >
                {catalog?.scenarios.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} · {s.goal}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Custom caller goal</label>
            <input
              className="input"
              placeholder='e.g. "Get a refund for a service booked last week without a receipt"'
              value={customGoal}
              onChange={(e) => setCustomGoal(e.target.value)}
            />
            <p className="hint mt-1.5">
              Overrides the scenario when set. Describe what the simulated caller is trying to accomplish.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={() => launch(false)} disabled={busy}>
              {busy ? <Spinner size={16} /> : <Play strokeWidth={2} />}
              Run simulation
            </button>
            <button className="btn btn-secondary" onClick={() => launch(true)} disabled={busy}>
              {busy && <Spinner size={16} />}
              Run all personas
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="mb-4">
        <span className="eyebrow">Recent runs</span>
      </div>

      {runs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FlaskConical}
            title="No simulations yet"
            body="Add knowledge base content first, then stress the agent with the accent heavy and interrupter personas before shipping prompt or KB changes."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <div key={r.id} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <StatusBadge status={r.status} />
                <span className="text-[15px] font-medium">{r.scenario}</span>
                <span className="text-tertiary text-[13px]">as {r.persona.replace(/_/g, " ")}</span>
                <span className="text-tertiary ml-auto text-xs">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(r)}>
                  Details
                </button>
              </div>
              {r.status === "done" && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {SCORE_KEYS.map((k) => {
                    const v = r.scores?.[k];
                    const color = v >= 4 ? "var(--success)" : v >= 3 ? "var(--warning)" : "var(--danger)";
                    return (
                      <div key={k} className="text-xs">
                        <span className="text-tertiary">{k.replace(/_/g, " ")} </span>
                        <b className="mono tabular" style={{ color }}>
                          {v ?? "—"}/5
                        </b>
                      </div>
                    );
                  })}
                  <span className={`badge ${r.scores?.verdict === "pass" ? "badge-success" : "badge-danger"}`}>
                    {r.scores?.verdict ?? "—"}
                  </span>
                  {r.latency?.llm_p50_ms !== undefined && (
                    <span className="mono text-tertiary text-xs">
                      rag p50 {r.latency.rag_p50_ms}ms · llm p50 {r.latency.llm_p50_ms}ms / p95 {r.latency.llm_p95_ms}ms
                    </span>
                  )}
                </div>
              )}
              {r.status === "error" && (
                <p className="text-[13px]" style={{ color: "var(--danger)" }}>
                  {r.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal
          wide
          title={`${open.scenario} · ${open.persona.replace(/_/g, " ")}`}
          onClose={() => setOpen(null)}
        >
          {open.scores?.notes && (
            <div className="mb-4 flex items-start gap-2">
              <Scale size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" style={{ color: "var(--text-tertiary)" }} />
              <p className="hint">{open.scores.notes}</p>
            </div>
          )}
          <div
            className="stage transcript-scroll max-h-[50vh] space-y-3 overflow-y-auto p-4"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            {open.turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "caller" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] ${t.role === "caller" ? "border-r-2 pr-3 text-right" : "border-l-2 pl-3"}`}
                  style={{
                    borderColor: t.role === "caller" ? "var(--voice-caller)" : "var(--voice-agent)",
                  }}
                >
                  <span
                    className="mono block text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--stage-text-muted)" }}
                  >
                    {t.role}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--stage-text)" }}>
                    {t.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
