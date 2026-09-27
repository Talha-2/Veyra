import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, Lock, Mail, MessageSquare, MessagesSquare, Phone, ShieldCheck, Zap } from "lucide-react";

import { LogoTile, PARTNERS, VeyraLogo, VeyraMark } from "@/components/mk/brand";
import { LayerDiagram, RingingMark, WhyStory } from "@/components/mk/company-parts";
import { SIGN_UP_URL } from "@/components/mk/links";
import { Marquee, Reveal, Stagger, TextReveal } from "@/components/mk/motion";

export const metadata: Metadata = {
  title: "About",
  description:
    "Small businesses lose customers to calls nobody answers. Veyra answers every one and does the work, built for real calls rather than demos.",
};

/* About. Why the company exists, what it believes, how the product is
   built, what it runs on, and the brand itself shown at full size. Every
   claim here is true of the product today; no invented people or numbers. */

const PRINCIPLES = [
  {
    title: "Honest when it isn’t sure.",
    body: "It answers from your knowledge or tells the caller it doesn’t know. If a booking fails, it says so and flags it for your team.",
    art: "flag",
    span: "lg:col-span-3",
  },
  {
    title: "A person is always one step away.",
    body: "When a caller wants a human, or something breaks, it hands off with the context written down. Never a dead line.",
    art: "handoff",
    span: "lg:col-span-3",
  },
  {
    title: "Your data stays yours.",
    body: "We don’t train models on your conversations and we don’t sell your data. Export or delete it whenever you like.",
    icon: Lock,
    span: "lg:col-span-2",
  },
  {
    title: "Speed is respect.",
    body: "Nobody should wait through silence wondering if anyone is there.",
    figure: "<1.2s",
    label: "voice to voice, the target",
    span: "lg:col-span-2",
  },
  {
    title: "Built for the worst call.",
    body: "Accents, noise, interruptions, an outage at the worst moment. We design for the ninety-fifth percentile, not the demo.",
    figure: "p95",
    label: "not the median",
    span: "lg:col-span-2",
  },
  {
    title: "One agent, every channel.",
    body: "Calls, texts, chat and email run on one agent with the same knowledge and tools. No channel gets a weaker version.",
    art: "channels",
    span: "lg:col-span-3",
  },
  {
    title: "Real, end to end.",
    body: "Everything we ship works all the way through. No screens that only look finished long enough for a screenshot.",
    icon: ShieldCheck,
    span: "lg:col-span-3",
  },
];

function PrincipleArt({ kind }: { kind?: string }) {
  if (kind === "flag") {
    return (
      <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(255,159,10,0.12)", maxWidth: 320 }}>
        <p className="text-[14px] font-semibold" style={{ color: "#b25f00" }}>Needs a human to check</p>
        <p className="mk-small mt-1">Booking timed out mid-write. Confirm in the calendar before telling the customer.</p>
      </div>
    );
  }
  if (kind === "handoff") {
    return (
      <div className="flex items-center gap-5">
        <VeyraMark size={72} />
        <div className="flex flex-col items-center gap-1"><span className="mk-pill mk-pill--ember">Briefed</span><ChevronRight className="text-[var(--mk-ink-3)]" size={24} /></div>
        <span className="flex size-[72px] items-center justify-center rounded-full text-[21px] font-semibold" style={{ background: "#dbe8ff", color: "#1d4ed8" }}>SO</span>
      </div>
    );
  }
  if (kind === "channels") {
    return (
      <div className="flex gap-3">
        {[Phone, MessageSquare, MessagesSquare, Mail].map((I, i) => (
          <span key={i} className="flex size-16 items-center justify-center rounded-2xl" style={{ background: i === 0 ? "var(--mk-ember)" : "rgba(233,107,52,0.1)", color: i === 0 ? "#fff" : "var(--mk-ember)" }}><I size={28} /></span>
        ))}
      </div>
    );
  }
  return null;
}

const ROLES: Record<string, string> = {
  OpenAI: "Language models",
  LiveKit: "Real-time audio",
  Deepgram: "Speech to text",
  Cartesia: "Text to speech",
  ElevenLabs: "Text to speech",
  Groq: "Fast inference",
  Twilio: "Telephony",
  Telnyx: "Telephony",
  Composio: "Actions in your apps",
  Langfuse: "Tracing and evaluation",
};

export default function CompanyPage() {
  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-8 md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">About Veyra</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[16ch]">The agent that actually picks up.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[44ch]">Small businesses lose customers to calls nobody answers. Veyra answers every one, then does the work: books the visit, logs the call, and brings your team in when it matters.</p>
          </Reveal>
          <Reveal variant="rise" delay={280} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started</a>
            <Link href="/contact" className="mk-btn mk-btn--ghost">Talk to us</Link>
          </Reveal>
        </div>
        <Reveal variant="zoom" delay={220} className="mk-wrap mt-6"><RingingMark /></Reveal>
      </section>

      {/* ── why: the pinned call log ─────────────────────────────────── */}
      <section className="mk-night">
        <div className="mk-wrap pt-[clamp(88px,12vw,160px)] text-center">
          <Reveal><h2 className="mk-h1 mx-auto max-w-[16ch]">Every unanswered call is a customer.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-5 max-w-[42ch]">The people who run small businesses are busy doing the work. Scroll through one ordinary day.</p></Reveal>
        </div>
        <WhyStory />
      </section>

      {/* ── the manifesto, lit word by word ──────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap mk-wrap--text">
          <TextReveal className="mk-h2" text="Most voice agents demo beautifully and fall apart on the first real call. We build for the callers that break demos: the ones who ramble, interrupt, switch languages and ring during an outage. That is the whole job." />
        </div>
      </section>

      {/* ── what we believe ──────────────────────────────────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-12 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">What we believe</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">The rules we don’t bend.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[44ch]">They show up in the product, not just the pitch.</p></Reveal>
          </div>
          <Stagger className="grid gap-5 lg:grid-cols-6" step={100}>
            {PRINCIPLES.map((p) => (
              <article key={p.title} className={`mk-card mk-card-lift flex min-h-[340px] flex-col p-8 md:p-10 ${p.span}`}>
                <h3 className="mk-h2">{p.title}</h3>
                <p className="mk-body mt-4 max-w-[40ch]">{p.body}</p>
                <div className="mt-auto pt-10">
                  {p.figure ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-[clamp(56px,6vw,84px)] font-semibold leading-none tracking-[-0.05em] text-[var(--mk-ember)]">{p.figure}</span>
                      <span className="mk-small">{p.label}</span>
                    </div>
                  ) : p.icon ? (
                    <span className="flex size-16 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}><p.icon size={30} /></span>
                  ) : (
                    <PrincipleArt kind={p.art} />
                  )}
                </div>
              </article>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── how it is built ──────────────────────────────────────────── */}
      <section className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap">
          <div className="mx-auto mb-14 max-w-[820px] text-center">
            <Reveal><p className="mk-eyebrow">How it’s built</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Two layers. One rule between them.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">The app owns all the data and never runs AI. The agent runs all the AI and owns no data. Everything that crosses between them goes through one typed contract.</p></Reveal>
          </div>
          <Reveal variant="zoom"><LayerDiagram /></Reveal>
          <Stagger className="mt-16 grid gap-10 sm:grid-cols-3" step={110}>
            {[
              ["A talker and a worker", "On a call, one part of the agent keeps the conversation going while another does the work in your tools, so a lookup isn’t silence on the line."],
              ["Your records, in one place", "Contacts, conversations and tickets live in the app, separate from the models that read them, scoped to your business."],
              ["Fails toward a person", "If a provider has a bad moment, the call falls back to your team or a callback. It never invents an answer to fill the gap."],
            ].map(([t, b]) => (
              <div key={t}><h3 className="mk-h4">{t}</h3><p className="mk-body mt-2">{b}</p></div>
            ))}
          </Stagger>
          <Reveal className="mt-12 text-center"><Link href="/security" className="mk-link">How we protect your data <ChevronRight /></Link></Reveal>
        </div>
      </section>

      {/* ── what it runs on ──────────────────────────────────────────── */}
      <section className="mk-section overflow-hidden">
        <div className="mk-wrap mb-14 text-center">
          <Reveal><p className="mk-eyebrow">What it runs on</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[18ch]">The best piece for every job.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[44ch]">Real-time audio, speech, language models and telephony from the teams that do each one best, with fallbacks when one has a bad day.</p></Reveal>
        </div>
        <Marquee duration={70} gap={40}>
          {PARTNERS.map((p) => <LogoTile key={p.name} partner={p} size={140} />)}
        </Marquee>
        <Stagger className="mk-wrap mt-20 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-5" step={70}>
          {PARTNERS.map((p) => (
            <div key={p.name} className="flex flex-col items-center text-center">
              <LogoTile partner={p} size={104} />
              <p className="mk-h4 mt-5">{p.name}</p>
              <p className="mk-small mt-1">{ROLES[p.name]}</p>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ── the brand ────────────────────────────────────────────────── */}
      <section className="mk-section mk-alt overflow-hidden">
        <div className="mk-wrap">
          <div className="mb-12 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">The brand</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">The shape of a voice.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[46ch]">Five amplitude bars in Ember on a graphite tile: someone speaking, caught mid-sentence. It reads at the size of a browser tab and at the size of a wall.</p></Reveal>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Reveal variant="zoom">
              <figure className="mk-card flex min-h-[440px] flex-col items-center justify-center gap-10 p-8 md:min-h-[560px]">
                <VeyraMark size={280} />
                <figcaption className="mk-small">On light</figcaption>
              </figure>
            </Reveal>
            <Reveal variant="zoom" delay={120}>
              <figure className="mk-card mk-night relative flex min-h-[440px] flex-col items-center justify-center gap-10 p-8 md:min-h-[560px]" style={{ background: "var(--mk-night)" }}>
                <div className="mk-breathe absolute inset-0" style={{ background: "radial-gradient(40% 40% at 50% 44%, rgba(233,107,52,0.32), transparent 70%)" }} aria-hidden="true" />
                <div className="relative"><VeyraMark size={280} /></div>
                <figcaption className="mk-small relative">On black</figcaption>
              </figure>
            </Reveal>
          </div>

          <Stagger className="mt-5 grid gap-5 lg:grid-cols-3" step={110}>
            <figure className="mk-card flex min-h-[300px] flex-col items-center justify-center gap-8 p-8 lg:col-span-2">
              <div className="max-sm:hidden"><VeyraLogo size={104} /></div>
              <div className="sm:hidden"><VeyraLogo size={68} /></div>
              <figcaption className="mk-small text-center">The wordmark: the mark, then Veyra in Poppins SemiBold, set tight.</figcaption>
            </figure>

            <figure className="mk-card flex flex-col lg:row-span-2">
              <div className="flex min-h-[260px] flex-1 flex-col justify-end p-8" style={{ background: "var(--mk-ember)", color: "#fff" }}>
                <span className="mk-h2">Ember</span>
                <span className="mt-1 text-[17px] opacity-85">The one brand colour</span>
              </div>
              <div className="p-8">
                <p className="mk-h3 tabular-nums">#E96B34</p>
                <p className="mk-small mt-1 tabular-nums">RGB 233 107 52</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[["Soft", "#FFB08A", "var(--mk-ember-soft)"], ["Deep", "#C2541C", "var(--mk-ember-deep)"]].map(([n, hex, v]) => (
                    <div key={n}>
                      <div className="h-14 rounded-[14px]" style={{ background: v }} />
                      <p className="mt-2 text-[14px] font-medium">{n}</p>
                      <p className="mk-small tabular-nums">{hex}</p>
                    </div>
                  ))}
                </div>
                <p className="mk-small mt-6">Soft on black, Deep for links on white. Never as a gradient on type.</p>
              </div>
            </figure>

            <figure className="mk-card flex flex-col gap-8 p-8 md:flex-row md:items-center md:p-10 lg:col-span-2">
              <div className="shrink-0">
                <span className="block text-[clamp(120px,14vw,188px)] font-semibold leading-[0.9] tracking-[-0.06em]">Aa</span>
                <p className="mk-h4 mt-4">Poppins</p>
                <p className="mk-small">400 · 500 · 600</p>
              </div>
              <div className="min-w-0 flex-1 md:border-l md:border-[var(--mk-line)] md:pl-10">
                {[["Regular", 400], ["Medium", 500], ["SemiBold", 600]].map(([n, w]) => (
                  <div key={n} className="border-b border-[var(--mk-line)] py-3 last:border-0">
                    <p className="mk-small">{n}</p>
                    <p className="mk-h4" style={{ fontWeight: w as number }}>Every call answered.</p>
                  </div>
                ))}
                <p className="mk-body mt-4 break-words">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</p>
              </div>
            </figure>
          </Stagger>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-10 flex justify-center">
            <div style={{ filter: "drop-shadow(0 24px 48px rgba(233,107,52,0.3))" }}><VeyraMark size={120} /></div>
          </Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[14ch]">Let’s get Veyra answering your calls.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Start with one line and the questions you hear every day, or tell us about the calls that keep going wrong.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started <ArrowRight /></a>
            <Link href="/contact" className="mk-btn mk-btn--ghost">Talk to us</Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
