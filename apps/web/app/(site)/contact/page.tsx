"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Building2, CalendarDays, Check, Mail, MessageSquare, Phone, Send, Sparkles,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import { Spinner } from "@/components/ui";

type Status = "idle" | "sending" | "sent";

const REACH = [
  {
    icon: Mail,
    label: "Email us",
    node: (
      <a href="mailto:dev@z360.biz" className="text-accent">
        dev@z360.biz
      </a>
    ),
    sub: "Straight to the team building Vera.",
  },
  {
    icon: CalendarDays,
    label: "Book a live demo",
    node: <span>Grab a slot and we will walk Vera through your exact workflows.</span>,
    sub: "Same day where we can, no strings.",
  },
  {
    icon: Phone,
    label: "Talk to a live agent",
    node: (
      <Link href="/#demo" className="text-accent">
        Try the live voice demo on the home page
      </Link>
    ),
    sub: "Hear the sub second, grounded answers for yourself.",
  },
];

const REASSURANCE = ["Reply within one business day", "No pressure", "See it on your use case"];

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
      <section className="band">
        <div className="wrap">
          <div className="grid items-start gap-x-16 gap-y-12 md:grid-cols-2">
            {/* ── left: the pitch and the ways in ── */}
            <Reveal variant="left">
              <span className="eyebrow mb-5">
                <Sparkles size={13} /> Contact
              </span>
              <h1 className="section-title">
                Let&rsquo;s get Vera <span className="text-gradient">answering your calls.</span>
              </h1>
              <p className="lead mt-5 max-w-lg">
                Tell us what you are building and we will show you Vera running on your real use case.
                Live callers, real workflows, the same day where we can. No slideware.
              </p>

              <div className="mt-10 flex flex-col gap-6">
                {REACH.map((r) => (
                  <div key={r.label} className="flex items-start gap-4">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 42,
                        height: 42,
                        flexShrink: 0,
                        borderRadius: 12,
                        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                        color: "var(--accent-text)",
                        border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))",
                      }}
                    >
                      <r.icon size={19} strokeWidth={1.8} />
                    </span>
                    <div>
                      <div className="text-[15px] font-semibold leading-tight">{r.label}</div>
                      <div className="text-secondary mt-1 text-[14px] leading-relaxed">{r.node}</div>
                      <div className="text-tertiary mt-0.5 text-[13px]">{r.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="chips mt-9">
                {REASSURANCE.map((c) => (
                  <span key={c} className="chip">
                    <Check size={12} /> {c}
                  </span>
                ))}
              </div>
            </Reveal>

            {/* ── right: the form on glass ── */}
            <Reveal variant="scale" delay={120}>
              <div className="glass-card" style={{ padding: "clamp(22px, 3vw, 32px)" }}>
                {status === "sent" ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        color: "var(--success)",
                        background: "color-mix(in srgb, var(--success) 14%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--success) 34%, transparent)",
                      }}
                    >
                      <Check size={28} strokeWidth={2.2} />
                    </span>
                    <h2 className="serif mt-6 text-[26px] font-normal leading-tight">
                      Thanks, we will be in touch.
                    </h2>
                    <p className="text-secondary mt-3 max-w-sm text-[15px] leading-relaxed">
                      Your note is in. Expect a reply within one business day, from a real person who
                      has read it.
                    </p>
                    <Link href="/" className="btn btn-secondary mt-8">
                      Back to site
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} aria-busy={sending} noValidate={false}>
                    <div className="mb-1 flex items-center gap-2">
                      <MessageSquare size={16} style={{ color: "var(--accent-text)" }} />
                      <h2 className="text-[17px] font-semibold">Tell us what you need</h2>
                    </div>
                    <p className="text-tertiary mb-6 text-[13px]">
                      A couple of details and we will take it from there.
                    </p>

                    <div className="mb-5">
                      <label className="label" htmlFor="cf-name">
                        Name
                      </label>
                      <input
                        id="cf-name"
                        name="name"
                        className="input"
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
                      <label className="label" htmlFor="cf-email">
                        Work email
                      </label>
                      <input
                        id="cf-email"
                        name="email"
                        className="input"
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
                      <label className="label" htmlFor="cf-company">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 size={13} /> Company
                          <span className="text-tertiary font-normal">(optional)</span>
                        </span>
                      </label>
                      <input
                        id="cf-company"
                        name="company"
                        className="input"
                        type="text"
                        autoComplete="organization"
                        placeholder="Acme Inc."
                        disabled={sending}
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </div>

                    <div className="mb-7">
                      <label className="label" htmlFor="cf-message">
                        What are you building?
                      </label>
                      <textarea
                        id="cf-message"
                        name="message"
                        className="input"
                        rows={4}
                        placeholder="A voice agent that books appointments and answers billing questions after hours."
                        disabled={sending}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        style={{
                          height: "auto",
                          minHeight: 112,
                          padding: "10px 12px",
                          lineHeight: 1.6,
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <button type="submit" className="btn btn-gradient w-full" disabled={sending}>
                      {sending ? (
                        <>
                          <Spinner size={16} /> Sending
                        </>
                      ) : (
                        <>
                          <Send size={16} /> Send message
                        </>
                      )}
                    </button>

                    <p className="text-tertiary mt-4 text-center text-[12.5px]">
                      We will only use this to reply. No lists, no noise.
                    </p>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── closing band ── */}
      <section className="band-sm">
        <div className="wrap-tight text-center">
          <Reveal>
            <p className="serif text-[clamp(1.5rem,3vw,2rem)] leading-snug">
              Prefer to just start?
            </p>
            <p className="lead mx-auto mt-3 max-w-md">
              Spin up your first agent free and book time with us once you have something to show.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">
                Start building free <ArrowRight />
              </Link>
              <Link href="/pricing" className="btn btn-secondary btn-lg">
                See pricing
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
