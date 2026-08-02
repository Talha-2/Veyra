"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowRight, ArrowUp, ArrowUpRight, Bot, Building2, Check, CheckCircle2, Circle,
  Loader2, PanelLeft, Plus, Rocket, ShieldAlert, ShieldCheck, Sparkles, Trash2, Workflow, Wrench, X, Zap,
} from "lucide-react";
import { API_URL, api } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { toast } from "@/components/Toasts";
import { Markdown } from "@/components/Markdown";
import { WorkflowViz } from "@/components/WorkflowViz";

type Todo = { content: string; status: string };
type Action = { name: string; args?: any };
type Item =
  | { kind: "text"; agent: string; text: string }
  | { kind: "tool"; agent: string; name: string; args?: any; result?: any }
  | { kind: "delegate"; agent: string }
  | { kind: "note"; text: string }
  | { kind: "approval"; actions: Action[]; resolved?: false | "approved" | "rejected" };
type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; items: Item[]; todos: Todo[] };
type Thread = { id: string; title: string; updated_at: string };

const EXPERT_META: Record<string, { label: string; color: string; icon: any }> = {
  orchestrator: { label: "Main", color: "var(--accent-text)", icon: Sparkles },
  "workflow-builder": { label: "Workflow Builder", color: "#2563eb", icon: Workflow },
  "business-manager": { label: "Business Manager", color: "#0d9488", icon: Building2 },
  "expert-builder": { label: "Expert Builder", color: "#d946ef", icon: Bot },
};

/* Tool results are JSON. Show them as tidy key/value or list rows — the "dropdown
   details" from the reference — falling back to raw text when they aren't JSON. */
function ToolResult({ args, result }: { args?: any; result?: any }) {
  let parsed: any = result;
  if (typeof result === "string") { try { parsed = JSON.parse(result); } catch { /* text */ } }
  const rows = (obj: any) =>
    Object.entries(obj).filter(([, v]) => v !== null && v !== "" && typeof v !== "object" || Array.isArray(v))
      .slice(0, 12)
      .map(([k, v]) => (
        <div key={k} className="da-kv"><span className="da-kv__k">{k.replace(/_/g, " ")}</span>
          <span className="da-kv__v">{Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : String(v).slice(0, 200)}</span></div>
      ));
  return (
    <div className="da-tool__body">
      {args && Object.keys(args).length > 0 && (
        <div className="da-tool__sec"><div className="da-tool__seclabel">arguments</div>
          <div className="da-tool__grid">{rows(args)}</div></div>
      )}
      <div className="da-tool__sec"><div className="da-tool__seclabel">result</div>
        {parsed && typeof parsed === "object" ? (
          Array.isArray(parsed) ? (
            <div className="da-tool__grid">
              {parsed.slice(0, 6).map((item, i) => (
                <div key={i} className="da-tool__item"><div className="da-tool__itemhead">Item {i + 1}</div>
                  {typeof item === "object" ? rows(item) : <div className="da-kv__v">{String(item).slice(0, 200)}</div>}</div>
              ))}
              {parsed.length > 6 && <div className="da-kv__v">…{parsed.length - 6} more</div>}
            </div>
          ) : <div className="da-tool__grid">{rows(parsed)}</div>
        ) : <pre className="da-tool__raw">{String(result ?? "").slice(0, 1500)}</pre>}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  task: "delegate", write_todos: "plan", ability_list: "list workflows",
  ability_from_template: "start from template", ability_create: "create workflow",
  ability_update: "update workflow", ability_compiled: "check workflow", ability_deploy: "deploy workflow",
  integration_actions: "list actions", integration_apps: "browse apps", integration_app_tools: "read tool params",
  integration_connections: "list connections", integration_execute: "run action",
  expert_list: "list experts", expert_create: "create expert", expert_update: "update expert",
  business_get: "read business", business_update: "update business",
  kb_list: "list knowledge", kb_create: "add knowledge", kb_search: "search knowledge",
  voice_config_get: "read voice config", voice_config_update: "tune voice", voices_list: "list voices",
};
function prettyTool(name?: string) {
  if (!name) return "tool";
  return TOOL_LABELS[name] || name.replace(/_/g, " ");
}

function ApprovalCard({ item, busy, onRespond }: {
  item: Extract<Item, { kind: "approval" }>; busy: boolean; onRespond: (a: boolean) => void;
}) {
  return (
    <div className={`da-approval ${item.resolved ? "resolved" : ""}`}>
      <div className="da-approval__head"><ShieldAlert size={15} /> Approval required</div>
      {item.actions.map((a, i) => (
        <div key={i} className="da-approval__action">
          <div className="da-approval__name">{prettyTool(a.name)}</div>
          {a.args && Object.entries(a.args).slice(0, 8).map(([k, v]) => (
            <div key={k} className="da-kv"><span className="da-kv__k">{k.replace(/_/g, " ")}</span>
              <span className="da-kv__v">{typeof v === "object" ? JSON.stringify(v).slice(0, 160) : String(v).slice(0, 160)}</span></div>
          ))}
        </div>
      ))}
      {item.resolved ? (
        <div className="da-approval__done">
          {item.resolved === "approved" ? <><Check size={13} style={{ color: "var(--success)" }} /> Approved</>
            : <><X size={13} style={{ color: "var(--danger)" }} /> Rejected</>}
        </div>
      ) : (
        <div className="da-approval__btns">
          <button className="btn btn-secondary" onClick={() => onRespond(false)} disabled={busy}><X size={14} /> Reject</button>
          <button className="btn btn-primary" onClick={() => onRespond(true)} disabled={busy}><Check size={14} /> Approve</button>
        </div>
      )}
    </div>
  );
}

function Handoff({ agent }: { agent: string }) {
  const from = EXPERT_META.orchestrator;
  const to = EXPERT_META[agent] || from;
  const FromIcon = from.icon; const ToIcon = to.icon;
  return (
    <div className="da-handoff">
      <span className="da-handoff__node"><FromIcon size={13} /> Main</span>
      <ArrowRight size={14} className="da-handoff__arrow" />
      <span className="da-handoff__node" style={{ ["--c" as any]: to.color, color: to.color }}><ToIcon size={13} /> {to.label}</span>
    </div>
  );
}

const SUGGESTIONS = [
  "Build an appointment-booking workflow: greet, collect name and preferred time, then deploy it.",
  "Set up the business profile and a knowledge base for a dental clinic (services, hours, insurance).",
  "Create an Expert that triages inbound emails and drafts replies using the connected tools.",
  "Review everything configured — workflows, experts, business profile, voice tuning — and tell me what's missing.",
];

export default function DeepAgentPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeExpert, setActiveExpert] = useState("");
  const [ability, setAbility] = useState<any | null>(null); // the workflow being built
  const [publishing, setPublishing] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [fullAccess, setFullAccess] = useState(true);
  const threadRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const empty = messages.length === 0;

  const loadThreads = useCallback(() => {
    api.get("/api/deep-agent/threads").then(setThreads).catch(() => {});
  }, []);
  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const newChat = () => {
    threadRef.current = ""; setMessages([]); setAbility(null); setActiveExpert(""); setError(null);
  };

  const openThread = async (id: string) => {
    try {
      const t = await api.get(`/api/deep-agent/threads/${id}`);
      threadRef.current = id;
      setAbility(null); setActiveExpert(""); setError(null);
      setMessages((t.messages || []).map((m: any) =>
        m.role === "user" ? { role: "user", content: m.content }
          : { role: "assistant", items: [{ kind: "text", agent: "orchestrator", text: m.content }], todos: [] }));
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.del(`/api/deep-agent/threads/${id}`).catch(() => {});
    if (threadRef.current === id) newChat();
    loadThreads();
  };

  // Whenever the agent touches an ability, refresh the visualizer with the latest one.
  const refreshAbility = useCallback(async () => {
    try {
      const list = await api.get("/api/abilities");
      if (!list?.length) return;
      const latest = [...list].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0];
      const full = await api.get(`/api/abilities/${latest.id}`);
      setAbility(full);
    } catch { /* ignore */ }
  }, []);

  const patchLast = (fn: (m: Extract<Message, { role: "assistant" }>) => void) =>
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        const copy = { ...last, items: [...last.items], todos: [...last.todos] };
        fn(copy);
        next[next.length - 1] = copy;
      }
      return next;
    });

  // Parse one SSE stream (from /build or /resume). Returns whether an ability was touched.
  const consume = async (resp: Response) => {
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let touched = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.replace(/^data: /, "").trim();
        if (!data || data === "[DONE]") continue;
        let ev: any; try { ev = JSON.parse(data); } catch { continue; }

        if (ev.type === "thread") threadRef.current = ev.thread_id;
        else if (ev.type === "delegate") { setActiveExpert(ev.agent); patchLast((m) => m.items.push({ kind: "delegate", agent: ev.agent })); }
        else if (ev.type === "token") patchLast((m) => {
          const last = m.items[m.items.length - 1];
          if (last && last.kind === "text" && last.agent === ev.agent) last.text += ev.text;
          else m.items.push({ kind: "text", agent: ev.agent, text: ev.text });
        });
        else if (ev.type === "text") patchLast((m) => m.items.push({ kind: "text", agent: ev.agent, text: ev.text }));
        else if (ev.type === "note") patchLast((m) => m.items.push({ kind: "note", text: ev.text }));
        else if (ev.type === "approval") patchLast((m) => m.items.push({ kind: "approval", actions: ev.actions || [], resolved: false }));
        else if (ev.type === "tool_call") {
          patchLast((m) => m.items.push({ kind: "tool", agent: ev.agent, name: ev.name, args: ev.args }));
          if (typeof ev.name === "string" && ev.name.startsWith("ability_")) touched = true;
        } else if (ev.type === "tool_result") {
          patchLast((m) => {
            for (let i = m.items.length - 1; i >= 0; i--) {
              const it = m.items[i];
              if (it.kind === "tool" && it.name === ev.name && it.result === undefined) { it.result = ev.result; return; }
            }
            m.items.push({ kind: "tool", agent: ev.agent || "", name: ev.name, result: ev.result });
          });
          if (typeof ev.name === "string" && ev.name.startsWith("ability_")) { touched = true; refreshAbility(); }
        } else if (ev.type === "todos") patchLast((m) => (m.todos = ev.todos || []));
        else if (ev.type === "error") setError(ev.error);
      }
    }
    return touched;
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", items: [], todos: [] }]);
    setInput("");
    setBusy(true);
    let touched = false;
    try {
      const resp = await fetch(`${API_URL}/api/deep-agent/build`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, thread_id: threadRef.current, full_access: fullAccess }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      touched = await consume(resp);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); setActiveExpert(""); if (touched) refreshAbility(); loadThreads(); }
  };

  const respondApproval = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    patchLast((m) => {
      for (let i = m.items.length - 1; i >= 0; i--) {
        const it = m.items[i];
        if (it.kind === "approval" && !it.resolved) { it.resolved = approve ? "approved" : "rejected"; break; }
      }
    });
    let touched = false;
    try {
      const resp = await fetch(`${API_URL}/api/deep-agent/resume`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadRef.current, approve, full_access: fullAccess }),
      });
      if (resp.ok && resp.body) touched = await consume(resp);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); setActiveExpert(""); if (touched) refreshAbility(); loadThreads(); }
  };

  const publish = async () => {
    if (!ability) return;
    setPublishing(true);
    try {
      const r = await api.post(`/api/abilities/${ability.id}/deploy`, { note: "Published from Deep Agent" });
      toast.success(`Published — live v${r.deployed}`);
      refreshAbility();
    } catch (e: any) {
      let msg = e.message;
      try {
        const d = JSON.parse(e.message);
        if (d.warnings) msg = d.warnings.map((w: any) => w.message).join(" ");
        else if (d.message) msg = d.message;
      } catch { /* plain message */ }
      toast.error("Not ready to publish", { description: msg });
    } finally { setPublishing(false); }
  };

  const Badge = ({ agent }: { agent: string }) => {
    const meta = EXPERT_META[agent];
    if (!meta) return null;
    return (
      <span className="da-badge" style={{ ["--c" as any]: meta.color }}>{meta.label}</span>
    );
  };

  const isDeployed = ability && (ability.live_version > 0);

  const Composer = ({ hero }: { hero?: boolean }) => (
    <div className={`da-composer ${hero ? "hero" : ""}`}>
      <input autoFocus className="da-composer__input"
        placeholder="Tell the agent what to build…" value={input}
        onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} disabled={busy} />
      <button className="btn btn-primary btn-icon" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
        {busy ? <Spinner size={16} /> : <ArrowUp strokeWidth={2} />}
      </button>
    </div>
  );

  return (
    <div className={`da-shell ${sideOpen ? "" : "collapsed"} ${ability ? "has-viz" : ""}`}>
      {/* ── sidebar: conversations (collapsible) ── */}
      <aside className="da-side">
        <div className="da-side__top">
          <button className="da-newchat" onClick={newChat}><Plus size={15} /> New build</button>
          <button className="da-side__toggle" onClick={() => setSideOpen(false)} aria-label="Hide sidebar"><PanelLeft size={16} /></button>
        </div>
        <div className="da-threads">
          {threads.length === 0 && <p className="da-side__empty">No conversations yet.</p>}
          {threads.map((t) => (
            <button key={t.id} className={`da-thread ${threadRef.current === t.id ? "active" : ""}`} onClick={() => openThread(t.id)}>
              <span className="da-thread__title">{t.title || "New conversation"}</span>
              <span className="da-thread__del" onClick={(e) => deleteThread(t.id, e)}><Trash2 size={12} /></span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── center: chat ── */}
      <main className="da-main">
        {!sideOpen && (
          <button className="da-side__show" onClick={() => setSideOpen(true)} aria-label="Show sidebar"><PanelLeft size={16} /></button>
        )}

        {empty ? (
          <div className="da-empty">
            <LogoMark size={40} />
            <h2 className="da-empty__title">What should we build?</h2>
            <p className="da-empty__sub">An autonomous builder. It delegates to Workflow Builder, Business Manager, and Expert Builder to build and deploy your voice agent.</p>
            <div className="da-empty__composer"><Composer hero /></div>
            <div className="da-accessrow center">
              <button className={`da-access ${fullAccess ? "full" : ""}`} onClick={() => setFullAccess((v) => !v)}>
                {fullAccess ? <Zap size={13} /> : <ShieldCheck size={13} />}
                {fullAccess ? "Full access" : "Review actions"}
              </button>
            </div>
            <div className="da-empty__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="da-sugg" onClick={() => send(s)}>
                  <span>{s}</span>
                  <ArrowUpRight size={15} strokeWidth={1.5} className="text-tertiary mt-0.5 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="da-scroll">
              <div className="da-thread-col">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end"><div className="da-user">{m.content}</div></div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <div className="mt-0.5 shrink-0"><LogoMark size={24} /></div>
                      <div className="min-w-0 flex-1 space-y-2.5">
                        {m.todos.length > 0 && <TaskList todos={m.todos} />}
                        {m.items.map((it, j) =>
                          it.kind === "delegate" ? (
                            <Handoff key={j} agent={it.agent} />
                          ) : it.kind === "note" ? (
                            <div key={j} className="da-note">{it.text}</div>
                          ) : it.kind === "approval" ? (
                            <ApprovalCard key={j} item={it} busy={busy} onRespond={respondApproval} />
                          ) : it.kind === "text" ? (
                            <div key={j}><Markdown>{it.text}</Markdown></div>
                          ) : (
                            <details key={j} className="da-tool" style={{ ["--c" as any]: EXPERT_META[it.agent]?.color || "var(--accent)" }}>
                              <summary>
                                <Wrench size={12} strokeWidth={2} className="shrink-0" style={{ color: EXPERT_META[it.agent]?.color || "var(--accent-text)" }} />
                                <span className="da-tool__name" style={{ color: EXPERT_META[it.agent]?.color || "var(--accent-text)" }}>{prettyTool(it.name)}</span>
                                <span className="da-tool__status">
                                  {it.result === undefined
                                    ? <><Spinner size={11} /> running</>
                                    : <><CheckCircle2 size={12} style={{ color: "var(--success)" }} /> done</>}
                                </span>
                              </summary>
                              <ToolResult args={it.args} result={it.result} />
                            </details>
                          )
                        )}
                        {busy && i === messages.length - 1 && (
                          <div className="da-thinking">
                            <span className="da-thinking__dots"><span /><span /><span /></span>
                            {activeExpert
                              ? <span>Working · <Badge agent={activeExpert} /></span>
                              : <span>{m.items.length === 0 ? "Planning" : "Thinking"}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="da-footer">
              <div className="da-thread-col">
                {error && (
                  <div className="mb-2 flex items-center gap-2 text-[13px]" style={{ color: "var(--danger)" }}>
                    <AlertCircle size={14} strokeWidth={2} className="shrink-0" /><span className="min-w-0">{error}</span>
                  </div>
                )}
                {busy && activeExpert && (
                  <div className="mb-2 flex items-center gap-2 text-[12.5px] text-tertiary">
                    <Loader2 size={13} className="animate-spin" /> <Badge agent={activeExpert} /> is working…
                  </div>
                )}
                <div className="da-accessrow">
                  <button className={`da-access ${fullAccess ? "full" : ""}`} onClick={() => setFullAccess((v) => !v)}
                    title={fullAccess ? "Actions run automatically" : "You approve each action that goes live or runs"}>
                    {fullAccess ? <Zap size={13} /> : <ShieldCheck size={13} />}
                    {fullAccess ? "Full access" : "Review actions"}
                  </button>
                </div>
                <Composer />
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── right: live workflow visualizer + publish ── */}
      {ability && (
        <aside className="da-viz">
          <div className="da-viz__head">
            <div className="min-w-0">
              <div className="da-viz__title truncate">{ability.name}</div>
              <div className="da-viz__sub">{(ability.nodes || []).length} nodes · {isDeployed ? `live v${ability.live_version}` : "draft"}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setAbility(null)} aria-label="Close"><X size={14} /></button>
          </div>
          <WorkflowViz nodes={ability.nodes || []} />
          <div className="da-viz__foot">
            {isDeployed ? (
              <div className="da-viz__live"><CheckCircle2 size={14} style={{ color: "var(--success)" }} /> Live · v{ability.live_version}</div>
            ) : (
              <button className="btn btn-primary w-full" onClick={publish} disabled={publishing}>
                {publishing ? <Spinner size={15} /> : <Rocket size={15} />} Publish this workflow
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function TaskList({ todos }: { todos: Todo[] }) {
  if (!todos.length) return null;
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <div className="da-plan">
      <div className="da-plan__head">Plan · {done} of {todos.length} done</div>
      <div className="space-y-1.5">
        {todos.map((t, i) => (
          <div key={i} className="flex items-start gap-2 text-[13px]">
            {t.status === "completed"
              ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
              : t.status === "in_progress"
                ? <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                : <Circle size={14} className="mt-0.5 shrink-0 text-tertiary" />}
            <span style={{ color: t.status === "completed" ? "var(--text-tertiary)" : "var(--text-primary)" }}>{t.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
