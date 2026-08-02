"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Send } from "lucide-react";
import { Spinner } from "@/components/ui";

/* Contact — the pitch beside a console form. */

type Status = "idle" | "sending" | "sent";

const REACH: { tag: string; label: string; node: React.ReactNode; sub: string }[] = [
  {
    tag: "email",
    label: "Email us",
    node: (
      <a href="mailto:dev@z360.biz" style={{ color: "var(--accent)" }}>
        dev@z360.biz
      </a>
    ),
    sub: "Straight to the team building Vera.",
  },
  {
    tag: "demo",
    label: "Book a live demo",
    node: <span>Grab a slot and we will walk Vera through your exact workflows.</span>,
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
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  const sending = status === "sending";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setStatus("sending");
    // No backend here — simulate a successful send locally.
    setTimeout(() => setStatus("sent"), 800);
  }

  return (
    <>
      <section className="band" style={{ paddingTop: "clamp(3.5rem, 7vw, 6rem)" }}>
        <div className="wrap">
          <div className="grid items-start gap-x-16 gap-y-12 md:grid-cols-2">
            {/* ── left: the pitch and the ways in ── */}
            <div>
              <h1 className="display-hero" style={{ fontSize: "clamp(2.2rem, 4.4vw, 3.4rem)", textWrap: "balance" }}>
                Let&rsquo;s get Vera answering your calls.
              </h1>
              <p className="lead mt-6 max-w-[48ch]">
                Tell us what you are building and we will show you Vera running on your real use
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
                {status === "sent" ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <span className="check-sq" style={{ width: 44, height: 44, borderRadius: "var(--radius-md)" }}>
                      <Check size={22} strokeWidth={2.4} />
                    </span>
                    <h2 className="mt-6 text-[24px]" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
                      Thanks — we will be in touch.
                    </h2>
                    <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Your note is in. Expect a reply within one business day, from a real person
                      who has read it.
                    </p>
                    <Link href="/" className="btn-mint mt-8">
                      Back to site
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} aria-busy={sending}>
                    <div className="mb-5">
                      <label className="field-label" htmlFor="cf-name">
                        Name
                      </label>
                      <input
                        id="cf-name"
                        name="name"
                        className="field"
                        type="text"
                        autoComplete="name"
                        placeholder="Jordan Rivera"
                        required
                        disabled={sending}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="mb-5">
                      <label className="field-label" htmlFor="cf-email">
                        Work email
                      </label>
                      <input
                        id="cf-email"
                        name="email"
                        className="field"
                        type="email"
                        autoComplete="email"
                        placeholder="jordan@company.com"
                        required
                        disabled={sending}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    <div className="mb-5">
                      <label className="field-label" htmlFor="cf-company">
                        Company <span style={{ color: "var(--text-tertiary)" }}>(optional)</span>
                      </label>
                      <input
                        id="cf-company"
                        name="company"
                        className="field"
                        type="text"
                        autoComplete="organization"
                        placeholder="Acme Inc."
                        disabled={sending}
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </div>

                    <div className="mb-7">
                      <label className="field-label" htmlFor="cf-message">
                        What are you building?
                      </label>
                      <textarea
                        id="cf-message"
                        name="message"
                        className="field"
                        rows={4}
                        placeholder="A voice agent that books appointments and answers billing questions after hours."
                        disabled={sending}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                    </div>

                    <button type="submit" className="btn-ember w-full" disabled={sending}>
                      {sending ? (
                        <>
                          <Spinner size={14} /> Sending
                        </>
                      ) : (
                        <>
                          <Send size={14} /> Send message
                        </>
                      )}
                    </button>

                    <p className="mt-4 text-center text-[12.5px]" style={{ color: "var(--text-tertiary)" }}>
                      We will only use this to reply. No lists, no noise.
                    </p>
                  </form>
                )}
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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="btn-ember">
              Start building free <ArrowRight />
            </Link>
            <Link href="/pricing" className="btn-mint">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
