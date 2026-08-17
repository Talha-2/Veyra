"use client";

/* Resizable pane group with persisted widths.

   The inbox is a workbench: how much room the list, thread, and context rail
   each get is the operator's call, not ours, and it should survive a reload.
   This is a small hand-rolled group rather than a dependency — it only has to
   do one thing (horizontal panes inside a fixed-height shell) and it has to do
   it with a keyboard.

   Sizes are stored as fractions of the group's width so the layout scales with
   the window. Panes declare min/max in px; a drag clamps against those and
   redistributes the delta between the two neighbours it sits between. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type PaneSpec = {
  id: string;
  /** starting fraction of the group width, 0–1 */
  initial: number;
  min: number;
  max?: number;
  /** collapsible panes snap to 0 and can be toggled from outside */
  collapsible?: boolean;
};

type Sizes = Record<string, number>;

const readStored = (key: string): Sizes | null => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Sizes) : null;
  } catch {
    return null;
  }
};

/** Normalize so the visible panes' fractions sum to 1. */
function normalize(sizes: Sizes, panes: PaneSpec[], collapsed: Set<string>): Sizes {
  const open = panes.filter((p) => !collapsed.has(p.id));
  const total = open.reduce((n, p) => n + (sizes[p.id] ?? p.initial), 0) || 1;
  const out: Sizes = {};
  for (const p of panes) out[p.id] = collapsed.has(p.id) ? 0 : (sizes[p.id] ?? p.initial) / total;
  return out;
}

export function usePaneGroup(storageKey: string, panes: PaneSpec[], collapsedIds: string[] = []) {
  const collapsed = new Set(collapsedIds);
  const [sizes, setSizes] = useState<Sizes>(() => {
    const base: Sizes = {};
    for (const p of panes) base[p.id] = p.initial;
    return base;
  });
  const [ready, setReady] = useState(false);

  // hydrate after mount so SSR and the first client paint agree
  useEffect(() => {
    const stored = readStored(storageKey);
    if (stored) {
      setSizes((cur) => {
        const merged = { ...cur };
        for (const p of panes) if (typeof stored[p.id] === "number") merged[p.id] = stored[p.id];
        return merged;
      });
    }
    setReady(true);
    // panes are a static declaration; the key identifies the layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const commit = useCallback(
    (next: Sizes) => {
      setSizes(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* private mode — the layout just won't persist */
      }
    },
    [storageKey],
  );

  return { sizes: normalize(sizes, panes, collapsed), commit, ready, collapsed };
}

export function PaneGroup({
  panes,
  sizes,
  onResize,
  collapsed,
  children,
  className = "",
  label,
}: {
  panes: PaneSpec[];
  sizes: Sizes;
  onResize: (next: Sizes) => void;
  collapsed: Set<string>;
  children: React.ReactNode[];
  className?: string;
  label?: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const drag = useRef<{ index: number; startX: number; a: number; b: number } | null>(null);

  useLayoutEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const visible = panes.filter((p) => !collapsed.has(p.id));

  /** Move the boundary after `visible[index]` by `dx` px. */
  const move = useCallback(
    (index: number, dx: number, from: { a: number; b: number }) => {
      if (!width) return;
      const A = visible[index];
      const B = visible[index + 1];
      if (!A || !B) return;

      const aPx = from.a * width + dx;
      const bPx = from.b * width - dx;
      const aMin = A.min;
      const aMax = A.max ?? Infinity;
      const bMin = B.min;
      const bMax = B.max ?? Infinity;

      // clamp the delta so neither neighbour breaks its own bounds
      let a = Math.min(Math.max(aPx, aMin), aMax);
      let b = from.a * width + from.b * width - a;
      if (b < bMin) {
        b = bMin;
        a = from.a * width + from.b * width - b;
      } else if (b > bMax) {
        b = bMax;
        a = from.a * width + from.b * width - b;
      }
      if (a < aMin) return;

      onResize({ ...sizes, [A.id]: a / width, [B.id]: b / width });
    },
    [visible, width, sizes, onResize],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      e.preventDefault();
      move(d.index, e.clientX - d.startX, { a: d.a, b: d.b });
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [move]);

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    const A = visible[index];
    const B = visible[index + 1];
    if (!A || !B) return;
    drag.current = { index, startX: e.clientX, a: sizes[A.id], b: sizes[B.id] };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // arrow keys nudge a boundary 16px at a time; Home/End jump to the min
  const onHandleKey = (index: number) => (e: React.KeyboardEvent) => {
    const A = visible[index];
    const B = visible[index + 1];
    if (!A || !B) return;
    const step = e.shiftKey ? 64 : 16;
    const from = { a: sizes[A.id], b: sizes[B.id] };
    if (e.key === "ArrowLeft") { e.preventDefault(); move(index, -step, from); }
    else if (e.key === "ArrowRight") { e.preventDefault(); move(index, step, from); }
    else if (e.key === "Home") { e.preventDefault(); move(index, -(width || 0), from); }
    else if (e.key === "End") { e.preventDefault(); move(index, width || 0, from); }
  };

  const nodes = children.filter(Boolean);

  return (
    <div ref={groupRef} className={`pane-group ${className}`} role="group" aria-label={label}>
      {visible.map((p, i) => {
        const idx = panes.findIndex((x) => x.id === p.id);
        const A = visible[i];
        const B = visible[i + 1];
        return (
          <div key={p.id} className="contents">
            <div
              className="pane"
              data-pane={p.id}
              style={{ width: `${(sizes[p.id] * 100).toFixed(4)}%`, minWidth: p.min }}
            >
              {nodes[idx]}
            </div>
            {B && (
              <div
                className="pane-handle"
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label={`Resize ${A.id} pane`}
                aria-valuenow={Math.round(sizes[p.id] * 100)}
                aria-valuemin={width ? Math.round((p.min / width) * 100) : 0}
                aria-valuemax={width && p.max ? Math.round((p.max / width) * 100) : 100}
                onPointerDown={startDrag(i)}
                onKeyDown={onHandleKey(i)}
                onDoubleClick={() => onResize({ ...sizes, [A.id]: A.initial, [B.id]: B.initial })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
