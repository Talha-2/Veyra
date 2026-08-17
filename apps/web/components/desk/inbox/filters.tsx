"use client";

/* Inbox filtering — the facet model, the two-pane filter builder, the active
   filter chips, and saved views.

   Every facet here is backed by a field the desk API actually returns, so a
   saved view can never promise a filter the data can't honour. The whole list
   is fetched once and matched client-side: filtering is instant and the nav
   rail can show a live count beside every view. Views persist per browser
   under one localStorage key; swapping in a `/api/desk/views` endpoint later
   only means replacing `loadViews`/`saveViews`. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Filter as FilterIcon, Mail, MessageSquare, Phone, Printer,
  Search, Trash2, UserRound, X,
} from "lucide-react";
import type { Member } from "@/components/desk/kit";
import { Avatar } from "@/components/desk/kit";
import { Popover } from "@/components/desk/popover";
import type { Row } from "./types";

// ── the filter model ─────────────────────────────────────────────────────────
export type Filters = {
  channels: string[];   // email | call | sms | fax
  statuses: string[];   // open | snoozed | closed
  assignees: string[];  // member id, or "unassigned"
  stages: string[];     // contact pipeline stage
  read: string;         // "" | unread | read
  known: string;        // "" | known | unknown
  favorite: string;     // "" | favorites
  since: string;        // "" | 24h | 7d | 30d
};

export const EMPTY_FILTERS: Filters = {
  channels: [], statuses: [], assignees: [], stages: [], read: "", known: "", favorite: "", since: "",
};

export const countFilters = (f: Filters) =>
  f.channels.length + f.statuses.length + f.assignees.length + f.stages.length +
  (f.read ? 1 : 0) + (f.known ? 1 : 0) + (f.favorite ? 1 : 0) + (f.since ? 1 : 0);

export const sameFilters = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);

const SINCE_MS: Record<string, number> = { "24h": 864e5, "7d": 6048e5, "30d": 2592e6 };

/** Does one conversation survive the active filters? */
export function matchesFilters(r: Row, f: Filters): boolean {
  if (f.channels.length && !f.channels.some((c) => r.channels.includes(c))) return false;
  if (f.statuses.length && !f.statuses.includes(r.status)) return false;
  if (f.stages.length && !f.stages.includes(r.contact.stage)) return false;
  if (f.assignees.length) {
    const ids = r.assignees.map((a) => a.id);
    const wantsNone = f.assignees.includes("unassigned");
    const hit = f.assignees.some((id) => id !== "unassigned" && ids.includes(id));
    if (!(hit || (wantsNone && ids.length === 0))) return false;
  }
  if (f.read === "unread" && r.unread === 0) return false;
  if (f.read === "read" && r.unread > 0) return false;
  if (f.known === "known" && !r.contact.id) return false;
  if (f.known === "unknown" && r.contact.id) return false;
  if (f.favorite === "favorites" && !r.is_favorite) return false;
  if (f.since) {
    const ms = SINCE_MS[f.since];
    if (ms && Date.now() - new Date(r.last_at).getTime() > ms) return false;
  }
  return true;
}

export function matchesQuery(r: Row, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${r.contact.name} ${r.peer} ${r.last_text}`.toLowerCase().includes(s);
}

// ── facet definitions ────────────────────────────────────────────────────────
type Option = { value: string; label: string; hint?: string; icon?: any; member?: Member };
type Facet = {
  key: keyof Filters;
  label: string;
  multi: boolean;
  hint: string;
  options: (ctx: FacetCtx) => Option[];
};
type FacetCtx = { team: Member[]; rows: Row[] };

const STAGE_LABEL = (s: string) => s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const FACETS: Facet[] = [
  {
    key: "channels", label: "Channel", multi: true,
    hint: "Conversations that carry at least one of these channels.",
    options: () => [
      { value: "email", label: "Email", icon: Mail },
      { value: "call", label: "Calls", icon: Phone },
      { value: "sms", label: "SMS", icon: MessageSquare },
      { value: "fax", label: "Fax", icon: Printer },
    ],
  },
  {
    key: "statuses", label: "Status", multi: true,
    hint: "Where the conversation sits in your queue.",
    options: () => [
      { value: "open", label: "Open" },
      { value: "snoozed", label: "Snoozed" },
      { value: "closed", label: "Closed" },
    ],
  },
  {
    key: "assignees", label: "Assignee", multi: true,
    hint: "Who owns the conversation right now.",
    options: ({ team }) => [
      { value: "unassigned", label: "Unassigned", icon: UserRound },
      ...team.map((m) => ({ value: m.id, label: m.name, hint: m.role, member: m })),
    ],
  },
  {
    key: "read", label: "Read state", multi: false,
    hint: "Unread counts come from synced mailboxes.",
    options: () => [
      { value: "unread", label: "Unread only" },
      { value: "read", label: "Read only" },
    ],
  },
  {
    key: "known", label: "Contact", multi: false,
    hint: "Whether the peer is saved in your CRM.",
    options: () => [
      { value: "known", label: "Saved contacts" },
      { value: "unknown", label: "Unknown numbers & addresses" },
    ],
  },
  {
    key: "favorite", label: "Favorites", multi: false,
    hint: "Threads your team has starred.",
    options: () => [{ value: "favorites", label: "Starred only" }],
  },
  {
    key: "stages", label: "Pipeline stage", multi: true,
    hint: "Stage on the contact record.",
    options: ({ rows }) => {
      const seen = new Map<string, number>();
      for (const r of rows) {
        if (!r.contact.id) continue;
        seen.set(r.contact.stage, (seen.get(r.contact.stage) || 0) + 1);
      }
      return [...seen.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([v, n]) => ({ value: v, label: STAGE_LABEL(v), hint: `${n}` }));
    },
  },
  {
    key: "since", label: "Last message", multi: false,
    hint: "Based on the most recent activity on the thread.",
    options: () => [
      { value: "24h", label: "Last 24 hours" },
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" },
    ],
  },
];

/** Human-readable chips for whatever is currently active. */
export function activeChips(f: Filters, team: Member[]): { key: keyof Filters; value: string; label: string }[] {
  const name = (id: string) => (id === "unassigned" ? "Unassigned" : team.find((m) => m.id === id)?.name || id);
  const out: { key: keyof Filters; value: string; label: string }[] = [];
  const push = (key: keyof Filters, value: string, label: string) => out.push({ key, value, label });
  for (const c of f.channels) push("channels", c, c === "sms" ? "SMS" : c === "call" ? "Calls" : STAGE_LABEL(c));
  for (const s of f.statuses) push("statuses", s, STAGE_LABEL(s));
  for (const a of f.assignees) push("assignees", a, name(a));
  for (const s of f.stages) push("stages", s, STAGE_LABEL(s));
  if (f.read) push("read", f.read, f.read === "unread" ? "Unread only" : "Read only");
  if (f.known) push("known", f.known, f.known === "known" ? "Saved contacts" : "Unknown peers");
  if (f.favorite) push("favorite", f.favorite, "Starred only");
  if (f.since) push("since", f.since, { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days" }[f.since] || f.since);
  return out;
}

export function withoutValue(f: Filters, key: keyof Filters, value: string): Filters {
  const cur = f[key];
  if (Array.isArray(cur)) return { ...f, [key]: cur.filter((v) => v !== value) };
  return { ...f, [key]: "" };
}

// ── saved views (per-browser until a /api/desk/views endpoint exists) ────────
export type SavedView = { id: string; name: string; color: string; filters: Filters };

const VIEWS_KEY = "vera.desk.inbox.views";
export const VIEW_COLORS = [
  "var(--accent)", "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)",
];

export function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.id === "string" && typeof v.name === "string")
      .map((v) => ({ ...v, filters: { ...EMPTY_FILTERS, ...(v.filters || {}) } }));
  } catch {
    return [];
  }
}

export function saveViews(views: SavedView[]) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* private mode — views simply don't persist */
  }
}

// ── the builder ──────────────────────────────────────────────────────────────
export function FilterPanel({
  open, anchor, onClose, filters, onChange, team, rows, countOf, onSaveView,
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  team: Member[];
  rows: Row[];
  /** the caller's own predicate, so the preview always equals the real list */
  countOf: (f: Filters) => number;
  onSaveView: (name: string, color: string, filters: Filters) => void;
}) {
  const [facetKey, setFacetKey] = useState<keyof Filters>("channels");
  const [q, setQ] = useState("");
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewColor, setViewColor] = useState(VIEW_COLORS[0]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setNaming(false); setViewName(""); setQ(""); }
  }, [open]);
  useEffect(() => { if (naming) nameRef.current?.focus(); }, [naming]);

  const facet = FACETS.find((f) => f.key === facetKey)!;
  const ctx = useMemo(() => ({ team, rows }), [team, rows]);
  const options = useMemo(() => {
    const all = facet.options(ctx);
    const s = q.trim().toLowerCase();
    return s ? all.filter((o) => o.label.toLowerCase().includes(s)) : all;
  }, [facet, ctx, q]);

  const active = countFilters(filters);
  const preview = countOf(filters);

  const countFor = (key: keyof Filters) => {
    const v = filters[key];
    return Array.isArray(v) ? v.length : v ? 1 : 0;
  };

  const toggle = (value: string) => {
    if (facet.multi) {
      const cur = filters[facet.key] as string[];
      onChange({
        ...filters,
        [facet.key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
      });
    } else {
      onChange({ ...filters, [facet.key]: filters[facet.key] === value ? "" : value });
    }
  };

  const isOn = (value: string) => {
    const cur = filters[facet.key];
    return Array.isArray(cur) ? cur.includes(value) : cur === value;
  };

  const commitView = () => {
    const name = viewName.trim();
    if (!name) return;
    onSaveView(name, viewColor, filters);
    setNaming(false);
    setViewName("");
    onClose();
  };

  return (
    <Popover open={open} anchor={anchor} onClose={onClose} align="start" width={560} maxHeight={480} label="Filter conversations">
      <div className="fpanel">
        <div className="fpanel__facets">
          <div className="fpanel__eyebrow">Filter by</div>
          {FACETS.map((f) => {
            const n = countFor(f.key);
            return (
              <button
                key={f.key}
                className={`fpanel__facet ${f.key === facetKey ? "active" : ""}`}
                onClick={() => { setFacetKey(f.key); setQ(""); }}
              >
                <span className="flex-1 truncate">{f.label}</span>
                {n > 0 && <span className="fpanel__badge">{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="fpanel__options">
          <div className="fpanel__optionhead">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{facet.label}</div>
              <p className="text-tertiary mt-0.5 text-[11.5px] leading-snug">{facet.hint}</p>
            </div>
            {facet.options(ctx).length > 6 && (
              <div className="fpanel__search">
                <Search size={13} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${facet.label.toLowerCase()}…`}
                  aria-label={`Search ${facet.label}`}
                />
              </div>
            )}
          </div>

          <div className="fpanel__optionlist">
            {options.length === 0 && (
              <p className="text-tertiary px-1 py-6 text-center text-[12.5px]">
                Nothing to filter by yet — this fills in as conversations arrive.
              </p>
            )}
            {options.map((o) => {
              const on = isOn(o.value);
              const Icon = o.icon;
              return (
                <button
                  key={o.value}
                  className={`fopt ${on ? "on" : ""}`}
                  onClick={() => toggle(o.value)}
                  role={facet.multi ? "checkbox" : "radio"}
                  aria-checked={on}
                >
                  <span className={`fopt__box ${facet.multi ? "" : "round"}`}>
                    {on && <Check size={11} strokeWidth={3.2} />}
                  </span>
                  {o.member ? (
                    <Avatar name={o.member.name} color={o.member.color} initials={o.member.initials} size={20} />
                  ) : Icon ? (
                    <Icon size={14} />
                  ) : null}
                  <span className="flex-1 truncate text-left">{o.label}</span>
                  {o.hint && <span className="fopt__hint">{o.hint}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="fpanel__foot">
          {naming ? (
            <>
              <div className="fpanel__swatches" role="radiogroup" aria-label="View color">
                {VIEW_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`fpanel__swatch ${c === viewColor ? "on" : ""}`}
                    style={{ background: c }}
                    onClick={() => setViewColor(c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={c === viewColor}
                  />
                ))}
              </div>
              <input
                ref={nameRef}
                className="input"
                style={{ height: 30, fontSize: 12.5, flex: 1, minWidth: 120 }}
                placeholder="Name this view…"
                value={viewName}
                maxLength={32}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitView();
                  if (e.key === "Escape") { e.stopPropagation(); setNaming(false); }
                }}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setNaming(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={commitView} disabled={!viewName.trim()}>Save view</button>
            </>
          ) : (
            <>
              <span className="text-tertiary text-[12px]">
                {active === 0
                  ? "No filters — showing every conversation."
                  : `${preview} of ${rows.length} conversation${rows.length === 1 ? "" : "s"} match.`}
              </span>
              <span className="flex-1" />
              <button className="btn btn-ghost btn-sm" onClick={() => onChange(EMPTY_FILTERS)} disabled={active === 0}>
                Clear all
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setNaming(true)} disabled={active === 0}>
                Save as view
              </button>
            </>
          )}
        </div>
      </div>
    </Popover>
  );
}

// ── the chip strip above the conversation list ───────────────────────────────
export function FilterChips({
  filters, team, onChange, savedName, onDeleteView,
}: {
  filters: Filters;
  team: Member[];
  onChange: (f: Filters) => void;
  savedName?: string;
  onDeleteView?: () => void;
}) {
  const chips = activeChips(filters, team);
  if (chips.length === 0) return null;
  return (
    <div className="ibx-chips">
      {savedName && (
        <span className="ibx-fchip ibx-fchip--view">
          <FilterIcon size={11} /> {savedName}
          {onDeleteView && (
            <button onClick={onDeleteView} aria-label={`Delete the ${savedName} view`} title="Delete this view">
              <Trash2 size={11} />
            </button>
          )}
        </span>
      )}
      {chips.map((c) => (
        <span key={`${c.key}:${c.value}`} className="ibx-fchip">
          {c.label}
          <button onClick={() => onChange(withoutValue(filters, c.key, c.value))} aria-label={`Remove filter ${c.label}`}>
            <X size={11} />
          </button>
        </span>
      ))}
      <button className="ibx-fchip ibx-fchip--clear" onClick={() => onChange(EMPTY_FILTERS)}>
        Clear all
      </button>
    </div>
  );
}
