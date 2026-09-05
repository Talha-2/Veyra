import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Veyra",
  description:
    "The terms for using Veyra: what the service is, how usage is billed, acceptable use, and plain-language limits.",
};

/* Same prose treatment as /privacy (packet delta D2). Marked for counsel
   review before the first paid customer relies on it. */

const SECTIONS: { label: string; title: string; body: React.ReactNode }[] = [
  {
    label: "01 — the service",
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
    label: "02 — billing",
    title: "Flat fee plus pass-through usage",
    body: (
      <>
        <p>
          The Starter plan is free. Paid plans bill a flat monthly fee. Usage — voice minutes,
          phone numbers, SMS — passes through at provider cost with no markup, metered and
          visible in your dashboard. You can cancel any time; billing stops at the end of the
          period.
        </p>
      </>
    ),
  },
  {
    label: "03 — acceptable use",
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
    label: "04 — your data",
    title: "Yours, not ours",
    body: (
      <p>
        Your conversations, contacts, and documents remain yours. We process them only to run the
        service, as described in the privacy policy. You can export or delete them at any time.
      </p>
    ),
  },
  {
    label: "05 — limits",
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
    <section className="band" style={{ paddingTop: "clamp(3.5rem, 7vw, 6rem)" }}>
      <div className="wrap" style={{ maxWidth: 760 }}>
        <h1 className="display-hero" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", textWrap: "balance" }}>
          Terms of service
        </h1>
        <p className="mono-tag mono-tag--dim mt-4">Last updated — August 2026</p>
        <p className="lead mt-6 max-w-[52ch]">
          The deal, in plain language. Five sections, no surprises.
        </p>

        <div className="mt-12">
          {SECTIONS.map((s) => (
            <div key={s.label} className="py-8" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="mono-tag" style={{ color: "var(--accent-text)" }}>{s.label}</p>
              <h2 className="mt-3 text-[20px]" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
                {s.title}
              </h2>
              <div className="legal-prose mt-4 flex flex-col gap-4 text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: "68ch" }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
