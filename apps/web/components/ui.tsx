"use client";

/* Shared UI primitives. Styling lives in globals.css classes — these wrap the
   recurring structural patterns so pages stay consistent. */

import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

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
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="title text-2xl">{title}</h1>
        {description && (
          <p className="text-secondary mt-1.5 max-w-2xl text-sm leading-relaxed">{description}</p>
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
    <section className={`card p-6 ${className}`}>
      {title && (
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="hint mt-1">{description}</p>}
        </div>
      )}
      {children}
    </section>
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
      <p className="text-secondary mt-1 max-w-[380px] text-sm leading-relaxed">{body}</p>
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
  // close only when the press starts AND ends on the scrim — a text-selection
  // drag that releases outside the dialog must not discard unsaved input
  const pressStartedOnScrim = useRef(false);
  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        pressStartedOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressStartedOnScrim.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal flex max-h-[86vh] flex-col"
        style={wide ? { maxWidth: 760 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ready" || status === "done" || status === "pass" || status === "enabled"
      ? "badge-success"
      : status === "error" || status === "failed" || status === "fail"
        ? "badge-danger"
        : status === "processing" || status === "running" || status === "pending" || status === "queued"
          ? "badge-warning"
          : "";
  return (
    <span className={`badge ${cls}`}>
      {(status === "processing" || status === "running") && <span className="dot dot-pulse" />}
      {status}
    </span>
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
