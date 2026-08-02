"use client";

/* Executions — every run, replayable node by node.

   The agentic runtime already records a trace for each run (thought, tool_call,
   tool_result, final). This surfaces it: pick a run on the left, walk what the
   agent actually did on the right. It is the answer to "why did it do that". */

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Brain, CheckCircle2, ChevronRight, CircleAlert, Clock,
  Play, RefreshCw, Terminal, Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, Spinner } from "@/components/ui";

type Row = {
  id: string;
  expert_id: string;
  expert_name: string;
  trigger: string;
  status: "running" | "done" | "error";
  result?: string;
  error?: string | null;
  tokens?: number;
  steps_count: number;
  duration_ms: number | null;
  started_at: string;
};

type Step = { type: string; name?: string; text?: string; arguments?: any; result?: any };

const STEP_META: Record<string, { icon: any; color: string; label: string }> = {
  thought: { icon: Brain, color: "#6366f1", label: "Thought" },
  tool_call: { icon: Wrench, color: "#0891b2", label: "Tool call" },
  tool_result: { icon: Terminal, color: "#0d9488", label: "Tool result" },
  final: { icon: CheckCircle2, color: "#2563eb", label: "Final answer" },
};

const fmtMs = (ms: number | null) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function StatusDot({ status }: { status: string }) {
  if (status === "running") return <span className="badge badge-warning"><span className="dot dot-pulse" /> running</span>;
  if (status === "error") return <span className="badge badge-danger"><CircleAlert size={11} /> failed</span>;
  return <span className="badge badge-success"><CheckCircle2 size={11} /> success</span>;
}

function Json({ value }: { value: any }) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre className="exec-json">{text}</pre>;
}

export default function ExecutionsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [filter, setFilter] = useState<"" | "done" | "error" | "running">("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = filter ? `?status=${filter}` : "";
    api.get(`/api/experts/executions/all${q}`)
      .then((d) => { setRows(d); setSel((s) => s ?? d[0]?.id ?? null); })
      .catch((e) => setErr(e.message));
  }, [filter]);

  useEffect(load, [load]);

  // a running execution is still moving: keep the feed fresh
  useEffect(() => {
    if (!rows?.some((r) => r.status === "running")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [rows, load]);

  useEffect(() => {
    if (!sel) return;
    setSteps(null);
    api.get(`/api/experts/runs/${sel}`)
      .then((r) => { setSteps(r.steps || []); setDetail(r); })
      .catch(() => { setSteps([]); setDetail(null); });
  }, [sel]);

  const current = rows?.find((r) => r.id === sel) || null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Executions"
        description="Every run of every expert, replayable step by step. See exactly what the agent thought, which tools it called, and what came back."
        actions={
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /> Refresh</button>
        }
      />

      {err && <div className="card mb-6 p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>{err}</div>}

      <div className="mb-4 flex gap-1.5">
        {([["", "All"], ["done", "Success"], ["error", "Failed"], ["running", "Running"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v as any)} className={`badge ${filter === v ? "badge-accent" : "badge-mono"}`}>
            {label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-full rounded-[var(--radius-md)]" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Activity}
            title="No executions yet"
            body="Run an expert, or trigger one on a schedule or webhook, and every run shows up here with a full trace."
          />
        </div>
      ) : (
        <div className="exec-grid">
          {/* run list */}
          <div className="exec-list">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSel(r.id)}
                className={`exec-row ${sel === r.id ? "active" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{r.expert_name}</span>
                    <StatusDot status={r.status} />
                  </div>
                  <div className="text-tertiary mt-1 flex items-center gap-2 text-[11px]">
                    <span className="mono">{r.trigger}</span>
                    <span>·</span>
                    <Clock size={10} /> {ago(r.started_at)}
                    {r.duration_ms != null && <><span>·</span><span className="mono tabular-nums">{fmtMs(r.duration_ms)}</span></>}
                  </div>
                </div>
                <ChevronRight size={14} className="text-tertiary shrink-0" />
              </button>
            ))}
          </div>

          {/* trace */}
          <div className="exec-detail">
            {!current ? (
              <p className="text-tertiary p-8 text-center text-sm">Pick a run to replay it.</p>
            ) : (
              <>
                <div className="exec-detail__head">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{current.expert_name}</span>
                      <StatusDot status={current.status} />
                    </div>
                    <div className="mono text-tertiary mt-1 text-[11px]">{current.id}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[12px]">
                    {current.duration_ms != null && (
                      <span className="mono tabular-nums" title="Wall clock duration">{fmtMs(current.duration_ms)}</span>
                    )}
                    {!!current.tokens && <span className="badge badge-mono">{current.tokens} tokens</span>}
                  </div>
                </div>

                {detail?.input && (
                  <div className="exec-block">
                    <div className="exec-block__label"><Play size={11} /> Input</div>
                    <Json value={detail.input} />
                  </div>
                )}

                {steps === null ? (
                  <div className="flex items-center gap-2 p-6"><Spinner size={15} /> <span className="text-secondary text-[13px]">Loading trace</span></div>
                ) : steps.length === 0 ? (
                  <p className="text-tertiary p-6 text-center text-[13px]">No trace recorded for this run.</p>
                ) : (
                  <ol className="exec-steps">
                    {steps.map((s, i) => {
                      const meta = STEP_META[s.type] || { icon: Terminal, color: "var(--text-tertiary)", label: s.type };
                      const Icon = meta.icon;
                      return (
                        <li key={i} className="exec-step">
                          <span className="exec-step__rail" style={{ ["--step" as any]: meta.color }}>
                            <span className="exec-step__dot"><Icon size={11} /></span>
                          </span>
                          <div className="min-w-0 flex-1 pb-5">
                            <div className="flex items-center gap-2">
                              <span className="text-[12.5px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                              {s.name && <span className="badge badge-mono">{s.name}</span>}
                            </div>
                            {s.text && <p className="text-secondary mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed">{s.text}</p>}
                            <Json value={s.arguments} />
                            <Json value={s.result} />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {current.error && (
                  <div className="exec-block" style={{ borderColor: "var(--danger-border)" }}>
                    <div className="exec-block__label" style={{ color: "var(--danger)" }}><CircleAlert size={11} /> Error</div>
                    <Json value={current.error} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
