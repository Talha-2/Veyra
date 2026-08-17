"use client";

/* Shared building blocks for Veyra Desk (the CRM): avatars, assignee stacks,
   colored status/stage pill selects, and the dashboard area chart. Kept in one
   place so every screen renders identical, on-brand pieces. */

import { useMemo, useRef, useState } from "react";
import { Popover } from "@/components/desk/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── avatars ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#16a34a", "#ea580c", "#4f46e5", "#0d9488"];

export function initialsOf(name: string): string {
  return (name || "?")
    .split(/[\s@._]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({
  name, color, initials, size = 30,
}: { name: string; color?: string; initials?: string; size?: number }) {
  const bg = color || colorForName(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.38) }}
      title={name}
    >
      {initials || initialsOf(name)}
    </span>
  );
}

export type Member = { id: string; name: string; initials: string; color: string; role?: string };

export function AssigneeStack({ members, max = 3, size = 26 }: { members: Member[]; max?: number; size?: number }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: max - i, boxShadow: "0 0 0 2px var(--surface)" }} className="rounded-full">
          <Avatar name={m.name} color={m.color} initials={m.initials} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ width: size, height: size, marginLeft: -8, background: "var(--surface-sunken)", color: "var(--text-secondary)", boxShadow: "0 0 0 2px var(--surface)" }}
        >
          +{extra}
        </span>
      )}
      {members.length === 0 && <span className="text-tertiary text-[12px]">Unassigned</span>}
    </div>
  );
}

// ── colored pill select (status / stage / priority) ──────────────────────────
export type PillOption = { value: string; label: string; color?: string };

/* The trigger keeps the tinted-pill identity; the menu it opens is the shared
   shadcn dropdown instead of the browser's native <select> popup, so the one
   surface that used to escape the design system now matches it — and gains
   arrow-key navigation and a visible current-value check. */
export function PillSelect({
  value, options, onChange, minWidth = 96,
}: { value: string; options: PillOption[]; onChange: (v: string) => void; minWidth?: number }) {
  const current = options.find((o) => o.value === value) || { value, label: value, color: "" };
  const color = current.color || "var(--text-tertiary)";
  return (
    // stop row-level click handlers (list rows open threads) from firing
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
          style={{ minWidth, background: `color-mix(in srgb, ${color} 16%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 34%, transparent)` }}
          aria-label={`Change (currently ${current.label})`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          <span className="truncate">{current.label}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.7 }} aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40">
          {options.map((o) => {
            const oc = o.color || "var(--text-tertiary)";
            return (
              <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: oc }} aria-hidden="true" />
                <span className="flex-1">{o.label}</span>
                {o.value === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
      {label}
    </span>
  );
}

// ── time helpers ─────────────────────────────────────────────────────────────
export function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── area chart (AI vs team conversation productivity) ────────────────────────
type Pt = { date: string; ai: number; team: number };

export function AreaChart({ series, height = 300 }: { series: Pt[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = 800, H = height, padL = 34, padR = 14, padT = 16, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(10, ...series.map((p) => Math.max(p.ai, p.team))) * 1.15;
  const n = series.length;

  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - (v / max) * ih;

  const AI = "var(--accent)";
  const TEAM = "#64748b";

  const linePath = (key: "ai" | "team") =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const areaPath = (key: "ai" | "team") =>
    `${linePath(key)} L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const yticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.max(1, Math.round(n / 6));

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = (e.clientX - rect.left) / rect.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((rel - padL) / (iw / Math.max(1, n - 1)))));
    setHover(i);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AI }} /> <span className="text-secondary">AI managed conversations</span></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM }} /> <span className="text-secondary">Team managed conversations</span></span>
      </div>
      <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Conversation productivity over time">
          <defs>
            <linearGradient id="aiFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="teamFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#64748b" stopOpacity="0.18" />
              <stop offset="1" stopColor="#64748b" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {yticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">{t}</text>
            </g>
          ))}
          <path d={areaPath("team")} fill="url(#teamFill)" />
          <path d={areaPath("ai")} fill="url(#aiFill)" />
          <path d={linePath("team")} fill="none" stroke={TEAM} strokeWidth="2" strokeLinejoin="round" />
          <path d={linePath("ai")} fill="none" stroke={AI} strokeWidth="2" strokeLinejoin="round" />
          {series.map((p, i) => i % labelEvery === 0 && (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">{p.date}</text>
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--border-strong)" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(series[hover].ai)} r="4" fill={AI} stroke="var(--surface)" strokeWidth="2" />
              <circle cx={x(hover)} cy={y(series[hover].team)} r="4" fill={TEAM} stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-[12px]"
            style={{
              left: `${(x(hover) / W) * 100}%`, top: 4, transform: "translateX(-50%)",
              background: "var(--surface-overlay)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)", whiteSpace: "nowrap",
            }}
          >
            <div className="mb-1 font-semibold">{series[hover].date}</div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: AI }} /> AI {series[hover].ai}</div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: TEAM }} /> Team {series[hover].team}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// pill option builders shared by screens
/* Status and priority ride the shared semantic tokens, so a pill reads the
   same way in both themes and never drifts from the rest of the console. */
export const STATUS_OPTIONS: PillOption[] = [
  { value: "open", label: "Open", color: "var(--info)" },
  { value: "in_progress", label: "In Progress", color: "var(--warning)" },
  { value: "pending", label: "Pending", color: "var(--chart-4)" },
  { value: "testing", label: "Testing", color: "var(--chart-1)" },
  { value: "resolved", label: "Resolved", color: "var(--success)" },
  { value: "closed", label: "Closed", color: "var(--success)" },
];

export const PRIORITY_OPTIONS: PillOption[] = [
  { value: "low", label: "Low", color: "var(--text-tertiary)" },
  { value: "normal", label: "Medium", color: "var(--warning)" },
  { value: "high", label: "High", color: "var(--accent)" },
  { value: "urgent", label: "Urgent", color: "var(--danger)" },
];

// ── interactive assignee picker (click + to assign anyone) ───────────────────
export function AssigneePicker({
  value, members, onChange, size = 26, align = "left",
}: { value: string[]; members: Member[]; onChange: (ids: string[]) => void; size?: number; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const selected = useMemo(() => members.filter((m) => value.includes(m.id)), [members, value]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="relative inline-flex items-center gap-1.5">
      {selected.length > 0 && <AssigneeStack members={selected} size={size} max={4} />}
      <button
        ref={ref}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center justify-center rounded-full border border-dashed transition-colors"
        style={{ width: size, height: size, borderColor: "var(--border-strong)", color: "var(--text-tertiary)" }}
        aria-label="Assign"
        aria-expanded={open}
        title="Assign to a team member"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </button>
      {/* portalled so the menu is never clipped by a scrolling pane */}
      <Popover open={open} anchor={ref} onClose={() => setOpen(false)} align={align === "right" ? "end" : "start"} width={224} label="Assign to">
        <div className="p-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="mono px-2.5 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Assign to</div>
          {members.length === 0 && (
            <p className="px-2.5 pb-2 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              No teammates yet — add one in Team.
            </p>
          )}
          <div className="max-h-64 overflow-y-auto">
            {members.map((m) => {
              const on = value.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <Avatar name={m.name} color={m.color} initials={m.initials} size={24} />
                  <span className="flex-1 truncate text-[13px]">{m.name}</span>
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded"
                    style={{ background: on ? "var(--accent)" : "transparent", border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}` }}
                  >
                    {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 6" stroke="var(--text-on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}
