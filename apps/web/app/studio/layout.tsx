"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AudioLines,
  BookOpen,
  Bot,
  Code2,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  Plug,
  Search,
  Sparkles,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui";
import { Toasts } from "@/components/Toasts";
import CommandPalette from "@/components/CommandPalette";
import { api } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";

const NAV_GROUPS = [
  {
    label: "Build",
    items: [
      { href: "/studio/overview", label: "Overview", icon: LayoutDashboard, count: null },
      { href: "/studio/workflows", label: "Workflows", icon: Workflow, count: "workflows" },
      { href: "/studio/experts", label: "Experts", icon: Sparkles, count: "experts" },
      { href: "/studio/knowledge", label: "Knowledge Base", icon: BookOpen, count: "docs" },
    ],
  },
  {
    label: "Configure",
    items: [
      // Voices lives inside Voice, reachable from its section rail: two
      // top level entries for one subject was just duplication
      { href: "/studio/tuning", label: "Voice", icon: AudioLines, count: null },
      { href: "/studio/telephony", label: "Telephony", icon: Phone, count: "numbers" },
      { href: "/studio/integrations", label: "Integrations", icon: Plug, count: "tools" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { href: "/studio/executions", label: "Executions", icon: Activity, count: "runs" },
      { href: "/studio/evals", label: "Evals", icon: FlaskConical, count: null },
    ],
  },
  {
    label: "Develop",
    items: [
      { href: "/studio/agent", label: "Deep Agent", icon: Bot, count: null },
      { href: "/studio/developers", label: "API and webhooks", icon: Code2, count: null },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function UserRow({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  const initials = (user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-2.5 px-1 py-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
        style={{ background: "var(--accent-subtle)", color: "var(--accent-text)" }}
      >
        {user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          initials || "?"
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{user?.name || "Account"}</div>
        <div className="text-tertiary truncate text-[12px]">{user?.email}</div>
      </div>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} aria-label="Sign out" title="Sign out">
        <LogOut strokeWidth={1.75} />
      </button>
    </div>
  );
}

function SidebarContent({
  pathname,
  user,
  onLogout,
  counts,
}: {
  pathname: string | null;
  user: AuthUser | null;
  onLogout: () => void;
  counts: Record<string, number>;
}) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-4">
        <Link href="/" aria-label="Vera home">
          <Logo size={26} suffix="STUDIO" />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Studio">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="sidebar-group-label">{group.label}</div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href) ?? false;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-item ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon strokeWidth={1.5} />
                    <span className="flex-1">{item.label}</span>
                    {item.count && counts[item.count] > 0 && (
                      <span className="nav-count">{counts[item.count]}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        className="mt-auto shrink-0 px-3 pt-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link href="/desk" className="sidebar-item">
          <Inbox strokeWidth={1.5} />
          Open Vera Desk
        </Link>
        <Link href="/" className="sidebar-item">
          <ExternalLink strokeWidth={1.5} />
          View landing site
        </Link>
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <UserRow user={user} onLogout={onLogout} />
        </div>
      </div>
    </>
  );
}

function ApiHealthPill() {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api
        .get("/api/health")
        .then(() => {
          if (!cancelled) setHealthy(true);
        })
        .catch(() => {
          if (!cancelled) setHealthy(false);
        });
    };
    check();
    const timer = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const cls =
    healthy === true ? "badge-success" : healthy === false ? "badge-danger" : "";
  const text =
    healthy === true
      ? "API connected"
      : healthy === false
        ? "API offline"
        : "Checking API";

  return (
    <span className={`badge ${cls}`} role="status" aria-live="polite">
      <span className={`dot ${healthy === true ? "dot-pulse" : ""}`} />
      {text}
    </span>
  );
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // one pass for the rail badges: what exists, at a glance
  useEffect(() => {
    if (status !== "authed") return;
    Promise.allSettled([
      api.get("/api/abilities"), api.get("/api/experts"), api.get("/api/knowledge"),
      api.get("/api/integrations/connections"), api.get("/api/experts/executions/all?limit=50"),
      api.get("/api/telephony/numbers"),
    ]).then(([w, e, d, t, r, n]) => setCounts({
      workflows: w.status === "fulfilled" ? w.value.length : 0,
      experts: e.status === "fulfilled" ? e.value.length : 0,
      docs: d.status === "fulfilled" ? d.value.length : 0,
      tools: t.status === "fulfilled" ? t.value.filter((x: any) => x.status === "active").length : 0,
      runs: r.status === "fulfilled" ? r.value.length : 0,
      numbers: n.status === "fulfilled" ? n.value.length : 0,
    }));
  }, [status]);

  const current = ALL_ITEMS.find((item) => pathname?.startsWith(item.href));

  // login wall: bounce guests to sign-in, remembering where they were headed
  useEffect(() => {
    if (status === "guest") {
      const next = encodeURIComponent(pathname ?? "/studio");
      router.replace(`/login?next=${next}`);
    }
  }, [status, pathname, router]);

  // Close the off-canvas sheet whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const doLogout = () => {
    logout();
    router.replace("/login");
  };

  // all hooks above run unconditionally; the wall gates rendering only
  if (status !== "authed") {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3">
        <Spinner size={20} />
        <span className="text-secondary text-sm">
          {status === "loading" ? "Loading your studio…" : "Redirecting to sign in…"}
        </span>
      </main>
    );
  }

  return (
    <div className="studio-shell min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <style>{`@keyframes studio-sheet-in { from { transform: translateX(-100%); } to { transform: none; } }`}</style>

      {/* Desktop sidebar */}
      <aside
        className="sticky top-0 hidden h-screen flex-col md:flex"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <SidebarContent pathname={pathname} user={user} onLogout={doLogout} counts={counts} />
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <>
          <div
            className="scrim md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto md:hidden"
            style={{
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              animation: "studio-sheet-in 250ms var(--ease-entrance)",
            }}
          >
            <SidebarContent pathname={pathname} user={user} onLogout={doLogout} counts={counts} />
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 px-6"
          style={{
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="btn btn-ghost btn-icon -ml-2 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu strokeWidth={2} />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
              <span className="text-tertiary text-[13px]">Studio</span>
              <span className="text-tertiary text-[13px]" aria-hidden="true">
                /
              </span>
              <span className="truncate text-[13px] font-medium">
                {current?.label ?? "Overview"}
              </span>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="cmdk-trigger"
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
              aria-label="Open command palette"
            >
              <Search size={14} strokeWidth={1.75} />
              <span className="hidden sm:inline">Search</span>
              <kbd className="cmdk-trigger-kbd">
                <span style={{ fontSize: "1.1em" }}>⌘</span>K
              </kbd>
            </button>
            <ApiHealthPill />
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1">
          <div className="px-6 py-8 md:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette />
      <Toasts />
    </div>
  );
}
