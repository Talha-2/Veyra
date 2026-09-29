import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building2,
  ChevronRight,
  Download,
  EyeOff,
  HandCoins,
  KeyRound,
  LifeBuoy,
  PhoneForwarded,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  TimerOff,
  Trash2,
  UserCheck,
  Webhook,
  BrainCircuit,
} from "lucide-react";

import { LogoTile, PARTNERS } from "@/components/mk/brand";
import { SIGN_UP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { CountUp, HorizontalScroll, Parallax, Reveal, Stagger, TextReveal } from "@/components/mk/motion";
import { DataFlow, PrincipleArt, ShieldArt } from "@/components/mk/security-parts";
import { Soon } from "@/components/mk/soon";

export const metadata: Metadata = {
  title: "Security",
  description:
    "Your data lives in one place, isolated per organization. Secrets stay on the server, webhooks are signed, API keys are hashed, and risky actions wait for a person.",
};

/* Security. Written like a privacy page: one big claim per screen, each
   shown as a picture of how the system actually works. Only what is true
   today; no certifications are claimed because none are held. */

const PRINCIPLES = [
  { icon: Building2, art: "tenants", title: "Every organization, walled off.", body: "Every record belongs to one organization, and every query is limited to it automatically. If no organization is set, the answer is nothing, not everyone’s data." },
  { icon: KeyRound, art: "secrets", title: "Secrets never reach the browser.", body: "API keys and app tokens live on the server, encrypted at rest. The agent uses them. No page, device or customer session ever holds one." },
  { icon: Webhook, art: "webhooks", title: "Webhooks you can verify.", body: "Every event we send carries an HMAC-SHA256 signature in the X-Veyra-Signature header, so your server can prove it came from us." },
  { icon: EyeOff, art: "hashed", title: "A key you see once.", body: "API keys are stored as a hash, never as the key itself. You see the full key once, when you create it. After that, only its first few characters." },
  { icon: SlidersHorizontal, art: "scopes", title: "Keys that do one job.", body: "Give each key only the scopes it needs. Each connected app gets only the access it needs. Revoke either in one click, and the access ends." },
  { icon: UserCheck, art: "confirm", title: "Risky actions wait for you.", body: "Before the agent makes a change that matters, a person confirms it. Looking things up is instant. Changing them is a decision." },
  { icon: TimerOff, art: "timeout", title: "A timeout is not a yes.", body: "If an action times out, the agent does not assume it worked. It says so, and flags it for your team to check." },
  { icon: ShieldCheck, art: "approval", title: "Nothing goes live on its own.", body: "You review what the deep agent builds: the workflows, the voice, the knowledge. No call reaches it until you approve." },
];

const YOURS = [
  { icon: BrainCircuit, title: "Not used for training", body: "We do not train on your conversations." },
  { icon: HandCoins, title: "Never sold", body: "Your customers’ records are not for sale." },
  { icon: Download, title: "Yours to export", body: "Knowledge, transcripts and customer records." },
  { icon: Trash2, title: "Yours to delete", body: "Remove what you no longer want us to hold." },
];

const FAILSAFE = [
  { icon: LifeBuoy, title: "Degrade to safe.", body: "When something breaks, Veyra falls back to a person or a callback. It never makes up a policy to fill a silence.", tag: "Human fallback" },
  { icon: Radio, title: "Provider failover.", body: "If a voice or model provider falters mid-call, Veyra switches over on its own. The caller hears a voice, not dead air.", tag: "Mid-call" },
  { icon: BookOpen, title: "Grounded, never guessing.", body: "It answers from your knowledge, or it says it does not know. A confident wrong answer counts as a failure.", tag: "No improvising" },
  { icon: PhoneForwarded, title: "Warm handoffs, always.", body: "Transfers carry the context. If the person is busy, the caller gets a callback instead of a long hold.", tag: "Context carried", soon: true },
];

const CARRIERS = PARTNERS.filter((p) => ["Twilio", "Telnyx", "LiveKit"].includes(p.name));

export default function SecurityPage() {
  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Security</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[13ch]">Your data. Your keys. Your call.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[44ch]">Veyra is built to sit in front of your customers. Your data lives in one place, your secrets never leave the server, and the agent asks before it does anything risky.</p>
          </Reveal>
          <Reveal variant="rise" delay={280} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started</a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Talk to our team</a>
          </Reveal>
        </div>
        <Reveal variant="zoom" delay={200} className="mt-10 flex justify-center">
          <Parallax speed={-0.12}><ShieldArt /></Parallax>
        </Reveal>
      </section>

      {/* ── the idea, lit word by word ───────────────────────────────── */}
      <section className="mk-section--tight pb-[clamp(88px,12vw,168px)]">
        <div className="mk-wrap--text mk-wrap">
          <TextReveal className="mk-h2" text="You are putting an agent in front of your customers. So the safeguards are not an add-on. They are how Veyra is built, from the database up." />
        </div>
      </section>

      {/* ── architecture: who holds what ─────────────────────────────── */}
      <section className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap">
          <div className="mb-16 text-center">
            <Reveal><p className="mk-eyebrow">How it is built</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[18ch]">One place holds your data. The agent holds none.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">Veyra is two layers. The app layer keeps your records, your settings and your credentials. The agent layer talks, thinks and acts, and keeps no customer data of its own.</p></Reveal>
          </div>
          <Reveal variant="zoom" delay={120}><DataFlow /></Reveal>
          <Stagger className="mt-24 grid grid-cols-2 gap-x-6 gap-y-12 text-center lg:grid-cols-4" step={120}>
            <div>
              <div className="mk-h1"><CountUp to={256} /></div>
              <p className="mk-body mx-auto mt-3 max-w-[22ch]">Bit HMAC-SHA256 signature on every webhook we send</p>
            </div>
            <div>
              <div className="mk-h1"><CountUp to={1} duration={600} /></div>
              <p className="mk-body mx-auto mt-3 max-w-[22ch]">Time you ever see a new API key in full</p>
            </div>
            <div>
              <div className="mk-h1">0</div>
              <p className="mk-body mx-auto mt-3 max-w-[22ch]">Secrets sent to the browser</p>
            </div>
            <div>
              <div className="mk-h1">0</div>
              <p className="mk-body mx-auto mt-3 max-w-[22ch]">Customer records kept by the agent layer</p>
            </div>
          </Stagger>
        </div>
      </section>

      {/* ── principles: the cards travel sideways ────────────────────── */}
      <section className="mk-alt">
        <HorizontalScroll
          header={
            <div className="mk-wrap mb-8 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mk-eyebrow">Eight safeguards</p>
                <h2 className="mk-h2 mt-2 max-w-[16ch]">Built in. Not bolted on.</h2>
              </div>
              <p className="mk-body max-w-[36ch]">What keeps your customers, your data and your keys safe, one rule at a time.</p>
            </div>
          }
        >
          {PRINCIPLES.map((p) => (
            <article key={p.title} className="mk-card flex shrink-0 flex-col" style={{ width: "min(400px, 80vw)", height: "min(540px, calc(100svh - 330px))", minHeight: 440 }}>
              <div className="p-8 pb-0">
                <p.icon size={28} className="text-[var(--mk-ember)]" />
                <h3 className="mk-h3 mt-5">{p.title}</h3>
                <p className="mk-body mt-3">{p.body}</p>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden"><PrincipleArt kind={p.art} /></div>
            </article>
          ))}
        </HorizontalScroll>
      </section>

      {/* ── your data ────────────────────────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap">
          <div className="mb-14 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">Your data</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">It stays yours.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[44ch]">Your knowledge, transcripts and customer records belong to you. We do not train on them, we do not sell them, and you can take them with you.</p></Reveal>
          </div>
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" step={90}>
            {YOURS.map((y) => (
              <article key={y.title} className="mk-card mk-card-lift flex items-start gap-5 p-6 sm:flex-col sm:gap-0 sm:p-8">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-16" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}>
                  <y.icon size={30} strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="mk-h4 sm:mt-8">{y.title}</h3>
                  <p className="mk-body mt-2">{y.body}</p>
                </div>
              </article>
            ))}
          </Stagger>

          <div className="mt-24 grid items-center gap-12 rounded-[var(--mk-radius-card)] bg-[var(--mk-bg-alt)] p-8 md:p-14 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Reveal><h3 className="mk-h2 max-w-[16ch]">Calls ride carrier-grade networks.</h3></Reveal>
              <Reveal delay={100}><p className="mk-body mt-4 max-w-[42ch]">Voice and phone traffic runs on established providers, with encryption in transit handled at the provider level.</p></Reveal>
              <Reveal delay={140}><p className="mk-small mt-4 flex flex-wrap items-center gap-2">Phone lines through Twilio and Telnyx <Soon /></p></Reveal>
            </div>
            <Stagger className="flex items-center justify-center gap-4 sm:gap-5 lg:justify-end" step={120}>
              {CARRIERS.map((p) => (
                <div key={p.name} className="w-[84px] sm:w-32">
                  <LogoTile partner={p} size={128} className="w-full!" />
                </div>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      {/* ── failure modes ────────────────────────────────────────────── */}
      <section className="mk-night mk-section">
        <div className="mk-wrap">
          <div className="mb-14 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">When things go wrong</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Built to fail in the right direction.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[44ch]">Trust is also how the agent behaves when a call, a provider or a tool goes sideways.</p></Reveal>
          </div>
          <Stagger className="grid gap-5 md:grid-cols-2" step={110}>
            {FAILSAFE.map((f) => (
              <article key={f.title} className="mk-card flex flex-col p-8 md:p-10" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-16 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.16)", color: "var(--mk-ember-soft)" }}>
                    <f.icon size={30} strokeWidth={1.8} />
                  </span>
                  <span className="mk-pill mk-pill--ember">{f.tag}</span>
                </div>
                <h3 className="mk-h3 mt-8">{f.title}{f.soon && <Soon inline />}</h3>
                <p className="mk-body mt-3 max-w-[44ch]">{f.body}</p>
              </article>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section mk-alt relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-10 flex justify-center">
            <span className="mk-logo-tile w-[120px]"><BadgeCheck size={56} strokeWidth={1.6} className="text-[var(--mk-ember)]" /></span>
          </Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[14ch]">Put it in front of your customers.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Have a security review team? We will walk them through how Veyra is built, layer by layer.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--primary">Talk to our team <ArrowRight /></a>
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--ghost">Get started</a>
          </Reveal>
          <Reveal delay={260} className="mt-8"><Link href="/pricing" className="mk-link">See pricing <ChevronRight /></Link></Reveal>
        </div>
      </section>
    </>
  );
}
