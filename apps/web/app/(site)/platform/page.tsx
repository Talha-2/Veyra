import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, AudioLines, BookOpen, Brain, BrainCircuit, Braces, Check, ChevronRight, Clock, FlaskConical, IdCard, KeyRound,
  Mail, MessageSquare, MessagesSquare, MousePointerClick, Network, Phone, PhoneForwarded, PhoneIncoming, Plug, Printer,
  Search, ShieldCheck, Sparkles, Ticket, Users, Webhook, Workflow, Zap,
} from "lucide-react";

import { APPS, LogoTile, PARTNERS, VeyraMark, type Partner } from "@/components/mk/brand";
import { SIGN_UP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { CountUp, HorizontalScroll, Marquee, Parallax, Reveal, Stagger, TextReveal, ZoomOnScroll } from "@/components/mk/motion";
import { AgentDiagram, AskStream, ReplyLanes, WebhookCode } from "@/components/mk/platform-parts";
import { CallScreen, DeskScreen, Globe, LanguageCloud, LaptopFrame, LogoOrbit, PhoneFrame, VoiceOrb, Waveform } from "@/components/mk/scenes";
import { ChannelStatus, Soon } from "@/components/mk/soon";

export const metadata: Metadata = {
  title: "Platform",
  description: "Everything behind a Veyra agent: the voice, the talker and worker that share each call, phone numbers, the Desk inbox, Studio, integrations and the developer API.",
};

/* The platform tour. Deeper than the home page and just as visual: each
   part of the product gets a screen of its own, shown working. The footer
   links to #voice, #telephony, #desk, #studio, #agent and #developers. */

const partner = (list: Partner[], logo: string) => list.find((p) => p.logo === logo)!;
const AZURE: Partner = { name: "Azure", logo: null, kind: "voice" };

/* ── hero: the channels orbiting one call ─────────────────────────────── */

const CHANNELS = [
  { icon: MessageSquare, label: "Text", who: "Ahmed Raza", body: "جی دستیاب ہے۔ کیا یہ وقت مناسب ہے؟", rtl: true, status: "Replied in Urdu", pos: "left-0 top-[6%]", from: "left" as const, delay: 420, speed: 0.08, soon: true },
  { icon: Mail, label: "Email", who: "Lena Kowalski", body: "Can you send the quote again?", status: "Quote sent", pos: "left-[5%] top-[56%]", from: "left" as const, delay: 620, speed: -0.06, soon: true },
  { icon: MessagesSquare, label: "Website chat", who: "Visitor", body: "Do you do weekend visits?", status: "Answered from Knowledge", pos: "right-0 top-[12%]", from: "right" as const, delay: 520, speed: -0.08 },
  { icon: Ticket, label: "Ticket raised", who: "#2 Furnace grinding", body: "Technician visit, tomorrow 8–11 AM", status: "Assigned to Sam", pos: "right-[4%] top-[60%]", from: "right" as const, delay: 720, speed: 0.06 },
];

/* ── voice: six steps of one reply, travelling sideways ───────────────── */

const VOICE_STEPS = [
  { n: "01", icon: AudioLines, title: "It hears you.", body: "Speech turns into text while the caller is still talking, so the reply is ready to start.", figure: "Live", label: "streaming speech to text", art: "hear" },
  { n: "02", icon: Clock, title: "It knows you’ve finished.", body: "It reads the sentence, not just the silence, so a pause to think isn’t mistaken for the end.", figure: "Semantic", label: "turn detection", art: "turn" },
  { n: "03", icon: Zap, title: "The front desk answers.", body: "A small, fast model starts the reply. Anything that needs real work goes to the worker behind it.", figure: "<1.2s", label: "voice to voice, target", art: "fast" },
  { n: "04", icon: Sparkles, title: "In a voice you choose.", body: "Cartesia, ElevenLabs or Azure. Pick a voice for each language and hear a real line first.", figure: "3", label: "voice engines", art: "voices" },
  { n: "05", icon: PhoneForwarded, title: "Interrupt it. It stops.", body: "A real interruption stops it mid-word. A cough, or an “mm-hm”, does not.", figure: "~100ms", label: "to stop speaking", art: "barge" },
  { n: "06", icon: Users, title: "It follows your language.", body: "English, Spanish, French, German, Portuguese, Hindi, Arabic and Urdu. Urdu speaks through Azure.", figure: "8", label: "languages in Studio", art: "lang" },
];

function VoiceArt({ kind }: { kind: string }) {
  switch (kind) {
    case "hear":
      return (
        <div className="flex h-full flex-col justify-center gap-6 px-8">
          <Waveform bars={26} height={56} />
          <p className="mk-h4">my furnace keeps grinding<span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-[var(--mk-ember)]" style={{ animation: "mk-caret 1s step-end infinite" }} /></p>
          <div className="flex items-center gap-3">
            <LogoTile partner={partner(PARTNERS, "deepgram")} size={44} />
            <LogoTile partner={partner(PARTNERS, "livekit")} size={44} />
          </div>
        </div>
      );
    case "turn":
      return (
        <div className="flex h-full flex-col justify-center gap-3 px-8">
          <p className="mk-h4">I need someone out on…</p>
          <span className="mk-pill self-start">Pause · still thinking</span>
          <p className="mk-h4">…Thursday morning.</p>
          <span className="mk-pill mk-pill--ember self-start">End of turn</span>
        </div>
      );
    case "fast":
      return (
        <div className="flex h-full flex-col justify-center gap-4 px-8">
          <div className="flex h-12 overflow-hidden rounded-xl">
            <div className="flex w-[30%] items-center justify-center text-[13px] font-medium" style={{ background: "rgba(255,255,255,0.1)" }}>hear</div>
            <div className="flex w-[34%] items-center justify-center text-[13px] font-medium" style={{ background: "rgba(233,107,52,0.35)" }}>think</div>
            <div className="flex flex-1 items-center justify-center text-[13px] font-medium text-white" style={{ background: "var(--mk-ember)" }}>speak</div>
          </div>
          <p className="mk-small">Measured from the end of the caller’s words to the start of the agent’s.</p>
        </div>
      );
    case "voices":
      return (
        <div className="flex h-full items-center justify-center gap-4 px-6">
          <LogoTile partner={PARTNERS.find((p) => p.name === "Cartesia")!} size={96} />
          <LogoTile partner={partner(PARTNERS, "elevenlabs")} size={96} />
          <LogoTile partner={AZURE} size={96} />
        </div>
      );
    case "barge":
      return (
        <div className="flex h-full flex-col justify-center gap-4 px-8">
          <div className="flex items-center gap-3"><span className="mk-small w-16">Agent</span><div className="h-3 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, var(--mk-ember) 55%, rgba(233,107,52,0.15) 55%)" }} /></div>
          <div className="flex items-center gap-3"><span className="mk-small w-16">Caller</span><div className="h-3 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, transparent 50%, var(--mk-ink) 50%, var(--mk-ink) 80%, transparent 80%)" }} /></div>
          <p className="mk-small">The agent yields the moment the caller starts.</p>
        </div>
      );
    default:
      return <LanguageCloud className="h-full w-full" />;
  }
}

/* ── Desk: what your team sees ────────────────────────────────────────── */

const DESK_CHANNELS = [
  { icon: MessagesSquare, label: "Chat" },
  { icon: AudioLines, label: "Voice" },
  { icon: Phone, label: "Calls", soon: true },
  { icon: MessageSquare, label: "Texts", soon: true },
  { icon: Mail, label: "Email", soon: true },
  { icon: Printer, label: "Fax", soon: true },
];

const DESK_FEATURES = [
  { title: "Tickets it raises itself.", body: "When it promises a callback or a visit, it opens a ticket with the details, so every promise has an owner.", art: "ticket" },
  { title: "A pipeline that fills itself.", body: "Callers asking about new work become leads you can move from first call to won.", art: "leads" },
  { title: "Every call, word for word.", body: "The recording, the transcript, and each lookup or booking the agent made along the way.", art: "transcript" },
  { title: "Handoffs with a briefing.", body: "When it transfers a call, your teammate knows who is calling and why before they say hello.", art: "handoff", soon: true },
  { title: "Speed you can see.", body: "Each call shows how fast the agent replied, turn by turn, against the target.", art: "latency" },
  { title: "Urdu, right to left.", body: "Messages render in their own script and direction, never as a fallback.", art: "rtl" },
];

const LATENCY = [62, 48, 71, 55, 44, 66, 52, 58, 40, 60];

function DeskArt({ kind }: { kind: string }) {
  switch (kind) {
    case "ticket":
      return (
        <div className="rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-card)] p-4">
          <div className="flex items-center justify-between"><span className="text-[14px] font-semibold">#2 Furnace grinding</span><span className="mk-pill mk-pill--ember">Open</span></div>
          <p className="mk-small mt-1.5">Raised by Nora during a call · due tomorrow</p>
        </div>
      );
    case "leads":
      return (
        <div className="grid grid-cols-3 gap-2">
          {[["New", 3], ["Quoted", 2], ["Won", 1]].map(([t, n]) => (
            <div key={t as string} className="rounded-xl p-2.5" style={{ background: "var(--mk-bg-alt)" }}>
              <span className="text-[12px] font-medium text-[var(--mk-ink-2)]">{t}</span>
              <div className="mt-2 flex flex-col gap-1.5">{Array.from({ length: n as number }, (_, i) => <span key={i} className="h-3 rounded-full" style={{ background: t === "Won" ? "var(--mk-ember)" : "var(--mk-line-strong)" }} />)}</div>
            </div>
          ))}
        </div>
      );
    case "transcript":
      return (
        <div className="flex flex-col gap-2 text-[14px]">
          <span className="self-start rounded-2xl px-3 py-1.5" style={{ background: "var(--mk-bg-alt)" }}>Do you come out to Evanston?</span>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[12px] text-[var(--mk-ink-2)]" style={{ background: "rgba(233,107,52,0.1)" }}><Search size={13} /> Searched knowledge · service areas</span>
          <span className="self-end rounded-2xl px-3 py-1.5" style={{ background: "rgba(233,107,52,0.12)" }}>We do. Tomorrow, 8 to 11?</span>
        </div>
      );
    case "handoff":
      return (
        <div className="flex items-center justify-center gap-4">
          <VeyraMark size={56} />
          <div className="flex flex-col items-center gap-1"><span className="mk-pill mk-pill--ember">Briefed</span><ChevronRight size={22} className="text-[var(--mk-ink-3)]" /></div>
          <span className="flex size-14 items-center justify-center rounded-full text-[17px] font-semibold" style={{ background: "#dbe8ff", color: "#1d4ed8" }}>SO</span>
        </div>
      );
    case "latency":
      return (
        <div className="relative flex h-24 items-end gap-2">
          <div className="absolute inset-x-0 border-t border-dashed" style={{ bottom: "80%", borderColor: "var(--mk-ember)" }} />
          <span className="absolute right-0 text-[12px] font-medium text-[var(--mk-ember-deep)]" style={{ bottom: "82%" }}>target</span>
          {LATENCY.map((h, i) => <span key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: "var(--mk-ink)", opacity: 0.8 }} />)}
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2" dir="rtl">
          <span className="self-start rounded-2xl px-3 py-1.5 text-[17px]" style={{ background: "var(--mk-bg-alt)", fontFamily: "'Noto Nastaliq Urdu', serif" }}>کیا کل صبح کوئی آ سکتا ہے؟</span>
          <span className="self-end rounded-2xl px-3 py-1.5 text-[17px]" style={{ background: "rgba(233,107,52,0.12)", fontFamily: "'Noto Nastaliq Urdu', serif" }}>جی، صبح آٹھ بجے۔</span>
        </div>
      );
  }
}

/* ── Studio: the rooms, travelling sideways ───────────────────────────── */

const STUDIO = [
  { icon: IdCard, title: "Identity", body: "Its name, greeting and manner. Who your callers think they’re talking to.", art: "identity" },
  { icon: AudioLines, title: "Voice", body: "A voice for every language, previewed with a real line before a caller hears it.", art: "voice" },
  { icon: BrainCircuit, title: "Experts", body: "Specialists for bookings, billing or support, each with its own tools and skills.", art: "experts" },
  { icon: Sparkles, title: "Skills", body: "Procedures in plain English. Write them as prose, or gate them step by step.", art: "skills" },
  { icon: Workflow, title: "Automations", body: "Work that runs on a schedule, an app event, a webhook, or the press of a button.", art: "automations" },
  { icon: BookOpen, title: "Knowledge", body: "Prices, policies, service areas. Test what it finds before a caller asks.", art: "knowledge" },
  { icon: Brain, title: "Memory", body: "Facts no document states. It adds to them after calls, and you can edit every one.", art: "memory" },
  { icon: Plug, title: "Integrations", body: "1,500+ apps through Composio, your own MCP servers, and custom HTTP actions.", art: "integrations" },
  { icon: FlaskConical, title: "Evaluations", body: "Simulated callers test it before real ones do: the rambler, the interrupter, the one who switches language.", art: "evals", soon: true },
];

function StudioArt({ kind }: { kind: string }) {
  switch (kind) {
    case "identity":
      return (
        <div className="flex flex-col items-center gap-3">
          <VeyraMark size={72} />
          <span className="rounded-2xl px-4 py-2 text-[14px]" style={{ background: "var(--mk-bg-alt)" }}>Northwind Services, this is Nora.</span>
        </div>
      );
    case "voice":
      return (
        <div className="flex w-full flex-col gap-3 px-8">
          <Waveform bars={24} height={40} />
          <div className="flex flex-wrap gap-2">{["English · Cartesia", "Urdu · Azure", "Spanish · ElevenLabs"].map((v) => <span key={v} className="mk-pill">{v}</span>)}</div>
        </div>
      );
    case "experts":
      return (
        <div className="flex w-full flex-col gap-2 px-8">
          {[["Bookings", "Calendar · 4 skills"], ["Billing", "Stripe · 2 skills"], ["Support", "Tickets · 3 skills"]].map(([t, s]) => (
            <div key={t} className="flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: "var(--mk-bg-alt)" }}>
              <span className="text-[14px] font-medium">{t}</span><span className="mk-small">{s}</span>
            </div>
          ))}
        </div>
      );
    case "skills":
      return (
        <div className="flex w-full flex-col gap-2 px-8">
          <div className="mb-1 inline-flex self-start rounded-full p-1" style={{ background: "var(--mk-bg-alt)" }}>
            <span className="rounded-full px-3 py-1 text-[13px] text-[var(--mk-ink-2)]">Prose</span>
            <span className="rounded-full bg-[var(--mk-card)] px-3 py-1 text-[13px] font-medium shadow-sm">Steps</span>
          </div>
          {["Find the existing booking", "Offer the two nearest windows", "Confirm before booking"].map((s, i) => (
            <div key={s} className="flex items-center gap-2.5 text-[14px]">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: i < 2 ? "var(--mk-ember)" : "var(--mk-ink-3)" }}>{i + 1}</span>{s}
            </div>
          ))}
        </div>
      );
    case "automations":
      return (
        <div className="grid w-full grid-cols-2 gap-2 px-8">
          {[[Clock, "Schedule"], [Zap, "App event"], [Webhook, "Webhook"], [MousePointerClick, "Manual"]].map(([I, t]) => {
            const Icon = I as typeof Clock;
            return <div key={t as string} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium" style={{ background: "var(--mk-bg-alt)" }}><Icon size={16} className="text-[var(--mk-ember)]" />{t as string}</div>;
          })}
        </div>
      );
    case "knowledge":
      return (
        <div className="flex w-full flex-col gap-2 px-8">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--mk-line-strong)] px-3 py-2.5 text-[14px] text-[var(--mk-ink-2)]"><Search size={16} /> Do you service Evanston?</div>
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[14px]" style={{ background: "rgba(233,107,52,0.1)" }}><span className="font-medium">Service areas</span><Check size={16} className="text-[var(--mk-ember)]" /></div>
          <div className="rounded-xl px-3 py-2.5 text-[14px] text-[var(--mk-ink-3)]" style={{ background: "var(--mk-bg-alt)" }}>Pricing 2026</div>
        </div>
      );
    case "memory":
      return (
        <div className="flex w-full flex-col gap-2 px-8">
          {["We never book installs on Fridays.", "The owner handles complaints himself."].map((m) => (
            <div key={m} className="rounded-xl px-3.5 py-2.5 text-[14px]" style={{ background: "var(--mk-bg-alt)" }}>“{m}”</div>
          ))}
        </div>
      );
    case "integrations":
      return (
        <div className="grid grid-cols-3 gap-3">
          {APPS.slice(0, 6).map((p) => <LogoTile key={p.name} partner={p} size={68} />)}
        </div>
      );
    default:
      return (
        <div className="flex w-full flex-col gap-2 px-8">
          {[["The rambler", true], ["The interrupter", true], ["Switches to Spanish", false]].map(([t, ok]) => (
            <div key={t as string} className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[14px]" style={{ background: "var(--mk-bg-alt)" }}>
              <span>{t as string}</span>
              <span className="mk-pill" style={ok ? { background: "rgba(52,199,89,0.14)", color: "#248a3d" } : { background: "rgba(255,159,10,0.14)", color: "#b25f00" }}>{ok ? "Passed" : "Review"}</span>
            </div>
          ))}
        </div>
      );
  }
}

const SCOPES = ["calls:read", "calls:write", "contacts:read", "contacts:write", "runs:read", "runs:write"];
const EVENTS = ["call.started", "call.ended", "message.received", "email.received", "fax.received", "lead.created", "ticket.created", "run.completed", "run.failed"];

export default function PlatformPage() {
  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-36 md:pt-24 md:pb-44">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">The Veyra platform</p></Reveal>
          <Reveal delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[13ch]">One agent. Every conversation.</h1></Reveal>
          <Reveal delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[44ch]">It answers your calls, texts, email and chat, does the work in your tools, and leaves your team a clean record. Here is everything underneath.</p>
          </Reveal>
          <Reveal delay={280} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started</a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Request a demo</a>
          </Reveal>
          <Reveal variant="fade" delay={360} className="mt-8"><ChannelStatus /></Reveal>
        </div>

        <div className="mk-wrap relative mt-16">
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(900px,140vw)] -translate-x-1/2 -translate-y-1/2" style={{ background: "var(--mk-glow)", opacity: 0.45, filter: "blur(40px)" }} aria-hidden="true" />
          <Reveal variant="zoom" delay={200} className="relative z-[1] flex justify-center">
            <PhoneFrame width="min(330px, 78vw)"><CallScreen /></PhoneFrame>
          </Reveal>
          {CHANNELS.map((c, i) => (
            <div key={c.label} className={`absolute z-[2] hidden w-[272px] lg:block ${c.pos}`}>
              <Parallax speed={c.speed}>
                <Reveal variant={c.from} delay={c.delay}>
                  <div className="mk-float" style={{ animationDelay: `${i * 1.3}s` }}>
                    <div className="mk-card p-5 text-left" style={{ boxShadow: "var(--mk-shadow-float)" }}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 items-center justify-center rounded-xl" style={{ background: "rgba(233,107,52,0.12)" }}><c.icon size={18} className="text-[var(--mk-ember)]" /></span>
                        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="mk-kicker">{c.label}</span>{c.soon && <Soon />}</div><div className="truncate text-[14px] font-semibold">{c.who}</div></div>
                      </div>
                      <p className="mt-3 text-[14px] leading-snug text-[var(--mk-ink-2)]" dir={c.rtl ? "rtl" : undefined} style={c.rtl ? { fontFamily: "'Noto Nastaliq Urdu', serif", fontSize: 17 } : undefined}>{c.body}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[var(--mk-ember-deep)]"><Check size={14} strokeWidth={2.4} />{c.status}</div>
                    </div>
                  </div>
                </Reveal>
              </Parallax>
            </div>
          ))}
        </div>
      </section>

      {/* ── proof: the numbers, then the infrastructure ──────────────── */}
      <section className="mk-section--tight">
        <Stagger className="mk-wrap grid grid-cols-2 gap-x-8 gap-y-12 text-center lg:grid-cols-5" step={110}>
          {[
            [<><span className="mr-0.5 align-[0.1em] text-[0.7em] font-medium">&lt;</span><CountUp to={1.2} decimals={1} suffix="s" /></>, "voice to voice, the target"],
            [<><span className="mr-0.5 align-[0.1em] text-[0.7em] font-medium">~</span><CountUp to={100} suffix="ms" /></>, "to stop when interrupted"],
            [<CountUp key="l" to={8} />, "languages in Studio"],
            [<CountUp key="c" to={100} suffix="+" />, "countries you can call", true],
            [<CountUp key="a" to={1500} suffix="+" />, "apps it can act in"],
          ].map(([fig, label, soon], i) => (
            <div key={i} className="max-lg:last:col-span-2">
              <div className="mk-h2">{fig}</div>
              <p className="mk-body mx-auto mt-2 max-w-[18ch]">{label}</p>
              {soon && <Soon className="mt-3" />}
            </div>
          ))}
        </Stagger>
        <Reveal variant="fade"><p className="mk-small mt-20 mb-8 text-center">Built on the best voice and AI infrastructure</p></Reveal>
        <Marquee duration={60} gap={40} className="py-6">
          {PARTNERS.map((p) => <LogoTile key={p.name} partner={p} size={128} />)}
        </Marquee>
      </section>

      {/* ── voice: a reply in six steps, travelling sideways ─────────── */}
      <section id="voice" className="mk-night">
        <div className="mk-wrap pt-[clamp(88px,12vw,160px)] text-center">
          <Reveal variant="zoom" className="flex justify-center"><VoiceOrb size="min(300px, 64vw)" /></Reveal>
          <Reveal><p className="mk-eyebrow mt-4">Voice</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[15ch]">The second after your caller speaks.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[42ch]">Six things happen before they hear a word back. The target for all six is under 1.2 seconds.</p></Reveal>
        </div>
        <HorizontalScroll
          header={
            <div className="mk-wrap mb-8 flex flex-wrap items-end justify-between gap-6">
              <h3 className="mk-h2 max-w-[14ch]">One reply, step by step.</h3>
              <p className="mk-body max-w-[34ch]">Keep scrolling. Each card is a stage every answer passes through, on every call.</p>
            </div>
          }
        >
          {VOICE_STEPS.map((s) => (
            <article key={s.n} className="mk-card flex shrink-0 flex-col" style={{ width: "min(400px, 80vw)", height: "min(520px, calc(100svh - 330px))", minHeight: 420 }}>
              <div className="p-6 pb-0 sm:p-8 sm:pb-0">
                <div className="flex items-center justify-between"><s.icon size={28} className="text-[var(--mk-ember-soft)]" /><span className="mk-kicker">{s.n}</span></div>
                <h3 className="mk-h3 mt-4 sm:mt-5">{s.title}</h3>
                <p className="mk-body mt-2 sm:mt-3">{s.body}</p>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden"><VoiceArt kind={s.art} /></div>
              <div className="flex items-baseline gap-3 border-t border-[var(--mk-line)] px-6 py-4 sm:px-8 sm:py-5">
                <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.figure}</span>
                <span className="mk-small">{s.label}</span>
              </div>
            </article>
          ))}
        </HorizontalScroll>
      </section>

      {/* ── the agent: talker and worker ─────────────────────────────── */}
      <section id="agent" className="mk-section overflow-hidden">
        <div className="mk-wrap text-center">
          <Reveal><p className="mk-eyebrow">The agent</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[16ch]">Two minds on every call.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">A fast front desk does the talking. A deeper worker does the job. One hand-off joins them, so the caller never waits in silence.</p></Reveal>
        </div>
        <div className="mk-wrap mt-16"><AgentDiagram /></div>
        <Reveal className="mk-wrap mt-16"><ReplyLanes /></Reveal>
        <Stagger className="mk-wrap mt-16 grid gap-10 sm:grid-cols-3" step={120}>
          {[
            [AudioLines, "No dead air.", "Lookups happen behind the conversation, not in the middle of it."],
            [Check, "No empty promises.", "It never says “booked” or “I’ve told the team” until the worker has actually done it."],
            [ShieldCheck, "Honest when it fails.", "A timeout becomes a flag for your team, never a success it made up."],
          ].map(([I, t, b]) => {
            const Icon = I as typeof Check;
            return (
              <div key={t as string}>
                <Icon size={28} className="text-[var(--mk-ember)]" />
                <h3 className="mk-h4 mt-4">{t as string}</h3>
                <p className="mk-body mt-2">{b as string}</p>
              </div>
            );
          })}
        </Stagger>
      </section>

      {/* ── the idea, lit word by word ───────────────────────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap mk-wrap--text">
          <TextReveal className="mk-h2" text="Your callers never hear the machinery. They hear one calm voice that knows your business, does what it says it did, and tells the truth when it can’t." />
        </div>
      </section>

      {/* ── telephony: the globe ─────────────────────────────────────── */}
      <section id="telephony" className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap grid items-center gap-16 lg:grid-cols-2">
          <div>
            <Reveal><p className="mk-eyebrow">Telephony<Soon inline /></p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">A real number, anywhere.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[38ch]">Buy a number in a click or bring the lines you already have. Answer and place calls worldwide, with every text in the same thread as the call.</p></Reveal>
            <Reveal delay={240} className="mt-10 flex items-baseline gap-4">
              <span className="text-[clamp(64px,8vw,120px)] font-semibold leading-none tracking-[-0.05em]"><CountUp to={100} suffix="+" /></span>
              <span className="mk-body max-w-[16ch]">countries to call and answer</span>
            </Reveal>
            <Stagger className="mt-10 flex flex-wrap gap-5" step={120}>
              {[partner(PARTNERS, "twilio"), partner(PARTNERS, "telnyx"), partner(PARTNERS, "livekit")].map((p) => (
                <figure key={p.name} className="flex flex-col items-center gap-3">
                  <LogoTile partner={p} size={112} />
                  <figcaption className="mk-small">{p.name}</figcaption>
                </figure>
              ))}
            </Stagger>
          </div>
          <Reveal variant="zoom" className="text-white"><Globe size="min(600px, 88vw)" /></Reveal>
        </div>
        <Stagger className="mk-wrap mt-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" step={100}>
          {[
            [PhoneIncoming, "Inbound and outbound", "The same agent answers your line and places the calls you schedule."],
            [MessageSquare, "Texts in the thread", "Two-way SMS sits beside the call it followed, in one conversation."],
            [PhoneForwarded, "Warm or cold transfers", "Brief a teammate before connecting, or pass the call straight through."],
            [Network, "Your carrier, our agent", "Twilio or Telnyx lines reach the agent through LiveKit SIP."],
          ].map(([I, t, b]) => {
            const Icon = I as typeof Phone;
            return (
              <div key={t as string} className="mk-card p-7">
                <div className="flex items-center justify-between gap-3"><Icon size={26} className="text-[var(--mk-ember-soft)]" /><Soon /></div>
                <h3 className="mk-h4 mt-5">{t as string}</h3>
                <p className="mk-body mt-2">{b as string}</p>
              </div>
            );
          })}
        </Stagger>
      </section>

      {/* ── Desk, on a laptop that grows into view ───────────────────── */}
      <section id="desk" className="mk-section overflow-hidden">
        <div className="mk-wrap text-center">
          <Reveal><p className="mk-eyebrow">Veyra Desk</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[17ch]">Your team’s side of every conversation.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">One inbox for every channel, one thread per customer, and the agent’s work already written down. Contacts, tickets and leads sit right beside it.</p></Reveal>
        </div>
        <Stagger className="mk-wrap mt-12 flex flex-wrap items-start justify-center gap-x-3 gap-y-6 sm:gap-x-6" step={90}>
          {DESK_CHANNELS.map((c) => (
            <div key={c.label} className="flex flex-col items-center gap-2.5">
              <span className="flex size-14 items-center justify-center rounded-[18px] bg-[var(--mk-card)] sm:size-20 sm:rounded-[22px]" style={{ boxShadow: "var(--mk-shadow-card)" }}><c.icon className={`size-6 sm:size-[30px] ${c.soon ? "text-[var(--mk-ink-3)]" : "text-[var(--mk-ember)]"}`} /></span>
              <span className="mk-small">{c.label}</span>
              {c.soon && <Soon />}
            </div>
          ))}
        </Stagger>
        <div className="mk-wrap mk-wrap--wide mt-14">
          <ZoomOnScroll from={0.78}><LaptopFrame><DeskScreen /></LaptopFrame></ZoomOnScroll>
        </div>
        <Stagger className="mk-wrap mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" step={100}>
          {DESK_FEATURES.map((f) => (
            <article key={f.title} className="mk-card mk-card-lift flex flex-col p-7">
              <h3 className="mk-h4">{f.title}{f.soon && <Soon inline />}</h3>
              <p className="mk-body mt-2">{f.body}</p>
              <div className="mt-auto pt-7"><DeskArt kind={f.art} /></div>
            </article>
          ))}
        </Stagger>
      </section>

      {/* ── Studio: the rooms travel sideways ────────────────────────── */}
      <section id="studio" className="mk-alt">
        <HorizontalScroll
          header={
            <div className="mk-wrap mb-8 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mk-eyebrow">Veyra Studio</p>
                <h2 className="mk-h2 mt-2 max-w-[16ch]">Shape everything it knows and does.</h2>
              </div>
              <p className="mk-body max-w-[36ch]">Nine rooms, all in plain English, no code. Change one and the next call picks it up.</p>
            </div>
          }
        >
          {STUDIO.map((s) => (
            <article key={s.title} className="mk-card flex shrink-0 flex-col" style={{ width: "min(380px, 80vw)", height: "min(500px, calc(100svh - 330px))", minHeight: 420 }}>
              <div className="p-8 pb-0">
                <div className="flex items-center justify-between gap-3"><span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.1)" }}><s.icon size={24} className="text-[var(--mk-ember)]" /></span>{s.soon && <Soon />}</div>
                <h3 className="mk-h3 mt-5">{s.title}</h3>
                <p className="mk-body mt-2">{s.body}</p>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-6"><StudioArt kind={s.art} /></div>
            </article>
          ))}
        </HorizontalScroll>
      </section>

      {/* ── Ask: tell it what to build ───────────────────────────────── */}
      <section className="mk-section overflow-hidden">
        <div className="mk-wrap grid items-center gap-14 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Reveal><p className="mk-eyebrow">Ask</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Or just ask for it.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[36ch]">Ask is a chat with the agent itself. Describe what you want and it drafts the skill or automation, step by step, while you watch. You review it and turn it on.</p></Reveal>
            <Stagger className="mt-8 flex flex-col items-start gap-2.5" step={110}>
              {["Text back every missed call.", "Summarize yesterday’s calls at 7 AM.", "Write a skill for rescheduling.", "Raise a ticket when someone mentions a leak."].map((q) => (
                <span key={q} className="rounded-full px-4 py-2 text-[14px] font-medium" style={{ background: "var(--mk-bg-alt)" }}>{q}</span>
              ))}
            </Stagger>
          </div>
          <Reveal variant="right" delay={120} className="min-w-0"><AskStream /></Reveal>
        </div>
      </section>

      {/* ── integrations: the orbit and the rails ────────────────────── */}
      <section id="integrations" className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap grid items-center gap-16 lg:grid-cols-2">
          <div>
            <Reveal><p className="mk-eyebrow">Integrations</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">It works where you work.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[38ch]">Connect an account once and the agent can act in it, with the permissions you choose. If it has an API, it can be a tool.</p></Reveal>
            <Reveal delay={240} className="mt-10 flex items-baseline gap-4">
              <span className="text-[clamp(64px,8vw,120px)] font-semibold leading-none tracking-[-0.05em]"><CountUp to={1500} suffix="+" /></span>
              <span className="mk-body max-w-[12ch]">apps, one sign-in each</span>
            </Reveal>
          </div>
          <Reveal variant="zoom">
            <LogoOrbit size={600} className="hidden text-white sm:block" />
            <LogoOrbit size={340} className="text-white sm:hidden" />
          </Reveal>
        </div>
        <Stagger className="mk-wrap mt-20 grid gap-5 lg:grid-cols-3" step={120}>
          <article className="mk-card flex flex-col p-8">
            <LogoTile partner={partner(PARTNERS, "composio")} size={96} />
            <h3 className="mk-h3 mt-6">Composio</h3>
            <p className="mk-body mt-2">Calendars, CRMs, payments and helpdesks. Sign in once, and the agent fills in each action’s details itself.</p>
          </article>
          <article className="mk-card flex flex-col p-8">
            <span className="flex size-24 items-center justify-center rounded-[24%]" style={{ background: "rgba(139,108,255,0.16)" }}><Plug size={44} className="text-[var(--mk-violet)]" /></span>
            <h3 className="mk-h3 mt-6">MCP servers</h3>
            <p className="mk-body mt-2">Point it at your own MCP server and its tools become the agent’s tools, with the same approvals.</p>
          </article>
          <article className="mk-card flex flex-col p-8">
            <span className="flex size-24 items-center justify-center rounded-[24%]" style={{ background: "rgba(77,181,255,0.16)" }}><Braces size={44} className="text-[var(--mk-sky)]" /></span>
            <h3 className="mk-h3 mt-6">HTTP actions</h3>
            <p className="mk-body mt-2">Call an endpoint you own. Describe what it does in plain English and the agent knows when to use it.</p>
          </article>
        </Stagger>
        <div className="mt-20 flex flex-col gap-3">
          <Marquee duration={70} gap={28} className="py-3">{APPS.slice(0, 15).map((p) => <LogoTile key={p.name} partner={p} size={120} />)}</Marquee>
          <Marquee duration={80} gap={28} reverse className="py-3">{APPS.slice(15).map((p) => <LogoTile key={p.name} partner={p} size={120} />)}</Marquee>
        </div>
        <Reveal className="mt-14 text-center"><Link href="/integrations" className="mk-link">See every integration <ChevronRight /></Link></Reveal>
      </section>

      {/* ── developers: keys, webhooks, a code sample ────────────────── */}
      <section id="developers" className="mk-section overflow-hidden">
        <div className="mk-wrap grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div className="min-w-0">
            <Reveal><p className="mk-eyebrow">Developers</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Build on it.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[38ch]">An API with scoped keys, and signed webhooks that tell your systems the moment something happens.</p></Reveal>
            <Reveal delay={220} className="mt-8 flex flex-col gap-3">
              {[["Authenticate", "Authorization: Bearer vy_sk_…"], ["Verify", "X-Veyra-Signature: sha256=<hex>"]].map(([k, v]) => (
                <div key={k} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="mk-small w-24">{k}</span>
                  <code className="min-w-0 rounded-lg px-2.5 py-1 font-mono text-[14px] break-all" style={{ background: "var(--mk-bg-alt)" }}>{v}</code>
                </div>
              ))}
            </Reveal>
            <Reveal delay={260}><p className="mk-kicker mt-10">Key scopes</p></Reveal>
            <Stagger className="mt-3 flex flex-wrap gap-2" step={60}>
              {SCOPES.map((s) => <span key={s} className="mk-pill font-mono">{s}</span>)}
            </Stagger>
            <Reveal delay={300}><p className="mk-kicker mt-8">Webhook events</p></Reveal>
            <Stagger className="mt-3 flex flex-wrap gap-2" step={50}>
              {EVENTS.map((e) => <span key={e} className="mk-pill mk-pill--ember font-mono">{e}</span>)}
            </Stagger>
          </div>
          <Reveal variant="right" delay={120} className="min-w-0"><WebhookCode /></Reveal>
        </div>
        <Stagger className="mk-wrap mt-20 grid gap-10 sm:grid-cols-3" step={120}>
          {[
            [KeyRound, "Scoped keys", "Give each system only what it needs. Revoke one without breaking the rest."],
            [Webhook, "Signed deliveries", "Every event is HMAC-signed, and each delivery is logged so you can see what failed."],
            [ShieldCheck, "Shown once", "Keys and signing secrets are displayed a single time. Only a hash is stored."],
          ].map(([I, t, b]) => {
            const Icon = I as typeof Check;
            return (
              <div key={t as string}>
                <Icon size={28} className="text-[var(--mk-ember)]" />
                <h3 className="mk-h4 mt-4">{t as string}</h3>
                <p className="mk-body mt-2">{b as string}</p>
              </div>
            );
          })}
        </Stagger>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section mk-alt relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-10 flex justify-center"><div className="mk-breathe" style={{ filter: "drop-shadow(0 24px 48px rgba(233,107,52,0.35))" }}><VeyraMark size={132} /></div></Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[12ch]">Start with one number.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Connect a line, add what you know, and let it take the next call. Shape the rest as you go.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started <ArrowRight /></a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Talk to our team</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
