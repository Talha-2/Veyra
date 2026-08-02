"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  GitBranch,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, SectionCard, EmptyState, Spinner, Modal } from "@/components/ui";
import { toast } from "@/components/Toasts";

// ── types ────────────────────────────────────────────────────────────────────
type Caps = { voice?: boolean; sms?: boolean; mms?: boolean };
type IvrAction = "ai" | "agent" | "extension" | "external" | "voicemail";
type IvrOption = { key: string; label: string; action: IvrAction; target: string };
type Ivr = {
  enabled: boolean;
  greeting: string;
  options: IvrOption[];
  no_input?: { action: string; target: string };
};
type Agent = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  phone: string;
  extension: string;
};
type Num = {
  id: string;
  e164: string;
  friendly_name: string;
  country: string;
  provider: string;
  capabilities: Caps;
  inbound_agent: string;
  sms_autoreply: boolean;
  assigned_to: string;
  ivr?: Ivr;
  status: string;
  monthly_cost: string;
  created_at: string;
};
type Found = {
  e164: string;
  friendly_name: string;
  country: string;
  region: string;
  locality: string;
  capabilities: Caps;
  monthly_cost: string;
};
type Call = {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  status: string;
  duration_sec: number;
  recording_url: string;
  error: string | null;
  room: string | null;
  created_at: string;
};
type Thread = {
  counterparty: string;
  last_body: string;
  last_direction: string;
  last_at: string;
  count: number;
  our_number: string;
};
type Msg = {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  created_at: string;
};
type Settings = {
  provider: string;
  configured: boolean;
  config: Record<string, any>;
  public_base_url: string;
  webhooks: { voice: string; sms: string; status: string };
  livekit: {
    outbound_trunk_id: string;
    inbound_trunk_id: string;
    dispatch_rule_id: string;
    sip_host: string;
    ready: boolean;
  };
  local_dev: boolean;
};

const COUNTRIES: [string, string][] = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["IE", "Ireland"],
  ["IN", "India"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
];

const STATUS_LABEL: Record<string, string> = {
  "in-progress": "in progress",
  "no-answer": "no answer",
  completed: "completed",
  ringing: "ringing",
  queued: "queued",
  failed: "failed",
  busy: "busy",
  canceled: "canceled",
  delivered: "delivered",
  received: "received",
  sent: "sent",
  undelivered: "undelivered",
};

function flag(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (cc.toUpperCase().charCodeAt(0) - 65),
    base + (cc.toUpperCase().charCodeAt(1) - 65),
  );
}

function fmtStatus(s: string): string {
  return STATUS_LABEL[s] || s.replace(/-/g, " ");
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function Copyable({ value }: { value: string }) {
  const [c, setC] = useState(false);
  return (
    <button
      className="mono inline-flex max-w-full items-center gap-1.5 text-[12px]"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setC(true);
        setTimeout(() => setC(false), 1200);
      }}
      title="Copy"
    >
      {c ? (
        <Check size={13} style={{ color: "var(--success)" }} />
      ) : (
        <Copy size={13} className="text-tertiary" />
      )}
      <span className="truncate">{value}</span>
    </button>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
const TABS = [
  ["numbers", "Numbers", Phone],
  ["messages", "Messages", MessageSquare],
  ["calls", "Calls", PhoneCall],
  ["settings", "Settings", Settings2],
] as const;

export default function TelephonyPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("numbers");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [numbers, setNumbers] = useState<Num[]>([]);

  const loadSettings = () => api.get("/api/telephony/settings").then(setSettings).catch(() => {});
  const loadNumbers = () => api.get("/api/telephony/numbers").then(setNumbers).catch(() => {});

  useEffect(() => {
    loadSettings();
    loadNumbers();
  }, []);

  const configured = settings?.configured ?? false;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Telephony"
        description="Give Vera a real phone number. Take inbound calls, place outbound calls to any country, and send or receive text messages, all answered by the same agent you tuned for voice."
        actions={
          <span className={`badge ${configured ? "badge-success" : ""}`}>
            <span className={`dot ${configured ? "dot-pulse" : ""}`} />
            {configured ? "Provider connected" : "Not configured"}
          </span>
        }
      />

      {/* tab bar */}
      <div className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="relative flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors"
            style={{ color: tab === key ? "var(--text)" : "var(--text-tertiary)" }}
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
            {key === "numbers" && numbers.length > 0 && <span className="nav-count">{numbers.length}</span>}
            {tab === key && (
              <span
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            )}
          </button>
        ))}
      </div>

      {tab === "numbers" && (
        <NumbersTab
          numbers={numbers}
          configured={configured}
          onChanged={loadNumbers}
          goSettings={() => setTab("settings")}
        />
      )}
      {tab === "messages" && <MessagesTab numbers={numbers} configured={configured} />}
      {tab === "calls" && <CallsTab numbers={numbers} settings={settings} />}
      {tab === "settings" && (
        <SettingsTab
          settings={settings}
          reload={() => {
            loadSettings();
            loadNumbers();
          }}
        />
      )}
    </div>
  );
}

// ── numbers ──────────────────────────────────────────────────────────────────
function NumbersTab({
  numbers,
  configured,
  onChanged,
  goSettings,
}: {
  numbers: Num[];
  configured: boolean;
  onChanged: () => void;
  goSettings: () => void;
}) {
  const [search, setSearch] = useState(false);
  const [routing, setRouting] = useState<Num | null>(null);
  const [abilities, setAbilities] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get("/api/abilities").then((rows) =>
      setAbilities(rows.map((r: any) => ({ id: r.id, name: r.name })))
    ).catch(() => {});
  }, []);

  const release = async (n: Num) => {
    if (!confirm(`Release ${n.e164}? You lose the number and this cannot be undone.`)) return;
    try {
      await api.del(`/api/telephony/numbers/${n.id}`);
      toast.success("Number released");
      onChanged();
    } catch (e: any) {
      toast.error("Could not release", { description: e.message });
    }
  };

  const patch = async (n: Num, body: Partial<Num>) => {
    try {
      await api.patch(`/api/telephony/numbers/${n.id}`, body);
      onChanged();
    } catch (e: any) {
      toast.error("Update failed", { description: e.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="hint">Numbers you own. Inbound calls and texts route to the agent you pick.</p>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => (configured ? setSearch(true) : goSettings())}
        >
          <Plus size={15} /> Get a number
        </button>
      </div>

      {numbers.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Phone}
            title={configured ? "No numbers yet" : "Connect a provider first"}
            body={
              configured
                ? "Search available numbers by country and area code, then buy one in a click. It starts taking calls and texts the moment you own it."
                : "Add your Twilio credentials in Settings, then come back to search and buy real phone numbers."
            }
            action={
              <button
                className="btn btn-primary btn-sm"
                onClick={() => (configured ? setSearch(true) : goSettings())}
              >
                {configured ? (
                  <>
                    <Search size={15} /> Search numbers
                  </>
                ) : (
                  <>
                    <Settings2 size={15} /> Go to Settings
                  </>
                )}
              </button>
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-3">
          {numbers.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{flag(n.country)}</span>
                    <span className="mono text-[15px] font-semibold">{n.e164}</span>
                    {n.capabilities.voice && <span className="badge badge-mono">voice</span>}
                    {n.capabilities.sms && <span className="badge badge-mono">sms</span>}
                    {n.capabilities.mms && <span className="badge badge-mono">mms</span>}
                  </div>
                  {n.friendly_name && n.friendly_name !== n.e164 && (
                    <div className="text-tertiary mt-1 text-[12px]">{n.friendly_name}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRouting(n)}
                    title="Call routing"
                  >
                    <GitBranch size={14} /> Routing
                  </button>
                  <button
                    className="btn btn-danger-ghost btn-icon btn-sm"
                    onClick={() => release(n)}
                    title="Release number"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Inbound call answers with</label>
                  <select
                    className="input"
                    value={n.inbound_agent}
                    onChange={(e) => patch(n, { inbound_agent: e.target.value })}
                  >
                    <option value="default">Voice agent (default)</option>
                    {abilities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Text messages</label>
                  <label className="flex h-9 cursor-pointer items-center gap-2.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={n.sms_autoreply}
                      onChange={(e) => patch(n, { sms_autoreply: e.target.checked })}
                    />
                    Auto answer texts with the business aware agent
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {search && <SearchModal onClose={() => setSearch(false)} onBought={onChanged} />}
      {routing && (
        <RoutingModal number={routing} onClose={() => setRouting(null)} onSaved={onChanged} />
      )}
    </div>
  );
}

function SearchModal({ onClose, onBought }: { onClose: () => void; onBought: () => void }) {
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState("");

  const run = async () => {
    setLoading(true);
    setResults(null);
    try {
      const q = new URLSearchParams({ country, area_code: areaCode, contains });
      const rows = await api.get(`/api/telephony/numbers/search?${q.toString()}`);
      setResults(rows);
    } catch (e: any) {
      toast.error("Search failed", { description: e.message });
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const buy = async (f: Found) => {
    setBuying(f.e164);
    try {
      await api.post("/api/telephony/numbers/buy", { e164: f.e164, country: f.country });
      toast.success(`${f.e164} is yours`, { description: "Webhooks wired. It is live now." });
      onBought();
      onClose();
    } catch (e: any) {
      toast.error("Could not buy number", { description: e.message });
      setBuying("");
    }
  };

  return (
    <Modal title="Get a phone number" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="label">Country</label>
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map(([cc, name]) => (
              <option key={cc} value={cc}>
                {flag(cc)} {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Area code</label>
          <input
            className="input"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
            placeholder="415"
          />
        </div>
        <div>
          <label className="label">Contains</label>
          <input
            className="input"
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder="digits"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>
          {loading ? <Spinner size={15} /> : <Search size={15} />} Search
        </button>
      </div>

      <div className="mt-5">
        {loading && (
          <div className="text-tertiary flex items-center justify-center gap-2 py-10 text-sm">
            <Spinner size={16} /> Searching {flag(country)} inventory…
          </div>
        )}
        {results && results.length === 0 && !loading && (
          <p className="text-tertiary py-8 text-center text-sm">
            No numbers matched. Try a different area code or country.
          </p>
        )}
        {results && results.length > 0 && (
          <div className="grid gap-2">
            {results.map((f) => (
              <div key={f.e164} className="card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <span className="mono text-[14px] font-semibold">{f.e164}</span>
                  <div className="text-tertiary mt-0.5 flex items-center gap-2 text-[12px]">
                    {[f.locality, f.region].filter(Boolean).join(", ") || f.friendly_name}
                    {f.capabilities.voice && <span className="badge badge-mono">voice</span>}
                    {f.capabilities.sms && <span className="badge badge-mono">sms</span>}
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm shrink-0"
                  onClick={() => buy(f)}
                  disabled={!!buying}
                >
                  {buying === f.e164 ? <Spinner size={14} /> : <Plus size={14} />} Buy
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RoutingModal({
  number,
  onClose,
  onSaved,
}: {
  number: Num;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignedTo, setAssignedTo] = useState(number.assigned_to || "ai");
  const [ivrEnabled, setIvrEnabled] = useState(number.ivr?.enabled ?? false);
  const [greeting, setGreeting] = useState(number.ivr?.greeting ?? "");
  const [options, setOptions] = useState<IvrOption[]>(number.ivr?.options ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/telephony/agents").then(setAgents).catch(() => {});
  }, []);

  const addOption = () =>
    setOptions([...options, { key: "", label: "", action: "ai", target: "" }]);
  const removeOption = (i: number) => setOptions(options.filter((_, idx) => idx !== i));
  const updateOption = (i: number, patch: Partial<IvrOption>) =>
    setOptions(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const assignedName =
    assignedTo === "ai"
      ? "the Vera AI agent"
      : agents.find((a) => a.id === assignedTo)?.name || "the assigned teammate";
  const summary = ivrEnabled
    ? "Callers hear the call menu, then route by their choice to the AI, a teammate, an extension, an external number, or voicemail."
    : `Callers reach ${assignedName} directly.`;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/telephony/numbers/${number.id}`, {
        assigned_to: assignedTo,
        ivr: { enabled: ivrEnabled, greeting, options },
      });
      toast.success("Routing saved");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error("Could not save routing", { description: e.message });
      setSaving(false);
    }
  };

  return (
    <Modal title={`Routing for ${number.e164}`} onClose={onClose} wide>
      {/* assignment */}
      <div>
        <label className="label">Who answers this line</label>
        <select
          className="input"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        >
          <option value="ai">Vera AI agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* ivr */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium">
          <input
            type="checkbox"
            checked={ivrEnabled}
            onChange={(e) => setIvrEnabled(e.target.checked)}
          />
          Enable call menu
        </label>

        {ivrEnabled && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="label">Greeting</label>
              <textarea
                className="input"
                rows={2}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Thanks for calling. Press 1 for sales, 2 for support, or stay on the line to talk to our assistant."
                style={{ resize: "vertical" }}
              />
            </div>

            <div className="space-y-2">
              <label className="label">Menu options</label>
              {options.length === 0 && (
                <p className="hint">No options yet. Add one to build the call menu.</p>
              )}
              {options.map((o, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="w-14">
                    <label className="label">Key</label>
                    <input
                      className="input mono"
                      value={o.key}
                      onChange={(e) => updateOption(i, { key: e.target.value })}
                      placeholder="1"
                    />
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <label className="label">Label</label>
                    <input
                      className="input"
                      value={o.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                      placeholder="Sales"
                    />
                  </div>
                  <div className="min-w-[160px]">
                    <label className="label">Action</label>
                    <select
                      className="input"
                      value={o.action}
                      onChange={(e) =>
                        updateOption(i, { action: e.target.value as IvrAction, target: "" })
                      }
                    >
                      <option value="ai">Talk to the AI</option>
                      <option value="agent">Transfer to a teammate</option>
                      <option value="extension">Transfer to an extension</option>
                      <option value="external">Transfer to an external number</option>
                      <option value="voicemail">Take a voicemail</option>
                    </select>
                  </div>
                  <div className="min-w-[160px] flex-1">
                    <label className="label">Target</label>
                    {o.action === "agent" || o.action === "extension" ? (
                      <select
                        className="input"
                        value={o.target}
                        onChange={(e) => updateOption(i, { target: e.target.value })}
                      >
                        <option value="">Choose teammate…</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.extension ? ` · x${a.extension}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : o.action === "external" ? (
                      <input
                        className="input mono"
                        value={o.target}
                        onChange={(e) => updateOption(i, { target: e.target.value })}
                        placeholder="+14155552671"
                      />
                    ) : (
                      <div className="hint flex h-9 items-center">No target needed</div>
                    )}
                  </div>
                  <button
                    className="btn btn-danger-ghost btn-icon btn-sm shrink-0"
                    onClick={() => removeOption(i)}
                    title="Remove option"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={addOption}>
                <Plus size={14} /> Add option
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="hint mt-5">{summary}</p>

      <div className="mt-4 flex justify-end">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? <Spinner size={15} /> : <Check size={15} />} Save routing
        </button>
      </div>
    </Modal>
  );
}

// ── messages ─────────────────────────────────────────────────────────────────
function MessagesTab({ numbers, configured }: { numbers: Num[]; configured: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [fromId, setFromId] = useState("");
  const [newThread, setNewThread] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const smsNumbers = numbers.filter((n) => n.capabilities.sms);

  const loadThreads = () => api.get("/api/telephony/messages/threads").then(setThreads).catch(() => {});
  const loadThread = (cp: string) =>
    api.get(`/api/telephony/messages/threads/${encodeURIComponent(cp)}`).then(setMsgs).catch(() => {});

  useEffect(() => {
    loadThreads();
  }, []);
  useEffect(() => {
    if (active) loadThread(active);
  }, [active]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  useEffect(() => {
    if (!fromId && smsNumbers.length) setFromId(smsNumbers[0].id);
  }, [smsNumbers, fromId]);

  const send = async (to: string) => {
    if (!body.trim() || !to.trim()) return;
    setSending(true);
    try {
      await api.post("/api/telephony/messages", { to, body, from_number_id: fromId });
      setBody("");
      setActive(to);
      setNewThread(false);
      setComposeTo("");
      loadThreads();
      loadThread(to);
    } catch (e: any) {
      toast.error("Could not send", { description: e.message });
    } finally {
      setSending(false);
    }
  };

  if (!configured) {
    return (
      <SectionCard>
        <EmptyState
          icon={MessageSquare}
          title="Messaging is off"
          body="Connect a provider and buy a number with SMS in Settings, then your text conversations show up here."
        />
      </SectionCard>
    );
  }

  return (
    <div className="card grid min-h-[520px] grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]" style={{ padding: 0 }}>
      {/* thread list */}
      <div className="flex flex-col border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[13px] font-semibold">Conversations</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setNewThread(true); setActive(null); }} title="New message">
            <Plus size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-tertiary px-4 py-8 text-center text-[13px]">No messages yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.counterparty}
                onClick={() => { setActive(t.counterparty); setNewThread(false); }}
                className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors"
                style={{
                  background: active === t.counterparty ? "var(--surface-sunken)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono truncate text-[13px] font-medium">{t.counterparty}</span>
                  <span className="text-tertiary shrink-0 text-[11px]">{timeAgo(t.last_at)}</span>
                </div>
                <span className="text-tertiary truncate text-[12px]">
                  {t.last_direction === "outbound" ? "You: " : ""}
                  {t.last_body}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* conversation */}
      <div className="flex min-h-0 flex-col">
        {newThread ? (
          <div className="flex flex-1 flex-col p-4">
            <label className="label">To</label>
            <input
              className="input mono mb-3"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              placeholder="+14155552671"
            />
            <div className="flex-1" />
            <Composer
              body={body}
              setBody={setBody}
              onSend={() => send(composeTo)}
              sending={sending}
              fromId={fromId}
              setFromId={setFromId}
              numbers={smsNumbers}
              disabled={!composeTo.trim()}
            />
          </div>
        ) : active ? (
          <>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="mono text-[14px] font-semibold">{active}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {msgs.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col"
                  style={{ alignItems: m.direction === "outbound" ? "flex-end" : "flex-start" }}
                >
                  <div
                    className="max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed"
                    style={
                      m.direction === "outbound"
                        ? { background: "var(--accent)", color: "var(--accent-contrast, #fff)" }
                        : { background: "var(--surface-sunken)", border: "1px solid var(--border)" }
                    }
                  >
                    {m.body}
                  </div>
                  <span className="text-tertiary mt-1 text-[11px]">
                    {fmtStatus(m.status)} · {timeAgo(m.created_at)}
                  </span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <Composer
              body={body}
              setBody={setBody}
              onSend={() => send(active)}
              sending={sending}
              fromId={fromId}
              setFromId={setFromId}
              numbers={smsNumbers}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Pick a conversation"
              body="Select a thread on the left, or start a new message."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  body,
  setBody,
  onSend,
  sending,
  fromId,
  setFromId,
  numbers,
  disabled,
}: {
  body: string;
  setBody: (s: string) => void;
  onSend: () => void;
  sending: boolean;
  fromId: string;
  setFromId: (s: string) => void;
  numbers: Num[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 p-3" style={{ borderTop: "1px solid var(--border)" }}>
      {numbers.length > 1 && (
        <select className="input" style={{ height: 32 }} value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {numbers.map((n) => (
            <option key={n.id} value={n.id}>
              From {n.e164}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-end gap-2">
        <textarea
          className="input flex-1"
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Write a message…"
          style={{ resize: "none", minHeight: 38 }}
        />
        <button className="btn btn-primary btn-icon" onClick={onSend} disabled={sending || disabled || !body.trim()}>
          {sending ? <Spinner size={15} /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

// ── calls ────────────────────────────────────────────────────────────────────
function CallsTab({ numbers, settings }: { numbers: Num[]; settings: Settings | null }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [to, setTo] = useState("");
  const [fromId, setFromId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  const voiceNumbers = numbers.filter((n) => n.capabilities.voice);
  const load = () => api.get("/api/telephony/calls").then(setCalls).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live status while calls are in flight
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!fromId && voiceNumbers.length) setFromId(voiceNumbers[0].id);
  }, [voiceNumbers, fromId]);

  const ready = settings?.livekit?.ready;

  const place = async () => {
    if (!to.trim()) return;
    setPlacing(true);
    try {
      await api.post("/api/telephony/calls", { to, from_number_id: fromId });
      toast.success("Calling…", { description: `Vera is dialing ${to}` });
      setTo("");
      load();
    } catch (e: any) {
      toast.error("Could not place call", { description: e.message });
    } finally {
      setPlacing(false);
    }
  };

  const openDetail = (id: string) =>
    api.get(`/api/telephony/calls/${id}`).then(setDetail).catch(() => {});

  return (
    <div className="space-y-5">
      {/* dialer */}
      <SectionCard title="Place a call" description="Vera dials the number and handles the conversation with your tuned voice agent.">
        {!ready && (
          <p className="hint mb-3" style={{ color: "var(--warning)" }}>
            Outbound calling needs the SIP trunk connected. Open Settings and click Connect first.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="label">To</label>
            <input
              className="input mono"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+14155552671"
              onKeyDown={(e) => e.key === "Enter" && place()}
            />
          </div>
          {voiceNumbers.length > 0 && (
            <div className="min-w-[180px]">
              <label className="label">From</label>
              <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {voiceNumbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.e164}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary" onClick={place} disabled={placing || !to.trim() || !ready}>
            {placing ? <Spinner size={15} /> : <PhoneOutgoing size={15} />} Call
          </button>
        </div>
      </SectionCard>

      {/* history */}
      {calls.length === 0 ? (
        <SectionCard>
          <EmptyState icon={PhoneCall} title="No calls yet" body="Inbound and outbound calls appear here with their status, duration, and full transcript." />
        </SectionCard>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Duration</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => openDetail(c.id)}>
                  <td>
                    {c.direction === "inbound" ? (
                      <PhoneIncoming size={15} style={{ color: "var(--success)" }} />
                    ) : (
                      <PhoneOutgoing size={15} style={{ color: "var(--accent-text)" }} />
                    )}
                  </td>
                  <td className="mono text-[12px]">{c.from_number || "—"}</td>
                  <td className="mono text-[12px]">{c.to_number || "—"}</td>
                  <td>
                    <span
                      className={`badge ${
                        c.status === "completed"
                          ? "badge-success"
                          : c.status === "failed" || c.status === "no-answer" || c.status === "busy"
                            ? "badge-danger"
                            : "badge-warning"
                      }`}
                    >
                      {fmtStatus(c.status)}
                    </span>
                  </td>
                  <td className="text-[12px]">{fmtDuration(c.duration_sec)}</td>
                  <td className="text-tertiary text-[12px]">{timeAgo(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <CallDetail call={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CallDetail({ call, onClose }: { call: any; onClose: () => void }) {
  return (
    <Modal title="Call detail" onClose={onClose} wide>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Direction" value={call.direction} />
        <Field label="Status" value={fmtStatus(call.status)} />
        <Field label="From" value={call.from_number || "—"} mono />
        <Field label="To" value={call.to_number || "—"} mono />
        <Field label="Duration" value={fmtDuration(call.duration_sec)} />
        <Field label="When" value={new Date(call.created_at).toLocaleString()} />
      </div>
      {call.error && (
        <p className="mb-4 text-[13px]" style={{ color: "var(--danger)" }}>
          {call.error}
        </p>
      )}
      {call.recording_url && (
        <div className="mb-4">
          <label className="label">Recording</label>
          <audio controls src={call.recording_url} className="w-full" />
        </div>
      )}
      <label className="label">Transcript</label>
      {call.transcript && call.transcript.length > 0 ? (
        <div className="space-y-2">
          {call.transcript.map((t: any, i: number) => (
            <div key={i} className="flex flex-col" style={{ alignItems: t.role === "assistant" ? "flex-start" : "flex-end" }}>
              <div
                className="max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px]"
                style={
                  t.role === "assistant"
                    ? { background: "var(--surface-sunken)", border: "1px solid var(--border)" }
                    : { background: "var(--accent)", color: "#fff" }
                }
              >
                {t.text}
              </div>
              <span className="text-tertiary mt-0.5 text-[11px]">{t.role === "assistant" ? "Vera" : "Caller"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-tertiary text-[13px]">No transcript. It appears here once the call ends.</p>
      )}
    </Modal>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`text-[13px] ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}

// ── settings ─────────────────────────────────────────────────────────────────
function SettingsTab({ settings, reload }: { settings: Settings | null; reload: () => void }) {
  const [provider, setProvider] = useState("twilio");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [messagingSid, setMessagingSid] = useState("");
  // telnyx
  const [telnyxKey, setTelnyxKey] = useState("");
  const [telnyxProfile, setTelnyxProfile] = useState("");
  const [telnyxConnection, setTelnyxConnection] = useState("");
  const [saving, setSaving] = useState(false);
  // sip connect
  const [sipDomain, setSipDomain] = useState("");
  const [sipUser, setSipUser] = useState("");
  const [sipPass, setSipPass] = useState("");
  const [sipHost, setSipHost] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider || "twilio");
      setAccountSid(settings.config?.account_sid || "");
      setMessagingSid(settings.config?.messaging_service_sid || "");
      setTelnyxProfile(settings.config?.messaging_profile_id || "");
      setTelnyxConnection(settings.config?.connection_id || "");
      setSipHost(settings.livekit?.sip_host || "");
    }
  }, [settings]);

  if (!settings) return <Spinner size={20} />;

  const tokenSet = settings.config?.auth_token?.set;
  const telnyxKeySet = settings.config?.api_key?.set;

  const save = async () => {
    setSaving(true);
    try {
      let config: Record<string, any>;
      if (provider === "telnyx") {
        config = { messaging_profile_id: telnyxProfile, connection_id: telnyxConnection };
        if (telnyxKey) config.api_key = telnyxKey; // blank keeps the stored one
      } else {
        config = { account_sid: accountSid, messaging_service_sid: messagingSid };
        if (authToken) config.auth_token = authToken; // blank keeps the stored one
      }
      await api.put("/api/telephony/settings", { provider, config });
      setAuthToken("");
      setTelnyxKey("");
      toast.success("Saved", { description: `${provider === "telnyx" ? "Telnyx" : "Twilio"} credentials stored.` });
      reload();
    } catch (e: any) {
      toast.error("Could not save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api.post("/api/telephony/connect", {
        sip_domain: sipDomain,
        sip_username: sipUser,
        sip_password: sipPass,
        sip_host: sipHost,
      });
      const warns: string[] = r.warnings || [];
      if (warns.length) toast.info("Connected with warnings", { description: warns.join(" · ") });
      else toast.success("Connected", { description: "SIP trunks provisioned and numbers wired." });
      reload();
    } catch (e: any) {
      toast.error("Connect failed", { description: e.message });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Carrier credentials"
        description="Pick your telephony provider and paste its credentials. Stored on your server and never shown in the browser again."
      >
        {/* provider picker */}
        <div className="mb-5 flex gap-2">
          {[["telnyx", "Telnyx"], ["twilio", "Twilio"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setProvider(value)}
              className="btn btn-sm"
              style={
                provider === value
                  ? { background: "var(--accent-subtle)", border: "1px solid var(--border-accent)", color: "var(--accent-text)" }
                  : { background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }
              }
            >
              {label}
              {value === "telnyx" && <span className="text-tertiary ml-1 text-[11px]">free credit to start</span>}
            </button>
          ))}
        </div>

        {provider === "telnyx" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">
                API Key (V2) {telnyxKeySet && <span className="badge badge-success ml-1">set</span>}
              </label>
              <input
                className="input mono"
                type="password"
                value={telnyxKey}
                onChange={(e) => setTelnyxKey(e.target.value)}
                placeholder={telnyxKeySet ? "•••••••• (leave blank to keep)" : "KEY…  from portal.telnyx.com, Auth, API Keys"}
              />
            </div>
            <div>
              <label className="label">Messaging Profile ID (for SMS)</label>
              <input
                className="input mono"
                value={telnyxProfile}
                onChange={(e) => setTelnyxProfile(e.target.value)}
                placeholder="from Messaging, Programmable Messaging"
              />
            </div>
            <div>
              <label className="label">SIP Connection or TeXML App ID (for calls)</label>
              <input
                className="input mono"
                value={telnyxConnection}
                onChange={(e) => setTelnyxConnection(e.target.value)}
                placeholder="from Voice, SIP Trunking or TeXML"
              />
            </div>
            <p className="hint sm:col-span-2">
              Numbers you buy are assigned to this profile and connection automatically, and the
              messaging webhook is pointed at Vera for you.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Account SID</label>
              <input className="input mono" value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="AC…" />
            </div>
            <div>
              <label className="label">
                Auth Token {tokenSet && <span className="badge badge-success ml-1">set</span>}
              </label>
              <input
                className="input mono"
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder={tokenSet ? "•••••••• (leave blank to keep)" : "your auth token"}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Messaging Service SID (optional)</label>
              <input
                className="input mono"
                value={messagingSid}
                onChange={(e) => setMessagingSid(e.target.value)}
                placeholder="MG… — a sender pool for SMS, recommended for scale"
              />
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={saving || (provider === "twilio" ? !accountSid.trim() : !(telnyxKey.trim() || telnyxKeySet))}
          >
            {saving ? <Spinner size={15} /> : <Check size={15} />} Save credentials
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Connect calling (LiveKit SIP)"
        description="Calls are carried into your voice agent over LiveKit SIP. Point it at your carrier's SIP trunk once, and every call flows through the agent."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Carrier SIP domain (outbound)</label>
            <input
              className="input mono"
              value={sipDomain}
              onChange={(e) => setSipDomain(e.target.value)}
              placeholder={provider === "telnyx" ? "sip.telnyx.com" : "yourco.pstn.twilio.com"}
            />
          </div>
          <div>
            <label className="label">LiveKit SIP host (inbound)</label>
            <input
              className="input mono"
              value={sipHost}
              onChange={(e) => setSipHost(e.target.value)}
              placeholder="yourproject.sip.livekit.cloud"
            />
          </div>
          <div>
            <label className="label">SIP username</label>
            <input className="input mono" value={sipUser} onChange={(e) => setSipUser(e.target.value)} />
          </div>
          <div>
            <label className="label">SIP password</label>
            <input className="input mono" type="password" value={sipPass} onChange={(e) => setSipPass(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <span className={`badge ${settings.livekit.outbound_trunk_id ? "badge-success" : ""}`}>
              {settings.livekit.outbound_trunk_id ? "outbound ready" : "outbound off"}
            </span>
            <span className={`badge ${settings.livekit.inbound_trunk_id ? "badge-success" : ""}`}>
              {settings.livekit.inbound_trunk_id ? "inbound ready" : "inbound off"}
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={connect} disabled={connecting || !settings.configured}>
            {connecting ? <Spinner size={15} /> : <ArrowRight size={15} />} Connect
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Webhooks"
        description="Twilio calls these on your numbers automatically when you buy or connect them. Shown here so you can set them by hand if you manage numbers in the Twilio console."
      >
        {settings.local_dev && (
          <p className="hint mb-3" style={{ color: "var(--warning)" }}>
            You are on localhost, so Twilio cannot reach these yet. Deploy to a public host, or expose the API with a tunnel, for inbound calls and texts to arrive.
          </p>
        )}
        <div className="space-y-2">
          <WebhookRow label="Voice (incoming calls)" url={settings.webhooks.voice} />
          <WebhookRow label="Messaging (incoming SMS)" url={settings.webhooks.sms} />
          <WebhookRow label="Call status callback" url={settings.webhooks.status} />
        </div>
      </SectionCard>

      <AgentsSection />
    </div>
  );
}

function AgentsSection() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    api.get("/api/telephony/agents").then(setAgents).catch(() => {});
  }, []);

  return (
    <SectionCard
      title="Agents and extensions"
      description="Give each teammate a direct line and an extension so calls can be transferred to them."
    >
      {agents.length === 0 ? (
        <p className="hint">No teammates yet.</p>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <AgentRow key={a.id} agent={a} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const [phone, setPhone] = useState(agent.phone || "");
  const [extension, setExtension] = useState(agent.extension || "");
  const [saving, setSaving] = useState(false);
  const dirty = phone !== (agent.phone || "") || extension !== (agent.extension || "");

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/telephony/agents/${agent.id}`, { phone, extension });
      toast.success("Saved", { description: `${agent.name} updated` });
    } catch (e: any) {
      toast.error("Could not save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-end gap-3 p-3">
      <div className="flex min-w-[140px] flex-1 items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
          style={{ background: agent.color, color: "#fff" }}
        >
          {agent.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{agent.name}</div>
          <div className="text-tertiary truncate text-[12px]">{agent.role}</div>
        </div>
      </div>
      <div className="min-w-[160px]">
        <label className="label">Direct line</label>
        <input
          className="input mono"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => dirty && save()}
          placeholder="+14155552671"
        />
      </div>
      <div className="w-24">
        <label className="label">Extension</label>
        <input
          className="input mono"
          value={extension}
          onChange={(e) => setExtension(e.target.value)}
          onBlur={() => dirty && save()}
          placeholder="101"
        />
      </div>
      <button className="btn btn-primary btn-sm shrink-0" onClick={save} disabled={saving || !dirty}>
        {saving ? <Spinner size={14} /> : <Check size={14} />} Save
      </button>
    </div>
  );
}

function WebhookRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="card flex items-center justify-between gap-3 p-3">
      <span className="text-[13px]">{label}</span>
      <Copyable value={url} />
    </div>
  );
}
