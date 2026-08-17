"use client";

/* Veyra's shared primitives — now backed by shadcn internals.

   Every prop API here is unchanged, because 36 files import this module and
   none of them should have to care that Modal is a real dialog now. What
   changed is what they get for free:

   • Modal was a hand-rolled div with aria-modal and nothing else — no focus
     trap, no Escape, no scroll lock, no restore-focus-on-close. It is now a
     Base UI Dialog, so keyboard and screen-reader users can actually leave it.
     The one bespoke behaviour worth keeping is preserved: a text-selection
     drag that starts inside and releases on the scrim must NOT discard the
     form, so dismissal is gated on the press starting on the scrim.
   • SectionCard and StatusBadge now render the shared Card and Badge, so a
     panel on the tickets page and a panel in the inbox are the same object.
   • PageHeader keeps its layout but stops relying on `.text-secondary`, which
     the Tailwind bridge can shadow. */

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { Badge } from "./badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./dialog";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="title text-2xl">{title}</h1>
        {description && (
          <p
            className="mt-1.5 max-w-2xl text-sm leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center"
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
        }}
      >
        <Icon size={22} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-[380px] text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {body}
      </p>
      {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  /* Call sites render <Modal> conditionally rather than passing `open`, so the
     dialog opens on mount and any close path routes back through onClose. */
  const [open, setOpen] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);
  const pressBeganInside = useRef(false);

  useEffect(() => {
    if (!open) onClose();
  }, [open, onClose]);

  /* The drag-select guard, kept from the hand-rolled version: selecting text
     inside the dialog and releasing on the scrim must not discard the form.
     Base UI reports the close, so the press ORIGIN is what has to be tracked —
     recorded on the way down (capture) and cleared once the gesture ends, so a
     later Escape or close button is never swallowed. */
  useEffect(() => {
    const down = (e: PointerEvent) => {
      pressBeganInside.current = !!popupRef.current?.contains(e.target as Node);
    };
    const up = () => {
      // clear after the close signal has had a chance to fire
      setTimeout(() => { pressBeganInside.current = false; }, 0);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
    };
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next && pressBeganInside.current) return;
        setOpen(next);
      }}
    >
      <DialogContent
        ref={popupRef}
        /* this Modal supplies its own header close button, so suppress the
           built-in absolutely-positioned one — otherwise every dialog in the
           app renders two X buttons stacked in the same corner */
        showCloseButton={false}
        aria-modal="true"
        className="flex max-h-[86vh] flex-col"
        style={wide ? { maxWidth: 760 } : undefined}
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogClose
            className="btn btn-ghost btn-icon btn-sm shrink-0"
            aria-label="Close"
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

const BADGE_TONE: Record<string, "secondary" | "destructive" | "outline"> = {
  ready: "secondary", done: "secondary", pass: "secondary", enabled: "secondary",
  error: "destructive", failed: "destructive", fail: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  const busy = status === "processing" || status === "running";
  /* keep the semantic tint classes — they carry Veyra's success/warn/danger
     tokens, which shadcn's variants don't know about */
  const tint =
    BADGE_TONE[status] === "secondary" ? "badge-success"
    : BADGE_TONE[status] === "destructive" ? "badge-danger"
    : busy || status === "pending" || status === "queued" ? "badge-warning"
    : "";
  return (
    <Badge variant="outline" className={`badge ${tint}`}>
      {busy && <span className="dot dot-pulse" />}
      {status}
    </Badge>
  );
}

/* Loading placeholder for a table or list.

   A spinner parked in the middle of content tells you nothing about what is
   arriving and makes the layout jump when it does. This holds the shape of the
   rows instead, so the page lands where the eye already is. Column widths vary
   deterministically (no Math.random — it would reshuffle on every render and
   flicker), and the whole thing is hidden from assistive tech behind the
   caller's own aria-busy. */
export function TableSkeleton({
  rows = 8,
  columns = [34, 22, 14, 16, 14],
}: {
  rows?: number;
  /** relative column widths, in percent */
  columns?: number[];
}) {
  return (
    <div className="table-skel" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="table-skel__row">
          {columns.map((w, c) => (
            <span
              key={c}
              className="sk"
              style={{
                width: `${Math.max(8, w - ((r * 7 + c * 11) % 9))}%`,
                height: 10,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
      style={{ animation: "spin 0.9s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="var(--border-strong)" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
