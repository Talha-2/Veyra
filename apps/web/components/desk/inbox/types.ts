/* Shared shapes for the Veyra Desk inbox — mirrors the desk API payloads in
   apps/server/app/routers/desk.py (`/api/desk/inbox`, `/api/desk/inbox/{peer}`). */

import type { Member } from "@/components/desk/kit";

export type Row = {
  peer: string;
  contact: { id: string | null; name: string; stage: string };
  channels: string[];
  count: number;
  unread: number;
  last_text: string;
  last_at: string;
  last_kind: string;
  status: string;
  is_favorite: boolean;
  created_at: string;
  assignees: Member[];
};

export type TimelineItem = {
  kind: "sms" | "call" | "email" | "fax";
  id: string;
  direction: "inbound" | "outbound";
  at: string;
  status: string;
  error?: string | null;
  // sms
  body?: string;
  // call
  duration_sec?: number;
  room?: string | null;
  recording_url?: string;
  // email
  from_addr?: string;
  to_addr?: string;
  provider?: string;
  subject?: string;
  snippet?: string;
  body_text?: string;
  body_html?: string;
  thread_external_id?: string;
  unread?: boolean;
  // fax
  media_url?: string;
  pages?: number;
};

export type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  priority: string;
  type: string;
  channel: string;
  contact_id: string | null;
  contact_name: string | null;
  assignees: Member[];
  creator: string;
  created_at: string;
  updated_at: string;
};

export type Note = { id: string; body: string; author: string; created_at: string };
export type Reminder = { id: string; text: string; done: boolean; due_at: string | null; created_at: string };

export type Contact = {
  id?: string | null;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  stage?: string;
  source?: string;
  owner?: string;
  value?: number;
  tags?: string[];
  last_contact_at?: string;
  created_at?: string;
};

export type Thread = {
  peer: string;
  contact: Contact;
  timeline: TimelineItem[];
  sidebar: { tickets: Ticket[]; notes: Note[]; reminders: Reminder[]; tags: string[] };
  conversation: { status: string; is_favorite: boolean; created_at: string; assignees: Member[] };
};

export type EmailAccount = { id: string; toolkit: string; email: string; status: string };
export type PhoneNum = { id: string; e164: string; friendly_name: string };

/* Status colors ride the shared semantic tokens so both themes stay correct. */
export const CONVERSATION_STATUS = [
  { value: "open", label: "Open", color: "var(--info)" },
  { value: "snoozed", label: "Snoozed", color: "var(--warning)" },
  { value: "closed", label: "Closed", color: "var(--success)" },
];

export const isEmailPeer = (peer: string) => peer.includes("@");

export const fmtDur = (s?: number) => {
  const v = Math.max(0, Math.round(s || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

export const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** E.164 → (817) 721-9906 for US/CA numbers; anything else passes through. */
export function prettyPhone(v: string): string {
  const d = (v || "").replace(/[^\d+]/g, "");
  const m = /^\+?1?(\d{3})(\d{3})(\d{4})$/.exec(d.replace(/^\+/, ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : v;
}

/** Short clock for a timeline entry — 4:12 PM. */
export const clockOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Today / Yesterday / Mon, Aug 4 — the thread's day separators. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
