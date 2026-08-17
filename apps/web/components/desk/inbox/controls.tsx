"use client";

/* List controls: how conversations are ordered, and what you can do to a
   selection of them at once. Both live above the list rather than inside a
   settings screen — ordering and triage are part of working the queue. */

import { useState } from "react";
import { Archive, ArrowDownUp, Check, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toasts";
import { Spinner } from "@/components/ui";
import { AssigneePicker, type Member } from "@/components/desk/kit";
import { Popover, useAnchor } from "@/components/desk/popover";
import type { Row } from "./types";

// ── sort ─────────────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { value: "last_at", label: "Last activity", hint: "Most recent message on the thread" },
  { value: "created_at", label: "Created date", hint: "When the thread first opened" },
  { value: "unread", label: "Unread first", hint: "Threads with unread mail on top" },
  { value: "count", label: "Message volume", hint: "Busiest threads first" },
  { value: "name", label: "Name", hint: "Alphabetical by contact" },
] as const;

export type SortBy = (typeof SORT_OPTIONS)[number]["value"];
export type SortDir = "asc" | "desc";
export const DEFAULT_SORT: { by: SortBy; dir: SortDir } = { by: "last_at", dir: "desc" };

export function sortRows(rows: Row[], by: SortBy, dir: SortDir): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (r: Row): string | number => {
    switch (by) {
      case "created_at": return r.created_at || r.last_at;
      case "unread": return r.unread;
      case "count": return r.count;
      case "name": return (r.contact.name || r.peer).toLowerCase();
      default: return r.last_at;
    }
  };
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    // name reads naturally ascending; every other key reads newest/most first
    const flip = by === "name" ? -sign : sign;
    if (ka === kb) return b.last_at.localeCompare(a.last_at);
    return (ka > kb ? 1 : -1) * flip;
  });
}

export function SortPopover({
  by, dir, onChange, onReset,
}: {
  by: SortBy;
  dir: SortDir;
  onChange: (by: SortBy, dir: SortDir) => void;
  onReset: () => void;
}) {
  const btn = useAnchor<HTMLButtonElement>();
  const active = by !== DEFAULT_SORT.by || dir !== DEFAULT_SORT.dir;
  const current = SORT_OPTIONS.find((o) => o.value === by);
  const label = active
    ? `Sorted by ${current?.label}, ${dir === "asc" ? "ascending" : "descending"}`
    : "Sort conversations";

  return (
    <>
      <button
        ref={btn.ref}
        className={`ibx-sortbtn ${active ? "on" : ""}`}
        onClick={btn.toggle}
        aria-expanded={btn.open}
        aria-label={label}
        title={label}
      >
        <ArrowDownUp size={15} />
      </button>
      {/* tall enough for all five options — a half-clipped last row reads as broken */}
      <Popover open={btn.open} anchor={btn.ref} onClose={btn.close} align="end" width={252} maxHeight={540} label="Sort conversations">
        <div className="srt">
          <div className="srt__head">
            <h2>Sort conversations</h2>
            <p>Applies to this view only.</p>
          </div>
          <div className="srt__body">
            <div className="srt__label">Direction</div>
            <div className="srt__seg" role="radiogroup" aria-label="Sort direction">
              {(["desc", "asc"] as SortDir[]).map((d) => (
                <button
                  key={d}
                  className={dir === d ? "on" : ""}
                  onClick={() => onChange(by, d)}
                  role="radio"
                  aria-checked={dir === d}
                >
                  {d === "desc" ? "Descending" : "Ascending"}
                </button>
              ))}
            </div>

            <div className="srt__label mt-3">Sort by</div>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`srt__opt ${o.value === by ? "on" : ""}`}
                onClick={() => onChange(o.value, dir)}
                role="radio"
                aria-checked={o.value === by}
              >
                <Check size={13} className={o.value === by ? "" : "invisible"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  <span className="srt__hint">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {active && (
            <div className="srt__foot">
              <button className="btn btn-ghost btn-sm" onClick={() => { onReset(); btn.close(); }}>
                Reset to last activity
              </button>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}

// ── bulk actions ─────────────────────────────────────────────────────────────
export function BulkBar({
  selected, rows, team, onClear, onDone,
}: {
  selected: Set<string>;
  rows: Row[];
  team: Member[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const peers = [...selected];
  if (peers.length === 0) return null;

  const picked = rows.filter((r) => selected.has(r.peer));
  const allClosed = picked.length > 0 && picked.every((r) => r.status === "closed");
  const allStarred = picked.length > 0 && picked.every((r) => r.is_favorite);

  const run = async (label: string, body: Record<string, unknown>, done: string) => {
    setBusy(label);
    try {
      await api.post("/api/desk/conversations/bulk", { peers, ...body });
      toast.success(done, { description: `${peers.length} conversation${peers.length === 1 ? "" : "s"}` });
      onClear();
      onDone();
    } catch (e: any) {
      toast.error("Bulk action failed", { description: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ibx-bulk" role="region" aria-label="Bulk actions">
      <span className="ibx-bulk__count">{peers.length}</span>
      <span className="ibx-bulk__label">selected</span>
      <span className="flex-1" />

      <AssigneePicker
        value={[]}
        members={team}
        onChange={(ids) => run("assign", { assignee_ids: ids }, "Assigned")}
        size={24}
        align="right"
      />
      <button
        className="ibx-bulk__act"
        onClick={() => run("star", { is_favorite: !allStarred }, allStarred ? "Unstarred" : "Starred")}
        disabled={busy !== null}
        title={allStarred ? "Remove from favorites" : "Add to favorites"}
      >
        {busy === "star" ? <Spinner size={13} /> : <Star size={14} className={allStarred ? "fill-current" : ""} />}
        {allStarred ? "Unstar" : "Star"}
      </button>
      <button
        className="ibx-bulk__act"
        onClick={() => run("archive", { status: allClosed ? "open" : "closed" }, allClosed ? "Reopened" : "Archived")}
        disabled={busy !== null}
        title={allClosed ? "Reopen these conversations" : "Archive these conversations"}
      >
        {busy === "archive" ? <Spinner size={13} /> : <Archive size={14} />}
        {allClosed ? "Reopen" : "Archive"}
      </button>
      <button className="ibx-bulk__x" onClick={onClear} aria-label="Clear selection">
        <X size={14} />
      </button>
    </div>
  );
}

export function BulkCheckbox({
  on, onToggle, label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      className={`ibx-check ${on ? "on" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onToggle(); }
      }}
    >
      {on && <Check size={11} strokeWidth={3.4} />}
    </span>
  );
}
