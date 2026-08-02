import Link from "next/link";
import { ArrowRight, CalendarDays, Code2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

function Col({ head, links }: { head: string; links: [string, string][] }) {
  return (
    <div>
      <div className="mono mb-4 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        {head}
      </div>
      <ul className="space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-[14px] transition-colors" style={{ color: "var(--text-secondary)" }}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer className="relative" style={{ marginTop: "2rem" }}>
      {/* a soft top wash instead of a hard divider — keeps the page one surface */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, transparent, color-mix(in srgb, var(--surface) 60%, transparent))",
        }}
      />
      <div className="wrap relative">
        <div className="grid gap-10 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo size={26} />
            <p className="text-secondary mt-4 text-[14px] leading-relaxed">
              AI agents that answer, call, and close. Voice and chat, grounded and sub-second, built for the
              conversations that break everything else.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <Link href="/signup" className="btn btn-gradient btn-sm">
                Get started <ArrowRight />
              </Link>
              <a href={CALENDAR_URL} {...bookProps} className="btn btn-secondary btn-sm">
                <CalendarDays /> Book a demo
              </a>
            </div>
          </div>
          <Col
            head="Product"
            links={[
              ["Platform", "/platform"],
              ["Solutions", "/solutions"],
              ["Integrations", "/integrations"],
              ["Voice agents", "/platform#voice"],
              ["Deep agent", "/platform#agent"],
              ["Telephony", "/platform#telephony"],
              ["Vera Desk", "/platform#desk"],
            ]}
          />
          <Col
            head="Studio"
            links={[
              ["Overview", "/studio/overview"],
              ["Workflows", "/studio/workflows"],
              ["Knowledge Base", "/studio/knowledge"],
              ["Telephony", "/studio/telephony"],
              ["Evals", "/studio/evals"],
            ]}
          />
          <Col
            head="Company"
            links={[
              ["About", "/company"],
              ["Pricing", "/pricing"],
              ["Contact", "/contact"],
              ["Docs", "/studio/developers"],
            ]}
          />
          <Col
            head="Legal"
            links={[
              ["Security", "/security"],
              ["Privacy", "#"],
              ["Terms", "#"],
            ]}
          />
        </div>
        <div
          className="flex flex-wrap items-center justify-between gap-4 py-6"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <p className="text-tertiary text-[13px]">© 2026 Vera. All rights reserved.</p>
          <div className="flex items-center gap-1">
            <a href="/studio/developers" className="btn btn-ghost btn-icon" aria-label="Developers">
              <Code2 />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
