import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CirclePlay,
  CreditCard,
  KeyRound,
  Lock,
  MessageSquare,
  Minus,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { SIGN_UP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { CountUp, Reveal, Stagger } from "@/components/mk/motion";
import { FaqAccordion, PassThroughArt } from "@/components/mk/pricing-parts";
import { VoiceOrb } from "@/components/mk/scenes";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free, no credit card. $99 a month when Veyra is answering real calls. Voice minutes, numbers and SMS pass through at provider cost, with no markup.",
};

/* The committed pricing story as structured data. Changes here and in the
   plan cards must move together. Scale has no list price, so it is left out. */
const PRICING_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Veyra",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [
    { "@type": "Offer", name: "Starter", price: "0", priceCurrency: "USD", description: "Everything you need to try Veyra end to end." },
    {
      "@type": "Offer",
      name: "Growth",
      price: "99",
      priceCurrency: "USD",
      description: "For teams putting Veyra on real conversations. Usage billed at provider cost.",
      priceSpecification: { "@type": "UnitPriceSpecification", price: "99", priceCurrency: "USD", unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } },
    },
  ],
};

/* Pricing. Calm, like a product's "which is right for you" page: three plans
   that pop in, the recommended one on black, then the full comparison, what
   every plan includes, and the questions people actually ask. */

type Plan = {
  name: string;
  price: string;
  unit?: string;
  blurb: string;
  recommended?: boolean;
  lead?: string;
  features: string[];
  cta: { label: string; href: string; demo?: boolean };
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: "Free",
    unit: "forever",
    blurb: "Everything you need to try Veyra end to end.",
    features: ["Build voice and chat agents", "The visual workflow builder", "A knowledge base for grounded answers", "The live demo playground", "Community support"],
    cta: { label: "Start free", href: SIGN_UP_URL },
  },
  {
    name: "Growth",
    price: "$99",
    unit: "per month",
    blurb: "For teams putting Veyra on real conversations.",
    recommended: true,
    lead: "Everything in Starter, plus",
    features: ["The deep agent builder", "Telephony: real numbers, calls and SMS", "Integrations with managed sign-in", "Evals and simulated callers", "Email support"],
    cta: { label: "Start building", href: SIGN_UP_URL },
  },
  {
    name: "Scale",
    price: "Let’s talk",
    blurb: "For higher volume and stricter controls.",
    lead: "Everything in Growth, plus",
    features: ["SSO and provisioning", "Higher rate limits", "Priority support", "Custom voices and models", "A dedicated success contact"],
    cta: { label: "Contact sales", href: DEMO_URL, demo: true },
  },
];

/* The comparison. `true` is included, `false` is not, a string is the value. */
type Cell = boolean | string;
const COMPARE: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "Build",
    rows: [
      ["Voice and chat agents", true, true, true],
      ["Visual workflow builder", true, true, true],
      ["Knowledge base for grounded answers", true, true, true],
      ["Live demo playground", true, true, true],
      ["Deep agent builder", false, true, true],
    ],
  },
  {
    group: "Go live",
    rows: [
      ["Real phone numbers, calls and SMS", false, true, true],
      ["Integrations with managed sign-in", false, true, true],
      ["Evals and simulated callers", false, true, true],
      ["Voice minutes, numbers and SMS", false, "At provider cost", "At provider cost"],
    ],
  },
  {
    group: "Scale and control",
    rows: [
      ["SSO and provisioning", false, false, true],
      ["Higher rate limits", false, false, true],
      ["Custom voices and models", false, false, true],
      ["A dedicated success contact", false, false, true],
    ],
  },
  {
    group: "Support",
    rows: [["Support", "Community", "Email", "Priority"]],
  },
];

const INCLUDED = [
  { icon: MessageSquare, title: "Voice and chat agents", body: "Build an agent that talks on the phone and chats on your site." },
  { icon: Workflow, title: "Visual workflow builder", body: "Lay out what should happen, step by step, without code." },
  { icon: BookOpen, title: "A knowledge base", body: "Upload your prices and policies. Answers come from what you wrote." },
  { icon: CirclePlay, title: "Live demo playground", body: "Talk to your agent and hear it before a single customer does." },
  { icon: CreditCard, title: "No card to start", body: "Starter is free forever. Add a card when you are ready to go live." },
  { icon: KeyRound, title: "Keys stay on the server", body: "Credentials are encrypted at rest and never sent to the browser." },
  { icon: ShieldCheck, title: "You approve what ships", body: "Nothing the agent builds goes live until you have reviewed it." },
  { icon: Lock, title: "Your data stays yours", body: "We do not train on your conversations or sell your data." },
];

const FAQS: [string, string][] = [
  ["Is there really a free plan?", "Yes. Starter is free forever. Build voice and chat agents, lay out workflows in the visual builder, ground them in your knowledge base, and try it all in the live demo before you ever add a card."],
  ["How is voice billed?", "Voice minutes, phone numbers and SMS are billed at provider cost, passed straight through with no markup. Your plan covers the platform. Usage is pay as you go, so you only pay for the conversations you actually run."],
  ["Can I use my own phone numbers?", "Yes. Get new numbers inside Veyra in more than 100 countries, or connect numbers you already own. The agent you tuned runs on whichever line you point at it."],
  ["What languages are supported?", "Eight in Studio today: English, Spanish, French, German, Portuguese, Hindi, Arabic and Urdu, each with its own voice. It follows a caller who switches language mid-sentence, with no setting to change."],
  ["Can I self-host or bring my own models?", "On Scale you can bring your own models and custom voices, and route to the providers you prefer. Talk to us about self-hosting and where your data lives if you are a regulated team."],
  ["How does the deep agent work?", "Describe your business in plain English. The deep agent plans the work, hands pieces to specialists, and builds your workflows, knowledge and voice. You review and approve everything before it goes live."],
];

const PLAN_NAMES = ["Starter", "Growth", "Scale"] as const;

function CellMark({ value, strong = false }: { value: Cell; strong?: boolean }) {
  if (value === true) {
    return (
      <>
        <Check size={22} strokeWidth={2.4} className={strong ? "mx-auto text-[var(--mk-ember)]" : "mx-auto text-[var(--mk-ink)]"} aria-hidden="true" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus size={18} className="mx-auto text-[var(--mk-ink-3)] opacity-60" aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-[15px] font-medium text-[var(--mk-ink)]">{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_LD) }} />

      {/* ── hero + plans ─────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-[clamp(88px,12vw,168px)] md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Pricing</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[14ch]">Start free. Pay when it answers.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[44ch]">One flat platform fee, plus usage at exactly what the provider charges. Build for free, and upgrade the day Veyra starts taking your calls.</p>
          </Reveal>
          <Reveal variant="rise" delay={260} className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <span className="mk-pill"><Check size={14} /> No credit card to start</span>
            <span className="mk-pill"><Check size={14} /> No markup on usage</span>
          </Reveal>
        </div>

        <div className="relative mk-wrap mt-16 md:mt-20">
          {/* the glow the recommended plan sits in */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden aspect-square w-[min(760px,70vw)] -translate-x-1/2 -translate-y-1/2 opacity-40 md:block" style={{ background: "var(--mk-glow)", filter: "blur(60px)" }} aria-hidden="true" />
          <Stagger className="relative grid items-stretch gap-5 md:grid-cols-3" step={140}>
            {PLANS.map((p) => (
              <article
                key={p.name}
                className={`mk-card flex flex-col p-8 lg:p-10 ${p.recommended ? "mk-card--night md:-my-5 md:py-12 lg:py-14" : ""}`}
                style={p.recommended ? { boxShadow: "0 0 0 1.5px var(--mk-ember), 0 40px 100px -30px rgba(233,107,52,0.55)" } : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="mk-h3">{p.name}</h2>
                  {p.recommended && <span className="mk-pill" style={{ background: "rgba(233,107,52,0.2)", color: "var(--mk-ember-soft)" }}>Recommended</span>}
                </div>
                <p className="mk-body mt-2">{p.blurb}</p>
                <div className="mt-8 flex items-baseline gap-2">
                  <span className="text-[clamp(44px,4.6vw,64px)] font-semibold leading-none tracking-[-0.05em]">{p.price}</span>
                  {p.unit && <span className="mk-small">{p.unit}</span>}
                </div>
                <a
                  href={p.cta.href}
                  {...(p.cta.demo ? demoProps : {})}
                  className={`mk-btn mt-8 w-full ${p.recommended ? "mk-btn--ember" : "mk-btn--ghost"}`}
                >
                  {p.cta.label}{p.recommended && <ArrowRight />}
                </a>
                <hr className="mk-hairline my-8" />
                {p.lead && <p className="mk-small mb-4 font-medium">{p.lead}</p>}
                <ul className="flex flex-col gap-3.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-[15px] leading-snug">
                      <Check size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: p.recommended ? "var(--mk-ember-soft)" : "var(--mk-ember)" }} aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </Stagger>
          <Reveal variant="fade" delay={300} className="mt-12 text-center">
            <a href="#compare" className="mk-link">Compare every feature <ChevronRight /></a>
          </Reveal>
        </div>
      </section>

      {/* ── usage, passed through ────────────────────────────────────── */}
      <section className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap text-center">
          <Reveal><p className="mk-eyebrow">Usage</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[16ch]">What the carrier charges. Not a cent more.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[44ch]">Voice minutes, phone numbers and SMS are billed at provider cost, with no markup. Your plan pays for the platform. Usage is pay as you go.</p></Reveal>
        </div>
        <Reveal variant="zoom" delay={120} className="mk-wrap mt-16">
          <PassThroughArt />
        </Reveal>
        <Stagger className="mk-wrap mt-20 grid gap-12 text-center sm:grid-cols-3" step={120}>
          <div>
            <div className="mk-h1">0%</div>
            <p className="mk-body mx-auto mt-3 max-w-[22ch]">Markup on minutes, numbers and messages</p>
          </div>
          <div>
            <div className="mk-h1"><CountUp to={100} suffix="+" /></div>
            <p className="mk-body mx-auto mt-3 max-w-[22ch]">Countries where you can get a number</p>
          </div>
          <div>
            <div className="mk-h1"><CountUp to={8} /></div>
            <p className="mk-body mx-auto mt-3 max-w-[22ch]">Languages in Studio, each with its own voice</p>
          </div>
        </Stagger>
        <Reveal delay={200}><p className="mk-small mx-auto mt-16 max-w-[48ch] text-center">Watch usage add up in real time from your dashboard, so the bill is never a surprise.</p></Reveal>
      </section>

      {/* ── compare ──────────────────────────────────────────────────── */}
      <section id="compare" className="mk-section scroll-mt-[var(--mk-nav-h)]">
        <div className="mk-wrap">
          <div className="mb-14 text-center">
            <Reveal><p className="mk-eyebrow">Compare</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[16ch]">Every plan, side by side.</h2></Reveal>
          </div>

          {/* desktop: one table, the plan row stays pinned under the nav */}
          <Reveal variant="fade" className="hidden md:block">
            <table className="w-full border-separate border-spacing-0 text-left">
              <caption className="sr-only">Features included in each Veyra plan</caption>
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="sticky top-[var(--mk-nav-h)] z-10 border-b border-[var(--mk-line)] bg-[var(--mk-bg)] py-6 pr-6 align-bottom">
                    <span className="sr-only">Feature</span>
                  </th>
                  {PLANS.map((p) => (
                    <th key={p.name} scope="col" className={`sticky top-[var(--mk-nav-h)] z-10 border-b border-[var(--mk-line)] px-4 py-6 text-center align-bottom ${p.recommended ? "rounded-t-[22px] bg-[var(--mk-bg-alt)]" : "bg-[var(--mk-bg)]"}`}>
                      <span className="mk-h4 block">{p.name}</span>
                      <span className="mk-small mt-1 block">{p.price}{p.unit && p.unit !== "forever" ? ` ${p.unit}` : ""}</span>
                      <a href={p.cta.href} {...(p.cta.demo ? demoProps : {})} className={`mk-btn mk-btn--sm mt-4 ${p.recommended ? "mk-btn--primary" : "mk-btn--ghost"}`}>{p.cta.label}</a>
                    </th>
                  ))}
                </tr>
              </thead>
              {COMPARE.map((g) => (
                <tbody key={g.group}>
                  <tr>
                    <th scope="colgroup" colSpan={1} className="pt-12 pb-4 pr-6"><span className="mk-h3">{g.group}</span></th>
                    <td className="pt-12 pb-4" />
                    <td className="bg-[var(--mk-bg-alt)] pt-12 pb-4" />
                    <td className="pt-12 pb-4" />
                  </tr>
                  {g.rows.map(([label, ...cells]) => (
                    <tr key={label}>
                      <th scope="row" className="border-t border-[var(--mk-line)] py-5 pr-6 text-[17px] font-normal text-[var(--mk-ink)]">{label}</th>
                      {cells.map((c, i) => (
                        <td key={PLAN_NAMES[i]} className={`border-t border-[var(--mk-line)] px-4 py-5 text-center ${i === 1 ? "bg-[var(--mk-bg-alt)]" : ""}`}>
                          <CellMark value={c} strong={i === 1} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <td />
                  <td />
                  <td className="h-6 rounded-b-[22px] bg-[var(--mk-bg-alt)]" />
                  <td />
                </tr>
              </tfoot>
            </table>
          </Reveal>

          {/* phone: one stacked card per plan */}
          <div className="flex flex-col gap-5 md:hidden">
            {PLANS.map((p, pi) => (
              <Reveal as="article" variant="pop" key={p.name} className={`mk-card p-7 ${p.recommended ? "mk-card--night" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="mk-h3">{p.name}</h3>
                  <span className="mk-small">{p.price}{p.unit && p.unit !== "forever" ? ` ${p.unit}` : ""}</span>
                </div>
                {COMPARE.map((g) => (
                  <div key={g.group} className="mt-6">
                    <p className="mk-kicker">{g.group}</p>
                    <ul className="mt-2">
                      {g.rows.map(([label, ...cells]) => {
                        const c = cells[pi];
                        return (
                          <li key={label} className={`flex items-center justify-between gap-4 border-b border-[var(--mk-line)] py-3 text-[15px] ${c === false ? "text-[var(--mk-ink-3)]" : ""}`}>
                            <span>{label}</span>
                            <span className="shrink-0 text-right">
                              {c === true ? <><Check size={18} strokeWidth={2.4} style={{ color: p.recommended ? "var(--mk-ember-soft)" : "var(--mk-ember)" }} aria-hidden="true" /><span className="sr-only">Included</span></> : c === false ? <><Minus size={16} className="opacity-60" aria-hidden="true" /><span className="sr-only">Not included</span></> : <span className="font-medium">{c}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <a href={p.cta.href} {...(p.cta.demo ? demoProps : {})} className={`mk-btn mt-7 w-full ${p.recommended ? "mk-btn--ember" : "mk-btn--ghost"}`}>{p.cta.label}</a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── in every plan ────────────────────────────────────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-14 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">In every plan</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">The whole platform, from day one.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[44ch]">Starter is not a trial. You build with the same tools, on the same safeguards, as every paying team.</p></Reveal>
          </div>
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" step={80}>
            {INCLUDED.map((f) => (
              <article key={f.title} className="mk-card mk-card-lift flex items-start gap-5 p-6 sm:flex-col sm:gap-0 sm:p-8">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-16" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}>
                  <f.icon size={30} strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="mk-h4 sm:mt-8">{f.title}</h3>
                  <p className="mk-body mt-2">{f.body}</p>
                </div>
              </article>
            ))}
          </Stagger>
          <Reveal className="mt-10 text-center"><Link href="/security" className="mk-link">How we keep it secure <ChevronRight /></Link></Reveal>
        </div>
      </section>

      {/* ── questions ────────────────────────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <div>
            <Reveal><p className="mk-eyebrow">Questions</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Asked and answered.</h2></Reveal>
            <Reveal delay={160}><p className="mk-body mt-5 max-w-[32ch]">Something else on your mind? <a href={DEMO_URL} {...demoProps} className="mk-link">Ask our team <ChevronRight /></a></p></Reveal>
          </div>
          <Reveal variant="rise" delay={120}>
            <FaqAccordion items={FAQS} />
          </Reveal>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-night mk-section relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-10 flex justify-center"><VoiceOrb size={180} /></Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[13ch]">Build it free. Go live for $99.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Build your agent, get a real number and connect your tools. Upgrade the moment Veyra is live and earning its keep.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Start free <ArrowRight /></a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Contact sales</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
