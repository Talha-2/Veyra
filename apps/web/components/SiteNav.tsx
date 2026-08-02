"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

/* Console nav: text wordmark left, wide-tracked mono links center, the
   Ember/Mint pill pair right. One near-white hairline under the bar. */

const LINKS: [string, string][] = [
  ["Platform", "/platform"],
  ["Solutions", "/solutions"],
  ["Integrations", "/integrations"],
  ["Pricing", "/pricing"],
  ["Company", "/company"],
];

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const bookExternal = CALENDAR_URL.startsWith("http");
  const bookProps = bookExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};

  // close the sheet on navigation
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav className="site-nav">
      <div className="wrap site-nav__row">
        <Link href="/" aria-label="Vera home" className="site-nav__word">
          Vera
        </Link>

        <div className="site-nav__links hidden md:flex">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="site-nav__link"
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <ThemeToggle />
          <Link href="/login" className="site-nav__link">
            Sign in
          </Link>
          <a href={CALENDAR_URL} {...bookProps} className="btn-ember btn-ember--sm">
            Request a demo
          </a>
          <Link href="/signup" className="btn-mint btn-mint--sm">
            Sign up
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

      {/* mobile: the console goes full-bleed */}
      {open && (
        <div className="site-menu md:hidden">
          <div className="site-nav__row" style={{ marginBottom: 8 }}>
            <span className="site-nav__word">Vera</span>
            <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close menu">
              <X />
            </button>
          </div>
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="site-menu__link" onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <Link href="/login" className="site-menu__link" onClick={() => setOpen(false)}>
            Sign in
          </Link>
          <div className="mt-8 flex flex-col gap-3">
            <a href={CALENDAR_URL} {...bookProps} className="btn-ember w-full" onClick={() => setOpen(false)}>
              Request a demo <ArrowRight />
            </a>
            <Link href="/signup" className="btn-mint w-full" onClick={() => setOpen(false)}>
              Sign up
            </Link>
            <div className="mt-4 flex items-center justify-between">
              <span className="mono-tag--dim mono-tag">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
