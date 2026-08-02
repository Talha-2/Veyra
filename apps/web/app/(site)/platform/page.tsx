import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import {
  ConsoleMock, InboxMock, IntegrationGrid, TelephonyMock, TranscriptMock, WorkflowMock,
} from "@/components/site/graphics";

/* Platform tour — deeper than the home page. Six product sections on Iron
   hairlines, each proven by its own console. */

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

type Feature = {
  id: string;
  flip: boolean;
  title: string;
  body: string;
  bullets: string[];
  art: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "voice",
    flip: false,
    title: "Agents that hold a real call",
    body: "Vera answers on LiveKit, transcribes with Deepgram, and speaks with Cartesia, so replies land in well under a second. Callers can barge in mid-sentence, and the agent follows anyone who switches languages without a config change.",
    bullets: [
      "Sub-second voice-to-voice on live calls",
      "Barge-in driven by semantic turn detection",
      "42+ languages, no setup required",
    ],
    art: <TranscriptMock />,
  },
  {
    id: "agent",
    flip: true,
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
    title: "Visual pathways wired to real tools",
    body: "Design what the agent does on every turn: ask, act, branch, and hand off. Each action binds to a Composio tool with its parameters mapped for you, then compiles into runtime the agent executes turn by turn.",
    bullets: [
      "Ask, act, and branch on one canvas",
      "1000+ tools with parameters mapped",
      "Compile, test, and version every change",
    ],
    art: <WorkflowMock />,
  },
  {
    id: "telephony",
    flip: true,
    title: "Real numbers reachable across the globe",
    body: "Provision a phone number in a click, then place and receive live calls in over 100 countries. Inbound and outbound run on the same agent you tuned for voice, and every text lands in one thread beside the call.",
    bullets: [
      "Buy real numbers and route them instantly",
      "Inbound and outbound calling worldwide",
      "Two-way SMS in a single thread",
    ],
    art: <TelephonyMock />,
  },
  {
    id: "desk",
    flip: false,
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
    title: "Plugged into your entire stack",
    body: "Connect Slack, Google Calendar, HubSpot, Stripe, and a thousand more through Composio with managed OAuth. The agent reads each tool, fills the parameters itself, and takes the action in real time.",
    bullets: [
      "Managed OAuth, connected in minutes",
      "1000+ apps through Composio",
      "Bring your own MCP servers too",
    ],
    art: <IntegrationGrid />,
  },
];

const PIPELINE = ["Knowledge + profile", "Agent brain", "Voice · Phone · Chat · SMS", "1000+ tools"];

const STATS: [string, string][] = [
  ["<1.2s", "voice to voice, target"],
  ["~100ms", "barge-in stop"],
  ["1000+", "tool integrations"],
  ["100+", "countries reachable"],
];

export default function PlatformPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 8vw, 6.5rem)" }}>
        <div className="wrap text-center">
          <h1 className="display-hero mx-auto max-w-[48rem]" style={{ textWrap: "balance" }}>
            One agent. Every way your customers reach you.
          </h1>
          <p className="lead-lg mx-auto mt-7 max-w-[54ch]">
            Voice, phone, chat, and SMS run on a single grounded agent with the same knowledge,
            tools, and memory. Build it visually, or hand the deep agent a plain-English prompt.
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

      {/* ── six product sections, each proven by its console ── */}
      {FEATURES.map((f) => (
        <section key={f.id} id={f.id} className="band band--line">
          <div className="wrap">
            <div className={`feature-sec ${f.flip ? "flip" : ""}`}>
              <div>
                <h2
                  style={{
                    fontWeight: 300,
                    fontSize: "clamp(1.55rem, 2.7vw, 2.15rem)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                  }}
                >
                  {f.title}
                </h2>
                <p className="lead mt-4 max-w-[54ch]">{f.body}</p>
                <ul className="mt-7 flex flex-col gap-3">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span className="check-sq">
                        <Check strokeWidth={2.6} />
                      </span>
                      <span className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-center">{f.art}</div>
            </div>
          </div>
        </section>
      ))}

      {/* ── how it fits together ── */}
      <section className="band band--line">
        <div className="wrap text-center">
          <h2 className="section-title mx-auto max-w-[20ch]">One brain, wired end to end.</h2>
          <p className="lead mx-auto mt-4 max-w-[52ch]">
            Your knowledge and business profile ground the agent. The agent runs on every channel
            and reaches for the right tool on each turn.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-3">
                <span className="chip chip--mono">{step}</span>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight size={14} aria-hidden style={{ color: "var(--text-tertiary)" }} />
                )}
              </span>
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
          <h2 className="section-title mx-auto max-w-[22ch]">
            Build it visually, or let the deep agent build it for you.
          </h2>
          <p className="lead mx-auto mt-5 max-w-[48ch]">
            Provision numbers, wire workflows and tools, and simulate real callers in the studio —
            or hand over a single prompt and approve what ships.
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
