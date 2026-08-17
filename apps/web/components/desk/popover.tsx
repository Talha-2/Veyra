"use client";

/* Anchored popover that escapes its container.

   The desk inbox is a fixed-height grid with `overflow: hidden` on the shell
   and `overflow-y: auto` on every pane, so an absolutely-positioned menu gets
   clipped the moment it reaches a pane edge. This renders through a portal at
   `position: fixed`, measured from the trigger's rect and re-measured on
   scroll/resize, so menus always sit whole on top of the app. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom";
type Align = "start" | "end" | "center";

const GAP = 6;
const EDGE = 10;

export function Popover({
  open,
  anchor,
  onClose,
  side = "bottom",
  align = "start",
  width,
  maxHeight = 420,
  className = "",
  label,
  children,
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  side?: Side;
  align?: Align;
  width?: number;
  maxHeight?: number;
  className?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; w: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const a = anchor.current;
    const p = panelRef.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const w = width ?? Math.max(r.width, 200);
    const h = p.offsetHeight || 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // flip when the preferred side has no room
    let top = side === "bottom" ? r.bottom + GAP : r.top - h - GAP;
    if (side === "bottom" && top + h > vh - EDGE && r.top - h - GAP > EDGE) top = r.top - h - GAP;
    if (side === "top" && top < EDGE && r.bottom + GAP + h < vh - EDGE) top = r.bottom + GAP;
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - h - EDGE));

    let left =
      align === "end" ? r.right - w : align === "center" ? r.left + r.width / 2 - w / 2 : r.left;
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - w - EDGE));

    setPos({ top, left, w });
  }, [anchor, align, side, width]);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    place();
    // a second pass once content has painted and the real height is known
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, place, children]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place, onClose, anchor]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={`pop ${className}`}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: pos?.w ?? width ?? 220,
        maxHeight,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Trigger + popover in one, for the common "button opens a menu" case. */
export function useAnchor<T extends HTMLElement = HTMLButtonElement>() {
  const ref = useRef<T>(null);
  const [open, setOpen] = useState(false);
  return { ref, open, setOpen, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}
