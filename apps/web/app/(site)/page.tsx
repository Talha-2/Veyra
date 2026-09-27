import Link from "next/link";
import { ArrowRight, AudioLines, BookOpen, ChevronRight, Globe2, Languages, PhoneForwarded, ShieldCheck, Sparkles, Workflow, Zap } from "lucide-react";

import { APPS, LogoTile, PARTNERS, VeyraMark } from "@/components/mk/brand";
import { APP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { CountUp, HorizontalScroll, Marquee, Parallax, Reveal, Stagger, TextReveal, ZoomOnScroll } from "@/components/mk/motion";
import { AskScreen, DeskScreen, Globe, LanguageCloud, LaptopFrame, LogoOrbit, StudioScreen, VoiceOrb, Waveform } from "@/components/mk/scenes";
import { CallStory } from "@/components/mk/sections";

/* Home. A product page, not a feature list: one idea per screen, the
   product shown working, and the reader's scroll driving the story. */

const CAPABILITIES = [
  { icon: Zap, title: "Fast enough to feel human.", body: "Replies start in about a second, voice to voice. Callers don’t wait through a silence wondering if anyone is there.", figure: "<1.2s", label: "voice to voice, target", art: "wave" },
  { icon: AudioLines, title: "Interrupt it. It listens.", body: "A real interruption stops it mid-word. A cough, or an “mm-hm”, does not.", figure: "~100ms", label: "to stop speaking", art: "barge" },
  { icon: Languages, title: "Speaks your callers’ language.", body: "English, Spanish, Urdu and more, each with its own voice, and it follows a caller who switches mid-sentence.", figure: "8", label: "languages in Studio today", art: "lang" },
  { icon: Globe2, title: "A real number, anywhere.", body: "Use the lines you have or add new ones, and answer and place calls across 100+ countries.", figure: "100+", label: "countries reachable", art: "globe" },
  { icon: PhoneForwarded, title: "Hands off, warmly.", body: "It briefs the person it transfers to. If they’re busy, the caller gets a callback, not a dead line.", figure: "Warm", label: "or cold transfers, your call", art: "handoff" },
  { icon: ShieldCheck, title: "Honest when it isn’t sure.", body: "If a booking times out, it says so and flags it for your team instead of pretending it went through.", figure: "Flagged", label: "never faked", art: "shield" },
];

function CapabilityArt({ kind }: { kind: string }) {
  switch (kind) {
    case "wave":
      return <div className="flex h-full items-center px-10"><Waveform bars={28} height="46%" color="var(--mk-ember)" /></div>;
    case "barge":
      return (
        <div className="flex h-full flex-col justify-center gap-4 px-10">
          <div className="flex items-center gap-3"><span className="mk-small w-16">Agent</span><div className="h-3 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, var(--mk-ember) 55%, rgba(233,107,52,0.15) 55%)" }} /></div>
          <div className="flex items-center gap-3"><span className="mk-small w-16">Caller</span><div className="h-3 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, transparent 50%, var(--mk-ink) 50%, var(--mk-ink) 80%, transparent 80%)" }} /></div>
          <p className="mk-small">The agent yields the moment the caller starts.</p>
        </div>
      );
    case "lang":
      return <LanguageCloud className="h-full w-full" />;
    case "globe":
      return <div className="flex h-full items-center justify-center py-2" style={{ color: "var(--mk-ink)" }}><div className="h-full" style={{ aspectRatio: "1" }}><Globe size="100%" /></div></div>;
    case "handoff":
      return (
        <div className="flex h-full items-center justify-center gap-5">
          <figure className="flex flex-col items-center gap-2"><VeyraMark size={84} /><figcaption className="mk-small">The agent</figcaption></figure>
          <div className="mb-7 flex flex-col items-center gap-1"><span className="mk-pill mk-pill--ember">Briefed</span><ChevronRight className="text-[var(--mk-ink-3)]" size={28} /></div>
          <figure className="flex flex-col items-center gap-2"><span className="flex size-[84px] items-center justify-center rounded-full text-2xl font-semibold" style={{ background: "#dbe8ff", color: "#1d4ed8" }}>SO</span><figcaption className="mk-small">Sam, dispatch</figcaption></figure>
        </div>
      );
    default:
      return (
        <div className="flex h-full items-center justify-center">
          <div className="rounded-2xl px-5 py-4 text-left" style={{ background: "rgba(255,159,10,0.12)", maxWidth: 280 }}>
            <p className="text-sm font-semibold" style={{ color: "#b25f00" }}>Needs a human to check</p>
            <p className="mk-small mt-1">Book appointment timed out mid-write. Confirm in the calendar before telling the customer.</p>
          </div>
        </div>
      );
  }
}

const BENTO = [
  { title: "Studio", body: "Shape how the agent behaves: its voice, its skills, what it may do.", screen: "studio", span: "lg:col-span-4 lg:row-span-2" },
  { title: "Ask", body: "Tell the agent what to build. It drafts; you approve.", screen: "ask", span: "lg:col-span-2 lg:row-span-2" },
  { title: "Knowledge", body: "Upload your prices and policies. It quotes them, word for word.", icon: BookOpen, span: "lg:col-span-2" },
  { title: "Automations", body: "Morning digests, missed-call text-backs, follow-ups that run themselves.", icon: Workflow, span: "lg:col-span-2" },
  { title: "Skills", body: "Write a procedure once, in plain English. It follows it on every call.", icon: Sparkles, span: "lg:col-span-2" },
];

export default function Home() {
  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Veyra</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3">Every call answered.<br className="hidden sm:block" /> Every job booked.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[40ch]">An AI agent that picks up your phone, texts and email, does the work in your tools, and brings your team in when it matters.</p>
          </Reveal>
          <Reveal variant="rise" delay={280} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={`${APP_URL}/register`} className="mk-btn mk-btn--primary">Get started</a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Request a demo</a>
          </Reveal>
        </div>
        <Reveal variant="zoom" delay={200} className="mt-8 flex justify-center md:mt-4">
          <Parallax speed={-0.12}><VoiceOrb size="min(620px, 88vw)" /></Parallax>
        </Reveal>
      </section>

      {/* ── partners, big and slow ───────────────────────────────────── */}
      <section className="mk-section--tight">
        <Reveal variant="fade"><p className="mk-small mb-8 text-center">Built on the best voice and AI infrastructure</p></Reveal>
        <Marquee duration={60} gap={36}>
          {PARTNERS.map((p) => <LogoTile key={p.name} partner={p} size={96} />)}
        </Marquee>
      </section>

      {/* ── the pinned call ──────────────────────────────────────────── */}
      <section className="mk-night">
        <div className="mk-wrap pt-[clamp(88px,12vw,160px)] text-center">
          <Reveal><h2 className="mk-h1 mx-auto max-w-[16ch]">Listen to it work.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-5 max-w-[42ch]">A homeowner calls about a grinding furnace. Scroll, and follow the call.</p></Reveal>
        </div>
        <CallStory />
      </section>

      {/* ── the idea, lit word by word ───────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap--text mk-wrap">
          <TextReveal className="mk-h2" text="One agent, on every channel your customers use. It knows your business, works in your tools, and knows exactly when a person should take over." />
        </div>
      </section>

      {/* ── capabilities: the cards travel sideways ──────────────────── */}
      <section className="mk-alt">
        <HorizontalScroll
          header={
            <div className="mk-wrap mb-8 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mk-eyebrow">Built for real calls</p>
                <h2 className="mk-h2 mt-2 max-w-[15ch]">Demos are easy. Tuesdays are hard.</h2>
              </div>
              <p className="mk-body max-w-[36ch]">Real callers ramble, interrupt, switch languages and phone in during outages. Each of those is a core feature here.</p>
            </div>
          }
        >
          {CAPABILITIES.map((c) => (
            <article key={c.title} className="mk-card flex shrink-0 flex-col" style={{ width: "min(400px, 80vw)", height: "min(520px, calc(100svh - 330px))", minHeight: 400 }}>
              <div className="p-8 pb-0">
                <c.icon size={28} className="text-[var(--mk-ember)]" />
                <h3 className="mk-h3 mt-5">{c.title}</h3>
                <p className="mk-body mt-3">{c.body}</p>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden"><CapabilityArt kind={c.art} /></div>
              <div className="flex items-baseline gap-3 border-t border-[var(--mk-line)] px-8 py-5">
                <span className="text-3xl font-semibold tracking-tight">{c.figure}</span>
                <span className="mk-small">{c.label}</span>
              </div>
            </article>
          ))}
        </HorizontalScroll>
      </section>

      {/* ── Desk, on a laptop that grows into view ───────────────────── */}
      <section id="desk" className="mk-section overflow-hidden">
        <div className="mk-wrap text-center">
          <Reveal><p className="mk-eyebrow">Veyra Desk</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[18ch]">Every conversation. One inbox.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">Calls, texts and email land in one thread per customer, with what the agent did already written down. Your team picks up where it left off.</p></Reveal>
        </div>
        <div className="mk-wrap mk-wrap--wide mt-14">
          <ZoomOnScroll from={0.78}><LaptopFrame><DeskScreen /></LaptopFrame></ZoomOnScroll>
        </div>
        <Stagger className="mk-wrap mt-14 grid gap-8 text-center sm:grid-cols-3" step={110}>
          {[
            ["Tickets it raises itself", "Every promise the agent makes to a caller becomes a ticket, so nothing falls through."],
            ["Urdu, right to left", "Messages render in their own script and direction, not as a fallback."],
            ["A contact for every caller", "History, tags and pipeline value, built from every conversation."],
          ].map(([t, b]) => (
            <div key={t}><h3 className="mk-h4">{t}</h3><p className="mk-body mt-2">{b}</p></div>
          ))}
        </Stagger>
      </section>

      {/* ── Studio: a bento of the builder ───────────────────────────── */}
      <section id="studio" className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-12 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">Veyra Studio</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Shape it without writing code.</h2></Reveal>
          </div>
          <Stagger className="grid auto-rows-[minmax(260px,auto)] gap-5 lg:grid-cols-6" step={100}>
            {BENTO.map((b) => (
              <article key={b.title} className={`mk-card mk-card-lift flex flex-col ${b.span}`}>
                <div className="p-8">
                  <h3 className="mk-h3">{b.title}</h3>
                  <p className="mk-body mt-2 max-w-[36ch]">{b.body}</p>
                </div>
                {b.screen ? (
                  <div className="relative mx-8 mt-auto flex-1 overflow-hidden rounded-t-2xl border border-b-0 border-[var(--mk-line)]" style={{ minHeight: 280, containerType: "inline-size" }}>
                    <div className="absolute inset-0">{b.screen === "studio" ? <StudioScreen /> : <AskScreen />}</div>
                  </div>
                ) : b.icon ? (
                  <div className="mt-auto flex justify-end p-8 pt-0"><span className="flex size-16 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}><b.icon size={30} /></span></div>
                ) : null}
              </article>
            ))}
          </Stagger>
          <Reveal className="mt-10 text-center"><Link href="/platform" className="mk-link">Explore the platform <ChevronRight /></Link></Reveal>
        </div>
      </section>

      {/* ── integrations: the orbit ──────────────────────────────────── */}
      <section className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap grid items-center gap-16 lg:grid-cols-2">
          <div>
            <Reveal><p className="mk-eyebrow">Integrations</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Works in the tools you already pay for.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[38ch]">Calendars, CRMs, payments, helpdesks. Connect an account once and the agent can act in it, with the permissions you choose.</p></Reveal>
            <Reveal delay={240} className="mt-10 flex items-baseline gap-4">
              <span className="text-[clamp(64px,8vw,120px)] font-semibold leading-none tracking-[-0.05em]"><CountUp to={1500} suffix="+" /></span>
              <span className="mk-body max-w-[12ch]">apps, one sign-in each</span>
            </Reveal>
            <Reveal delay={300} className="mt-8"><Link href="/integrations" className="mk-link">See every integration <ChevronRight /></Link></Reveal>
          </div>
          <Reveal variant="zoom"><LogoOrbit size={620} className="text-white" /></Reveal>
        </div>
        <div className="mt-24 flex flex-col gap-6">
          <Marquee duration={70} gap={28}>{APPS.slice(0, 15).map((p) => <LogoTile key={p.name} partner={p} size={112} />)}</Marquee>
          <Marquee duration={80} gap={28} reverse>{APPS.slice(15).map((p) => <LogoTile key={p.name} partner={p} size={112} />)}</Marquee>
        </div>
      </section>

      {/* ── the numbers ──────────────────────────────────────────────── */}
      <section className="mk-section">
        <Stagger className="mk-wrap grid gap-12 text-center sm:grid-cols-2 lg:grid-cols-4" step={120}>
          {[
            [<><span className="text-[0.55em] align-top">&lt;</span><CountUp to={1.2} decimals={1} suffix="s" /></>, "Voice to voice, the target every call is measured against"],
            [<><span className="text-[0.55em] align-top">~</span><CountUp to={100} suffix="ms" /></>, "To stop talking when a caller interrupts"],
            [<CountUp key="a" to={1500} suffix="+" />, "Apps the agent can act in"],
            [<CountUp key="c" to={100} suffix="+" />, "Countries you can call and answer"],
          ].map(([fig, label], i) => (
            <div key={i}>
              <div className="mk-h1">{fig}</div>
              <p className="mk-body mx-auto mt-3 max-w-[22ch]">{label}</p>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section mk-alt relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-10 flex justify-center"><VoiceOrb size={180} /></Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[13ch]">Put Veyra on the phone.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[38ch]">Set it up in an afternoon. Start with one line and the questions you hear every day.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={`${APP_URL}/register`} className="mk-btn mk-btn--primary">Get started <ArrowRight /></a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Talk to our team</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
