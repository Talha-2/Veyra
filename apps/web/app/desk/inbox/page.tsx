"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState, Spinner } from "@/components/ui";
import {
  Avatar,
  AssigneePicker,
  PillSelect,
  Tag,
  timeAgo,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  type Member,
} from "@/components/desk/kit";
import { toast } from "@/components/Toasts";
import {
  Inbox,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  Play,
  FileText,
  Ticket,
  StickyNote,
  Bell,
  User,
  Users,
  ChevronDown,
  ChevronRight,
  Plus,
  Star,
  Mail,
  Filter,
  Check,
  ArrowUpRight,
  Tag as TagIcon,
} from "lucide-react";

/* Vera Desk — Inbox. A three pane cockpit: every conversation on the left,
   the full call and text history in the middle, and a rich contact sidebar on
   the right. This upgrade adds ownership: a filter bar (All / Mine / Unassigned
   plus a channel toggle), assign to any teammate through the + picker, and the
   contact's linked tickets rendered right inside the thread the way a real CRM
   surfaces them. Deep link with ?peer= to open a thread on arrival. The list
   and the open thread both refresh on a gentle timer so new calls and texts
   land on their own. Replies and calling are handled by the agent in Studio. */

// ── types ────────────────────────────────────────────────────────────────────

type InboxRow = {
  peer: string;
  contact: { id: string; name: string; stage: string };
  channels: string[];
  count: number;
  last_text: string;
  last_at: string;
  last_kind: string;
  status: string;
  assignees: Member[];
};

type TimelineEntry = {
  kind: "sms" | "call";
  direction: "inbound" | "outbound";
  body?: string;
  status: string;
  duration_sec?: number;
  room?: string;
  at: string;
};

type SidebarTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  type: string;
  created_at: string;
};
type SidebarNote = { id: string; body: string; author: string; created_at: string };
type SidebarReminder = {
  id: string;
  text: string;
  done: boolean;
  due_at?: string;
  created_at: string;
};

type ThreadContact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  stage: string;
  source: string;
  tags: string[];
  [k: string]: unknown;
};

type Thread = {
  peer: string;
  contact: ThreadContact;
  timeline: TimelineEntry[];
  sidebar: {
    tickets: SidebarTicket[];
    notes: SidebarNote[];
    reminders: SidebarReminder[];
    tags: string[];
  };
  conversation: { status: string; assignees: Member[] };
};

type SectionKey = "tickets" | "notes" | "reminders" | "tags" | "activities";
type Scope = "all" | "mine" | "unassigned";

// The conversation status pills — shared by the thread header select and the
// small badge that flags a non open thread in the list.
const CONVERSATION_STATUS = [
  { value: "open", label: "Open", color: "#2563eb" },
  { value: "snoozed", label: "Snoozed", color: "#d97706" },
  { value: "closed", label: "Closed", color: "#16a34a" },
];

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
];

// ── helpers ──────────────────────────────────────────────────────────────────

// A name that is really just a phone number renders in the mono face.
function looksLikeNumber(s: string): boolean {
  return !s || /^[+()\d\s.]+$/.test(s);
}

// Seconds into a compact "M:SS"; blank when there is nothing worth showing.
function fmtDuration(sec?: number): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function nameParts(name: string, peer: string) {
  const numeric = looksLikeNumber(name);
  return { label: numeric ? peer : name, mono: numeric };
}

// ── conversation thread pieces ───────────────────────────────────────────────

// A linked ticket, shown inside the thread the way a real CRM keeps the ticket
// visible in the conversation. The subject and the arrow both click through.
function ThreadTicketCard({
  t,
  onPatch,
}: {
  t: SidebarTicket;
  onPatch: (id: string, patch: Record<string, string>) => void;
}) {
  return (
    <div className="card" style={{ padding: 14, maxWidth: 460 }}>
      <div className="flex items-center gap-2">
        <span className="badge" style={{ cursor: "default", gap: 5 }}>
          <Ticket size={12} /> Ticket
        </span>
        {t.type && (
          <span className="text-[11.5px]" style={{ color: "var(--text-tertiary)" }}>
            {t.type}
          </span>
        )}
        <Link
          href="/desk/tickets"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-sunken)]"
          style={{ color: "var(--text-tertiary)" }}
          aria-label="Open ticket"
          title="Open in Tickets"
        >
          <ArrowUpRight size={14} />
        </Link>
      </div>

      <Link
        href="/desk/tickets"
        className="mt-2 block text-[13.5px] font-semibold leading-snug transition-colors hover:underline"
      >
        {t.subject}
      </Link>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PillSelect
          value={t.status}
          options={STATUS_OPTIONS}
          onChange={(v) => onPatch(t.id, { status: v })}
          minWidth={90}
        />
        <PillSelect
          value={t.priority}
          options={PRIORITY_OPTIONS}
          onChange={(v) => onPatch(t.id, { priority: v })}
          minWidth={80}
        />
        <span className="ml-auto text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {timeAgo(t.created_at)}
        </span>
      </div>
    </div>
  );
}

function CallCard({ entry }: { entry: TimelineEntry }) {
  const inbound = entry.direction === "inbound";
  const Dir = inbound ? PhoneIncoming : PhoneOutgoing;
  const dur = fmtDuration(entry.duration_sec);
  return (
    <div className="card" style={{ padding: 14, maxWidth: 460 }}>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--success) 16%, transparent)" }}
        >
          <Dir size={15} strokeWidth={2} style={{ color: "var(--success)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">
            {inbound ? "Incoming" : "Outgoing"} call
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--text-tertiary)" }}>
            {dayTime(entry.at)}
            {dur ? ` · ${dur}` : ""}
          </div>
        </div>
        <span
          className="badge"
          style={{ cursor: "default" }}
          title="Transcript is generated by the agent"
        >
          <FileText size={12} /> Transcript
        </span>
      </div>

      {/* faux recording bar — audio is not wired here */}
      <div
        className="mt-3 flex items-center gap-2.5 rounded-full px-3 py-2"
        style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
        >
          <Play size={12} style={{ marginLeft: 1 }} />
        </span>
        <span className="h-1 flex-1 rounded-full" style={{ background: "var(--border-strong)" }} />
        <span className="mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {dur || "0:00"}
        </span>
      </div>
    </div>
  );
}

function SmsBubble({ entry }: { entry: TimelineEntry }) {
  const out = entry.direction === "outbound";
  return (
    <div className="flex" style={{ justifyContent: out ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "76%",
          borderRadius: 14,
          padding: "9px 13px",
          background: out ? "var(--accent)" : "var(--surface-sunken)",
          color: out ? "#fff" : "var(--text-primary)",
          border: out ? "none" : "1px solid var(--border)",
        }}
      >
        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{entry.body}</div>
        <div
          className="mt-1 text-[10.5px]"
          style={{ color: out ? "rgba(255,255,255,0.8)" : "var(--text-tertiary)" }}
        >
          {clockTime(entry.at)}
        </div>
      </div>
    </div>
  );
}

// ── right pane pieces ────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
  children,
}: {
  icon: typeof Ticket;
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors"
        style={{ background: "transparent" }}
      >
        <Icon size={15} strokeWidth={1.9} style={{ color: "var(--text-tertiary)" }} />
        <span className="flex-1 text-[13px] font-semibold">{label}</span>
        {typeof count === "number" && <span className="badge badge-mono">{count}</span>}
        {open ? (
          <ChevronDown size={15} style={{ color: "var(--text-tertiary)" }} />
        ) : (
          <ChevronRight size={15} style={{ color: "var(--text-tertiary)" }} />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Dialpad({ peer }: { peer: string }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto" style={{ maxWidth: 244 }}>
        <div className="mono mb-5 text-center text-[15px]">{peer}</div>
        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              className="flex h-14 items-center justify-center rounded-full text-[18px] font-medium transition-colors"
              style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
            >
              {k}
            </button>
          ))}
        </div>
        <button className="btn btn-primary mt-5 w-full">
          <Phone size={16} /> Call
        </button>
        <p className="hint mt-3 text-center text-[11.5px]">
          Calling is handled by the agent in Studio Telephony.
        </p>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [list, setList] = useState<InboxRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [team, setTeam] = useState<Member[]>([]);

  // filters
  const [scope, setScope] = useState<Scope>("all");
  const [channel, setChannel] = useState<"" | "call" | "sms">("");
  const [q, setQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<"details" | "dialpad">("details");
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    tickets: true,
    notes: false,
    reminders: false,
    tags: false,
    activities: false,
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [reminderDraft, setReminderDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggle = (k: SectionKey) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  // "Mine" has no current user id to lean on, so we take the admin teammate if
  // there is one, otherwise the first — a simple, stable heuristic.
  const mineId = (team.find((m) => m.role === "admin") || team[0])?.id || "";

  // Deep link: open the thread named in ?peer= as soon as we arrive. Read from
  // the URL directly so the page needs no Suspense boundary.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("peer");
    if (p) setActive(p);
  }, []);

  // Pickers load once.
  useEffect(() => {
    api
      .get("/api/desk/team")
      .then((t: Member[]) => setTeam(t || []))
      .catch(() => {});
  }, []);

  // Conversation list, filtered and kept fresh every eight seconds. Re running
  // on any filter change swaps the timer to the new query cleanly.
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    const assignee = scope === "mine" ? mineId : scope === "unassigned" ? "unassigned" : "";
    if (assignee) params.set("assignee", assignee);
    if (channel) params.set("channel", channel);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    const load = () =>
      api
        .get(`/api/desk/inbox${qs ? `?${qs}` : ""}`)
        .then((d: InboxRow[]) => {
          if (alive) setList(d || []);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setLoadingList(false);
        });
    const first = setTimeout(load, q ? 200 : 0);
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [scope, channel, q, mineId, reloadKey]);

  // Selected thread, refreshed on the same cadence so a reply that lands while
  // you are reading shows up without a click.
  useEffect(() => {
    if (!active) {
      setThread(null);
      return;
    }
    let alive = true;
    setThread(null);
    const load = () =>
      api
        .get(`/api/desk/inbox/${encodeURIComponent(active)}`)
        .then((d: Thread) => {
          if (alive) setThread(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active]);

  // Pin the timeline to the newest entry when the thread grows or changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active, thread?.timeline.length]);

  const bumpList = () => setReloadKey((k) => k + 1);

  const refreshDetail = async () => {
    if (!active) return;
    try {
      const d: Thread = await api.get(`/api/desk/inbox/${encodeURIComponent(active)}`);
      setThread(d);
    } catch {
      /* keep whatever we have */
    }
  };

  const patchConversation = async (patch: { assignee_ids?: string[]; status?: string }) => {
    if (!active) return;
    try {
      await api.patch(`/api/desk/conversations/${encodeURIComponent(active)}`, patch);
      await refreshDetail();
      bumpList();
      toast.success(patch.status ? "Status updated" : "Assignment updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not update that conversation");
    }
  };

  const addNote = async () => {
    if (!thread || !noteDraft.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/desk/notes", {
        contact_id: thread.contact.id,
        body: noteDraft.trim(),
      });
      setNoteDraft("");
      toast.success("Note added");
      await refreshDetail();
    } catch (e: any) {
      toast.error(e?.message || "Could not add that note");
    } finally {
      setBusy(false);
    }
  };

  const addReminder = async () => {
    if (!thread || !reminderDraft.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/desk/reminders", {
        contact_id: thread.contact.id,
        text: reminderDraft.trim(),
      });
      setReminderDraft("");
      toast.success("Reminder set");
      await refreshDetail();
    } catch (e: any) {
      toast.error(e?.message || "Could not set that reminder");
    } finally {
      setBusy(false);
    }
  };

  const newTicket = async () => {
    if (!thread) return;
    const { label } = nameParts(thread.contact.name, thread.peer);
    setBusy(true);
    try {
      await api.post("/api/desk/tickets", {
        subject: `Follow up with ${label}`,
        contact_id: thread.contact.id,
        channel: "call",
      });
      toast.success("Ticket created", { description: `Opened a follow up ticket for ${label}.` });
      await refreshDetail();
    } catch (e: any) {
      toast.error(e?.message || "Could not create that ticket");
    } finally {
      setBusy(false);
    }
  };

  const patchTicket = async (id: string, patch: Record<string, string>) => {
    try {
      await api.patch(`/api/desk/tickets/${id}`, patch);
      await refreshDetail();
    } catch (e: any) {
      toast.error(e?.message || "Could not update that ticket");
    }
  };

  const header = thread ? nameParts(thread.contact.name, thread.peer) : null;

  // small style helpers for the channel toggle chips
  const chipOn = {
    background: "var(--accent-subtle)",
    color: "var(--accent-text)",
    border: "1px solid var(--border-accent)",
  } as const;
  const chipOff = {
    background: "var(--surface-sunken)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
  } as const;

  return (
    <div
      className="card overflow-hidden"
      style={{ padding: 0, height: "calc(100vh - 140px)", minHeight: 520 }}
    >
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[340px_1fr_340px]">
        {/* ── LEFT: conversation list ───────────────────────────────────── */}
        <aside
          className="hidden min-h-0 flex-col lg:flex"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div
            className="shrink-0 px-4 pt-4 pb-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Inbox size={16} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
              <span className="text-[14px] font-semibold">Inbox</span>
              <span className="badge badge-mono ml-auto">{list.length}</span>
            </div>

            {/* scope: All / Mine / Unassigned */}
            <div
              className="mt-3 flex items-center gap-1 rounded-[10px] p-0.5"
              style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
            >
              {SCOPES.map((s) => {
                const on = scope === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => setScope(s.value)}
                    className="flex-1 rounded-[8px] px-2 py-1 text-[12px] font-medium transition-colors"
                    style={
                      on
                        ? {
                            background: "var(--surface)",
                            color: "var(--text-primary)",
                            boxShadow: "var(--shadow-card)",
                          }
                        : { color: "var(--text-secondary)" }
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* channel toggles */}
            <div className="mt-2.5 flex items-center gap-2">
              <Filter size={13} style={{ color: "var(--text-tertiary)" }} />
              {([
                { value: "call" as const, label: "Calls", Icon: Phone },
                { value: "sms" as const, label: "Texts", Icon: MessageSquare },
              ]).map(({ value, label, Icon }) => {
                const on = channel === value;
                return (
                  <button
                    key={value}
                    onClick={() => setChannel((c) => (c === value ? "" : value))}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
                    style={on ? chipOn : chipOff}
                  >
                    {on ? <Check size={12} /> : <Icon size={12} />}
                    {label}
                  </button>
                );
              })}
            </div>

            {/* search */}
            <div className="relative mt-2.5">
              <Filter
                size={14}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-tertiary)",
                  pointerEvents: "none",
                }}
              />
              <input
                className="input"
                style={{ height: 34, paddingLeft: 32, fontSize: 12.5 }}
                placeholder="Search conversations"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList && list.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={18} />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No conversations"
                body="Adjust the filters, or wait for the next call or text."
              />
            ) : (
              list.map((row) => {
                const { label, mono } = nameParts(row.contact.name, row.peer);
                const on = row.peer === active;
                const statusMeta = CONVERSATION_STATUS.find((x) => x.value === row.status);
                const first = row.assignees && row.assignees[0];
                return (
                  <button
                    key={row.peer}
                    onClick={() => setActive(row.peer)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background: on ? "var(--surface-sunken)" : "transparent",
                      borderBottom: "1px solid var(--border)",
                      borderLeft: on ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    <Avatar name={row.contact.name || row.peer} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold ${mono ? "mono" : ""}`}
                        >
                          {label}
                        </span>
                        <span
                          className="shrink-0 text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {timeAgo(row.last_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5">
                        <span className="flex shrink-0 items-center gap-1">
                          {row.channels.map((c, i) => {
                            const Ico = c === "call" ? Phone : MessageSquare;
                            return (
                              <Ico
                                key={`${c}-${i}`}
                                size={12}
                                strokeWidth={1.9}
                                style={{ color: "var(--text-tertiary)" }}
                              />
                            );
                          })}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-[12px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {row.last_text}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        {statusMeta && row.status !== "open" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                            style={{
                              background: `color-mix(in srgb, ${statusMeta.color} 16%, transparent)`,
                              color: statusMeta.color,
                              border: `1px solid color-mix(in srgb, ${statusMeta.color} 32%, transparent)`,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        )}
                        <span className="ml-auto flex shrink-0 items-center">
                          {first ? (
                            <Avatar
                              name={first.name}
                              color={first.color}
                              initials={first.initials}
                              size={18}
                            />
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10.5px]"
                              style={{ color: "var(--text-tertiary)" }}
                              title="Unassigned"
                            >
                              <span
                                className="inline-block h-2 w-2 rounded-full border border-dashed"
                                style={{ borderColor: "var(--border-strong)" }}
                              />
                              Unassigned
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── MIDDLE: conversation thread ───────────────────────────────── */}
        <section
          className="flex min-h-0 min-w-0 flex-col"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          {!active ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Pick a conversation"
                body="Choose a thread to see the full history."
              />
            </div>
          ) : !thread || !header ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : (
            <>
              <div
                className="flex shrink-0 items-center gap-3 px-5 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <Avatar name={thread.contact.name || thread.peer} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`truncate text-[15px] font-semibold ${header.mono ? "mono" : ""}`}
                    >
                      {header.label}
                    </span>
                    {thread.contact.stage && <span className="badge">{thread.contact.stage}</span>}
                  </div>
                  <div
                    className="mono mt-0.5 truncate text-[12px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {thread.peer}
                  </div>
                </div>

                {/* conversation controls: assign anyone + set status */}
                <div className="flex shrink-0 items-center gap-2.5">
                  <span
                    className="hidden items-center gap-1.5 xl:inline-flex"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <Users size={14} />
                  </span>
                  <AssigneePicker
                    value={thread.conversation.assignees.map((a) => a.id)}
                    members={team}
                    onChange={(ids) => patchConversation({ assignee_ids: ids })}
                    align="right"
                  />
                  <PillSelect
                    value={thread.conversation.status}
                    options={CONVERSATION_STATUS}
                    onChange={(s) => patchConversation({ status: s })}
                    minWidth={92}
                  />
                </div>
              </div>

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5"
              >
                {/* linked tickets, surfaced inside the thread */}
                {thread.sidebar.tickets.map((t) => (
                  <ThreadTicketCard key={t.id} t={t} onPatch={patchTicket} />
                ))}

                {thread.timeline.length === 0 && thread.sidebar.tickets.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="hint text-[12.5px]">No history yet.</p>
                  </div>
                ) : (
                  thread.timeline.map((entry, i) =>
                    entry.kind === "call" ? (
                      <CallCard key={i} entry={entry} />
                    ) : (
                      <SmsBubble key={i} entry={entry} />
                    )
                  )
                )}
              </div>

              <div
                className="shrink-0 px-5 py-3.5"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <input
                  className="input"
                  readOnly
                  value=""
                  placeholder="Replies are handled in Studio Telephony"
                  style={{
                    background: "var(--surface-sunken)",
                    color: "var(--text-tertiary)",
                    cursor: "not-allowed",
                  }}
                />
                <p className="hint mt-1.5 text-[11px]">
                  Replies are handled in Studio Telephony.
                </p>
              </div>
            </>
          )}
        </section>

        {/* ── RIGHT: contact details ────────────────────────────────────── */}
        <aside className="hidden min-h-0 flex-col lg:flex">
          {!thread ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <p className="hint text-center text-[12.5px]">
                Select a conversation to see the contact details.
              </p>
            </div>
          ) : (
            <>
              <div
                className="flex shrink-0 items-center gap-1 px-3 pt-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                {(["details", "dialpad"] as const).map((id) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className="relative px-3 pb-2.5 pt-1 text-[13px] font-medium capitalize transition-colors"
                    style={{
                      color: tab === id ? "var(--text-primary)" : "var(--text-tertiary)",
                    }}
                  >
                    {id}
                    {tab === id && (
                      <span
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {tab === "dialpad" ? (
                <Dialpad peer={thread.peer} />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {/* contact card */}
                  <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-3">
                      <Avatar name={thread.contact.name || thread.peer} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`truncate text-[14px] font-semibold ${
                              header && header.mono ? "mono" : ""
                            }`}
                          >
                            {header?.label}
                          </span>
                          <button
                            className="btn btn-ghost btn-icon btn-sm shrink-0"
                            aria-label="Favorite"
                            title="Favorite"
                          >
                            <Star size={14} />
                          </button>
                        </div>
                        {thread.contact.company && (
                          <div
                            className="truncate text-[12px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {thread.contact.company}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {thread.contact.email && (
                        <div className="flex items-center gap-2 text-[12.5px]">
                          <Mail
                            size={13}
                            className="shrink-0"
                            style={{ color: "var(--text-tertiary)" }}
                          />
                          <span className="mono min-w-0 flex-1 truncate">
                            {thread.contact.email}
                          </span>
                          <span className="badge badge-mono">Primary</span>
                        </div>
                      )}
                      {thread.contact.phone && (
                        <div className="flex items-center gap-2 text-[12.5px]">
                          <Phone
                            size={13}
                            className="shrink-0"
                            style={{ color: "var(--text-tertiary)" }}
                          />
                          <span className="mono min-w-0 flex-1 truncate">
                            {thread.contact.phone}
                          </span>
                          <span className="badge badge-mono">Primary</span>
                        </div>
                      )}
                    </div>

                    <Link
                      href="/desk/contacts"
                      className="btn btn-secondary btn-sm mt-3 w-full"
                    >
                      <User size={14} /> View contact
                    </Link>
                  </div>

                  {/* Tickets */}
                  <Section
                    icon={Ticket}
                    label="Tickets"
                    count={thread.sidebar.tickets.length}
                    open={open.tickets}
                    onToggle={() => toggle("tickets")}
                  >
                    <div className="flex flex-col gap-2.5">
                      {thread.sidebar.tickets.length === 0 && (
                        <p className="hint text-[12px]">No tickets yet.</p>
                      )}
                      {thread.sidebar.tickets.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-lg p-2.5"
                          style={{
                            background: "var(--surface-sunken)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug">
                              {t.subject}
                            </div>
                            <Link
                              href="/desk/tickets"
                              className="shrink-0 rounded-md p-0.5 transition-colors hover:bg-[var(--surface)]"
                              style={{ color: "var(--text-tertiary)" }}
                              aria-label="Open ticket"
                            >
                              <ArrowUpRight size={13} />
                            </Link>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <PillSelect
                              value={t.status}
                              options={STATUS_OPTIONS}
                              onChange={(v) => patchTicket(t.id, { status: v })}
                              minWidth={78}
                            />
                            <PillSelect
                              value={t.priority}
                              options={PRIORITY_OPTIONS}
                              onChange={(v) => patchTicket(t.id, { priority: v })}
                              minWidth={70}
                            />
                            <span
                              className="ml-auto text-[11px]"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {timeAgo(t.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                      <button
                        className="btn btn-secondary btn-sm w-full"
                        onClick={newTicket}
                        disabled={busy}
                      >
                        <Plus size={14} /> New ticket
                      </button>
                    </div>
                  </Section>

                  {/* Notes */}
                  <Section
                    icon={StickyNote}
                    label="Notes"
                    count={thread.sidebar.notes.length}
                    open={open.notes}
                    onToggle={() => toggle("notes")}
                  >
                    <div className="flex flex-col gap-2.5">
                      {thread.sidebar.notes.length === 0 && (
                        <p className="hint text-[12px]">No notes yet.</p>
                      )}
                      {thread.sidebar.notes.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-lg p-2.5"
                          style={{
                            background: "var(--surface-sunken)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div className="whitespace-pre-wrap text-[12.5px] leading-snug">
                            {n.body}
                          </div>
                          <div
                            className="mt-1.5 text-[11px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {n.author || "You"} · {timeAgo(n.created_at)}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <input
                          className="input"
                          style={{ height: 34, fontSize: 12.5 }}
                          placeholder="Add a note"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addNote();
                          }}
                        />
                        <button
                          className="btn btn-secondary btn-sm shrink-0"
                          onClick={addNote}
                          disabled={busy || !noteDraft.trim()}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </Section>

                  {/* Reminders */}
                  <Section
                    icon={Bell}
                    label="Reminders"
                    count={thread.sidebar.reminders.length}
                    open={open.reminders}
                    onToggle={() => toggle("reminders")}
                  >
                    <div className="flex flex-col gap-2.5">
                      {thread.sidebar.reminders.length === 0 && (
                        <p className="hint text-[12px]">No reminders yet.</p>
                      )}
                      {thread.sidebar.reminders.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-lg p-2.5"
                          style={{
                            background: "var(--surface-sunken)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="min-w-0 flex-1 text-[12.5px] leading-snug"
                              style={
                                r.done
                                  ? { color: "var(--text-tertiary)", textDecoration: "line-through" }
                                  : undefined
                              }
                            >
                              {r.text}
                            </span>
                            {r.done && <span className="badge badge-success">Done</span>}
                          </div>
                          <div
                            className="mt-1.5 text-[11px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {r.due_at ? `Due ${dayTime(r.due_at)}` : `Added ${timeAgo(r.created_at)}`}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <input
                          className="input"
                          style={{ height: 34, fontSize: 12.5 }}
                          placeholder="Add a reminder"
                          value={reminderDraft}
                          onChange={(e) => setReminderDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addReminder();
                          }}
                        />
                        <button
                          className="btn btn-secondary btn-sm shrink-0"
                          onClick={addReminder}
                          disabled={busy || !reminderDraft.trim()}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </Section>

                  {/* Tags */}
                  <Section
                    icon={TagIcon}
                    label="Tags"
                    count={thread.sidebar.tags.length}
                    open={open.tags}
                    onToggle={() => toggle("tags")}
                  >
                    {thread.sidebar.tags.length === 0 ? (
                      <p className="hint text-[12px]">No tags yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {thread.sidebar.tags.map((t) => (
                          <Tag key={t} label={t} />
                        ))}
                      </div>
                    )}
                  </Section>

                  {/* Activities */}
                  <Section
                    icon={MessageSquare}
                    label="Activities"
                    count={thread.timeline.length}
                    open={open.activities}
                    onToggle={() => toggle("activities")}
                  >
                    {thread.timeline.length === 0 ? (
                      <p className="hint text-[12px]">Nothing yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {thread.timeline
                          .slice()
                          .reverse()
                          .slice(0, 12)
                          .map((e, i) => {
                            const Ico = e.kind === "call" ? Phone : MessageSquare;
                            return (
                              <div key={i} className="flex items-center gap-2 text-[12px]">
                                <span
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                  style={{
                                    background: "var(--surface-sunken)",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  <Ico
                                    size={11}
                                    strokeWidth={1.9}
                                    style={{ color: "var(--text-tertiary)" }}
                                  />
                                </span>
                                <span className="min-w-0 flex-1 truncate capitalize">
                                  {e.direction} {e.kind}
                                </span>
                                <span
                                  className="shrink-0"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  {timeAgo(e.at)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </Section>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
