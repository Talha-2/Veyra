import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { InquiryForm } from "@/components/site/InquiryForm";

/* Start — the one branded conversion surface. Every "Request a demo" resolves
   here until an external booking link exists (NEXT_PUBLIC_CALENDAR_URL).
   Two doors: a demo form that files into Veyra Desk, and self-serve signup.
   The form is the page; no other visuals (packet delta D1). */

export const metadata: Metadata = {
  title: "Book a Veyra Demo or Start Free",
  description:
    "Book a 20-minute demo of Veyra configured for your business, or start free and set it up yourself. No credit card required.",
};

const SELF_SERVE = [
  "Voice and chat agents, visual workflow builder",
  "Knowledge base grounded in your business",
  "The live demo playground, no phone line needed",
  "Free to start. No credit card required",
];

export default function StartPage() {
  return (
    <>
      <section className="band" style={{ paddingTop: "clamp(3.5rem, 7vw, 6rem)" }}>
        <div className="wrap">
          <div className="text-center">
            <h1 className="display-hero mx-auto max-w-[22ch]" style={{ fontSize: "clamp(2.2rem, 4.4vw, 3.4rem)", textWrap: "balance" }}>
              See Veyra with your business in it.
            </h1>
            <p className="lead mx-auto mt-6 max-w-[52ch]">
              Book a demo configured for your use case, or set it up yourself. Either way, the
              first thing you hear is the product, not a pitch.
            </p>
          </div>

          <div className="mt-12 grid items-start gap-8 md:grid-cols-2">
            {/* ── door one: the demo form ── */}
            <div className="console">
              <div className="console__bar">
                <span className="console__dot" />
                start — book a demo
              </div>
              <div className="console__body" style={{ padding: "clamp(20px, 3vw, 28px)" }}>
                <h2 className="text-[20px]" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
                  Book a 20-minute demo
                </h2>
                <p className="mt-2 mb-7 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Tell us a little about your business and we&rsquo;ll show you Veyra configured
                  for it, not a canned tour.
                </p>
                <InquiryForm
                  topics={[
                    "Answering our phones",
                    "Following up with leads",
                    "A specific workflow",
                    "Something else",
                  ]}
                  defaultTopic="Answering our phones"
                  messageLabel="Anything we should know?"
                  messagePlaceholder="We run a three-location clinic. Mondays are the problem."
                  submitLabel="Book my demo"
                  successTitle="Demo request received."
                  showPhone
                />
              </div>
            </div>

            {/* ── door two: self-serve ── */}
            <div className="console">
              <div className="console__bar">
                <span className="console__dot" />
                start — free
              </div>
              <div className="console__body flex flex-col" style={{ padding: "clamp(20px, 3vw, 28px)" }}>
                <h2 className="text-[20px]" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
                  Start building free
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Set it up yourself. The full platform, free to start.
                </p>
                <ul className="mt-7 flex flex-col gap-3.5">
                  {SELF_SERVE.map((line) => (
                    <li key={line} className="flex items-start gap-3 text-[14px]" style={{ color: "var(--text-secondary)" }}>
                      <span className="check-sq" style={{ width: 20, height: 20, flexShrink: 0 }}>
                        <Check size={12} strokeWidth={2.6} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link href="/signup" className="btn-mint w-full">
                    Create your account <ArrowRight />
                  </Link>
                  <p className="mt-4 text-center text-[12.5px]" style={{ color: "var(--text-tertiary)" }}>
                    No sales call required.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── the proof path ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[20ch]">Want proof before either?</h2>
          <p className="lead mx-auto mt-4 max-w-[42ch]">
            Veyra is answering live on the home page. Talk to it first, then decide.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/#demo" className="btn-ember">
              Talk to Veyra live <ArrowRight />
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
