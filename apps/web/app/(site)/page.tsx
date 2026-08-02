import Link from "next/link";
import {
  ArrowRight, AudioLines, Bot, CalendarDays, Inbox, Languages, Mic,
  Phone, Plug, RefreshCw, ShieldCheck, Sparkles, Workflow,
} from "lucide-react";
import VoiceDemo from "@/components/VoiceDemo";
import Reveal from "@/components/Reveal";
import {
  ConsoleMock, InboxMock, IntegrationOrbits, TelephonyMock, VoiceWaveform, WorkflowMock,
} from "@/components/site/graphics";

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

const STACK = ["LiveKit", "Deepgram", "Cartesia", "OpenAI", "Composio", "ElevenLabs", "Twilio"];
const STATS: [string, string][] = [
  ["<1.2s", "voice to voice, target"],
  ["~100ms", "barge in stop"],
  ["1000+", "tool integrations"],
  ["100+", "countries reachable"],
];

const RELIABILITY = [
  { icon: AudioLines, title: "Barge in that doesn't flinch", body: "Semantic turn detection on VAD. A real interruption stops speech in about 100ms; a cough or an mm hm won't kill the answer." },
  { icon: RefreshCw, title: "Provider failover", body: "The primary voice leads; if it degrades mid call, synthesis fails over automatically, so the caller hears a voice, not silence." },
  { icon: Phone, title: "Graceful transfers", body: "Cold routing and warm, AI briefed handoffs. Busy or failed targets fall back to a callback instead of stranding the caller." },
  { icon: Languages, title: "Multilingual by default", body: "Streaming multilingual speech to text follows callers who switch languages mid sentence, across 42 plus languages, no config change." },
];

export default function Home() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "2rem" }}>
        <div className="wrap text-center">
          <Reveal>
            <span className="eyebrow mb-6 justify-center"><Sparkles size={13} /> AI agents for customer conversations</span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-hero mx-auto max-w-[56rem]" style={{ textWrap: "balance" }}>
              Your customers reach out.{" "}
              <span className="text-gradient">Vera answers, calls, and closes.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-7 max-w-2xl">
              AI voice and chat agents that talk to your customers, place and take real phone calls,
              run workflows across a thousand tools, and hand off to a human when it matters. Describe your
              business in plain English and Vera builds and deploys the whole thing.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href={CALENDAR_URL} {...bookProps} className="btn btn-gradient btn-lg">Request a demo <ArrowRight /></a>
              <Link href="/signup" className="btn btn-mint btn-lg">Start building free</Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <a href="#demo" className="text-tertiary mt-7 inline-flex items-center gap-2 text-[13px]">
              <Mic size={14} /> or talk to a live agent below
            </a>
          </Reveal>
        </div>
        {/* the signature: full-bleed six-color spectrogram, hero only */}
        <Reveal delay={380}>
          <div className="spectro mt-14" aria-hidden>
            {Array.from({ length: 72 }).map((_, i) => <i key={i} />)}
          </div>
        </Reveal>
      </section>

      {/* ── live demo, floated on glass ── */}
      <section id="demo" className="wrap-tight" style={{ paddingBottom: "1rem" }}>
        <Reveal variant="scale">
          <div className="glass-frame"><VoiceDemo /></div>
        </Reveal>
      </section>

      {/* ── trust marquee ── */}
      <section className="band-sm">
        <div className="wrap">
          <Reveal><p className="eyebrow mb-7 justify-center">Built on best of breed infrastructure</p></Reveal>
          <div className="marquee">
            <div className="marquee__track">
              {STACK.concat(STACK).map((name, i) => (
                <span key={i} className="marq-item text-[17px]">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── platform intro ── */}
      <section className="band" style={{ paddingBottom: "1rem" }}>
        <div className="wrap">
          <Reveal>
            <div className="section-head mx-auto text-center">
              <span className="eyebrow mb-5 justify-center">The platform</span>
              <h2 className="section-title">One brain, every channel your customers use.</h2>
              <p className="lead mt-4">
                Voice, chat, phone, and messaging run on the same grounded agent, the same knowledge, and the
                same tools. Build it visually, or let the deep agent build it for you.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── highlights: one flagship + a concise product grid (deep dive lives on /platform) ── */}
      <Highlights />

      {/* ── reliability ── */}
      <section id="reliability" className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5">Built for the failure modes</span>
              <h2 className="section-title">Most agents demo well and die on real calls.</h2>
              <p className="lead mt-4">
                Real callers ramble, interrupt, have accents, and phone in during provider outages. Every one of
                those is a core concern here, not an afterthought.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-x-14 gap-y-9 md:grid-cols-2">
            {RELIABILITY.map((r, i) => (
              <Reveal key={r.title} delay={(i % 2) * 80}>
                <div className="flex items-start gap-4">
                  <span className="mock-float" style={{ position: "static", padding: 11, borderRadius: 13 }}>
                    <r.icon size={20} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h3 className="text-[19px] font-semibold leading-tight">{r.title}</h3>
                    <p className="text-secondary mt-1.5 text-[15px] leading-relaxed">{r.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── stats ── */}
      <section className="band-sm">
        <div className="wrap">
          <div className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
            {STATS.map(([fig, label], i) => (
              <Reveal key={label} variant="scale" delay={i * 90}>
                <div className="text-center">
                  <div className="figure text-gradient">{fig}</div>
                  <div className="mono mt-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── closing CTA ── */}
      <section className="band">
        <div className="wrap-tight text-center">
          <Reveal>
            <ShieldCheck size={30} strokeWidth={1.5} className="mx-auto mb-6 glow-pulse" style={{ color: "var(--accent)" }} />
            <h2 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              Put your conversations on <span className="text-gradient">Vera.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="lead mx-auto mt-5 max-w-xl">
              Build voice and chat agents, provision real numbers, wire workflows and tools, and simulate callers,
              or let the deep agent do all of it from a single prompt.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <a href={CALENDAR_URL} {...bookProps} className="btn btn-secondary btn-lg"><CalendarDays /> Book a demo</a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

// Home is the overview: a bento of real product surfaces. The deep, per feature
// tour lives on /platform, so nothing is duplicated across pages.
function Highlights() {
  return (
    <section className="band-sm">
      <div className="wrap">
        <Reveal className="bento">
          {/* flagship: deep agent, wide tile with the console filling it */}
          <Link href="/platform#agent" className="bento__tile col4">
            <span className="bento__label"><Bot size={13} /> The deep agent</span>
            <div className="bento__title">Describe it, and it builds it</div>
            <p className="bento__body">
              An autonomous builder plans the work, delegates to system experts, and ships your
              workflows, knowledge, and voice. You approve before anything goes live.
            </p>
            <div className="bento__art"><ConsoleMock /></div>
          </Link>

          {/* voice */}
          <div className="bento__tile col2 pad">
            <span className="bento__label"><AudioLines size={13} /> Voice</span>
            <div className="bento__title">Sub second, grounded calls</div>
            <p className="bento__body">Barge in, multilingual turn taking, and a warm human handoff the moment it matters.</p>
            <div className="mt-auto flex flex-col gap-3 pt-6">
              <VoiceWaveform bars={34} />
              <div className="flex flex-wrap gap-2">
                {["42 plus languages", "~100ms barge in"].map((c) => (
                  <span key={c} className="chip" style={{ fontSize: 11 }}>{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* telephony */}
          <Link href="/platform#telephony" className="bento__tile col2">
            <span className="bento__label"><Phone size={13} /> Telephony</span>
            <div className="bento__title">Real numbers, IVR, transfers</div>
            <div className="bento__art"><TelephonyMock /></div>
          </Link>

          {/* workflows */}
          <Link href="/platform#workflows" className="bento__tile col2">
            <span className="bento__label"><Workflow size={13} /> Workflows</span>
            <div className="bento__title">Visual pathways, real tools</div>
            <div className="bento__art"><WorkflowMock /></div>
          </Link>

          {/* integrations */}
          <div className="bento__tile col2 pad">
            <span className="bento__label"><Plug size={13} /> Integrations</span>
            <div className="bento__title">Plugged into your stack</div>
            <p className="bento__body">Slack, Calendar, HubSpot and a thousand more, with managed OAuth.</p>
            <div className="mt-auto flex justify-center pt-2"><IntegrationOrbits /></div>
          </div>

          {/* vera desk — full width split showcase */}
          <Link href="/platform#desk" className="bento__tile col6 bento__tile--wide">
            <div>
              <span className="bento__label"><Inbox size={13} /> Vera Desk</span>
              <div className="bento__title">One inbox for every channel</div>
              <p className="bento__body">
                Calls, texts, and email in a single thread with tickets, assignment, and a team
                workload view. The technical platform lives here; a clean client view sits on top.
              </p>
              <span className="chip mt-5"><ArrowRight size={12} /> Explore Vera Desk</span>
            </div>
            <div className="bento__art"><InboxMock /></div>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
