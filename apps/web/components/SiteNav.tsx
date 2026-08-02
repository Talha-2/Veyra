"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Bot,
  CalendarDays,
  ChevronDown,
  Inbox,
  Menu,
  Phone,
  Plug,
  Workflow,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const PRODUCTS: { icon: any; label: string; desc: string; href: string }[] = [
  { icon: AudioLines, label: "Voice agents", desc: "Sub-second calls that hold up with real callers", href: "/platform#voice" },
  { icon: Bot, label: "Deep agent", desc: "Describe your business, it builds and ships it", href: "/platform#agent" },
  { icon: Phone, label: "Telephony", desc: "Real numbers, calls to any country, and SMS", href: "/platform#telephony" },
  { icon: Workflow, label: "Workflows", desc: "Visual pathways wired to a thousand tools", href: "/platform#workflows" },
  { icon: Plug, label: "Integrations", desc: "A thousand tools connected with managed OAuth", href: "/integrations" },
  { icon: Inbox, label: "Vera Desk", desc: "One inbox for calls, texts, and email", href: "/platform#desk" },
];

const LINKS: [string, string][] = [
  ["Platform", "/platform"],
  ["Solutions", "/solutions"],
  ["Pricing", "/pricing"],
  ["Company", "/company"],
];

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bookExternal = CALENDAR_URL.startsWith("http");

  return (
    <nav
      className="nav-glass sticky top-0 z-50 transition-all duration-300"
      style={{
        borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
        boxShadow: scrolled ? "var(--shadow-card)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link href="/" aria-label="Vera home">
          <Logo size={28} />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {/* products mega-menu */}
          <div className="nav-menu relative">
            <button className="flex items-center gap-1 text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Products <ChevronDown size={14} />
            </button>
            <div className="nav-panel">
              {PRODUCTS.map((p) => (
                <Link key={p.label} href={p.href} className="nav-link2">
                  <span className="nav-link2__ic"><p.icon size={17} strokeWidth={1.9} /></span>
                  <div>
                    <b>{p.label}</b>
                    <p>{p.desc}</p>
                  </div>
                </Link>
              ))}
              <Link href="/studio" className="nav-link2">
                <span className="nav-link2__ic"><ArrowRight size={17} /></span>
                <div>
                  <b>Open the Studio</b>
                  <p>Build, tune, and ship from one workspace</p>
                </div>
              </Link>
            </div>
          </div>

          {LINKS.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="text-[14px] font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <a
            href={CALENDAR_URL}
            {...(bookExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="btn btn-ghost"
          >
            <CalendarDays /> Book a demo
          </a>
          <Link href="/login" className="btn btn-secondary">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-gradient">
            Get started <ArrowRight />
          </Link>
        </div>

        <button
          className="btn btn-ghost btn-icon md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu />
        </button>
      </div>

      {/* mobile sheet */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="scrim" onClick={() => setOpen(false)} style={{ position: "absolute" }} />
          <div
            className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col gap-1 overflow-y-auto p-5"
            style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <Logo size={26} />
              <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close">
                <X />
              </button>
            </div>
            <div className="mono mb-1 mt-2 px-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Products
            </div>
            {PRODUCTS.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5"
                style={{ color: "var(--text-secondary)" }}
              >
                <p.icon size={17} /> <span className="text-[15px] font-medium">{p.label}</span>
              </Link>
            ))}
            <div className="mono mb-1 mt-3 px-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Company
            </div>
            {LINKS.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-sm)] px-3 py-2.5 text-[15px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {label}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/login" className="btn btn-secondary w-full" onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-gradient w-full" onClick={() => setOpen(false)}>
                Get started <ArrowRight />
              </Link>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-tertiary text-sm">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
