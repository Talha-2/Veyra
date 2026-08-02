"use client";

/* Test a workflow without making a phone call.

   Runs the flow the way the voice worker will (agent follows the compiled
   script, a simulated caller pushes back), then reports which steps actually
   happened, which variables were collected, and what went wrong. */

import { useState } from "react";
import { CheckCircle2, CircleAlert, Play, TriangleAlert, User, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui";

type Result = {
  ok: boolean;
  error?: string;
  transcript?: { role: string; text: string }[];
  turns?: number;
  steps_total?: number;
  steps_completed?: number[];
  coverage?: number;
  variables?: Record<string, string | null>;
  issues?: string[];
  verdict?: string;
  summary?: string;
  avg_agent_ms?: number | null;
  script_steps?: string[];
  model?: string;
};

const STYLES = [
  "polite and clear",
  "rushed and impatient",
  "rambling, goes off topic",
  "heavy accent, repeats things",
  "suspicious, asks a lot of questions",
];

export default function WorkflowTest({ abilityId }: { abilityId: string }) {
  const [goal, setGoal] = useState("You want to book an appointment for next week.");
  const [style, setStyle] = useState(STYLES[0]);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const run = async () => {
    setRunning(true); setRes(null);
    try {
      const r = await api.post(`/api/abilities/${abilityId}/test`, { goal, style, max_turns: 8 });
      setRes(r);
    } catch (e: any) {
      setRes({ ok: false, error: e.message });
    } finally { setRunning(false); }
  };

  const done = new Set(res?.steps_completed || []);

  return (
    <div className="space-y-4">
      <div>
        <label className="label">What the caller wants</label>
        <textarea
          className="textarea min-h-[64px]"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="You want to reschedule an appointment you booked last week."
        />
      </div>
      <div>
        <label className="label">Caller type</label>
        <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
          {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <p className="hint mt-1.5">Real callers ramble and interrupt. Test the awkward ones, not just the easy path.</p>
      </div>

      <button className="btn btn-primary w-full" onClick={run} disabled={running}>
        {running ? <Spinner size={15} /> : <Play size={15} />} {running ? "Running the call" : "Run test call"}
      </button>

      {res && !res.ok && (
        <div className="card p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>
          {res.error || "The test could not run."}
        </div>
      )}

      {res?.ok && (
        <>
          {/* verdict strip */}
          <div className="wt-verdict">
            <span className={`badge ${res.verdict === "pass" ? "badge-success" : res.verdict === "fail" ? "badge-danger" : ""}`}>
              {res.verdict === "pass" ? <CheckCircle2 size={11} /> : <CircleAlert size={11} />} {res.verdict}
            </span>
            <span className="mono text-[12px] tabular-nums">
              {res.coverage}% of steps · {res.turns} turns
            </span>
            {res.avg_agent_ms != null && (
              <span className="text-tertiary mono text-[11px] tabular-nums">{res.avg_agent_ms} ms/turn</span>
            )}
          </div>

          {res.summary && <p className="text-secondary text-[13px] leading-relaxed">{res.summary}</p>}

          {/* step coverage: which authored steps actually happened */}
          {!!res.script_steps?.length && (
            <div>
              <div className="label mb-2">Steps reached</div>
              <div className="space-y-1">
                {res.script_steps.map((s, i) => {
                  const hit = done.has(i + 1);
                  return (
                    <div key={i} className={`wt-step ${hit ? "hit" : ""}`}>
                      {hit ? <CheckCircle2 size={12} /> : <span className="wt-step__skip" />}
                      <span className="truncate">{s}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* variables the flow was supposed to collect */}
          {res.variables && Object.keys(res.variables).length > 0 && (
            <div>
              <div className="label mb-2">Variables collected</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(res.variables).map(([k, v]) => (
                  <span key={k} className={`badge ${v ? "badge-success" : "badge-danger"}`} title={v || "never collected"}>
                    {k}{v ? `: ${String(v).slice(0, 20)}` : " (missing)"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!!res.issues?.length && (
            <div>
              <div className="label mb-2">Issues</div>
              <div className="space-y-1.5">
                {res.issues.map((it, i) => (
                  <div key={i} className="wt-issue"><TriangleAlert size={12} /> <span>{it}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* the call itself */}
          <div>
            <div className="label mb-2">Transcript</div>
            <div className="wt-transcript">
              {res.transcript?.map((t, i) => (
                <div key={i} className={`wt-turn ${t.role}`}>
                  <span className="wt-turn__who">
                    {t.role === "agent" ? <Volume2 size={11} /> : <User size={11} />}
                    {t.role}
                  </span>
                  <p>{t.text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="hint">
            Text mode on purpose: this checks whether the flow holds together. Audio latency is measured separately on
            the Voice Tuning bench.
          </p>
        </>
      )}
    </div>
  );
}
