"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  MessageSquare,
  Play,
  Plug,
  Trash2,
  Webhook,
  Wrench,
  Zap,
} from "lucide-react";
import { api, API_URL, ExpertRow, ExpertRunRow, ToolRef } from "@/lib/api";
import { Modal, Spinner, StatusBadge } from "@/components/ui";

/* Chat, schedule and webhook are not three flavours of the same switch: one is
   a conversation, one is a clock, one is an inbound request with a secret URL.
   They get separate cards, their own names, and their own configuration. */
type TriggerKind = "chat" | "schedule" | "external";
const TRIGGERS: { kind: TriggerKind; label: string; icon: any; colour: string; blurb: string }[] = [
  { kind: "chat", label: "Chat", icon: MessageSquare, colour: "#2563eb",
    blurb: "Someone messages the expert and it answers in the moment." },
  { kind: "schedule", label: "Schedule", icon: Calendar, colour: "#0d9488",
    blurb: "Runs on a clock with no one watching. Give it a goal it can finish alone." },
  { kind: "external", label: "Webhook", icon: Webhook, colour: "#7c3aed",
    blurb: "Another system posts to a secret URL and the expert runs on that payload." },
];

const TAB_KEYS = ["instructions", "triggers", "tools", "runs"] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_LABEL: Record<TabKey, string> = {
  instructions: "Instructions", triggers: "Triggers", tools: "Tools", runs: "Runs",
};

const composioLogo = (ref?: string) =>
  ref ? `https://logos.composio.dev/api/${ref.toLowerCase()}` : null;

export default function ExpertEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [e, setE] = useState<ExpertRow | null>(null);
  const [tools, setTools] = useState<ToolRef[]>([]);
  const [runs, setRuns] = useState<ExpertRunRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [openRun, setOpenRun] = useState<ExpertRunRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("instructions");

  const loadRuns = useCallback(() => {
    api.get(`/api/experts/${id}/runs`).then(setRuns).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.get(`/api/experts/${id}`).then(setE).catch((err) => setError(err.message));
    // available tools = KB + active composio connections + custom actions + mcp
    Promise.allSettled([
      api.get("/api/integrations/connections"),
      api.get("/api/integrations/actions"),
      api.get("/api/integrations/mcp"),
    ]).then(([c, a, m]) => {
      const list: ToolRef[] = [{ kind: "kb", ref: "knowledge_base", label: "Knowledge Base" }];
      if (c.status === "fulfilled") c.value.filter((x: any) => x.status === "active").forEach((x: any) => list.push({ kind: "composio", ref: x.toolkit, label: x.app_name || x.toolkit }));
      if (a.status === "fulfilled") a.value.forEach((x: any) => list.push({ kind: "action", ref: x.id, label: x.name }));
      if (m.status === "fulfilled") m.value.forEach((x: any) => list.push({ kind: "mcp", ref: x.id, label: x.name }));
      setTools(list);
    });
    loadRuns();
  }, [id, loadRuns]);

  const set = (patch: Partial<ExpertRow>) => {
    setE((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!e) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put(`/api/experts/${id}`, {
        name: e.name, description: e.description, kind: e.kind, system_prompt: e.system_prompt,
        goal: e.goal, triggers: e.triggers, schedule: e.schedule, reasoning: e.reasoning,
        allowed_tools: e.allowed_tools, status: e.status,
      });
      setE(updated);
      setDirty(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      if (dirty) await save();
      const { run_id } = await api.post(`/api/experts/${id}/run`, { input: "" });
      // poll to completion
      let r: ExpertRunRow | null = null;
      for (let i = 0; i < 120; i++) {
        r = await api.get(`/api/experts/runs/${run_id}`);
        if (r && r.status !== "running") break;
        await new Promise((res) => setTimeout(res, 1500));
      }
      loadRuns();
      if (r) setOpenRun(r);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete expert "${e?.name}"?`)) return;
    await api.del(`/api/experts/${id}`);
    router.push("/studio/experts");
  };

  if (!e) {
    return (
      <div className="mx-auto max-w-6xl">
        {error ? (
          <div className="card p-4 text-[13px]" style={{ color: "var(--danger)" }}>{error}</div>
        ) : (
          <div className="space-y-4"><div className="skeleton h-10 w-64" /><div className="skeleton h-96 w-full" /></div>
        )}
      </div>
    );
  }

  const toggleTrigger = (t: string) =>
    set({ triggers: e.triggers.includes(t) ? e.triggers.filter((x) => x !== t) : [...e.triggers, t] });

  return (
    <div className="mx-auto max-w-6xl">
      {/* header: identity left, what fires it in the middle, actions right */}
      <div className="exp-head">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/studio/experts" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Experts</Link>
          <input
            className="exp-name"
            value={e.name}
            onChange={(ev) => set({ name: ev.target.value })}
            placeholder="Expert name"
          />
          <span className={`badge ${e.status === "active" ? "badge-success" : ""}`}>
            {e.status === "active" ? "active" : "inactive"}
          </span>
        </div>

        {/* the centre control: what makes this expert run */}
        <button className="exp-trigger-btn" onClick={() => setTab("triggers")} title="Configure what starts this expert">
          <Zap size={14} />
          {e.triggers.length === 0 ? (
            <span className="exp-trigger-btn__empty">No trigger set</span>
          ) : (
            <span className="flex items-center gap-1.5">
              {e.triggers.map((t) => {
                const def = TRIGGERS.find((x) => x.kind === t);
                if (!def) return null;
                const nm = (e.trigger_meta || {})[t]?.name;
                return (
                  <span key={t} className="exp-trigger-chip" style={{ ["--tc" as any]: def.colour }}>
                    <def.icon size={11} />
                    {nm || def.label}
                  </span>
                );
              })}
            </span>
          )}
          <ChevronDown size={13} />
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {dirty && <span className="text-tertiary text-[12px]">Unsaved</span>}
          <button className="btn btn-secondary btn-sm" onClick={run} disabled={running}>
            {running ? <Spinner size={15} /> : <Play size={15} />} Run
          </button>
          <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={remove}><Trash2 size={15} /></button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>
            {saving && <Spinner size={15} />} Save
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="mb-6 flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {TAB_KEYS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="relative px-4 py-2.5 text-[14px] font-medium"
            style={{ color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {TAB_LABEL[t]}
            {t === "tools" && e.allowed_tools.length > 0 && <span className="nav-count ml-1.5">{e.allowed_tools.length}</span>}
            {t === "runs" && runs.length > 0 && <span className="nav-count ml-1.5">{runs.length}</span>}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5" style={{ background: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      {error && <div className="card mb-4 p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>{error}</div>}

      {tab === "instructions" && (
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-5">
            <div>
              <label className="label">Description</label>
              <textarea className="textarea min-h-[70px]" value={e.description} onChange={(ev) => set({ description: ev.target.value })} placeholder="What this expert automates." />
            </div>
            <div>
              <label className="label">System prompt</label>
              <textarea className="textarea min-h-[240px]" value={e.system_prompt} onChange={(ev) => set({ system_prompt: ev.target.value })} placeholder="You are an expert that... Define its role, rules, tone, and how to use its tools." />
              <p className="hint mt-1.5">Who it is and how it behaves. This applies on every run.</p>
            </div>
            <div>
              <label className="label">Goal</label>
              <textarea className="textarea min-h-[150px]" value={e.goal} onChange={(ev) => set({ goal: ev.target.value })} placeholder="Execute these exact steps: 1) ... 2) ... then produce or send the result." />
              <p className="hint mt-1.5">The task for a schedule or webhook run, where nobody is there to clarify. Be specific enough that it can finish alone.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">Active</span>
                <button className="switch" role="switch" aria-checked={e.status === "active"}
                  onClick={() => set({ status: e.status === "active" ? "inactive" : "active" })} />
              </div>
              <p className="hint mt-2">{e.status === "active" ? "Scheduled and webhook triggers will fire." : "Nothing runs automatically while this is off."}</p>
              <div className="mono text-tertiary mt-3 space-y-1 text-[12px]">
                <div className="flex justify-between"><span>Next run</span><span>{e.next_run_at ? new Date(e.next_run_at).toLocaleString() : "not scheduled"}</span></div>
                <div className="flex justify-between"><span>Last ran</span><span>{e.last_run_at ? new Date(e.last_run_at).toLocaleString() : "never"}</span></div>
              </div>
            </div>

            <div className="card p-4">
              <label className="label">Effort</label>
              <select className="select" value={e.reasoning} onChange={(ev) => set({ reasoning: ev.target.value })}>
                <option value="fast">Fast, fewest steps and lowest cost</option>
                <option value="balanced">Balanced</option>
                <option value="deep">Deep, more tool steps and more thorough</option>
              </select>
              <p className="hint mt-1.5">How many tool steps it may take before it must answer.</p>
            </div>
          </div>
        </div>
      )}

      {tab === "triggers" && (
        <div className="space-y-4">
          <p className="hint">Each trigger is a different way to start this expert. Name them so runs are readable later.</p>
          {TRIGGERS.map((t) => {
            const on = e.triggers.includes(t.kind);
            const meta = (e.trigger_meta || {})[t.kind] || {};
            const setMeta = (patch: any) =>
              set({ trigger_meta: { ...(e.trigger_meta || {}), [t.kind]: { ...meta, ...patch } } });
            return (
              <div key={t.kind} className={`trg-card ${on ? "on" : ""}`} style={{ ["--tc" as any]: t.colour }}>
                <div className="flex items-start gap-3">
                  <span className="trg-icon"><t.icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold">{t.label}</span>
                      {on && <span className="badge badge-success">on</span>}
                    </div>
                    <p className="trg-blurb">{t.blurb}</p>
                  </div>
                  <button className="switch" role="switch" aria-checked={on} onClick={() => toggleTrigger(t.kind)} />
                </div>

                {on && (
                  <div className="trg-body">
                    <div>
                      <label className="label">Name this trigger</label>
                      <input className="input h-9" value={meta.name || ""} onChange={(ev) => setMeta({ name: ev.target.value })}
                        placeholder={t.kind === "schedule" ? "Morning digest" : t.kind === "external" ? "CRM created a lead" : "Support chat"} />
                    </div>

                    {t.kind === "schedule" && (
                      <div className="mt-3">
                        <label className="label">When it runs</label>
                        <ScheduleEditor schedule={e.schedule} onChange={(schedule) => set({ schedule })} />
                        <p className="hint mt-2">{e.schedule_label || "No schedule set yet."}</p>
                      </div>
                    )}

                    {t.kind === "external" && (
                      <div className="mt-3">
                        <AppTriggerPicker
                          value={e.app_trigger || {}}
                          onChange={(app_trigger) => set({ app_trigger })}
                        />
                        <div className="ext-or"><span>or post directly</span></div>
                        <label className="label">Your own webhook</label>
                        {e.external_url ? <CopyField value={`${API_URL}${e.external_url}`} /> : <p className="hint">Save once to generate the URL.</p>}
                        <p className="hint mt-2">The path holds an unguessable secret. Treat it like a password, and rotate it by recreating the expert.</p>
                      </div>
                    )}

                    {t.kind === "chat" && (
                      <p className="hint mt-3">Reachable from Deep Agent and any chat surface you attach. Runs use the system prompt, not the goal.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "tools" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <label className="label">Tools this expert may call</label>
            <p className="hint mb-3">Give it only what the job needs. Every extra tool is another thing it can get wrong.</p>
            <ToolSelect all={tools} selected={e.allowed_tools} onChange={(allowed_tools) => set({ allowed_tools })} />
          </div>
          <div>
            <label className="label">Selected</label>
            {e.allowed_tools.length === 0 ? (
              <p className="text-tertiary text-[12.5px]">Nothing selected. The expert can still reason, but it cannot act.</p>
            ) : (
              <div className="space-y-2">
                {e.allowed_tools.map((t) => {
                  const logo = t.kind === "composio" ? composioLogo(t.ref) : null;
                  return (
                    <div key={`${t.kind}:${t.ref}`} className="tool-chip">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="wf-toolmark" style={{ width: 26, height: 26 }} />
                      ) : (
                        <span className="tool-chip__plate"><Wrench size={13} /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{t.label}</div>
                        <div className="mono text-tertiary truncate text-[10.5px]">{t.kind}</div>
                      </div>
                      <button className="btn btn-danger-ghost btn-icon btn-sm"
                        onClick={() => set({ allowed_tools: e.allowed_tools.filter((x) => !(x.kind === t.kind && x.ref === t.ref)) })}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "runs" && (
        <div>
          {runs.length === 0 ? (
            <p className="text-tertiary py-12 text-center text-sm">No runs yet. Hit Run above, or wait for a trigger to fire.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <button key={r.id} className="run-row" onClick={() => setOpenRun(r)}>
                  <StatusBadge status={r.status === "done" ? "ready" : r.status} />
                  <span className="mono text-tertiary text-[11px]">{r.trigger}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{r.result || r.error || "running"}</span>
                  <span className="text-tertiary text-[11px]">{new Date(r.started_at).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {openRun && <RunModal run={openRun} onClose={() => setOpenRun(null)} />}
    </div>
  );
}

/* ── tool multiselect ─────────────────────────────────────────────────── */
function ToolSelect({ all, selected, onChange }: { all: ToolRef[]; selected: ToolRef[]; onChange: (v: ToolRef[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const isOn = (t: ToolRef) => selected.some((s) => s.kind === t.kind && s.ref === t.ref);
  const toggle = (t: ToolRef) => onChange(isOn(t) ? selected.filter((s) => !(s.kind === t.kind && s.ref === t.ref)) : [...selected, t]);
  return (
    <div ref={ref} className="relative">
      <button className="select flex items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <span>{selected.length ? `${selected.length} tool${selected.length > 1 ? "s" : ""} selected` : "Select tools"}</span>
        <ChevronDown size={15} className="text-tertiary" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius-md)] p-1" style={{ background: "var(--surface-overlay)", border: "1px solid var(--border)", boxShadow: "var(--shadow-overlay)" }}>
          {all.length === 0 && <p className="hint p-3">No tools available. Connect apps in Integrations.</p>}
          {all.map((t) => (
            <button key={`${t.kind}:${t.ref}`} onClick={() => toggle(t)} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]">
              <span className="flex h-4 w-4 items-center justify-center rounded-[4px]" style={{ border: "1px solid var(--border-strong)", background: isOn(t) ? "var(--accent)" : "transparent" }}>
                {isOn(t) && <Check size={11} color="#fff" />}
              </span>
              <span className="flex-1">{t.label}</span>
              <span className="badge badge-mono">{t.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


/* Composio apps do not only expose tools the agent can call, they also emit
   events. This subscribes the expert to one, so it runs when a Gmail message
   lands rather than only when something POSTs its URL. Only connected apps are
   offered: a trigger on an unauthorised account would fail at subscribe time. */
function AppTriggerPicker({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const [apps, setApps] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/api/integrations/triggers")
      .then((r) => setApps(r.apps || []))
      .catch(() => setApps([]));
  }, []);

  const chosenApp = apps?.find((a) => a.slug === value.toolkit);
  const chosen = chosenApp?.triggers?.find((t: any) => t.slug === value.slug);
  const setCfg = (name: string, v: string) =>
    onChange({ ...value, config: { ...(value.config || {}), [name]: v } });

  if (apps === null) {
    return <div className="flex items-center gap-2 py-3"><Spinner size={14} /> <span className="text-tertiary text-[12px]">Loading app events</span></div>;
  }

  if (apps.length === 0) {
    return (
      <div className="ext-empty">
        <Plug size={15} />
        <div className="text-[12.5px]">
          No connected app publishes events yet. Connect one in Integrations and its triggers show up here.
        </div>
      </div>
    );
  }

  return (
    <>
      <label className="label">Run when an app event happens</label>
      {chosen ? (
        <div className="ext-chosen">
          {chosenApp?.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={chosenApp.logo} alt="" className="wf-toolmark" style={{ width: 28, height: 28 }} />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{chosen.name}</div>
            <div className="mono text-tertiary truncate text-[10.5px]">{chosen.slug}</div>
          </div>
          <span className="badge badge-mono">{chosen.kind}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Change</button>
        </div>
      ) : (
        <button className="btn btn-secondary w-full" onClick={() => setOpen(true)}>
          <Zap size={14} /> Choose an app event
        </button>
      )}

      {open && (
        <div className="ext-picker">
          {apps.map((a) => (
            <div key={a.slug} className="mb-3">
              <div className="ext-app">
                {a.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.logo} alt="" className="wf-toolmark" style={{ width: 20, height: 20 }} />
                )}
                <span className="text-[12px] font-semibold">{a.name}</span>
                <span className="text-tertiary text-[11px]">{a.triggers.length} events</span>
              </div>
              {a.triggers.map((t: any) => (
                <button
                  key={t.slug}
                  className="ext-item"
                  onClick={() => { onChange({ toolkit: a.slug, slug: t.slug, name: t.name, config: {} }); setOpen(false); }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{t.name}</div>
                    <div className="text-tertiary line-clamp-2 text-[11px]">{t.description}</div>
                  </div>
                  <span className="badge badge-mono shrink-0">{t.kind}</span>
                </button>
              ))}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm w-full" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}

      {chosen && (
        <>
          {chosen.description && <p className="hint mt-2">{chosen.description}</p>}

          {chosen.config?.length > 0 && (
            <div className="mt-3">
              <label className="label">Event settings</label>
              <div className="space-y-2.5">
                {chosen.config.map((f: any) => (
                  <div key={f.name}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="mono text-[11.5px] font-medium">{f.name}</span>
                      {f.required && <span className="cx-req">required</span>}
                      <span className="text-tertiary text-[10px]">{f.type}</span>
                    </div>
                    {f.enum ? (
                      <select className="select h-8 text-[12px]" value={(value.config || {})[f.name] || ""}
                        onChange={(ev) => setCfg(f.name, ev.target.value)}>
                        <option value="">Default</option>
                        {f.enum.map((o: string) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="input mono h-8 text-[12px]" value={(value.config || {})[f.name] || ""}
                        onChange={(ev) => setCfg(f.name, ev.target.value)}
                        placeholder={f.default != null ? String(f.default) : ""} />
                    )}
                    {f.description && <p className="hint mt-1">{f.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {chosen.payload?.length > 0 && (
            <div className="mt-3">
              <label className="label">What the expert receives</label>
              <div className="flex flex-wrap gap-1.5">
                {chosen.payload.map((f: string) => <span key={f} className="badge badge-mono">{f}</span>)}
              </div>
              <p className="hint mt-1.5">Reference these in the goal, for example {"{subject}"} or {"{sender}"}.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── schedule editor ──────────────────────────────────────────────────── */
function ScheduleEditor({ schedule, onChange }: { schedule: Record<string, any>; onChange: (s: Record<string, any>) => void }) {
  const kind = schedule.kind || "daily";
  const set = (patch: any) => onChange({ ...schedule, ...patch });
  return (
    <div className="mt-3 space-y-3">
      <div>
        <label className="label">Frequency</label>
        <select className="select" value={kind} onChange={(e) => set({ kind: e.target.value })}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="hourly">Hourly</option>
          <option value="interval">Interval</option>
        </select>
      </div>
      {(kind === "daily" || kind === "weekly") && (
        <div className="grid grid-cols-2 gap-2">
          {kind === "weekly" && (
            <div>
              <label className="label">Weekday</label>
              <select className="select" value={schedule.weekday ?? 0} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Time (UTC)</label>
            <input type="time" className="input" value={schedule.at || "09:00"} onChange={(e) => set({ at: e.target.value })} />
          </div>
        </div>
      )}
      {kind === "hourly" && (
        <div><label className="label">At minute</label><input type="number" min={0} max={59} className="input" value={schedule.at_minute ?? 0} onChange={(e) => set({ at_minute: Number(e.target.value) })} /></div>
      )}
      {kind === "interval" && (
        <div><label className="label">Every N minutes</label><input type="number" min={1} className="input" value={schedule.interval_minutes ?? 30} onChange={(e) => set({ interval_minutes: Number(e.target.value) })} /></div>
      )}
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input className="input mono text-[12px]" value={value} readOnly />
      <button className="btn btn-secondary btn-icon" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/* ── run detail ───────────────────────────────────────────────────────── */
function RunModal({ run, onClose }: { run: ExpertRunRow; onClose: () => void }) {
  return (
    <Modal wide title={`${run.trigger} run`} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <StatusBadge status={run.status === "done" ? "ready" : run.status} />
        <span className="text-tertiary mono text-[12px]">{run.tokens} tokens</span>
        {run.error && <span className="text-[12px]" style={{ color: "var(--danger)" }}>{run.error}</span>}
      </div>
      {run.result && (
        <div className="card mb-4 p-4">
          <div className="eyebrow mb-2">Result</div>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{run.result}</p>
        </div>
      )}
      <div className="eyebrow mb-2">Steps</div>
      <div className="space-y-1.5">
        {(run.steps || []).map((s, i) => (
          <div key={i} className="mono rounded-[var(--radius-sm)] p-2.5 text-[12px]" style={{ background: "var(--surface-sunken)" }}>
            {s.type === "tool_call" && <span><span className="text-accent">⚙ {s.name}</span> {JSON.stringify(s.arguments)}</span>}
            {s.type === "tool_result" && <span className="text-tertiary">→ {typeof s.result === "string" ? s.result.slice(0, 300) : JSON.stringify(s.result).slice(0, 300)}</span>}
            {s.type === "final" && <span>✓ final answer</span>}
            {s.type === "error" && <span style={{ color: "var(--danger)" }}>{s.text}</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
