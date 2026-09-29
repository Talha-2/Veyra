import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock } from "lucide-react";

import { VeyraMark } from "@/components/mk/brand";
import { InquiryForm } from "@/components/mk/inquiry-form";
import { SIGN_UP_URL, DEMO_URL, demoLinkProps } from "@/components/mk/links";
import { Reveal, Stagger } from "@/components/mk/motion";
import { Soon } from "@/components/mk/soon";

export const metadata: Metadata = {
  title: "Request a demo",
  description:
    "Book a 20-minute demo of Veyra configured for your business, or start free and set it up yourself. No credit card required.",
};

/* Start: where every "Request a demo" lands until a calendar link is
   configured. Two doors, side by side: a demo request that files into Veyra
   Desk, and self-serve sign-up. */

const SELF_SERVE: { line: string; soon?: boolean }[] = [
  { line: "Voice and chat on one agent" },
  { line: "Phone calls, texts and email", soon: true },
  { line: "Knowledge grounded in your business" },
  { line: "Try every skill in Studio before it goes live" },
  { line: "Free to start. No credit card required" },
];

const NEXT = [
  { n: "1", title: "We read it", body: "A person on the team reads your request, not an autoresponder." },
  { n: "2", title: "We set it up", body: "We configure Veyra with your business in it: your services, your hours, your questions." },
  { n: "3", title: "You hear it", body: "Twenty minutes on your real use case. The first thing you hear is the product, not a pitch." },
];

export default function StartPage() {
  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Request a demo</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[14ch]">See Veyra with your business in it.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[42ch]">Book a demo configured for your use case, or set it up yourself. Either way, the first thing you hear is the product, not a pitch.</p>
          </Reveal>
        </div>
      </section>

      {/* ── two doors ────────────────────────────────────────────────── */}
      <section className="pt-12 pb-[clamp(88px,12vw,168px)]">
        <div className="mk-wrap grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Reveal variant="pop" delay={120}>
            <div className="mk-card p-6 sm:p-10" style={{ boxShadow: "var(--mk-shadow-float)" }}>
              <span className="mk-pill mk-pill--ember">20 minutes</span>
              <h2 className="mk-h2 mt-4">Book a demo</h2>
              <p className="mk-body mt-3 max-w-[44ch]">Pick a time that suits you, or tell us a little about your business and we’ll show you Veyra configured for it, not a canned tour.</p>
              <a href={DEMO_URL} {...demoLinkProps} className="mk-btn mk-btn--primary mt-6 mb-8">Pick a time <ArrowRight /></a>
              <InquiryForm
                page="/start"
                topic="demo"
                pickTopic={false}
                messageLabel="Anything we should know?"
                messagePlaceholder="We run a three-location clinic. Mondays are the problem."
                submitLabel="Request my demo"
                successTitle="Demo request received."
              />
            </div>
          </Reveal>

          <Reveal variant="pop" delay={240} className="lg:sticky lg:top-[calc(var(--mk-nav-h)+24px)]">
            <div className="mk-card mk-card--night relative overflow-hidden p-6 sm:p-10">
              <div className="mk-breathe pointer-events-none absolute -right-24 -top-24 size-72 opacity-60" style={{ background: "var(--mk-glow)", filter: "blur(30px)" }} aria-hidden="true" />
              <div className="relative">
                <VeyraMark size={64} />
                <h2 className="mk-h2 mt-8">Start free</h2>
                <p className="mk-body mt-3">Set it up yourself. The full platform, free to start.</p>
                <ul className="mt-8 flex flex-col gap-4">
                  {SELF_SERVE.map(({ line, soon }) => (
                    <li key={line} className="flex items-start gap-3 text-[17px] leading-[1.45] text-[var(--mk-ink)]">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full" style={soon ? { background: "rgba(255,255,255,0.08)", color: "var(--mk-ink-3)" } : { background: "rgba(233,107,52,0.2)", color: "var(--mk-ember-soft)" }}>{soon ? <Clock size={14} strokeWidth={2.4} /> : <Check size={14} strokeWidth={2.6} />}</span>
                      <span>{line}{soon && <Soon inline />}</span>
                    </li>
                  ))}
                </ul>
                <a href={SIGN_UP_URL} className="mk-btn mk-btn--ember mt-10 w-full">Create your account <ArrowRight /></a>
                <p className="mk-small mt-4 text-center">No sales call required.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── what happens next ────────────────────────────────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-12 text-center">
            <Reveal><p className="mk-eyebrow">What happens next</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[18ch]">From request to hearing it.</h2></Reveal>
          </div>
          <Stagger className="grid gap-5 md:grid-cols-3" step={120}>
            {NEXT.map((s) => (
              <article key={s.n} className="mk-card mk-card-lift p-8 md:p-10">
                <span className="text-[clamp(64px,6vw,88px)] font-semibold leading-none tracking-[-0.05em] text-[var(--mk-ember)]">{s.n}</span>
                <h3 className="mk-h3 mt-6">{s.title}</h3>
                <p className="mk-body mt-3">{s.body}</p>
              </article>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap text-center">
          <Reveal><h2 className="mk-h1 mx-auto max-w-[16ch]">Want to see it work first?</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-5 max-w-[40ch]">Follow a real call from the first ring to the booking, then decide.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Link href="/" className="mk-btn mk-btn--ghost">Watch a call</Link>
            <Link href="/pricing" className="mk-link">See pricing <ChevronRight /></Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
