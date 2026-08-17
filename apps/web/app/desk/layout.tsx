"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, ChevronsUpDown, Inbox, LayoutDashboard, LogOut, Menu, Plus,
  Search, Settings, Sparkles, Ticket, Users, UsersRound, X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui";
import { Toasts } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";

const NAV = [
  { href: "/desk", label: "Dashboard", icon: LayoutDashboard, exact: true, count: null },
  { href: "/desk/inbox", label: "Inbox", icon: Inbox, count: "inbox" },
  { href: "/desk/tickets", label: "Tickets", icon: Ticket, count: "tickets" },
  { href: "/desk/contacts", label: "Contacts", icon: Users, count: "contacts" },
  { href: "/desk/team", label: "Team", icon: UsersRound, count: null },
];

function WorkspaceSwitcher({ user }: { user: AuthUser | null }) {
  const [open, setOpen] = useState(false);
  const org = (user?.name || user?.email || "Your workspace").split("@")[0];
  return (
    <div className="workspace-switcher relative px-3 pt-3" onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-[10px] p-2 transition-colors"
        style={{ background: open ? "var(--surface-sunken)" : "transparent" }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: "var(--gradient-brand)" }}>
          <Sparkles size={16} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-semibold capitalize">{org}</span>
          <span className="block text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Admin · <span style={{ color: "var(--success)" }}>Active</span>
          </span>
        </span>
        <ChevronsUpDown size={15} className="text-tertiary" />
      </button>
      {open && (
        <div className="absolute inset-x-3 top-full z-50 mt-1 overflow-hidden rounded-[12px] p-1.5"
          style={{ background: "var(--surface-overlay)", border: "1px solid var(--border)", boxShadow: "var(--shadow-overlay)" }}>
          <div className="mono px-2.5 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Switch product</div>
          <div className="flex items-start gap-2.5 rounded-[9px] p-2.5" style={{ background: "var(--surface-sunken)" }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent-text)" }}><Inbox size={16} /></span>
            <div><div className="text-[13px] font-semibold">Veyra Desk</div><div className="text-tertiary text-[12px] leading-snug">Inbox, contacts, tickets, leads</div></div>
          </div>
          <Link href="/studio/overview" className="mt-0.5 flex items-start gap-2.5 rounded-[9px] p-2.5 transition-colors hover:bg-[var(--surface-sunken)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--voice-caller) 15%, transparent)", color: "var(--voice-caller)" }}><Sparkles size={16} /></span>
            <div><div className="text-[13px] font-semibold">Veyra Studio</div><div className="text-tertiary text-[12px] leading-snug">Build agents, voice, telephony</div></div>
          </Link>
        </div>
      )}
    </div>
  );
}

function Sidebar({ pathname, counts, user, onLogout }: { pathname: string | null; counts: Record<string, number>; user: AuthUser | null; onLogout: () => void }) {
  const isActive = (item: (typeof NAV)[number]) => (item.exact ? pathname === item.href : pathname?.startsWith(item.href));
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/desk" aria-label="Veyra Desk"><Logo size={24} suffix="DESK" /></Link>
      </div>
      <WorkspaceSwitcher user={user} />

      <button
        onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
        className="cmdk-trigger mx-3 mt-3 flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px]"
        style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", color: "var(--text-tertiary)" }}
      >
        <Search size={15} /> <span className="flex-1 text-left">Search</span>
        <kbd className="cmdk-trigger-kbd"><span style={{ fontSize: "1.1em" }}>⌘</span>K</kbd>
      </button>

      <Link href="/desk/contacts" className="btn btn-gradient mx-3 mt-3"><Plus size={16} /> New contact</Link>

      <nav className="mt-4 flex-1 overflow-y-auto px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`desk-nav-item ${isActive(item) ? "active" : ""}`}
            >
              <Icon strokeWidth={1.9} /> <span className="flex-1">{item.label}</span>
              {item.count && counts[item.count] > 0 && <span className="nav-count">{counts[item.count]}</span>}
            </Link>
          );
        })}

      </nav>

      {/* labels are wrapped so the icon-rail variant can hide them with CSS */}
      <div className="desk-foot border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <Link href="/desk/inbox" className="desk-nav-item" title="Notifications">
          <Bell strokeWidth={1.9} /> <span className="flex-1">Notifications</span>
        </Link>
        <Link href="/studio/telephony" className="desk-nav-item" title="Settings">
          <Settings strokeWidth={1.9} /> <span className="flex-1">Settings</span>
        </Link>
        <div className="desk-foot__user mt-1 flex items-center gap-2 px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent-text)" }} title={user?.email}>
            {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="desk-foot__email min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>{user?.email}</span>
          <ThemeToggle />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} aria-label="Sign out"><LogOut strokeWidth={1.75} /></button>
        </div>
      </div>
    </div>
  );
}

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status !== "authed") return;
    Promise.allSettled([
      api.get("/api/desk/contacts?per_page=1"), api.get("/api/desk/inbox"),
      api.get("/api/desk/tickets?status=open&per_page=1"),
    ]).then(([c, i, t]) => setCounts({
      contacts: c.status === "fulfilled" ? c.value.total : 0,
      inbox: i.status === "fulfilled" ? i.value.length : 0,
      tickets: t.status === "fulfilled" ? t.value.total : 0,
    }));
  }, [status, pathname]);

  useEffect(() => {
    if (status === "guest") router.replace(`/login?next=${encodeURIComponent(pathname ?? "/desk")}`);
  }, [status, pathname, router]);
  useEffect(() => setMobileOpen(false), [pathname]);

  const doLogout = () => { logout(); router.replace("/login"); };
  const flush = !!pathname?.startsWith("/desk/inbox");

  if (status !== "authed") {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3">
        <Spinner size={20} /><span className="text-secondary text-sm">{status === "loading" ? "Loading Veyra Desk…" : "Redirecting…"}</span>
      </main>
    );
  }

  // the inbox is a four-pane workbench — the app sidebar narrows to an icon rail
  // there so the panes get the width, and returns on every other desk page
  return (
    <div className={`desk-app min-h-screen md:grid ${flush ? "desk-app--rail" : "md:grid-cols-[256px_1fr]"}`}>
      <aside className="desk-sidebar sticky top-0 hidden h-screen md:block">
        <Sidebar pathname={pathname} counts={counts} user={user} onLogout={doLogout} />
      </aside>

      {mobileOpen && (
        <>
          <div className="scrim md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 md:hidden" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
            <Sidebar pathname={pathname} counts={counts} user={user} onLogout={doLogout} />
          </aside>
        </>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 px-4 md:hidden" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(true)} aria-label="Menu"><Menu /></button>
          <Logo size={22} suffix="DESK" />
        </header>
        {/* the inbox is a full-frame console — it owns the viewport, so no
            page padding and no page scroll for that route */}
        <main className={flush ? "desk-main--flush min-w-0" : "min-w-0 px-5 py-6 md:px-8 md:py-8"}>
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
