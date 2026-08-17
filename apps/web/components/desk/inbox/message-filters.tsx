"use client";

/* Thread-level filtering.

   A long-running thread mixes five kinds of record — texts, calls, emails,
   faxes, and the tickets filed against the contact — from both sides of the
   conversation. When you are looking for "the call where they gave the DOB",
   scrolling is the wrong tool. This narrows the open thread by who sent it and
   what kind it is, entirely client-side over the timeline already loaded.

   Options are derived from what the thread actually contains, so the filter can
   never offer a kind that would return nothing. */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Check, Filter as FilterIcon, Mail, MessageSquare, Phone, Printer, Ticket as TicketIcon } from "lucide-react";
import { Popover, useAnchor } from "@/components/desk/popover";
import type { Thread, TimelineItem, Ticket } from "./types";

export type MessageKind = "sms" | "call" | "email" | "fax" | "ticket";
export type Sender = "customer" | "team";

export type StreamEntry =
  | { at: string; key: string; type: "item"; item: TimelineItem }
  | { at: string; key: string; type: "ticket"; ticket: Ticket };

const KIND_LABEL: Record<MessageKind, string> = {
  sms: "Texts", call: "Calls", email: "Emails", fax: "Faxes", ticket: "Tickets",
};
const KIND_ICON: Record<MessageKind, any> = {
  sms: MessageSquare, call: Phone, email: Mail, fax: Printer, ticket: TicketIcon,
};

export const kindOf = (e: StreamEntry): MessageKind => (e.type === "ticket" ? "ticket" : e.item.kind);
export const senderOf = (e: StreamEntry): Sender =>
  e.type === "ticket" ? "team" : e.item.direction === "outbound" ? "team" : "customer";

export type MessageFilters = { kinds: MessageKind[]; senders: Sender[] };
export const NO_MESSAGE_FILTERS: MessageFilters = { kinds: [], senders: [] };

export const messageFilterCount = (f: MessageFilters) =>
  (f.kinds.length > 0 ? 1 : 0) + (f.senders.length > 0 ? 1 : 0);

export function applyMessageFilters(entries: StreamEntry[], f: MessageFilters): StreamEntry[] {
  if (messageFilterCount(f) === 0) return entries;
  return entries.filter(
    (e) =>
      (f.kinds.length === 0 || f.kinds.includes(kindOf(e))) &&
      (f.senders.length === 0 || f.senders.includes(senderOf(e))),
  );
}

// ── context, so the header button and the list share one state ───────────────
type Ctx = {
  filters: MessageFilters;
  setFilters: (f: MessageFilters) => void;
  present: { kinds: MessageKind[]; senders: Sender[] };
  customerName: string;
};
const MessageFilterContext = createContext<Ctx | null>(null);

export function useMessageFilters(): Ctx {
  const ctx = useContext(MessageFilterContext);
  if (!ctx) throw new Error("useMessageFilters must be used inside MessageFilterProvider");
  return ctx;
}

export function MessageFilterProvider({
  peer, thread, entries, children,
}: {
  peer: string;
  thread: Thread | null;
  entries: StreamEntry[];
  children: React.ReactNode;
}) {
  const [filters, setFilters] = useState<MessageFilters>(NO_MESSAGE_FILTERS);

  // a filter set from one thread is meaningless in the next
  useEffect(() => setFilters(NO_MESSAGE_FILTERS), [peer]);

  const present = useMemo(() => {
    const kinds = new Set<MessageKind>();
    const senders = new Set<Sender>();
    for (const e of entries) {
      kinds.add(kindOf(e));
      senders.add(senderOf(e));
    }
    return {
      kinds: (["sms", "call", "email", "fax", "ticket"] as MessageKind[]).filter((k) => kinds.has(k)),
      senders: (["customer", "team"] as Sender[]).filter((s) => senders.has(s)),
    };
  }, [entries]);

  const customerName = thread?.contact?.name || peer;

  return (
    <MessageFilterContext.Provider value={{ filters, setFilters, present, customerName }}>
      {children}
    </MessageFilterContext.Provider>
  );
}

// ── the header control ───────────────────────────────────────────────────────
export function MessageFilterButton() {
  const { filters, setFilters, present, customerName } = useMessageFilters();
  const btn = useAnchor<HTMLButtonElement>();
  const n = messageFilterCount(filters);
  const usable = present.kinds.length > 1 || present.senders.length > 1;
  if (!usable) return null;

  const toggleKind = (k: MessageKind) =>
    setFilters({
      ...filters,
      kinds: filters.kinds.includes(k) ? filters.kinds.filter((x) => x !== k) : [...filters.kinds, k],
    });
  const toggleSender = (s: Sender) =>
    setFilters({
      ...filters,
      senders: filters.senders.includes(s) ? filters.senders.filter((x) => x !== s) : [...filters.senders, s],
    });

  return (
    <>
      <button
        ref={btn.ref}
        className={`ibx-mfbtn ${n > 0 ? "on" : ""}`}
        onClick={btn.toggle}
        aria-expanded={btn.open}
        aria-label={n > 0 ? `Filtering this thread (${n} active)` : "Filter this thread"}
        title="Filter this thread"
      >
        <FilterIcon size={16} />
        {n > 0 && <span>{n}</span>}
      </button>
      <Popover open={btn.open} anchor={btn.ref} onClose={btn.close} align="end" width={230} label="Filter this thread">
        <div className="mfpanel">
          {present.kinds.length > 1 && (
            <section>
              <div className="mfpanel__label">Kind</div>
              {present.kinds.map((k) => {
                const Icon = KIND_ICON[k];
                const on = filters.kinds.includes(k);
                return (
                  <button key={k} className={`fopt ${on ? "on" : ""}`} onClick={() => toggleKind(k)} role="checkbox" aria-checked={on}>
                    <span className="fopt__box">{on && <Check size={11} strokeWidth={3.2} />}</span>
                    <Icon size={14} />
                    <span className="flex-1 text-left">{KIND_LABEL[k]}</span>
                  </button>
                );
              })}
            </section>
          )}
          {present.senders.length > 1 && (
            <section>
              <div className="mfpanel__label">From</div>
              {present.senders.map((s) => {
                const on = filters.senders.includes(s);
                return (
                  <button key={s} className={`fopt ${on ? "on" : ""}`} onClick={() => toggleSender(s)} role="checkbox" aria-checked={on}>
                    <span className="fopt__box">{on && <Check size={11} strokeWidth={3.2} />}</span>
                    <span className="flex-1 truncate text-left">{s === "team" ? "Your team" : customerName}</span>
                  </button>
                );
              })}
            </section>
          )}
          {n > 0 && (
            <div className="mfpanel__foot">
              <button className="btn btn-ghost btn-sm w-full" onClick={() => setFilters(NO_MESSAGE_FILTERS)}>
                Reset
              </button>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
