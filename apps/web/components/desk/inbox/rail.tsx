"use client";

/* The context rail: everything about the person on the other end (Details) and
   the outbound line (Dialpad). Both are scroll containers of their own so the
   rail never stretches the shell — the three panes always share one viewport. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, Bell, Check, ChevronDown, Copy, Delete, ExternalLink, FileText, Mail, MessageSquare,
  Paperclip, Phone, PhoneCall, PhoneOff, Plus, Play, StickyNote, Tag as TagIcon,
  Ticket as TicketIcon, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toasts";
import { Spinner } from "@/components/ui";
import { Avatar, Tag, timeAgo } from "@/components/desk/kit";
import { isEmailPeer, prettyPhone, type Row, type Thread } from "./types";
import type { PhoneNum } from "./types";

// ── accordion ────────────────────────────────────────────────────────────────
function Section({
  label, icon: Icon, count, defaultOpen = false, children,
}: {
  label: string;
  icon: any;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ibx-acc">
      <h3>
        <button className="ibx-acc__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Icon size={14} className="ibx-acc__ic" />
          <span className="flex-1 text-left">{label}</span>
          {count !== undefined && count > 0 && <span className="ibx-acc__count">{count}</span>}
          <ChevronDown size={14} className="ibx-acc__chev" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      </h3>
      {open && <div className="ibx-acc__body">{children}</div>}
    </section>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return <p className="ibx-blank">{children}</p>;
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ibx-icobtn"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ── details ──────────────────────────────────────────────────────────────────
export function DetailsRail({
  thread, otherThreads, onOpenPeer, onCall, refresh,
}: {
  thread: Thread | null;
  otherThreads: Row[];
  onOpenPeer: (p: string) => void;
  onCall: (n: string) => void;
  refresh: () => void;
}) {
  const [activity, setActivity] = useState<any[] | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const c = thread?.contact;
  const contactId = c?.id || null;

  useEffect(() => { setActivity(null); setNoteDraft(""); }, [contactId, thread?.peer]);

  const loadActivity = useCallback(async () => {
    if (!contactId || activity || loadingActivity) return;
    setLoadingActivity(true);
    try {
      const d = await api.get(`/api/desk/contacts/${contactId}`);
      setActivity(d.activity || []);
    } catch {
      setActivity([]);
    } finally {
      setLoadingActivity(false);
    }
  }, [contactId, activity, loadingActivity]);

  // real attachments: fax documents and call recordings already on the thread
  const attachments = useMemo(() => {
    const out: { id: string; label: string; sub: string; href: string; icon: any }[] = [];
    for (const t of thread?.timeline || []) {
      if (t.kind === "fax" && t.media_url) {
        out.push({
          id: t.id, label: `Fax · ${t.pages || "?"} page${t.pages === 1 ? "" : "s"}`,
          sub: timeAgo(t.at), href: t.media_url, icon: FileText,
        });
      }
      if (t.kind === "call" && t.recording_url) {
        out.push({ id: t.id, label: "Call recording", sub: timeAgo(t.at), href: t.recording_url, icon: Play });
      }
    }
    return out.reverse();
  }, [thread]);

  const saveContact = async () => {
    if (!thread) return;
    setSaving(true);
    try {
      await api.post("/api/desk/contacts", {
        name: c?.name && c.name !== thread.peer ? c.name : "",
        phone: isEmailPeer(thread.peer) ? "" : thread.peer,
        email: isEmailPeer(thread.peer) ? thread.peer : "",
        source: isEmailPeer(thread.peer) ? "email" : "call",
      });
      toast.success("Contact saved", { description: "Notes, tickets, and reminders can attach now." });
      refresh();
    } catch (e: any) {
      toast.error("Could not save the contact", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!contactId || !noteDraft.trim()) return;
    try {
      await api.post("/api/desk/notes", { contact_id: contactId, body: noteDraft.trim() });
      setNoteDraft("");
      refresh();
    } catch (e: any) {
      toast.error("Could not add the note", { description: e.message });
    }
  };

  if (!thread) {
    return (
      <div className="ibx-railblank">
        <Users size={20} strokeWidth={1.6} />
        <p>Open a conversation to see who you&rsquo;re talking to.</p>
      </div>
    );
  }

  const tickets = thread.sidebar.tickets;
  const openTickets = tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length;

  return (
    <div className="ibx-scroll">
      <div className="ibx-contact">
        <Avatar name={c?.name || thread.peer} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="ibx-contact__name" title={c?.name || thread.peer}>{c?.name || thread.peer}</h2>
          <p className="ibx-contact__sub">
            {c?.company || (contactId ? "No company on file" : "Not in your contacts yet")}
          </p>
        </div>
        {/* an icon, not the word "Open" — that word already means a status here */}
        {contactId && (
          <Link href="/desk/contacts" className="ibx-icobtn" title="Open the full contact record" aria-label="Open the full contact record">
            <ExternalLink size={14} />
          </Link>
        )}
      </div>

      <div className="ibx-fields">
        {c?.email && (
          <div className="ibx-field">
            <Mail size={13} className="ibx-field__ic" />
            <span className="ibx-field__val mono" title={c.email}>{c.email}</span>
            <span className="badge badge-success ibx-field__tag">Primary</span>
            <CopyBtn value={c.email} label="email address" />
          </div>
        )}
        {c?.phone && (
          <div className="ibx-field">
            <Phone size={13} className="ibx-field__ic" />
            <span className="ibx-field__val mono">{prettyPhone(c.phone)}</span>
            <CopyBtn value={c.phone} label="phone number" />
            <button className="ibx-icobtn accent" onClick={() => onCall(c.phone!)} title={`Call ${prettyPhone(c.phone)}`} aria-label="Call this number">
              <PhoneCall size={13} />
            </button>
          </div>
        )}
        {c?.stage && contactId && (
          <div className="ibx-field">
            <Activity size={13} className="ibx-field__ic" />
            <span className="ibx-field__val">Stage · {c.stage.replace(/[_-]/g, " ")}</span>
          </div>
        )}
        {!contactId && (
          <button className="btn btn-secondary btn-sm w-full" onClick={saveContact} disabled={saving}>
            {saving ? <Spinner size={14} /> : <Plus />} Save as contact
          </button>
        )}
      </div>

      <Section label="Tickets" icon={TicketIcon} count={tickets.length} defaultOpen={openTickets > 0}>
        {tickets.length === 0 ? (
          <Blank>No tickets on this contact. File one from the composer.</Blank>
        ) : (
          <div className="flex flex-col gap-1.5">
            {tickets.map((t) => (
              <Link key={t.id} href="/desk/tickets" className="ibx-mini">
                <span className="min-w-0 flex-1">
                  <span className="ibx-mini__title">{t.subject}</span>
                  <span className="ibx-mini__sub">{timeAgo(t.created_at)} · {t.priority}</span>
                </span>
                <Tag label={t.status.replace(/_/g, " ")} />
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section label="Notes" icon={StickyNote} count={thread.sidebar.notes.length}>
        <div className="flex flex-col gap-2">
          {thread.sidebar.notes.map((n) => (
            <div key={n.id} className="ibx-note">
              <p>{n.body}</p>
              <span>{n.author || "Team"} · {timeAgo(n.created_at)}</span>
            </div>
          ))}
          {contactId ? (
            <div className="flex items-center gap-1.5">
              <input
                className="input"
                style={{ height: 30, fontSize: 12.5 }}
                placeholder="Add a note…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                aria-label="Add a note"
              />
              <button className="btn btn-secondary btn-sm btn-icon" onClick={addNote} disabled={!noteDraft.trim()} aria-label="Save note">
                <Plus />
              </button>
            </div>
          ) : (
            <Blank>Save the contact to attach notes.</Blank>
          )}
        </div>
      </Section>

      <Section label="Attachments" icon={Paperclip} count={attachments.length}>
        {attachments.length === 0 ? (
          <Blank>Fax documents and call recordings from this thread collect here.</Blank>
        ) : (
          <div className="flex flex-col gap-1.5">
            {attachments.map((a) => (
              <a key={a.id} className="ibx-mini" href={a.href} target="_blank" rel="noopener noreferrer">
                <a.icon size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <span className="min-w-0 flex-1">
                  <span className="ibx-mini__title">{a.label}</span>
                  <span className="ibx-mini__sub">{a.sub}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section label="Reminders" icon={Bell} count={thread.sidebar.reminders.length}>
        {thread.sidebar.reminders.length === 0 ? (
          <Blank>Nothing scheduled. Switch the composer to Reminder to set one.</Blank>
        ) : (
          <div className="flex flex-col gap-1.5">
            {thread.sidebar.reminders.map((r) => (
              <div key={r.id} className={`ibx-rem ${r.done ? "done" : ""}`}>
                <Bell size={12} />
                <span className="flex-1">{r.text}</span>
                {r.due_at && <span className="ibx-rem__due">{timeAgo(r.due_at)}</span>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section label="Other threads" icon={MessageSquare} count={otherThreads.length}>
        {otherThreads.length === 0 ? (
          <Blank>This contact has only reached you on this address.</Blank>
        ) : (
          <div className="flex flex-col gap-1">
            {otherThreads.map((r) => (
              <button key={r.peer} className="ibx-sug" onClick={() => onOpenPeer(r.peer)}>
                {r.channels.includes("email") ? <Mail size={13} /> : <Phone size={13} />}
                <span className="mono min-w-0 flex-1 truncate text-left">
                  {isEmailPeer(r.peer) ? r.peer : prettyPhone(r.peer)}
                </span>
                <span className="ibx-sug__time">{timeAgo(r.last_at)}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section label="Activity" icon={Activity}>
        {!contactId ? (
          <Blank>Save the contact to track its activity.</Blank>
        ) : (
          <>
            {!activity && (
              <button className="btn btn-secondary btn-sm" onClick={loadActivity} disabled={loadingActivity}>
                {loadingActivity ? <Spinner size={14} /> : null} Load recent activity
              </button>
            )}
            {activity && activity.length === 0 && <Blank>No recorded activity yet.</Blank>}
            <div className="flex flex-col gap-1.5">
              {(activity || []).slice(0, 12).map((a, i) => (
                <div key={i} className="ibx-act">
                  <span className="ibx-act__kind">{a.kind || a.type || "event"}</span>
                  <span className="min-w-0 flex-1">{a.label || a.text || a.summary || "—"}</span>
                  <span className="ibx-act__time">{timeAgo(a.at || a.created_at || "")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section label="Tags" icon={TagIcon} count={thread.sidebar.tags.length}>
        {thread.sidebar.tags.length === 0 ? (
          <Blank>No tags on this contact.</Blank>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {thread.sidebar.tags.map((t) => <Tag key={t} label={t} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── dialpad ──────────────────────────────────────────────────────────────────
const KEYS: [string, string][] = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""],
];

export function DialpadRail({
  numbers, to, setTo, recent, active,
}: {
  numbers: PhoneNum[];
  to: string;
  setTo: (v: string) => void;
  recent: Row[];
  active: boolean;
}) {
  const [fromId, setFromId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);
  const padRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fromId && numbers.length > 0) setFromId(numbers[0].id);
  }, [numbers, fromId]);

  // type digits straight into the pad when it's the visible tab
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9*#+]$/.test(e.key)) { setTo(to + e.key); e.preventDefault(); }
      else if (e.key === "Backspace") { setTo(to.slice(0, -1)); e.preventDefault(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, to, setTo]);

  const call = async () => {
    if (!to.trim() || placing) return;
    setPlacing(true);
    setPlaced(null);
    try {
      await api.post("/api/telephony/calls", { to: to.trim(), from_number_id: fromId });
      setPlaced(`Calling ${prettyPhone(to.trim())}. Veyra answers the line and can warm-transfer to your team.`);
      toast.success("Call placed", { description: "Follow it live in Studio → Telephony." });
    } catch (e: any) {
      toast.error("Could not place the call", { description: e.message });
    } finally {
      setPlacing(false);
    }
  };

  if (numbers.length === 0) {
    return (
      <div className="ibx-railblank">
        <PhoneOff size={20} strokeWidth={1.6} />
        <p>No phone number on this workspace yet.</p>
        <Link href="/studio/telephony" className="btn btn-secondary btn-sm">Provision a number</Link>
      </div>
    );
  }

  return (
    <div className="ibx-scroll ibx-dial">
      <label className="ibx-dial__label" htmlFor="dial-from">Calling as</label>
      <select id="dial-from" className="select" style={{ height: 32, fontSize: 12.5 }} value={fromId} onChange={(e) => setFromId(e.target.value)}>
        {numbers.map((n) => (
          <option key={n.id} value={n.id}>{n.friendly_name || prettyPhone(n.e164)}</option>
        ))}
      </select>

      <div className="ibx-dial__display">
        <input
          className="ibx-dial__input mono"
          placeholder="Enter a number"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") call(); }}
          aria-label="Number to call"
        />
        <button
          className="ibx-icobtn"
          onClick={() => setTo(to.slice(0, -1))}
          disabled={!to}
          aria-label="Delete last digit"
          title="Delete last digit"
        >
          <Delete size={15} />
        </button>
      </div>

      <div className="ibx-pad" ref={padRef}>
        {KEYS.map(([d, sub]) => (
          <button key={d} className="ibx-key" onClick={() => setTo(to + d)} aria-label={`Dial ${d}`}>
            <b>{d}</b>
            <span>{sub || " "}</span>
          </button>
        ))}
      </div>

      <button className="btn btn-primary ibx-dial__call" onClick={call} disabled={placing || !to.trim()}>
        {placing ? <Spinner size={15} /> : <PhoneCall />} {placing ? "Placing…" : "Call"}
      </button>
      <p className="ibx-dial__note">Veyra dials and answers the line; transfers ring your team.</p>

      {placed && <div className="ibx-dial__placed">{placed}</div>}

      {recent.length > 0 && (
        <>
          <div className="ibx-dial__label mt-5">Recent</div>
          <div className="flex flex-col gap-0.5">
            {recent.map((r) => (
              <button key={r.peer} className="ibx-sug" onClick={() => setTo(r.peer)}>
                <Avatar name={r.contact.name} size={22} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="ibx-sug__name">{r.contact.name}</span>
                  <span className="ibx-sug__peer mono">{prettyPhone(r.peer)}</span>
                </span>
                <PhoneCall size={13} style={{ color: "var(--success)" }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
