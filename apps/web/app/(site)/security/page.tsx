import Link from "next/link";
import {
  Activity, ArrowRight, BadgeCheck, Database, Fingerprint, GitBranch, KeyRound,
  Lock, RefreshCw, ShieldCheck, Webhook,
  type LucideIcon,
} from "lucide-react";
import Reveal from "@/components/Reveal";

/* Security / trust page. Server Component: returns inner content only. The
   shared (site)/layout owns the nav, the fixed aurora, and the footer, so this
   is one continuous surface, separated by whitespace, never borders or filled
   bands. Clear trust points with icons, grounded in how the product works. */

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: KeyRound,
    title: "Credentials stay server side",
    body: "API keys and OAuth tokens live on the server, encrypted at rest. They are never sent to the browser, and your customers never touch them. The agent acts with them; nobody sees them.",
  },
  {
    icon: BadgeCheck,
    title: "Approval before anything goes live",
    body: "Nothing the deep agent builds ships on its own. You review the workflows, the voice, and the knowledge, and not a single call can land until you approve it.",
  },
  {
    icon: Webhook,
    title: "Signed and verified webhooks",
    body: "Every inbound event is signed and checked before it reaches your agent, so whatever triggers an action is provably from where it claims to be.",
  },
  {
    icon: Database,
    title: "You own your data",
    body: "We do not train on your conversations or sell your data. Your knowledge, transcripts, and customer records stay yours, and you can export or delete them.",
  },
  {
    icon: Lock,
    title: "Encrypted at the provider",
    body: "Calls run on carrier grade infrastructure with encryption in transit at the provider level, handled by the same vendors that power regulated contact centers.",
  },
  {
    icon: Fingerprint,
    title: "Scoped, least privilege access",
    body: "Each tool connects with only the permissions it needs. Revoke a connection in one click and the agent loses that access immediately.",
  },
];

const RELIABILITY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: "Degrade to safe",
    body: "When something breaks, Vera falls back to a human or a callback. It never invents a policy just to fill the silence.",
  },
  {
    icon: RefreshCw,
    title: "Provider failover",
    body: "If a voice or model provider degrades mid call, Vera fails over automatically, so the caller hears a voice, not dead air.",
  },
  {
    icon: Activity,
    title: "Grounded, never guessing",
    body: "The agent answers from your knowledge or it says it does not know. A confident wrong answer is treated as a failure, not a feature.",
  },
  {
    icon: GitBranch,
    title: "Warm handoffs, always",
    body: "Transfers carry context, and a busy or failed target falls back to a callback instead of stranding the caller on hold.",
  },
];

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
        color: "var(--accent-text)", display: "grid", placeItems: "center",
      }}
    >
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}

export default function SecurityPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "1.5rem" }}>
        <div className="wrap">
          <div style={{ maxWidth: 860 }}>
            <Reveal>
              <span className="eyebrow mb-6"><ShieldCheck size={13} /> Security and trust</span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="display-hero">
                Trusted with your calls,{" "}
                <span className="text-gradient">your data, and your customers.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="lead mt-7 max-w-2xl">
                Vera runs on infrastructure you can put in front of real customers. Credentials stay
                server side, nothing ships without your approval, and every action the agent takes is
                scoped, signed, and logged.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
                <Link href="/contact" className="btn btn-secondary btn-lg">Talk to us</Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── trust points ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><Lock size={13} /> How we keep it safe</span>
              <h2 className="section-title">The boring parts, taken seriously.</h2>
              <p className="lead mt-4 max-w-2xl">
                You are putting Vera in front of real customers, so the controls are not an add on.
                They are how the platform is built.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {TRUST.map((t, i) => (
              <Reveal key={t.title} delay={(i % 2) * 90}>
                <div className="flex items-start gap-4">
                  <IconTile icon={t.icon} />
                  <div>
                    <h3 className="text-[18px] font-semibold leading-snug">{t.title}</h3>
                    <p className="text-secondary mt-1.5 text-[15px] leading-relaxed">{t.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── credentials highlight ── */}
      <section className="band-sm">
        <div className="wrap-tight">
          <Reveal variant="scale">
            <div className="glass-card text-center" style={{ padding: "30px 34px" }}>
              <span
                className="mx-auto mb-4 inline-flex items-center justify-center"
                style={{
                  width: 44, height: 44, borderRadius: 13,
                  background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                  color: "var(--accent-text)",
                }}
              >
                <Lock size={22} strokeWidth={1.8} />
              </span>
              <p className="lead" style={{ color: "var(--text-secondary)" }}>
                Credentials never touch the browser. The agent holds your keys server side and acts on
                your behalf, so a token cannot leak from a page, a device, or a customer's session. You
                connect a tool once; Vera does the rest without ever exposing the secret.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── reliability posture ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><Activity size={13} /> Reliability posture</span>
              <h2 className="section-title">Built to fail in the right direction.</h2>
              <p className="lead mt-4 max-w-2xl">
                Trust is not only about who can see your data. It is whether the agent behaves when a
                call, a provider, or a tool goes sideways. Vera is designed to degrade to safe.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {RELIABILITY.map((r, i) => (
              <Reveal key={r.title} delay={(i % 2) * 90}>
                <div className="flex items-start gap-4">
                  <IconTile icon={r.icon} />
                  <div>
                    <h3 className="text-[18px] font-semibold leading-snug">{r.title}</h3>
                    <p className="text-secondary mt-1.5 text-[15px] leading-relaxed">{r.body}</p>
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
            <ShieldCheck size={30} strokeWidth={1.5} className="mx-auto mb-6 glow-pulse" style={{ color: "var(--accent)" }} />
          </Reveal>
          <Reveal delay={80}>
            <h2 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              Put it in front of your customers{" "}
              <span className="text-gradient">with confidence.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-5 max-w-xl">
              Start building on a platform that keeps your credentials, your data, and your callers
              safe by default. Have a security review team? We are happy to walk them through it.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Talk to us</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
