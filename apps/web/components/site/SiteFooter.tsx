import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

function Col({ head, links }: { head: string; links: [string, string][] }) {
  return (
    <div>
      <div className="site-footer__head">{head}</div>
      <ul className="space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="site-footer__link">
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
    <footer className="site-footer">
      <div className="wrap">
        <div className="grid gap-10 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <div className="site-nav__word">Veyra</div>
            <p className="mt-4 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              AI agents that answer, call, and close. One grounded brain across voice, chat, phone,
              and SMS.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a href={CALENDAR_URL} {...bookProps} className="btn-ember btn-ember--sm">
                Request a demo <ArrowRight />
              </a>
              <Link href="/signup" className="btn-mint btn-mint--sm">
                Sign up
              </Link>
            </div>
          </div>
          <Col
            head="Product"
            links={[
              ["Platform", "/platform"],
              ["Solutions", "/solutions"],
              ["Integrations", "/integrations"],
              ["Pricing", "/pricing"],
              ["Voice agents", "/platform#voice"],
              ["Deep agent", "/platform#agent"],
              ["Veyra Desk", "/platform#desk"],
            ]}
          />
          <Col
            head="Studio"
            links={[
              ["Overview", "/studio/overview"],
              ["Workflows", "/studio/workflows"],
              ["Knowledge base", "/studio/knowledge"],
              ["Telephony", "/studio/telephony"],
              ["Evals", "/studio/evals"],
            ]}
          />
          <Col
            head="Company"
            links={[
              ["About", "/company"],
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
          <p className="mono-tag mono-tag--dim" style={{ textTransform: "none", letterSpacing: "0.04em" }}>
            © 2026 Veyra. All rights reserved.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
