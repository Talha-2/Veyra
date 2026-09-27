import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Contents } from "@/components/mk/company-parts";
import { Reveal } from "@/components/mk/motion";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using Veyra: what the service is, how usage is billed, acceptable use, and plain-language limits.",
};

/* Same treatment as /privacy: one readable column, a contents list that
   stays in view on desktop, no motion beyond the hero. The terms' words
   are unchanged; marked for counsel review before the first paid customer
   relies on them. */

/* the site resets link colour on every <a>, so the legal links carry theirs inline */
const LINK = { color: "var(--mk-ember-deep)", textDecoration: "underline", textDecorationThickness: 1, textUnderlineOffset: 4 } as const;

const SECTIONS: { id: string; label: string; title: string; body: React.ReactNode }[] = [
  {
    id: "the-service",
    label: "The service",
    title: "What Veyra is",
    body: (
      <p>
        Veyra provides AI agents that answer, place, and follow up on customer conversations
        across voice, chat, phone, and SMS, plus the tools to build and operate them (Veyra
        Studio and Veyra Desk). You configure what the agents may do; you remain responsible for
        how they are used with your customers.
      </p>
    ),
  },
  {
    id: "billing",
    label: "Billing",
    title: "Flat fee plus pass-through usage",
    body: (
      <p>
        The Starter plan is free. Paid plans bill a flat monthly fee. Usage — voice minutes,
        phone numbers, SMS — passes through at provider cost with no markup, metered and
        visible in your dashboard. You can cancel any time; billing stops at the end of the
        period.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    label: "Acceptable use",
    title: "What you may not do",
    body: (
      <p>
        No unlawful calling or messaging (including spam, robocall abuse, and impersonation), no
        harassment, no use that violates telecom regulations in the countries you call. We may
        suspend workspaces that put the platform or other customers at risk, and will tell you
        why.
      </p>
    ),
  },
  {
    id: "your-data",
    label: "Your data",
    title: "Yours, not ours",
    body: (
      <p>
        Your conversations, contacts, and documents remain yours. We process them only to run the
        service, as described in the{" "}
        <Link href="/privacy" className="font-medium" style={LINK}>privacy policy</Link>.
        You can export or delete them at any time.
      </p>
    ),
  },
  {
    id: "limits",
    label: "Limits",
    title: "Plain-language warranty",
    body: (
      <>
        <p>
          The service is provided as-is while it evolves. We work to keep it reliable — failover,
          graceful degradation, human handoff are built in — but we do not promise uninterrupted
          service, and our liability is limited to what you paid us in the preceding month.
        </p>
        <p>
          These terms will be reviewed by counsel as the product matures; material changes will be
          announced to your workspace email before they take effect.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
      <section className="pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="mk-wrap mk-wrap--text">
          <Reveal variant="rise">
            <p className="mk-eyebrow">Legal</p>
            <h1 className="mk-h1 mt-3">Terms of service</h1>
            <p className="mk-small mt-5">Last updated August 2026</p>
            <p className="mk-lead mt-6 max-w-[40ch]">The deal, in plain language. Five sections, no surprises.</p>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-[var(--mk-line)] pb-[clamp(88px,12vw,168px)]">
        <div className="mk-wrap grid gap-10 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,760px)_minmax(0,1fr)] lg:gap-0 lg:pt-16">
          <aside className="lg:pr-6">
            <div className="mk-wrap--text mx-auto lg:sticky lg:top-[calc(var(--mk-nav-h)+40px)] lg:mx-0"><Contents items={SECTIONS.map((s) => ({ id: s.id, title: s.label }))} /></div>
          </aside>
          <div className="min-w-0">
            {SECTIONS.map((s, i) => (
              <article key={s.id} id={s.id} className={`scroll-mt-[calc(var(--mk-nav-h)+32px)] py-10 ${i ? "border-t border-[var(--mk-line)]" : "pt-0"}`}>
                <p className="mk-kicker">{String(i + 1).padStart(2, "0")} · {s.label}</p>
                <h2 className="mk-h3 mt-3">{s.title}</h2>
                <div className="mk-body mt-5 flex flex-col gap-5">{s.body}</div>
              </article>
            ))}
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--mk-line)] pt-8">
              <Link href="/privacy" className="mk-link">Read the privacy policy <ChevronRight /></Link>
              <Link href="/contact" className="mk-link">Questions? Talk to us <ChevronRight /></Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
