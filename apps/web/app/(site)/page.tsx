import Link from "next/link";
import { ArrowRight } from "lucide-react";
import VoiceDemo from "@/components/VoiceDemo";
import { ConsoleMock, Spectro } from "@/components/site/graphics";

/* Home. The console: hero whispers at weight 300, the spectrogram carries
   the color, the Ember/Mint pair carries the action. Sections below the
   fold sit on Iron hairlines. */

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

const STACK = ["LiveKit", "Deepgram", "Cartesia", "OpenAI", "Composio", "ElevenLabs", "Twilio"];

const PRODUCTS: { tag: string; title: string; body: string; metric: string; href: string }[] = [
  {
    tag: "voice",
    title: "Calls that hold up",
    body: "Sub-second replies on live audio. Callers can interrupt mid-sentence, switch languages mid-thought, and still get the right answer.",
    metric: "<1.2s voice-to-voice",
    href: "/platform#voice",
  },
  {
    tag: "telephony",
    title: "Real numbers, worldwide",
    body: "Provision a number in a click, answer and place calls in 100+ countries, and keep every text in the same thread.",
    metric: "100+ countries",
    href: "/platform#telephony",
  },
  {
    tag: "workflows",
    title: "Visual pathways, real actions",
    body: "Ask, act, and branch on one canvas. Every step binds to a real tool with its parameters mapped for you.",
    metric: "compile + version",
    href: "/platform#workflows",
  },
  {
    tag: "integrations",
    title: "Plugged into your stack",
    body: "Slack, Google Calendar, HubSpot, Stripe, and a thousand more through managed OAuth. No glue code.",
    metric: "1000+ tools",
    href: "/integrations",
  },
  {
    tag: "veyra desk",
    title: "One inbox for every channel",
    body: "Calls, texts, and email land in a single thread with tickets, assignment, and a team workload view.",
    metric: "one thread",
    href: "/platform#desk",
  },
];

const RELIABILITY: { title: string; body: string; metric: string }[] = [
  {
    title: "Barge-in that doesn't flinch",
    body: "Semantic turn detection on top of VAD. A real interruption stops speech almost instantly; a cough or an “mm-hm” doesn't kill the answer.",
    metric: "~100 ms stop",
  },
  {
    title: "Provider failover",
    body: "The primary voice leads. If it degrades mid-call, synthesis fails over automatically — the caller hears a voice, not silence.",
    metric: "mid-call",
  },
  {
    title: "Graceful transfers",
    body: "Cold routing and warm, AI-briefed handoffs. Busy or failed targets fall back to a callback instead of stranding the caller.",
    metric: "warm + cold",
  },
  {
    title: "Multilingual by default",
    body: "Streaming speech-to-text follows callers who switch languages mid-sentence. No configuration change.",
    metric: "42+ languages",
  },
];

const STATS: [string, string][] = [
  ["<1.2s", "voice to voice, target"],
  ["~100ms", "barge-in stop"],
  ["1000+", "tool integrations"],
  ["100+", "countries reachable"],
];

export default function Home() {
  return (
    <>
      {/* ── hero: the headline whispers, the spectrogram speaks ── */}
      <section style={{ paddingTop: "clamp(4.5rem, 9vw, 7.5rem)" }}>
        <div className="wrap text-center">
          <h1 className="display-hero rise mx-auto max-w-[64rem]" style={{ textWrap: "balance" }}>
            Your customers reach out.
            <br className="hidden md:inline" /> Veyra answers, calls, and closes.
          </h1>
          <p
            className="lead-lg rise mx-auto mt-7 max-w-[52ch]"
            style={{ ["--rise-delay" as string]: "90ms" }}
          >
            AI agents that talk to your customers on every channel, take real action in your
            tools, and hand off to a human when it matters.
          </p>
          <div
            className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ ["--rise-delay" as string]: "180ms" }}
          >
            <a href={CALENDAR_URL} {...bookProps} className="btn-ember">
              Request a demo <ArrowRight />
            </a>
            <Link href="/signup" className="btn-mint">
              Start building free
            </Link>
          </div>
          <div className="rise mt-12" style={{ ["--rise-delay" as string]: "270ms" }}>
            <a href="#demo" className="console-pill">
              Talk to Veyra
              <span className="dotgrid" aria-hidden>
                <i /><i /><i /><i />
              </span>
            </a>
          </div>
        </div>
        {/* the signature — full-bleed, hero only */}
        <div className="rise mt-16" style={{ ["--rise-delay" as string]: "360ms" }}>
          <Spectro bars={96} />
        </div>
      </section>

      {/* ── live demo: the strongest proof on the site ── */}
      <section id="demo" className="band band--line mt-16">
        <div className="wrap">
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className="section-title">Talk to Veyra, live.</h2>
            <p className="lead mx-auto mt-4 max-w-[48ch]">
              A real microphone call with barge-in, streaming transcription, and a per-turn
              latency readout. Not a recording.
            </p>
          </div>
          <div className="console demo-frame mx-auto mt-10" style={{ maxWidth: 960 }}>
            <div className="console__bar">
              <span className="console__dot" />
              talk to veyra — live session
              <span className="spacer" />
              deepgram → agent → cartesia
            </div>
            <VoiceDemo />
          </div>
        </div>
      </section>

      {/* ── the stack it runs on ── */}
      <section className="band-sm band--line">
        <div className="wrap">
          <div className="logo-strip">
            <span className="mono-tag mono-tag--dim">Runs on</span>
            {STACK.map((name) => (
              <b key={name}>{name}</b>
            ))}
          </div>
        </div>
      </section>

      {/* ── platform: one brain, every channel ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[22ch]">One brain. Every channel your customers use.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            Voice, chat, phone, and SMS run on the same grounded agent — the same knowledge, the
            same tools, the same memory. Build it visually, or describe it and approve what the
            deep agent ships.
          </p>

          {/* flagship: the deep agent, proven by its own console */}
          <div className="feature-sec mt-14">
            <div>
              <h3
                style={{
                  fontWeight: 300,
                  fontSize: "clamp(1.5rem, 2.6vw, 2.1rem)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Describe your business. Approve what it ships.
              </h3>
              <p className="lead mt-4 max-w-[52ch]">
                The deep agent reads your site and connected tools, plans the work, and delegates
                to system experts that draft your workflows, knowledge, and voice. Nothing goes
                live until you approve it.
              </p>
              <Link href="/platform#agent" className="link-mono mt-7">
                See the platform <ArrowRight />
              </Link>
            </div>
            <div className="flex justify-center">
              <ConsoleMock />
            </div>
          </div>

          {/* the rest of the surface area, as console rows */}
          <div className="rows mt-14">
            {PRODUCTS.map((p) => (
              <Link key={p.tag} href={p.href} className="row">
                <span className="row__tag">{p.tag}</span>
                <span>
                  <span className="row__title">{p.title}</span>
                  <span className="row__body block">{p.body}</span>
                </span>
                <span className="row__metric">{p.metric}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── reliability: built for the failure modes ── */}
      <section id="reliability" className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[24ch]">Most agents demo well and die on real calls.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            Real callers ramble, interrupt, have accents, and phone in during provider outages.
            Veyra treats every one of those as a core concern, not an afterthought.
          </p>
          <div className="rows mt-12">
            {RELIABILITY.map((r) => (
              <div key={r.title} className="row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>
                  <span className="row__title">{r.title}</span>
                  <span className="row__body block">{r.body}</span>
                </span>
                <span className="row__metric">{r.metric}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── numbers ── */}
      <section className="band band--line">
        <div className="wrap">
          <div className="stat-grid">
            {STATS.map(([fig, label]) => (
              <div key={label} className="stat">
                <div className="stat__fig">{fig}</div>
                <div className="stat__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[18ch]">Put your conversations on Veyra.</h2>
          <p className="lead mx-auto mt-5 max-w-[46ch]">
            Build voice and chat agents, provision real numbers, and wire your tools — or describe
            your business and approve what the deep agent builds.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={CALENDAR_URL} {...bookProps} className="btn-ember">
              Request a demo <ArrowRight />
            </a>
            <Link href="/signup" className="btn-mint">
              Start building free
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
