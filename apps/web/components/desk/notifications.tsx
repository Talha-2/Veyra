"use client";

/* Shared notification + status primitives for Veyra Desk.

   These are the small but high-signal marks that make the inbox scannable:
   unread pulse dots, channel badges, delivery tick marks, and status lozenges.
   Each one is a single semantic color pulled from the design tokens so they
   stay correct in both light and dark themes and never drift from the
   console palette (Ember / Mint / semantic hues). */

import { useMemo } from "react";
import { Mail, MessageSquare, Phone, Printer } from "lucide-react";
import { Avatar, type Member } from "./kit";
import { cn } from "@/lib/utils";

/* ── unread pulse dot ─────────────────────────────────────────────────────── */
const DOT_SIZES = { sm: 8, md: 10, lg: 12 } as const;
export function UnreadDot({ count = 1, size = "sm", pulse = true }: {
  count?: number;
  size?: keyof typeof DOT_SIZES;
  pulse?: boolean;
}) {
  const px = DOT_SIZES[size];
  const showCount = count > 1 && count < 100;
  return (
    <span
      role="status"
      aria-label={count === 1 ? "Unread" : `${count} unread`}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-accent",
        "mono font-semibold leading-none",
        pulse && "notification-pulse",
      )}
      style={{
        /* a bare dot stays a dot; a count grows into a pill so the number is
           actually legible instead of crushed inside 8px */
        minWidth: showCount ? 16 : px,
        height: showCount ? 16 : px,
        paddingInline: showCount ? 4 : 0,
        fontSize: 9.5,
        color: "var(--text-on-accent)",
        boxShadow: pulse ? "0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)" : undefined,
      }}
    >
      {showCount && <span>{count}</span>}
      {pulse && <i className="dot-pulse-ring" />}
    </span>
  );
}

/* ── channel badge (SMS · Call · Email · Fax) ────────────────────────────── */
type ChannelMeta = { label: string; toneVar: string; Icon: React.ElementType };
const CHANNEL_META: Record<string, ChannelMeta> = {
  sms: { label: "SMS", toneVar: "--info", Icon: MessageSquare },
  call: { label: "Voice", toneVar: "--voice-agent", Icon: Phone },
  email: { label: "Email", toneVar: "--warning", Icon: Mail },
  fax: { label: "Fax", toneVar: "--chart-4", Icon: Printer },
};
const DEFAULT_CHANNEL_META: ChannelMeta = { label: "?", toneVar: "--text-tertiary", Icon: MessageSquare };


export function ChannelBadge({ channel, size = "sm" }: { channel: string; size?: "sm" | "md" }) {
  const meta = CHANNEL_META[channel] || DEFAULT_CHANNEL_META;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-medium"
      style={{
        height: size === "md" ? 20 : 18,
        paddingInline: size === "md" ? 8 : 6,
        fontSize: size === "md" ? 11.5 : 10.5,
        background: `color-mix(in srgb, var(${meta.toneVar}) 14%, transparent)`,
        color: `var(${meta.toneVar})`,
        border: `1px solid color-mix(in srgb, var(${meta.toneVar}) 34%, transparent)`,
      }}
      title={`This conversation includes ${channel}`}
    >
      <meta.Icon size={size === "md" ? 12 : 10} /> {meta.label}
    </span>
  );
}

export function ChannelIcons({ channels, size = 12 }: { channels: string[]; size?: number }) {
  return (
    <span className="ibx-cht" title={`Channels: ${channels.join(", ")}`}>
      {channels.map((c) => {
        const IconC = (CHANNEL_META[c] || DEFAULT_CHANNEL_META).Icon;
        return <IconC key={c} size={size} />;
      })}
    </span>
  );
}

/* ── delivery / read tick ────────────────────────────────────────────────────
   The messaging idiom carries real information, so use all of it:
   one check = sent, two checks = delivered, two Ember checks = read,
   crossed circle = failed. Before, sent/delivered/read were identical. */
export function Tick({ state, size = 14 }: { state?: "sent" | "delivered" | "read" | "failed"; size?: number }) {
  const double = state === "delivered" || state === "read";
  const tone = useMemo(() => (
    state === "read" ? "var(--accent)" :
    state === "failed" ? "var(--danger)" :
    "var(--text-tertiary)"
  ), [state]);
  if (state === "failed") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-label="Failed to deliver">
        <circle cx="12" cy="12" r="9" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={tone} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
      aria-label={state === "read" ? "Read" : state === "delivered" ? "Delivered" : "Sent"}
    >
      {double ? (
        <>
          <path d="M2.5 12.5l4.5 4.5L16 8" />
          <path d="M12 16l1.5 1.5L22.5 8.5" />
        </>
      ) : (
        <path d="M5 12l5 5L20 6" />
      )}
    </svg>
  );
}

/* ── status dot ──────────────────────────────────────────────────────────── */
const STATUS_TONES: Record<string, string> = {
  open: "--info",
  snoozed: "--warning",
  closed: "--success",
  failed: "--danger",
};
export function StatusDot({ status, size = 10 }: { status: string; size?: number }) {
  const varName = STATUS_TONES[status] || "--text-tertiary";
  return <span className="inline-block rounded-full" style={{ width: size, height: size, background: `var(${varName})` }} title={status} />;
}

/* ── owner mini-stack ───────────────────────────────────────────────────── */
export function OwnerChip({
  members,
  size = 20,
}: {
  members: Pick<Member, "id" | "name" | "color" | "initials">[];
  size?: number;
}) {
  if (!members || members.length === 0) {
    return <span className="text-tertiary text-[11px] font-medium">Unassigned</span>;
  }
  const showSize = size < 18 ? 14 : size - 2;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {members.slice(0, 3).map((m, i) => (
        <span
          key={m.id || i}
          className="inline-flex items-center justify-center rounded-full border-2 border-[var(--bg)]"
          style={{ width: 18, height: 18, zIndex: 3 - i }}
          title={m.name}
        >
          <Avatar name={m.name} color={m.color} initials={m.initials} size={showSize} />
        </span>
      ))}
      {members.length > 3 && (
        <span
          className="inline-flex items-center justify-center rounded-full border-2 border-[var(--bg)] text-[9px] font-bold"
          style={{ width: 18, height: 18, background: "var(--surface-sunken)", color: "var(--text-secondary)", zIndex: 0 }}
        >
          +{members.length - 3}
        </span>
      )}
    </span>
  );
}
