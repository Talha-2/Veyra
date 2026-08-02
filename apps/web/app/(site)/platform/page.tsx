import Link from "next/link";
import {
  ArrowRight, AudioLines, Bot, BookOpen, Building2, Check, GitBranch, Inbox,
  MessageSquare, Phone, Plug, Sparkles, Workflow,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import {
  ConsoleMock, InboxMock, IntegrationOrbits, TelephonyMock, VoiceWaveform, WorkflowMock,
} from "@/components/site/graphics";

/* Platform tour — deeper than the home page. Server Component: returns only the
   inner page content (the shared layout owns the nav, aurora, and footer). One
   continuous surface: separation is whitespace, never borders or filled bands. */

type Feature = {
  id: string;
  flip: boolean;
  tag: string;
  icon: typeof AudioLines;
  title: string;
  body: string;
  bullets: string[];
  art: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "voice",
    flip: false,
    tag: "Voice",
    icon: AudioLines,
    title: "Agents that hold a real call",
    body: "Vera answers on LiveKit, transcribes with Deepgram, and speaks with Cartesia, so replies land in well under a second. Callers can barge in mid sentence, and the agent follows anyone who switches languages without a config change.",
    bullets: [
      "Sub second voice to voice on live calls",
      "Barge in driven by semantic turn detection",
      "42 plus languages, no setup required",
    ],
    art: <VoiceTranscript />,
  },
  {
    id: "agent",
    flip: true,
    tag: "Deep agent",
    icon: Bot,
    title: "Describe your business, and it builds the agent",
    body: "The deep agent reads your site and connected tools, plans the work as a live task list, then delegates to system experts that draft your workflows, knowledge, and voice. Nothing ships until you approve it.",
    bullets: [
      "Plans the build as a running task list",
      "Delegates to specialist system experts",
      "Approve before anything goes live",
    ],
    art: <ConsoleMock />,
  },
  {
    id: "workflows",
    flip: false,
    tag: "Workflows",
    icon: Workflow,
    title: "Visual pathways wired to real tools",
    body: "Design what the agent does on every turn: ask, act, branch, and hand off. Each action binds to a Composio tool with its parameters mapped for you, then compiles into runtime the agent executes turn by turn.",
    bullets: [
      "Ask, act, and branch on one canvas",
      "1000 plus tools with parameters mapped",
      "Compile, test, and version every change",
    ],
    art: <WorkflowMock />,
  },
  {
    id: "telephony",
    flip: true,
    tag: "Telephony",
    icon: Phone,
    title: "Real numbers reachable across the globe",
    body: "Provision a phone number in a click, then place and receive live calls in over 100 countries. Inbound and outbound run on the same agent you tuned for voice, and every text lands in one thread beside the call.",
    bullets: [
      "Buy real numbers and route them instantly",
      "Inbound and outbound calling worldwide",
      "Two way SMS in a single thread",
    ],
    art: <TelephonyMock />,
  },
  {
    id: "desk",
    flip: false,
    tag: "Vera Desk",
    icon: Inbox,
    title: "Every conversation in one inbox",
    body: "Calls, texts, and email arrive in a single inbox, alongside tickets and leads captured from your forms and ads. The full technical console lives here, with a calm client view layered on top for your customers.",
    bullets: [
      "Unified inbox across every channel",
      "Tickets, leads, and contacts in context",
      "A clean client view over the console",
    ],
    art: <InboxMock />,
  },
  {
    id: "integrations",
    flip: true,
    tag: "Integrations",
    icon: Plug,
    title: "Plugged into your entire stack",
    body: "Connect Slack, Google Calendar, HubSpot, Stripe, and a thousand more through Composio with managed OAuth. The agent reads each tool, fills the parameters itself, and takes the action in real time.",
    bullets: [
      "Managed OAuth connected in minutes",
      "1000 plus apps through Composio",
      "Bring your own MCP servers too",
    ],
    art: <IntegrationOrbits />,
  },
];

const STATS: [string, string][] = [
  ["<1.2s", "voice to voice, target"],
  ["~100ms", "barge in stop"],
  ["1000+", "tool integrations"],
  ["100+", "countries reachable"],
];

export default function PlatformPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "1rem" }}>
        <div className="wrap text-center">
          <Reveal>
            <span className="eyebrow mb-6 justify-center"><Sparkles size={13} /> The platform</span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-hero mx-auto max-w-4xl">
              One agent. <span className="text-gradient">Every way your customers reach you.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-7 max-w-2xl">
              Voice, phone, chat, and SMS run on a single grounded agent with the same knowledge, the
              same tools, and the same memory. Build it visually in the studio, or let the deep agent
              assemble the whole thing from a plain English prompt.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Book a demo</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── six deep feature sections (text beside a live mockup, no boxes) ── */}
      {FEATURES.map((f) => (
        <section key={f.id} id={f.id} className="band-sm">
          <div className="wrap">
            <div className={`feature-row ${f.flip ? "flip" : ""}`}>
              <Reveal className="feature-copy" variant={f.flip ? "right" : "left"}>
                <span className="eyebrow mb-4"><f.icon size={13} /> {f.tag}</span>
                <h3>{f.title}</h3>
                <p className="lead mt-4">{f.body}</p>
                <ul className="mt-7 flex flex-col gap-3.5">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span
                        className="grid place-items-center"
                        style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 2,
                          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                          color: "var(--accent-text)",
                        }}
                      >
                        <Check size={13} strokeWidth={2.4} />
                      </span>
                      <span className="text-secondary text-[15px] leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal variant="scale" delay={100}>
                <div className="flex justify-center">{f.art}</div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* ── how it fits together ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mx-auto text-center">
              <span className="eyebrow mb-5 justify-center"><GitBranch size={13} /> How it fits together</span>
              <h2 className="section-title">One brain, wired end to end.</h2>
              <p className="lead mx-auto mt-4 max-w-2xl">
                Your knowledge and business profile ground the agent. That agent runs across every channel
                and reaches for the right tool on each turn.
              </p>
            </div>
          </Reveal>

          <Reveal variant="scale" delay={120}>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-4 gap-y-6">
              {/* inputs */}
              <div className="flex flex-col items-center gap-2.5">
                <span className="chip"><BookOpen size={13} /> Knowledge base</span>
                <span className="chip"><Building2 size={13} /> Business profile</span>
              </div>

              <ArrowRight size={20} style={{ color: "var(--text-tertiary)" }} />

              {/* the brain */}
              <span
                className="inline-flex items-center gap-2 font-medium"
                style={{
                  padding: "11px 18px", borderRadius: 999, fontSize: 14,
                  color: "var(--accent-text)",
                  border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))",
                  background: "color-mix(in srgb, var(--accent) 9%, transparent)",
                }}
              >
                <Sparkles size={15} /> Agent brain
              </span>

              <ArrowRight size={20} style={{ color: "var(--text-tertiary)" }} />

              {/* channels */}
              <div className="grid grid-cols-2 gap-2.5">
                <span className="chip"><AudioLines size={13} /> Voice</span>
                <span className="chip"><Phone size={13} /> Phone</span>
                <span className="chip"><MessageSquare size={13} /> Chat</span>
                <span className="chip"><MessageSquare size={13} /> SMS</span>
              </div>

              <ArrowRight size={20} style={{ color: "var(--text-tertiary)" }} />

              {/* tools */}
              <span className="chip"><Plug size={13} /> 1000+ tools</span>
            </div>
          </Reveal>
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
            <Sparkles size={30} strokeWidth={1.5} className="mx-auto mb-6 glow-pulse" style={{ color: "var(--accent)" }} />
            <h2 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              Build it visually, or let the deep agent <span className="text-gradient">build it for you.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="lead mx-auto mt-5 max-w-xl">
              Provision numbers, wire workflows and tools, and simulate real callers in the studio, or hand
              the deep agent a single prompt and approve what it ships.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Book a demo</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* Voice section imagery: a compact live transcript inside a product mock frame. */
function VoiceTranscript() {
  return (
    <div className="mock float-slow" style={{ maxWidth: 420, width: "100%" }}>
      <div className="mock__bar">
        <span className="mock__dot r" /><span className="mock__dot y" /><span className="mock__dot g" />
        <span className="mock__addr">live call · deepgram → agent → cartesia</span>
      </div>
      <div className="mock__body">
        <div className="mk-line">
          <span className="mk-av"><AudioLines size={13} /></span>
          <div className="mk-bubble">Thanks for calling Vera. How can I help you today?</div>
        </div>
        <div className="mk-line me">
          <span className="mk-av" style={{ background: "color-mix(in srgb, var(--voice-caller) 18%, transparent)", color: "var(--voice-caller)" }}>C</span>
          <div className="mk-bubble">Hi, do you have any openings this Friday afternoon?</div>
        </div>
        <div className="mk-line">
          <span className="mk-av"><AudioLines size={13} /></span>
          <div className="mk-bubble">We do, there is a two thirty and a four o'clock. Want me to book one?</div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--accent-text)" }}>
            <GitBranch size={13} /> booking flow · collecting time
          </div>
          <VoiceWaveform bars={14} />
        </div>
      </div>
    </div>
  );
}
