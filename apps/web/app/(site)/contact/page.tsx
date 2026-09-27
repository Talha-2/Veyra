import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, ChevronRight, Clock, LogIn, Mail, UserRound } from "lucide-react";

import { InquiryForm } from "@/components/mk/inquiry-form";
import { APP_URL } from "@/components/mk/links";
import { Reveal, Stagger } from "@/components/mk/motion";

export const metadata: Metadata = {
  title: "Contact",
  description: "Tell us what you’re building. A person reads every message and replies within one business day.",
};

/* Contact. The pitch and the ways in beside one large form; the form files
   straight into Veyra Desk through the app's public inquiry endpoint. */

const WAYS = [
  { icon: Mail, title: "Email us", body: "Straight to the team building Veyra.", link: { label: "trazzaq744@gmail.com", href: "mailto:trazzaq744@gmail.com" } },
  { icon: CalendarCheck, title: "Book a live demo", body: "Veyra on your real use case, the same day where we can.", link: { label: "Request a demo", href: "/start" } },
  { icon: LogIn, title: "Already a customer?", body: "Sign in to Veyra Desk and Studio.", link: { label: "Sign in", href: `${APP_URL}/login` } },
];

export default function ContactPage() {
  return (
    <>
      {/* ── hero: the pitch beside the form ──────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-[clamp(88px,12vw,168px)] md:pt-24">
        <div className="pointer-events-none absolute right-[-10%] top-[-10%] h-[720px] w-[720px] opacity-40 blur-3xl max-lg:hidden" style={{ background: "var(--mk-glow)" }} aria-hidden="true" />
        <div className="mk-wrap relative grid items-start gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="lg:sticky lg:top-[calc(var(--mk-nav-h)+48px)]">
            <Reveal variant="blur"><p className="mk-eyebrow">Contact</p></Reveal>
            <Reveal variant="rise" delay={80}><h1 className="mk-h1 mt-3 max-w-[13ch]">Let’s get Veyra answering your calls.</h1></Reveal>
            <Reveal variant="rise" delay={180}>
              <p className="mk-lead mt-6 max-w-[40ch]">Tell us what you’re building and we’ll show you Veyra running on your real use case. Live callers, real workflows. No slideware.</p>
            </Reveal>
            <Stagger className="mt-12 flex flex-col" step={100}>
              {WAYS.map((w) => (
                <div key={w.title} className="flex gap-5 border-t border-[var(--mk-line)] py-6">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}><w.icon size={22} /></span>
                  <div className="min-w-0">
                    <h2 className="mk-h4">{w.title}</h2>
                    <p className="mk-body mt-1">{w.body}</p>
                    {w.link.href.startsWith("/") ? (
                      <Link href={w.link.href} className="mk-link mt-2">{w.link.label} <ChevronRight /></Link>
                    ) : (
                      <a href={w.link.href} className="mk-link mt-2 break-all">{w.link.label} <ChevronRight /></a>
                    )}
                  </div>
                </div>
              ))}
            </Stagger>
          </div>

          <Reveal variant="pop" delay={200}>
            <div className="mk-card p-6 sm:p-10" style={{ boxShadow: "var(--mk-shadow-float)" }}>
              <h2 className="mk-h3">Send us a message</h2>
              <p className="mk-body mt-2 mb-8">Pick what it’s about and we’ll route it to the right person.</p>
              <InquiryForm page="/contact" topic="sales" submitLabel="Send message" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── what to expect ───────────────────────────────────────────── */}
      <section className="mk-section--tight mk-alt">
        <Stagger className="mk-wrap grid gap-10 text-center sm:grid-cols-3" step={110}>
          {[
            [UserRound, "A person reads it", "Not an autoresponder. Someone on the team building Veyra."],
            [Clock, "A reply within a business day", "From someone who has read what you wrote, not a canned sequence."],
            [Mail, "No lists, no noise", "We use your details to reply to you. We don’t sell them."],
          ].map(([Icon, t, b]) => {
            const I = Icon as typeof Mail;
            return (
              <div key={t as string} className="flex flex-col items-center">
                <I size={28} className="text-[var(--mk-ember)]" />
                <h3 className="mk-h4 mt-4">{t as string}</h3>
                <p className="mk-body mt-2 max-w-[30ch]">{b as string}</p>
              </div>
            );
          })}
        </Stagger>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap text-center">
          <Reveal><h2 className="mk-h1 mx-auto max-w-[16ch]">Prefer to just start?</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-5 max-w-[40ch]">Set up your first agent free and book time with us once you have something to show.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <a href={`${APP_URL}/register`} className="mk-btn mk-btn--primary">Get started free <ArrowRight /></a>
            <Link href="/pricing" className="mk-link">See pricing <ChevronRight /></Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
