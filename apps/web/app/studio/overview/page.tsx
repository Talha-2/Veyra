"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  FlaskConical,
  GitBranch,
  PhoneCall,
  Plug,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatusBadge } from "@/components/ui";
import ActivityChart, { bucketByDay, type Series } from "@/components/ActivityChart";

type Stat = { label: string; value: string; sub: string; icon: any; href: string; accent?: boolean };

export default function OverviewPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [wfs, setWfs] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [evals, setEvals] = useState<any[]>([]);
  const [integ, setInteg] = useState({ conns: 0, actions: 0, mcp: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get("/api/knowledge"),
      api.get("/api/workflows"),
      api.get("/api/transcripts"),
      api.get("/api/evals"),
      api.get("/api/integrations/connections"),
      api.get("/api/integrations/actions"),
      api.get("/api/integrations/mcp"),
    ]).then(([d, w, c, e, ic, ia, im]) => {
      if (d.status === "fulfilled") setDocs(d.value);
      if (w.status === "fulfilled") setWfs(w.value);
      if (c.status === "fulfilled") setCalls(c.value);
      if (e.status === "fulfilled") setEvals(e.value);
      setInteg({
        conns: ic.status === "fulfilled" ? ic.value.filter((x: any) => x.status === "active").length : 0,
        actions: ia.status === "fulfilled" ? ia.value.length : 0,
        mcp: im.status === "fulfilled" ? im.value.length : 0,
      });
      setLoading(false);
    });
  }, []);

  const readyDocs = docs.filter((d) => d.status === "ready").length;
  const enabledWf = wfs.filter((w) => w.enabled).length;
  const doneEvals = evals.filter((e) => e.status === "done");
  const passed = doneEvals.filter((e) => e.scores?.verdict === "pass").length;
  const passRate = doneEvals.length ? Math.round((passed / doneEvals.length) * 100) : null;
  const integTotal = integ.conns + integ.actions + integ.mcp;

  const activitySeries: Series[] = [
    { key: "calls", label: "Calls", color: "var(--accent)" },
    { key: "evals", label: "Evals", color: "var(--accent-2)" },
  ];
  const activity = bucketByDay(
    [
      { key: "calls", rows: calls.map((c) => ({ at: c.created_at })) },
      { key: "evals", rows: evals.map((e) => ({ at: e.created_at })) },
    ],
    14,
  );

  const stats: Stat[] = [
    { label: "Knowledge docs", value: String(docs.length), sub: `${readyDocs} indexed and ready`, icon: BookOpen, href: "/studio/knowledge" },
    { label: "Workflows", value: String(wfs.length), sub: `${enabledWf} enabled`, icon: GitBranch, href: "/studio/workflows" },
    { label: "Integrations", value: String(integTotal), sub: `${integ.conns} apps · ${integ.actions} actions · ${integ.mcp} MCP`, icon: Plug, href: "/studio/integrations" },
    { label: "Eval pass rate", value: passRate === null ? "n/a" : `${passRate}%`, sub: `${doneEvals.length} runs scored`, icon: FlaskConical, href: "/studio/evals", accent: true },
  ];

  const actions = [
    { label: "Add knowledge", desc: "Upload or write a document", icon: Plus, href: "/studio/knowledge" },
    { label: "Connect an app", desc: "Gmail, Calendar, Slack", icon: Plug, href: "/studio/integrations" },
    { label: "Tune the voice", desc: "STT, TTS, turn taking", icon: SlidersHorizontal, href: "/studio/tuning" },
    { label: "Ask the deep agent", desc: "Build it all from a prompt", icon: Bot, href: "/studio/agent" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Overview" description="Everything your voice agent is running on, at a glance." />

      {/* stat tiles */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="card card-hover p-5">
              <div className="mb-3 flex items-center justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent-text)" }}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <ArrowUpRight size={16} className="text-tertiary" />
              </div>
              <div className={`mono text-[30px] font-medium leading-none ${s.accent ? "text-gradient" : ""}`}>
                {loading ? <span className="skeleton inline-block h-7 w-12 align-middle" /> : s.value}
              </div>
              <div className="mt-2 text-[13px] font-medium">{s.label}</div>
              <div className="text-tertiary text-[12px]">{s.sub}</div>
            </Link>
          );
        })}
      </div>

      {/* quick actions */}
      <div className="mb-4">
        <span className="eyebrow">Quick actions</span>
      </div>
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.label} href={a.href} className="card card-hover flex items-start gap-3 p-4">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                style={{ background: "var(--surface-sunken)", color: "var(--accent-text)" }}
              >
                <Icon size={17} strokeWidth={1.75} />
              </div>
              <div>
                <div className="text-[14px] font-medium">{a.label}</div>
                <div className="text-tertiary text-[12px]">{a.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* activity chart */}
      <div className="card mb-10 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="eyebrow">Activity</span>
            <div className="text-tertiary mt-1 text-[12px]">Calls and evals over the last 14 days</div>
          </div>
          <div className="flex items-center gap-5">
            {activitySeries.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: s.color }} />
                <span className="text-secondary text-[12px]">{s.label}</span>
                <span className="mono text-[14px] font-semibold">
                  {s.key === "calls" ? calls.length : evals.length}
                </span>
              </div>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="skeleton h-[220px] w-full rounded-[var(--radius-sm)]" />
        ) : (
          <ActivityChart data={activity} series={activitySeries} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* recent calls */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Recent calls</span>
            <Link href="/studio/evals" className="text-tertiary text-[13px]">View evals →</Link>
          </div>
          <div className="card overflow-hidden">
            {calls.length === 0 ? (
              <p className="text-tertiary p-6 text-center text-[13px]">
                No calls yet. Start one from the landing page&apos;s live demo.
              </p>
            ) : (
              <ul>
                {calls.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <PhoneCall size={15} className="text-tertiary shrink-0" />
                    <span className="mono truncate text-[13px]">{c.room}</span>
                    <span className="text-tertiary ml-auto shrink-0 text-[12px]">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* recent evals */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Recent evals</span>
            <Link href="/studio/evals" className="text-tertiary text-[13px]">Run new →</Link>
          </div>
          <div className="card overflow-hidden">
            {evals.length === 0 ? (
              <p className="text-tertiary p-6 text-center text-[13px]">
                No simulations yet. Stress test the agent before it ships.
              </p>
            ) : (
              <ul>
                {evals.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <StatusBadge status={e.status} />
                    <span className="truncate text-[13px]">{e.scenario}</span>
                    <span className="text-tertiary ml-auto shrink-0 text-[12px]">{e.persona.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
