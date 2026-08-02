import Link from "next/link";
import {
  ArrowRight, Gauge, GitBranch, Heart, Lock, PhoneCall,
  Server, ShieldCheck, Sparkles, Target,
  type LucideIcon,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import { Logo } from "@/components/Logo";

/* Company / About page for the Vera marketing site. Chrome (nav, aurora,
   footer) lives in the shared (site)/layout, so this returns inner content
   only. One continuous surface: separation is whitespace, not borders. */

const STACK = ["LiveKit", "Deepgram", "Cartesia", "OpenAI", "Composio", "ElevenLabs", "Twilio"];

const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Gauge,
    title: "p95 is the product",
    body: "We design for the worst calls, not the median. Hold up at the ninety fifth percentile and the easy calls take care of themselves.",
  },
  {
    icon: Target,
    title: "Grounded, never guessing",
    body: "The agent answers from your knowledge or it tells the caller it does not know. A confident wrong answer is worse than an honest gap.",
  },
  {
    icon: ShieldCheck,
    title: "Degrade to safe",
    body: "When something breaks, we fall back to a human or a callback. The agent never invents a policy just to fill the silence.",
  },
  {
    icon: GitBranch,
    title: "One brain, every channel",
    body: "Voice, chat, phone, and messaging run on one grounded agent with the same knowledge and tools. No channel gets a weaker version.",
  },
  {
    icon: Sparkles,
    title: "Ship real features",
    body: "Everything we build works end to end. No dummy mimics, no screens that only look finished long enough for a screenshot.",
  },
  {
    icon: PhoneCall,
    title: "Own the failure modes",
    body: "Barge in, provider failover, warm transfers, and multilingual turn taking are core concerns here, not extras we bolt on later.",
  },
];

const SECURITY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Credentials stay server side",
    body: "API keys and OAuth tokens live on the server and are never exposed to the browser. The agent acts with them; your users never touch them.",
  },
  {
    icon: Server,
    title: "Your data stays yours",
    body: "We do not train on your conversations or sell your data. Your knowledge, your transcripts, and your customer records remain yours.",
  },
  {
    icon: ShieldCheck,
    title: "Approval before go live",
    body: "Nothing the deep agent builds ships until you approve it. You review the workflows, the voice, and the knowledge before a single call lands.",
  },
  {
    icon: GitBranch,
    title: "Signed webhooks",
    body: "Every inbound event is signed and verified, so what reaches your agent is provably from where it claims to be.",
  },
];

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
        color: "var(--accent-text)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}

export default function CompanyPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "2rem" }}>
        <div className="wrap">
          <div style={{ maxWidth: 860 }}>
            <Reveal>
              <span className="eyebrow mb-6"><Sparkles size={13} /> Company</span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="display-hero">
                We are building the agent that{" "}
                <span className="text-gradient">actually picks up.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="lead mt-7 max-w-2xl">
                Most AI voice agents demo beautifully and fall apart on the first real call. Vera is
                built for the callers that break demos: grounded, sub second, and reliable under
                conditions no scripted demo will ever show you.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="chips mt-8">
                <span className="chip"><Gauge size={12} /> Sub second</span>
                <span className="chip"><Target size={12} /> Grounded</span>
                <span className="chip"><ShieldCheck size={12} /> Reliable under load</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── mission / story ── */}
      <section className="band" style={{ paddingTop: "1rem" }}>
        <div className="wrap-tight">
          <Reveal>
            <span className="eyebrow mb-6"><Heart size={13} /> Why Vera exists</span>
          </Reveal>
          <Reveal delay={80}>
            <p className="lead" style={{ fontSize: "clamp(1.05rem, 1.5vw, 1.22rem)" }}>
              We started Vera because the distance between a great voice demo and a voice agent you
              would actually put on your main line is enormous. The demo answers one clean question
              in a quiet room. The real line brings accents, background noise, people who talk over
              you, and the occasional provider outage at the worst possible moment.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <p className="lead mt-6" style={{ fontSize: "clamp(1.05rem, 1.5vw, 1.22rem)" }}>
              So we build for the p95, not the p50. The median call was never the hard part. The
              product is what happens when a call goes sideways: the barge in that stops mid word,
              the synthesis that fails over before the caller hears silence, the honest{" "}
              <span className="text-accent">I do not know</span> instead of a confident wrong one.
              One grounded brain runs across voice, chat, phone, and messaging, so the agent behaves
              the same everywhere your customers reach you.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── principles ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><GitBranch size={13} /> Principles</span>
              <h2 className="section-title">How we build.</h2>
              <p className="lead mt-4">
                A short list of the things we refuse to compromise on. They show up in the code, not
                just the pitch.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} variant="up" delay={(i % 3) * 90}>
                <div className="flex items-start gap-4">
                  <IconTile icon={p.icon} />
                  <div>
                    <h3 className="text-[18px] font-semibold leading-snug">{p.title}</h3>
                    <p className="text-secondary mt-1.5 text-[15px] leading-relaxed">{p.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── built on ── */}
      <section className="band-sm">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow mb-7 justify-center">Built on best of breed infrastructure</p>
          </Reveal>
          <div className="marquee">
            <div className="marquee__track">
              {STACK.concat(STACK).map((name, i) => (
                <span key={i} className="marq-item text-[17px]">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── security and trust ── */}
      <section id="security" className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><Lock size={13} /> Trust</span>
              <h2 className="section-title">Security and trust.</h2>
              <p className="lead mt-4">
                The boring parts we take seriously, because you are putting this in front of real
                customers.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {SECURITY.map((s, i) => (
              <Reveal key={s.title} variant="up" delay={(i % 2) * 90}>
                <div className="flex items-start gap-4">
                  <IconTile icon={s.icon} />
                  <div>
                    <h3 className="text-[18px] font-semibold leading-snug">{s.title}</h3>
                    <p className="text-secondary mt-1.5 text-[15px] leading-relaxed">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── closing CTA ── */}
      <section className="band">
        <div className="wrap-tight text-center">
          <Reveal variant="scale">
            <div className="mb-7 flex justify-center">
              <Logo size={40} />
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              Come build the agent that <span className="text-gradient">picks up.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-5 max-w-xl">
              If reliability over flash sounds like your kind of engineering, we should talk. Start
              building today, or reach out and tell us about the calls that keep breaking.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">
                Start building free <ArrowRight />
              </Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">
                Talk to us
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
