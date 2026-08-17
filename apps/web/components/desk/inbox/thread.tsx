"use client";

/* The conversation pane: header, the merged timeline, and the composer.

   The timeline interleaves every channel the contact has used — SMS bubbles,
   call records with transcripts, email cards, faxes — plus the tickets filed
   against that contact, in one chronological stream broken by day separators.
   The composer is the single place work leaves from: reply by SMS or email, or
   file a note / ticket / reminder without leaving the thread. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowDown, Archive, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Copy,
  ExternalLink, FileText, Mail, MessageSquare, MoreHorizontal, Paperclip, Phone, PhoneCall,
  Moon, PhoneIncoming, PhoneMissed, PhoneOutgoing, Printer, Send, Star, StickyNote,
  Ticket as TicketIcon, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toasts";
import { Spinner, EmptyState } from "@/components/ui";
import {
  AssigneePicker, Avatar, type Member, PillSelect, PRIORITY_OPTIONS, STATUS_OPTIONS, timeAgo,
} from "@/components/desk/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CONVERSATION_STATUS, clockOf, dayLabel, fmtDur, isEmailPeer, prettyPhone, stripHtml,
  type EmailAccount, type Thread, type Ticket, type TimelineItem,
} from "./types";
import {
  applyMessageFilters, MessageFilterButton, MessageFilterProvider, messageFilterCount,
  NO_MESSAGE_FILTERS, useMessageFilters, type StreamEntry,
} from "./message-filters";
import { RecordingPlayer } from "./player";

const MISSED = ["failed", "no-answer", "busy", "canceled"];

// ── one chronological stream of messages and tickets ─────────────────────────
function buildEntries(thread: Thread | null): StreamEntry[] {
  if (!thread) return [];
  return [
    ...thread.timeline.map((item) => ({ at: item.at, key: `i${item.id}`, type: "item" as const, item })),
    ...thread.sidebar.tickets.map((ticket) => ({
      at: ticket.created_at, key: `t${ticket.id}`, type: "ticket" as const, ticket,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

/** Group a filtered stream into day buckets for the separators. */
function groupByDay(entries: StreamEntry[]): { day: string; entries: StreamEntry[] }[] {
  const days: { day: string; entries: StreamEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.at);
    const last = days[days.length - 1];
    if (last && last.day === label) last.entries.push(e);
    else days.push({ day: label, entries: [e] });
  }
  return days;
}

// ── header ───────────────────────────────────────────────────────────────────
function ThreadHeader({
  peer, thread, team, railOpen, onBack, onPatch, onCall, onToggleRail, onCompose,
}: {
  peer: string;
  thread: Thread | null;
  team: Member[];
  railOpen: boolean;
  onBack: () => void;
  onPatch: (p: ConvPatch) => void;
  onCall: (n: string) => void;
  onToggleRail: () => void;
  onCompose: (mode: "ticket" | "note" | "reminder") => void;
}) {
  const name = thread?.contact?.name || peer;
  const phone = thread?.contact?.phone || (isEmailPeer(peer) ? "" : peer);
  const channels = useMemo(() => {
    const s = new Set(thread?.timeline.map((t) => t.kind) || []);
    return [...s];
  }, [thread]);

  const copyPeer = () => {
    navigator.clipboard?.writeText(peer).then(
      () => toast.success("Copied", { description: peer }),
      () => toast.error("Could not copy"),
    );
  };

  return (
    <header className="ibx-thead">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onBack} aria-label="Back to conversations">
        <ArrowLeft />
      </Button>
      <Avatar name={name} size={34} />
      <div className="ibx-thead__id">
        <div className="ibx-thead__name" title={name}>{name}</div>
        <div className="ibx-thead__peer">
          <span className="mono truncate">{isEmailPeer(peer) ? peer : prettyPhone(peer)}</span>
          {channels.map((c) => (
            <span key={c} className="ibx-cht" title={`This thread includes ${c}`}>
              {c === "email" ? <Mail /> : c === "fax" ? <Printer /> : c === "sms" ? <MessageSquare /> : <Phone />}
              {c === "sms" ? "SMS" : c}
            </span>
          ))}
        </div>
      </div>

      <div className="ibx-thead__actions">
        {thread && (
          <>
            {/* assignment also lives in the details rail, so it folds away on phones */}
            <span className="ibx-thead__assign">
              <AssigneePicker
                value={thread.conversation.assignees.map((a) => a.id)}
                members={team}
                onChange={(ids) => onPatch({ assignee_ids: ids })}
                align="right"
              />
            </span>
            {/* also in the more-menu, so this can fold away on phones */}
            <span className="ibx-thead__status">
              <PillSelect
                value={thread.conversation.status}
                options={CONVERSATION_STATUS}
                onChange={(v) => onPatch({ status: v })}
                minWidth={92}
              />
            </span>
          </>
        )}
        <MessageFilterButton />
        {phone && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ibx-callbtn"
            title={`Call ${prettyPhone(phone)}`}
            aria-label={`Call ${prettyPhone(phone)}`}
            onClick={() => onCall(phone)}
          >
            <PhoneCall />
          </Button>
        )}
        {thread && (
          <button
            className={`ibx-starbtn ${thread.conversation.is_favorite ? "on" : ""}`}
            onClick={() => onPatch({ is_favorite: !thread.conversation.is_favorite })}
            aria-pressed={thread.conversation.is_favorite}
            aria-label={thread.conversation.is_favorite ? "Remove from favorites" : "Add to favorites"}
            title={thread.conversation.is_favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star size={16} />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={copyPeer}><Copy /> Copy address</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCompose("ticket")}><TicketIcon /> File a ticket</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCompose("note")}><StickyNote /> Add internal note</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCompose("reminder")}><Bell /> Set a reminder</DropdownMenuItem>
            {thread?.contact?.id && (
              <DropdownMenuItem render={<Link href="/desk/contacts" />}>
                <Users /> Open contact record
              </DropdownMenuItem>
            )}
            {thread && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onPatch({ status: thread.conversation.status === "snoozed" ? "open" : "snoozed" })}
                >
                  <Moon />
                  {thread.conversation.status === "snoozed" ? "Unsnooze" : "Snooze until it replies"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onPatch({ status: thread.conversation.status === "closed" ? "open" : "closed" })}
                >
                  <Archive />
                  {thread.conversation.status === "closed" ? "Reopen conversation" : "Archive conversation"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleRail}
          aria-expanded={railOpen}
          aria-label={railOpen ? "Hide details panel" : "Show details panel"}
          title={railOpen ? "Hide details" : "Show details"}
        >
          {railOpen ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>
    </header>
  );
}

// ── pane ─────────────────────────────────────────────────────────────────────
export type ConvPatch = { assignee_ids?: string[]; status?: string; is_favorite?: boolean };

export function ThreadPane(props: {
  peer: string;
  thread: Thread | null;
  team: Member[];
  accounts: EmailAccount[];
  railOpen: boolean;
  onBack: () => void;
  onPatch: (p: ConvPatch) => void;
  onCall: (n: string) => void;
  onToggleRail: () => void;
  refresh: () => void;
}) {
  const entries = useMemo(() => buildEntries(props.thread), [props.thread]);
  return (
    <MessageFilterProvider peer={props.peer} thread={props.thread} entries={entries}>
      <ThreadBody {...props} entries={entries} />
    </MessageFilterProvider>
  );
}

function ThreadBody({
  peer, thread, team, accounts, railOpen, entries, onBack, onPatch, onCall, onToggleRail, refresh,
}: {
  peer: string;
  thread: Thread | null;
  team: Member[];
  accounts: EmailAccount[];
  railOpen: boolean;
  entries: StreamEntry[];
  onBack: () => void;
  onPatch: (p: ConvPatch) => void;
  onCall: (n: string) => void;
  onToggleRail: () => void;
  refresh: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [forceMode, setForceMode] = useState<{ mode: string; n: number } | null>(null);
  const { filters, setFilters } = useMessageFilters();

  const shown = useMemo(() => applyMessageFilters(entries, filters), [entries, filters]);
  const days = useMemo(() => groupByDay(shown), [shown]);
  const count = shown.length;
  const filtering = messageFilterCount(filters) > 0;

  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    if (stick.current) toBottom();
  }, [count, peer, toBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    stick.current = near;
    setAtBottom(near);
  };

  return (
    <>
      <ThreadHeader
        peer={peer}
        thread={thread}
        team={team}
        railOpen={railOpen}
        onBack={onBack}
        onPatch={onPatch}
        onCall={onCall}
        onToggleRail={onToggleRail}
        onCompose={(mode) => setForceMode({ mode, n: (forceMode?.n || 0) + 1 })}
      />

      <div className="ibx-threadwrap">
        <div ref={scrollRef} className="ibx-scroll ibx-thread" onScroll={onScroll}>
          {!thread && <ThreadSkeleton />}
          {thread && count === 0 && filtering && (
            <div className="ibx-mfblank">
              <p role="status">No messages in this thread match those filters.</p>
              <Button variant="outline" size="sm" onClick={() => setFilters(NO_MESSAGE_FILTERS)}>
                Clear thread filters
              </Button>
            </div>
          )}
          {thread && count === 0 && !filtering && (
            <EmptyState
              icon={MessageSquare}
              title="Nothing here yet"
              body="Say hello below — SMS and email send straight from this thread, and every call lands here automatically."
            />
          )}
          {days.map((d) => (
            <section key={d.day} className="ibx-day">
              <div className="ibx-daysep"><span>{d.day}</span></div>
              {d.entries.map((e) =>
                e.type === "ticket" ? (
                  <TicketCard key={e.key} ticket={e.ticket} team={team} refresh={refresh} />
                ) : e.item.kind === "sms" ? (
                  <SmsBubble key={e.key} item={e.item} />
                ) : e.item.kind === "call" ? (
                  <CallCard key={e.key} item={e.item} />
                ) : e.item.kind === "email" ? (
                  <EmailCard key={e.key} item={e.item} />
                ) : (
                  <FaxCard key={e.key} item={e.item} />
                ),
              )}
            </section>
          ))}
        </div>
        {!atBottom && count > 0 && (
          <button className="ibx-jump" onClick={() => toBottom(true)} aria-label="Jump to the latest message">
            <ArrowDown size={14} /> Latest
          </button>
        )}
      </div>

      <Composer peer={peer} thread={thread} accounts={accounts} refresh={refresh} forceMode={forceMode} />
    </>
  );
}

function ThreadSkeleton() {
  return (
    <div className="ibx-skel" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`ibx-skel__row ${i === 1 ? "me" : ""}`}>
          <span className="sk" style={{ width: i === 1 ? 210 : 260, height: i === 1 ? 40 : 62 }} />
        </div>
      ))}
    </div>
  );
}

// ── timeline items ───────────────────────────────────────────────────────────
function SmsBubble({ item }: { item: TimelineItem }) {
  const me = item.direction === "outbound";
  const failed = item.status === "failed" || item.status === "undelivered";
  return (
    <div className={`msg-wrap ${me ? "me" : ""}`}>
      <div className="msg-bubble">{item.body}</div>
      <div className="msg-meta">
        <span>{me ? "SMS · sent" : "SMS"}</span>
        <span>{clockOf(item.at)}</span>
        {failed && <span className="msg-failed">Failed{item.error ? ` — ${item.error}` : ""}</span>}
      </div>
    </div>
  );
}

function CallCard({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inbound = item.direction === "inbound";
  const missed = MISSED.includes(item.status);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail && item.room) {
      setLoading(true);
      try {
        setDetail(await api.get(`/api/telephony/calls/${item.id}`));
      } catch {
        setDetail({ transcript: [] });
      } finally {
        setLoading(false);
      }
    }
  };

  const transcript: { role: string; text: string }[] = detail?.transcript || [];
  const total = detail?.metrics?.total_ms ?? detail?.metrics?.avg_total_ms;
  const Icon = missed ? PhoneMissed : inbound ? PhoneIncoming : PhoneOutgoing;

  return (
    <article className={`msg-card ${item.direction === "outbound" ? "me" : ""}`}>
      <div className="msg-card__head">
        <span className={`msg-card__ic ${missed ? "bad" : inbound ? "in" : "out"}`}><Icon /></span>
        <div className="min-w-0 flex-1">
          <h4 className="msg-card__title">
            {missed ? (inbound ? "Missed call" : "Call not connected") : inbound ? "Incoming call" : "Outgoing call"}
          </h4>
          <div className="msg-card__sub">
            {clockOf(item.at)}
            {item.duration_sec ? ` · ${fmtDur(item.duration_sec)}` : ""}
            {missed ? ` · ${item.status}` : ""}
          </div>
        </div>
        {item.room && (
          <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={open}>
            Transcript <ChevronDown className="chev" style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </Button>
        )}
      </div>
      {item.recording_url ? (
        <div className="msg-card__body">
          <RecordingPlayer src={item.recording_url} label={`Recording of ${inbound ? "incoming" : "outgoing"} call`} />
        </div>
      ) : (
        !missed && <div className="msg-card__body"><p className="msg-card__none">No recording captured for this call</p></div>
      )}
      {open && (
        <div className="msg-x">
          {loading && <div className="flex justify-center py-3"><Spinner size={16} /></div>}
          {!loading && transcript.length === 0 && <span className="text-tertiary">No transcript was captured for this call.</span>}
          {!loading && transcript.map((t, i) => {
            const agent = t.role === "assistant" || t.role === "agent";
            return (
              <p key={i} className="msg-x__line">
                <span className={`who ${agent ? "agent" : ""}`}>{agent ? "veyra" : "caller"}</span>
                {t.text}
              </p>
            );
          })}
          {!loading && total != null && (
            <p className="msg-x__foot">turn latency ~{Math.round(total)} ms</p>
          )}
        </div>
      )}
    </article>
  );
}

function EmailCard({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const me = item.direction === "outbound";
  const body = item.body_text || (item.body_html ? stripHtml(item.body_html) : "") || item.snippet || "";
  const failed = item.status === "failed";
  return (
    <article className={`msg-card ${me ? "me" : ""} ${item.unread ? "unread" : ""}`}>
      <div className="msg-card__head">
        <span className={`msg-card__ic ${failed ? "bad" : me ? "out" : "in"}`}><Mail /></span>
        <div className="min-w-0 flex-1">
          <h4 className="msg-card__title truncate">
            {item.subject || "(no subject)"}
            {item.unread && <span className="ibx-dot ml-2 inline-block align-middle" title="Unread" />}
          </h4>
          <div className="msg-card__sub truncate">
            {me ? `to ${item.to_addr}` : `from ${item.from_addr}`} · {clockOf(item.at)}
            {item.provider ? ` · ${item.provider}` : ""}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Collapse" : "Read"}
        </Button>
      </div>
      {!open && body && (
        <div className="msg-card__body"><p className="msg-card__clamp">{body}</p></div>
      )}
      {open && <div className="msg-x">{body || "This message has no body."}</div>}
      {failed && (
        <div className="msg-card__foot"><span className="msg-failed">Delivery failed{item.error ? ` — ${item.error}` : ""}</span></div>
      )}
    </article>
  );
}

function FaxCard({ item }: { item: TimelineItem }) {
  const me = item.direction === "outbound";
  const failed = item.status === "failed";
  return (
    <article className={`msg-card ${me ? "me" : ""}`}>
      <div className="msg-card__head">
        <span className={`msg-card__ic ${failed ? "bad" : me ? "out" : "in"}`}><Printer /></span>
        <div className="min-w-0 flex-1">
          <h4 className="msg-card__title">{me ? "Outgoing fax" : "Incoming fax"}</h4>
          <div className="msg-card__sub">
            {item.pages ? `${item.pages} page${item.pages === 1 ? "" : "s"} · ` : ""}
            {clockOf(item.at)} · {item.status}
          </div>
        </div>
        {item.media_url && (
          <Button variant="outline" size="sm" render={<a href={item.media_url} target="_blank" rel="noopener noreferrer" />}>
            <FileText /> Open PDF
          </Button>
        )}
      </div>
      {failed && (
        <div className="msg-card__foot"><span className="msg-failed">Failed{item.error ? ` — ${item.error}` : ""}</span></div>
      )}
    </article>
  );
}

// ── ticket card (filed against this contact, shown in place) ─────────────────
const TICKET_TYPES = [
  { value: "", label: "Untyped", color: "var(--text-tertiary)" },
  { value: "question", label: "Question", color: "var(--info)" },
  { value: "issue", label: "Issue", color: "var(--danger)" },
  { value: "appointment", label: "Appointment", color: "var(--chart-4)" },
  { value: "billing", label: "Billing", color: "var(--warning)" },
  { value: "follow_up", label: "Follow-up", color: "var(--success)" },
];

function TicketCard({ ticket, team, refresh }: { ticket: Ticket; team: Member[]; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.patch(`/api/desk/tickets/${ticket.id}`, body);
      refresh();
    } catch (e: any) {
      toast.error("Could not update the ticket", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="tkt gap-0 py-0" aria-busy={busy}>
      <div className="tkt__bar">
        <Badge className="tkt__badge"><TicketIcon size={11} /> Ticket</Badge>
        <span className="tkt__id mono">{ticket.id}</span>
        <span className="flex-1" />
        <Link href="/desk/tickets" className="tkt__link" title="Open in Tickets">
          <ExternalLink size={13} />
        </Link>
      </div>
      <div className="tkt__body">
        <h4 className="tkt__subject">{ticket.subject}</h4>
        {ticket.body && ticket.body !== ticket.subject && <p className="tkt__text">{ticket.body}</p>}
      </div>
      <dl className="tkt__grid">
        <div>
          <dt>Status</dt>
          <dd><PillSelect value={ticket.status} options={STATUS_OPTIONS} onChange={(v) => patch({ status: v })} minWidth={104} /></dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            <PillSelect value={ticket.type || ""} options={TICKET_TYPES} onChange={(v) => patch({ type: v })} minWidth={116} />
          </dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd><PillSelect value={ticket.priority} options={PRIORITY_OPTIONS} onChange={(v) => patch({ priority: v })} minWidth={92} /></dd>
        </div>
        <div>
          <dt>Assignees</dt>
          <dd>
            <AssigneePicker
              value={ticket.assignees.map((a) => a.id)}
              members={team}
              onChange={(ids) => patch({ assignee_ids: ids })}
              size={22}
            />
          </dd>
        </div>
      </dl>
      <div className="tkt__foot">
        <span>{ticket.creator ? `Filed by ${ticket.creator}` : "Filed"} · {ticket.channel}</span>
        <span>{timeAgo(ticket.created_at)}</span>
      </div>
    </Card>
  );
}

// ── composer ─────────────────────────────────────────────────────────────────
type Mode = "sms" | "email" | "note" | "ticket" | "reminder";
const MODES: { key: Mode; label: string; short: string; icon: any; hint: string }[] = [
  { key: "sms", label: "Reply by SMS", short: "SMS", icon: MessageSquare, hint: "Goes to the contact's phone." },
  { key: "email", label: "Reply by email", short: "Email", icon: Mail, hint: "Sends from your connected mailbox." },
  { key: "note", label: "Internal note", short: "Note", icon: StickyNote, hint: "Only your team sees this." },
  { key: "ticket", label: "File a ticket", short: "Ticket", icon: TicketIcon, hint: "Opens a tracked ticket on the contact." },
  { key: "reminder", label: "Set a reminder", short: "Reminder", icon: Bell, hint: "Nudges the team later." },
];

const SMS_SEGMENT = 160;

function Composer({
  peer, thread, accounts, refresh, forceMode,
}: {
  peer: string;
  thread: Thread | null;
  accounts: EmailAccount[];
  refresh: () => void;
  forceMode: { mode: string; n: number } | null;
}) {
  const emailPeer = isEmailPeer(peer);
  const [mode, setMode] = useState<Mode>(emailPeer ? "email" : "sms");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMode(emailPeer ? "email" : "sms"); setText(""); setSubject(""); }, [peer, emailPeer]);
  useEffect(() => {
    if (!forceMode) return;
    setMode(forceMode.mode as Mode);
    taRef.current?.focus();
  }, [forceMode]);

  // grow with the content, up to the cap the CSS sets
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text, mode]);

  const contactId = thread?.contact?.id || null;
  const contactEmail = thread?.contact?.email || (emailPeer ? peer : "");
  const contactPhone = thread?.contact?.phone || (emailPeer ? "" : peer);
  const lastEmail = useMemo(
    () => [...(thread?.timeline || [])].reverse().find((t) => t.kind === "email"),
    [thread],
  );
  const activeMailbox = accounts.some((a) => a.status === "active");
  const current = MODES.find((m) => m.key === mode)!;

  const blocked =
    mode === "sms" && !contactPhone ? "This thread has no phone number to text." :
    mode === "email" && !contactEmail ? "This thread has no email address." :
    mode === "email" && !activeMailbox ? "Connect Gmail or Outlook in Integrations to send email." :
    (mode === "note" || mode === "ticket" || mode === "reminder") && !contactId
      ? "Save this peer as a contact first — use the Details panel." : "";

  const placeholder =
    mode === "sms" ? `Text ${thread?.contact?.name || prettyPhone(peer)}…` :
    mode === "email" ? "Write your reply…" :
    mode === "note" ? "Add a note only your team can see…" :
    mode === "ticket" ? "Describe the issue — this becomes the ticket…" :
    "What should the team be reminded about?";

  const send = async () => {
    const body = text.trim();
    if (!body || busy || blocked) return;
    setBusy(true);
    try {
      if (mode === "sms") {
        await api.post("/api/telephony/messages", { to: contactPhone, body });
      } else if (mode === "email") {
        await api.post("/api/desk/email/send", {
          to: contactEmail,
          subject:
            subject.trim() ||
            (lastEmail?.subject ? `Re: ${lastEmail.subject.replace(/^Re:\s*/i, "")}` : "Message from Veyra Desk"),
          body,
          thread_external_id: lastEmail?.thread_external_id || "",
        });
      } else if (mode === "note") {
        await api.post("/api/desk/notes", { contact_id: contactId, body });
        toast.success("Note added", { description: "Visible to your team only." });
      } else if (mode === "ticket") {
        await api.post("/api/desk/tickets", {
          subject: body.slice(0, 90), body, contact_id: contactId,
          channel: emailPeer ? "email" : "call", priority: "normal",
        });
        toast.success("Ticket filed", { description: "It now tracks in this thread and in Tickets." });
      } else {
        await api.post("/api/desk/reminders", { contact_id: contactId, text: body });
        toast.success("Reminder set");
      }
      setText("");
      setSubject("");
      refresh();
    } catch (e: any) {
      toast.error("Could not send", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); return; }
    if (e.key === "Enter" && !e.shiftKey && mode === "sms") { e.preventDefault(); send(); }
  };

  const segments = Math.max(1, Math.ceil(text.length / SMS_SEGMENT));
  const sendLabel = mode === "sms" || mode === "email" ? "Send" : mode === "ticket" ? "File" : "Save";

  return (
    <div className={`ibx-composer mode-${mode}`}>
      <div className="ibx-composer__modes" role="tablist" aria-label="Composer mode">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={m.key === mode}
            className={`ibx-mtag ${m.key === mode ? "on" : ""}`}
            onClick={() => { setMode(m.key); taRef.current?.focus(); }}
            title={m.hint}
          >
            <m.icon /> {m.short}
          </button>
        ))}
      </div>

      <div className="ibx-composer__box">
        {mode === "email" && (
          <input
            className="ibx-composer__subject"
            placeholder={lastEmail?.subject ? `Re: ${lastEmail.subject.replace(/^Re:\s*/i, "")}` : "Subject"}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Email subject"
          />
        )}
        <textarea
          ref={taRef}
          placeholder={blocked || placeholder}
          value={text}
          disabled={!!blocked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          aria-label={current.label}
        />
        <div className="ibx-composer__foot">
          <span className="ibx-composer__hint">
            {blocked ? (
              <span className="msg-failed">{blocked}</span>
            ) : mode === "sms" ? (
              text.length > 0
                ? `${text.length} characters · ${segments} segment${segments === 1 ? "" : "s"}`
                : "Enter to send · Shift+Enter for a new line"
            ) : (
              `${current.hint} · ⌘Enter to ${sendLabel.toLowerCase()}`
            )}
          </span>
          <div className="ibx-composer__tools">
            {mode === "email" && (
              <button className="btn btn-ghost btn-icon btn-sm" disabled title="Attachments are coming to email replies" aria-label="Attach a file">
                <Paperclip />
              </button>
            )}
            <Button size="sm" onClick={send} disabled={busy || !text.trim() || !!blocked}>
              {busy ? <Spinner size={14} /> : <Send />} {sendLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
