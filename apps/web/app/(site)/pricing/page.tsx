import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  AudioLines,
  Blocks,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Code2,
  Inbox,
  KeyRound,
  Lock,
  Minus,
  Sparkles,
} from "lucide-react";

import { SIGN_UP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { Reveal, Stagger } from "@/components/mk/motion";
import { FaqAccordion } from "@/components/mk/pricing-parts";
import { VoiceOrb } from "@/components/mk/scenes";
import { Soon } from "@/components/mk/soon";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Veyra Desk is $100 a month per location plus what your agent uses. Veyra Studio is pay as you go from $0.10 a minute, or $0.05 with your own provider keys. $10 of free credit to start, no card.",
};

/* The pricing story as structured data. Changes here and in the plan cards
   must move together. */
const PRICING_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Veyra",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [
    { "@type": "Offer", name: "Veyra Desk", price: "100", priceCurrency: "USD", description: "The AI front desk for one business location, plus usage." },
    { "@type": "Offer", name: "Veyra Studio Pro", price: "29", priceCurrency: "USD", description: "Production API access. The monthly fee is used as usage credit." },
    { "@type": "Offer", name: "Veyra Studio Scale", price: "499", priceCurrency: "USD", description: "Lower rates for volume. The monthly fee is used as usage credit." },
  ],
};

/* Pricing, for two products on one agent. Desk: a flat fee per business plus
   the rate card. Studio: pay as you go, where a monthly fee is credit, not a
   charge. Usage is what the agent does; reading your own data is free. */

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

const SOON = new Set([
  "Phone numbers and calls",
  "Phone number",
  "Phone line minute",
  "Text message (SMS)",
  "SSO and custom contracts",
  "Unlimited team members",
  "Your own provider keys, if you like",
  "With your own provider keys, per minute",
  "With your own provider keys, per message",
]);

const DESK_PLANS: Plan[] = [
  {
    name: "Try it",
    price: "Free",
    unit: "$10 of credit",
    blurb: "Set up your business and talk to your agent before a customer does.",
    features: ["The full Desk and Studio", "Talk to your agent by voice and chat", "Your knowledge, skills and integrations", "No card needed"],
    cta: { label: "Start free", href: SIGN_UP_URL },
  },
  {
    name: "Desk",
    price: "$100",
    unit: "per month, per location",
    blurb: "Your AI front desk, answering customers, with your whole team in one inbox.",
    recommended: true,
    lead: "Everything in Try it, plus",
    features: ["Chat on your website, through our chat API", "Phone numbers and calls", "Unlimited team members", "Tickets, contacts and pipelines", "Usage at the rates below"],
    cta: { label: "Start free", href: SIGN_UP_URL },
  },
  {
    name: "Multi-location",
    price: "Let’s talk",
    blurb: "Several locations, higher volume, or your own terms.",
    lead: "Everything in Desk, plus",
    features: ["A price per location that falls with volume", "Lower usage rates", "A named contact on our team", "SSO and custom contracts"],
    cta: { label: "Contact sales", href: DEMO_URL, demo: true },
  },
];

const STUDIO_PLANS: Plan[] = [
  {
    name: "Build",
    price: "Free",
    unit: "$10 of credit",
    blurb: "Build and test agents, and try the API in a sandbox.",
    features: ["Every Studio feature", "2 conversations at a time", "API keys for testing", "No card needed"],
    cta: { label: "Start building", href: SIGN_UP_URL },
  },
  {
    name: "Pro",
    price: "$29",
    unit: "per month, used as credit",
    blurb: "Put your agent inside your own product.",
    recommended: true,
    lead: "Everything in Build, plus",
    features: ["Production API keys and webhooks", "Unlimited agents", "10 conversations at a time, then $10 a line", "Your own provider keys, if you like"],
    cta: { label: "Start building", href: SIGN_UP_URL },
  },
  {
    name: "Scale",
    price: "$499",
    unit: "per month, used as credit",
    blurb: "Lower rates for products with real volume.",
    lead: "Everything in Pro, plus",
    features: ["About 20% lower rates", "50 conversations at a time", "Higher API rate limits", "Priority support"],
    cta: { label: "Start building", href: SIGN_UP_URL },
  },
];

type Cell = boolean | string;
const DESK_RATES: [string, string, string][] = [
  ["AI voice minute", "$0.10", "Speech, voice, AI models and real-time audio, standard voice and model"],
  ["Premium voice", "+ $0.04 a minute", "Higher-fidelity voices"],
  ["Advanced AI model", "+ $0.04 a minute", "Larger models for harder conversations"],
  ["AI chat message", "$0.01", "Each reply the agent writes"],
  ["Phone number", "$2 a month", "Per number"],
  ["Phone line minute", "$0.015", "On top of the voice minute, for calls over a phone number"],
  ["Text message (SMS)", "$0.025", "Each message, sent or received"],
];

const STUDIO_ROWS: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "Voice",
    rows: [
      ["All included, per minute", "From credit", "$0.10", "$0.08"],
      ["With your own provider keys, per minute", false, "$0.05", "$0.035"],
      ["Premium voice or advanced model", "From credit", "+ $0.04", "+ $0.03"],
    ],
  },
  {
    group: "Chat",
    rows: [
      ["All included, per message", "From credit", "$0.01", "$0.008"],
      ["With your own provider keys, per message", false, "$0.005", "$0.004"],
    ],
  },
  {
    group: "Phone",
    rows: [
      ["Phone number", false, "$2 a month", "$2 a month"],
      ["Phone line minute", false, "$0.015", "$0.012"],
      ["Text message (SMS)", false, "$0.025", "$0.02"],
    ],
  },
  {
    group: "Platform",
    rows: [
      ["REST API, chat API and webhooks", "For testing", true, true],
      ["API requests a minute, per key", "120", "120", "Higher"],
      ["Conversations at a time", "2", "10, then $10 a line", "50"],
      ["Support", "Docs", "Email", "Priority"],
    ],
  },
];

const INCLUDED: { icon: typeof Brain; title: string; body: React.ReactNode }[] = [
  { icon: AudioLines, title: "Voice and chat agents", body: <>An agent that talks and chats with your customers. <span className="whitespace-nowrap">Phone lines<Soon inline /></span></> },
  { icon: BookOpen, title: "Knowledge", body: "Your prices and policies. Answers come only from what you wrote." },
  { icon: Sparkles, title: "Skills and experts", body: "The procedures your agent follows, and the specialists that run them." },
  { icon: Blocks, title: "1,500+ app connections", body: "Calendars, CRMs and the tools your team already uses." },
  { icon: Brain, title: "Memory", body: "What your agent should always keep in mind about your business." },
  { icon: Code2, title: "API and webhooks", body: "Reading and writing your own data is included. You pay for what the agent does." },
  { icon: KeyRound, title: "Keys stay on the server", body: "Provider keys are encrypted at rest and never sent to the browser." },
  { icon: Lock, title: "Your data stays yours", body: "We do not train on your conversations or sell your data." },
];

const FAQS: [string, string, boolean?][] = [
  ["Is there a free plan?", "Every new account gets $10 of credit, with no card. That is enough to set up your business and talk to your agent by voice and chat for a good while. Add a card when you are ready to go live."],
  ["What is the difference between Desk and Studio?", "Desk is the finished front desk for a business: the agent answers your customers and your team works every conversation in one inbox. Studio is for developers who want the same agent inside their own product, through the API. Desk includes Studio for setting up your own agent."],
  ["Do API calls cost extra?", "No. Reading and writing your contacts, tickets, knowledge and conversations through the API is included in every plan, within the rate limits. You pay for what the agent does: its minutes and messages."],
  ["What does \"used as credit\" mean?", "On Studio Pro and Scale, the monthly fee is not a separate charge. It is added to your balance and spent on your usage first. If you use less than the fee in a month, the fee is all you pay."],
  ["What does \"your own provider keys\" mean?", "If you already have accounts with speech, voice and AI model providers, you will be able to connect your keys so those providers bill you directly. Veyra then charges only its platform rate: $0.05 a minute on Pro.", true],
  ["How is usage measured?", "Voice is billed per second of conversation. Chat is billed per reply the agent writes. Messages your customers send are free."],
  ["Can I use my own phone numbers?", "Yes. Get new numbers inside Veyra, or connect numbers you already own. The agent you tuned runs on whichever line you point at it.", true],
  ["Do you offer volume pricing?", "Yes. Studio Scale lowers every rate by about 20%, and above 100,000 minutes a month, or for several Desk locations, we agree a price with you."],
];

const STUDIO_NAMES = ["Build", "Pro", "Scale"] as const;

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

function PlanCards({ plans }: { plans: Plan[] }) {
  return (
    <Stagger className="relative grid items-stretch gap-5 md:grid-cols-3" step={140}>
      {plans.map((p) => (
        <article
          key={p.name}
          className={`mk-card flex flex-col p-8 lg:p-10 ${p.recommended ? "mk-card--night md:-my-5 md:py-12 lg:py-14" : ""}`}
          style={p.recommended ? { boxShadow: "0 0 0 1.5px var(--mk-ember), 0 40px 100px -30px rgba(233,107,52,0.55)" } : undefined}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="mk-h3">{p.name}</h3>
            {p.recommended && <span className="mk-pill" style={{ background: "rgba(233,107,52,0.2)", color: "var(--mk-ember-soft)" }}>Most popular</span>}
          </div>
          <p className="mk-body mt-2">{p.blurb}</p>
          <div className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1">
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
                <span>{f}{SOON.has(f) && <Soon inline />}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </Stagger>
  );
}

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_LD) }} />

      {/* ── hero: two products ────────────────────────────────────────── */}
      <section className="relative pt-16 pb-[clamp(64px,9vw,120px)] md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Pricing</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[15ch]">Pay for what your agent does.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[46ch]">A front desk for your business, or an agent for your own product. Both start with $10 of free credit, and neither charges you for reading your own data.</p>
          </Reveal>
          <Reveal variant="rise" delay={260} className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <span className="mk-pill"><Check size={14} /> $10 of free credit, no card</span>
            <span className="mk-pill"><Check size={14} /> API calls included</span>
            <span className="mk-pill"><Check size={14} /> Voice billed per second</span>
          </Reveal>
        </div>

        <Stagger className="mk-wrap mt-14 grid gap-5 md:grid-cols-2" step={120}>
          <a href="#desk" className="mk-card mk-card-lift flex flex-col p-8 lg:p-10">
            <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}><Inbox size={28} strokeWidth={1.8} /></span>
            <p className="mk-small mt-8 font-medium">For businesses</p>
            <h2 className="mk-h2 mt-1">Veyra Desk</h2>
            <p className="mk-body mt-3">The AI front desk: your agent answers customers, your team works every conversation in one inbox.</p>
            <p className="mt-8 text-[22px] font-semibold tracking-[-0.02em]">$100 a month <span className="mk-body font-normal">per location, plus usage</span></p>
            <span className="mk-link mt-6">See Desk pricing <ChevronRight /></span>
          </a>
          <a href="#studio" className="mk-card mk-card--night mk-card-lift flex flex-col p-8 lg:p-10">
            <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.2)", color: "var(--mk-ember-soft)" }}><Code2 size={28} strokeWidth={1.8} /></span>
            <p className="mk-small mt-8 font-medium">For developers</p>
            <h2 className="mk-h2 mt-1">Veyra Studio</h2>
            <p className="mk-body mt-3">The agent platform: build voice and chat agents and put them inside your own product through the API.</p>
            <p className="mt-8 text-[22px] font-semibold tracking-[-0.02em]">From $0.10 a minute <span className="mk-body font-normal">or $0.05 with your own keys</span></p>
            <span className="mk-link mt-6" style={{ color: "var(--mk-ember-soft)" }}>See Studio pricing <ChevronRight /></span>
          </a>
        </Stagger>
      </section>

      {/* ── Desk ──────────────────────────────────────────────────────── */}
      <section id="desk" className="mk-section mk-alt scroll-mt-[var(--mk-nav-h)]">
        <div className="mk-wrap">
          <div className="mb-14 text-center">
            <Reveal><p className="mk-eyebrow">Veyra Desk</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[18ch]">One price per location, plus what it uses.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">We estimate a typical business uses about $100 a month. If one extra booked job is worth more than that, Desk pays for itself.</p></Reveal>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden aspect-square w-[min(760px,70vw)] -translate-x-1/2 -translate-y-1/2 opacity-30 md:block" style={{ background: "var(--mk-glow)", filter: "blur(60px)" }} aria-hidden="true" />
            <PlanCards plans={DESK_PLANS} />
          </div>

          <Reveal variant="fade" className="mx-auto mt-20 max-w-[920px]">
            <h3 className="mk-h3">Usage</h3>
            <p className="mk-body mt-2">Billed as it happens. Messages your customers send are free.</p>
            <div className="mt-6 overflow-hidden rounded-[var(--mk-radius-tile)] bg-[var(--mk-card)]" style={{ boxShadow: "var(--mk-shadow-card)" }}>
              <table className="w-full text-left">
                <caption className="sr-only">Veyra Desk usage rates</caption>
                <tbody>
                  {DESK_RATES.map(([label, price, note]) => (
                    <tr key={label} className="border-b border-[var(--mk-line)] last:border-0">
                      <th scope="row" className="px-6 py-5 align-top">
                        <span className="text-[17px] font-medium text-[var(--mk-ink)]">{label}{SOON.has(label) && <Soon inline />}</span>
                        <span className="mk-small mt-1 block font-normal">{note}</span>
                      </th>
                      <td className="whitespace-nowrap px-6 py-5 text-right align-top text-[17px] font-semibold">{price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Studio ────────────────────────────────────────────────────── */}
      <section id="studio" className="mk-section scroll-mt-[var(--mk-nav-h)]">
        <div className="mk-wrap">
          <div className="mb-14 text-center">
            <Reveal><p className="mk-eyebrow">Veyra Studio</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[18ch]">Pay as you go. The monthly fee is credit.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">Pro and Scale add their monthly fee to your balance and spend it on your usage first, so a quiet month costs no more than the fee.</p></Reveal>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden aspect-square w-[min(760px,70vw)] -translate-x-1/2 -translate-y-1/2 opacity-30 md:block" style={{ background: "var(--mk-glow)", filter: "blur(60px)" }} aria-hidden="true" />
            <PlanCards plans={STUDIO_PLANS} />
          </div>

          {/* desktop: rates side by side */}
          <Reveal variant="fade" className="mt-24 hidden md:block">
            <table className="w-full border-separate border-spacing-0 text-left">
              <caption className="sr-only">Veyra Studio rates by plan</caption>
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="sticky top-[var(--mk-nav-h)] z-10 border-b border-[var(--mk-line)] bg-[var(--mk-bg)] py-6 pr-6 align-bottom"><span className="mk-h3">Rates</span></th>
                  {STUDIO_PLANS.map((p) => (
                    <th key={p.name} scope="col" className={`sticky top-[var(--mk-nav-h)] z-10 border-b border-[var(--mk-line)] px-4 py-6 text-center align-bottom ${p.recommended ? "rounded-t-[22px] bg-[var(--mk-bg-alt)]" : "bg-[var(--mk-bg)]"}`}>
                      <span className="mk-h4 block">{p.name}</span>
                      <span className="mk-small mt-1 block">{p.price === "Free" ? "$10 of credit" : `${p.price} a month, as credit`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {STUDIO_ROWS.map((g) => (
                <tbody key={g.group}>
                  <tr>
                    <th scope="colgroup" className="pt-12 pb-4 pr-6"><span className="mk-h3">{g.group}</span></th>
                    <td className="pt-12 pb-4" />
                    <td className="bg-[var(--mk-bg-alt)] pt-12 pb-4" />
                    <td className="pt-12 pb-4" />
                  </tr>
                  {g.rows.map(([label, ...cells]) => (
                    <tr key={label}>
                      <th scope="row" className="border-t border-[var(--mk-line)] py-5 pr-6 text-[17px] font-normal text-[var(--mk-ink)]">{label}{SOON.has(label) && <Soon inline />}</th>
                      {cells.map((c, i) => (
                        <td key={STUDIO_NAMES[i]} className={`border-t border-[var(--mk-line)] px-4 py-5 text-center ${i === 1 ? "bg-[var(--mk-bg-alt)]" : ""}`}>
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

          {/* phone: one card per plan */}
          <div className="mt-16 flex flex-col gap-5 md:hidden">
            {STUDIO_PLANS.map((p, pi) => (
              <Reveal as="article" variant="pop" key={p.name} className={`mk-card p-7 ${p.recommended ? "mk-card--night" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="mk-h3">{p.name}</h3>
                  <span className="mk-small">{p.price === "Free" ? "$10 of credit" : `${p.price} a month`}</span>
                </div>
                {STUDIO_ROWS.map((g) => (
                  <div key={g.group} className="mt-6">
                    <p className="mk-kicker">{g.group}</p>
                    <ul className="mt-2">
                      {g.rows.map(([label, ...cells]) => {
                        const c = cells[pi];
                        return (
                          <li key={label} className={`flex items-center justify-between gap-4 border-b border-[var(--mk-line)] py-3 text-[15px] ${c === false ? "text-[var(--mk-ink-3)]" : ""}`}>
                            <span>{label}{SOON.has(label) && <Soon inline />}</span>
                            <span className="shrink-0 text-right">
                              {c === true ? <><Check size={18} strokeWidth={2.4} style={{ color: p.recommended ? "var(--mk-ember-soft)" : "var(--mk-ember)" }} aria-hidden="true" /><span className="sr-only">Included</span></> : c === false ? <><Minus size={16} className="opacity-60" aria-hidden="true" /><span className="sr-only">Not included</span></> : <span className="font-medium">{c}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-12 text-center">
            <Link href="/docs/api/overview" className="mk-link">Read the API docs <ChevronRight /></Link>
          </Reveal>
        </div>
      </section>

      {/* ── what a minute is ──────────────────────────────────────────── */}
      <section className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap text-center">
          <Reveal><p className="mk-eyebrow">What a minute includes</p></Reveal>
          <Reveal delay={80}><h2 className="mk-h1 mx-auto mt-2 max-w-[17ch]">Everything it takes to hold a conversation.</h2></Reveal>
          <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">One voice minute covers the whole pipeline. Or bring your own provider keys and pay us only for running it.</p></Reveal>
        </div>
        <Stagger className="mk-wrap mt-16 grid gap-5 md:grid-cols-2" step={120}>
          <article className="mk-card mk-card--night p-8 lg:p-10" style={{ boxShadow: "0 0 0 1.5px var(--mk-ember)" }}>
            <p className="mk-small font-medium">All included</p>
            <p className="mt-3 text-[clamp(44px,4.6vw,64px)] font-semibold leading-none tracking-[-0.05em]">$0.10<span className="mk-body ml-2 font-normal tracking-normal">a minute</span></p>
            <ul className="mt-8 flex flex-col gap-3.5">
              {["Hearing the caller: speech recognition", "Thinking and acting: the AI models", "Speaking: a natural voice", "Real-time audio in both directions", "The talker and worker that run it all"].map((l) => (
                <li key={l} className="flex items-start gap-3 text-[15px] leading-snug"><Check size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: "var(--mk-ember-soft)" }} aria-hidden="true" />{l}</li>
              ))}
            </ul>
          </article>
          <article className="mk-card mk-card--night p-8 lg:p-10">
            <p className="mk-small font-medium">Your own provider keys · Studio <Soon inline /></p>
            <p className="mt-3 text-[clamp(44px,4.6vw,64px)] font-semibold leading-none tracking-[-0.05em]">$0.05<span className="mk-body ml-2 font-normal tracking-normal">a minute</span></p>
            <ul className="mt-8 flex flex-col gap-3.5">
              {["Your speech, voice and model providers bill you directly", "Veyra runs the pipeline, the agent and its tools", "Real-time audio in both directions", "Your keys stay encrypted on our servers"].map((l) => (
                <li key={l} className="flex items-start gap-3 text-[15px] leading-snug"><Check size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: "var(--mk-ember-soft)" }} aria-hidden="true" />{l}</li>
              ))}
            </ul>
          </article>
        </Stagger>
      </section>

      {/* ── in every plan ────────────────────────────────────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-14 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">In every plan</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">The whole platform, from day one.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[44ch]">The free credit is not a cut-down trial. You build with the same tools, on the same safeguards, as every paying team.</p></Reveal>
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
          <Reveal><h2 className="mk-display mx-auto max-w-[14ch]">Start with $10 on us.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Set up your agent, talk to it, and see it work with your business in it. No card until you go live.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Start free <ArrowRight /></a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Contact sales</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
