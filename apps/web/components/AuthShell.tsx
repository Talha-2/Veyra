"use client";

import Link from "next/link";
import MeshBg from "@/components/MeshBg";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

/* Centered auth card over the animated mesh — used by login/signup/forgot. */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <MeshBg variant="auth" />
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Veyra home">
          <Logo size={26} />
        </Link>
        <ThemeToggle />
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[420px]">
          <div className="mb-7 text-center">
            <h1 className="serif" style={{ fontSize: 32 }}>
              {title}
            </h1>
            {subtitle && <p className="text-secondary mt-2 text-[15px]">{subtitle}</p>}
          </div>
          <div className="card p-7" style={{ boxShadow: "var(--shadow-raised)" }}>
            {children}
          </div>
          {footer && <div className="text-secondary mt-6 text-center text-[14px]">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

export function GoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="btn btn-secondary w-full" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
      </svg>
      {label}
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
      <span className="text-tertiary text-[12px]">or</span>
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  );
}
