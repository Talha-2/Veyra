import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InquiryForm } from "@/components/site/InquiryForm";

/* Contact — the pitch beside a console form. The form files straight into
   Veyra Desk (contact + lead + ticket) through the public intake endpoint. */

export const metadata: Metadata = {
  title: "Contact Veyra",
  description:
    "Tell us what you're building. A person reads every message and replies within one business day.",
};

const REACH: { tag: string; label: string; node: React.ReactNode; sub: string }[] = [
  {
    tag: "email",
    label: "Email us",
    node: (
      <a href="mailto:dev@z360.biz" style={{ color: "var(--accent)" }}>
        dev@z360.biz
      </a>
    ),
    sub: "Straight to the team building Veyra.",
  },
  {
    tag: "demo",
    label: "Book a live demo",
    node: (
      <Link href="/start" style={{ color: "var(--accent)" }}>
        Tell us your use case and pick a focus
      </Link>
    ),
    sub: "Same day where we can, no strings.",
  },
  {
    tag: "live",
    label: "Talk to the agent",
    node: (
      <Link href="/#demo" style={{ color: "var(--accent)" }}>
        Try the live voice demo on the home page
      </Link>
    ),
    sub: "Hear the sub-second, grounded answers yourself.",
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="band" style={{ paddingTop: "clamp(3.5rem, 7vw, 6rem)" }}>
        <div className="wrap">
          <div className="grid items-start gap-x-16 gap-y-12 md:grid-cols-2">
            {/* ── left: the pitch and the ways in ── */}
            <div>
              <h1 className="display-hero" style={{ fontSize: "clamp(2.2rem, 4.4vw, 3.4rem)", textWrap: "balance" }}>
                Let&rsquo;s get Veyra answering your calls.
              </h1>
              <p className="lead mt-6 max-w-[48ch]">
                Tell us what you are building and we will show you Veyra running on your real use
                case. Live callers, real workflows, the same day where we can. No slideware.
              </p>

              <div className="rows mt-10">
                {REACH.map((r) => (
                  <div key={r.tag} className="row" style={{ gridTemplateColumns: "72px 1fr" }}>
                    <span className="row__tag">{r.tag}</span>
                    <span>
                      <span className="row__title" style={{ fontSize: 15 }}>{r.label}</span>
                      <span className="row__body block">{r.node}</span>
                      <span className="block text-[12.5px]" style={{ color: "var(--text-tertiary)", marginTop: 2 }}>
                        {r.sub}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── right: the console form ── */}
            <div className="console">
              <div className="console__bar">
                <span className="console__dot" />
                contact — new message
              </div>
              <div className="console__body" style={{ padding: "clamp(20px, 3vw, 28px)" }}>
                <InquiryForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[16ch]">Prefer to just start?</h2>
          <p className="lead mx-auto mt-4 max-w-[42ch]">
            Spin up your first agent free and book time with us once you have something to show.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup" className="btn-mint">
              Start building free <ArrowRight />
            </Link>
            <Link href="/pricing" className="link-mono">
              See pricing <ArrowRight />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
