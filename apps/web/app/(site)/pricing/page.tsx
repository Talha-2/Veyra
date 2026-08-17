import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

/* Pricing — three Carbon plans on hairlines, usage passed through at cost,
   questions as list rows. */

type Plan = {
  name: string;
  amount: string;
  unit?: string;
  blurb: string;
  featured?: boolean;
  features: string[];
  cta: { href: string; label: string; ember?: boolean };
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    amount: "Free",
    blurb: "Everything you need to try Veyra end to end",
    features: [
      "Build voice and chat agents",
      "The visual workflow builder",
      "Knowledge base for grounded answers",
      "The live demo playground",
      "Community support",
    ],
    cta: { href: "/signup", label: "Start free" },
  },
  {
    name: "Growth",
    amount: "$99",
    unit: "per month",
    blurb: "For teams putting Veyra on real conversations",
    featured: true,
    features: [
      "Everything in Starter, plus",
      "The deep agent builder",
      "Telephony: real numbers, calls, and SMS",
      "Integrations with managed OAuth",
      "Evals and simulated callers",
      "Email support",
    ],
    cta: { href: "/signup", label: "Start building" },
  },
  {
    name: "Scale",
    amount: "Let's talk",
    blurb: "For higher volume and stricter controls",
    features: [
      "Everything in Growth, plus",
      "SSO and provisioning",
      "Higher rate limits",
      "Priority support",
      "Custom voices and models",
      "A dedicated success contact",
    ],
    cta: { href: "/contact", label: "Contact sales", ember: true },
  },
];

const FAQS: [string, string][] = [
  [
    "Is there really a free plan?",
    "Yes. Starter is free forever. Build voice and chat agents, design workflows in the visual builder, ground them on your knowledge base, and try everything in the live demo before you ever add a card.",
  ],
  [
    "How is voice billed?",
    "Voice minutes, phone numbers, and SMS are billed at provider cost, passed straight through with no markup. Your plan covers the platform; usage is pay as you go, so you only pay for the conversations you actually run.",
  ],
  [
    "Can I use my own phone numbers?",
    "Yes. Provision new numbers inside Veyra across more than a hundred countries, or connect numbers you already own. The same agent you tuned for voice runs on whichever line you point at it.",
  ],
  [
    "What languages are supported?",
    "Veyra handles 42+ languages with streaming speech-to-text that follows callers in real time, including code-switching mid-sentence. No configuration change is needed when a caller switches languages.",
  ],
  [
    "Can I self-host or bring my own models?",
    "On Scale you can bring your own models and custom voices and route to your preferred providers. Talk to us about self-hosting and data-residency options for regulated teams.",
  ],
  [
    "How does the deep agent work?",
    "Describe your business in plain English and the deep agent plans the work, delegates to system experts, and builds your workflows, knowledge, and voice. You review and approve everything before it goes live.",
  ],
];

export default function PricingPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 8vw, 6.5rem)" }}>
        <div className="wrap text-center">
          <h1 className="display-hero mx-auto max-w-[58rem]" style={{ textWrap: "balance" }}>
            Simple pricing that scales with your conversations.
          </h1>
          <p className="lead-lg mx-auto mt-6 max-w-[50ch]">
            One flat platform fee, plus usage at provider cost. Start free and pay only when Veyra
            is answering your calls.
          </p>
          <p className="mono-tag mono-tag--dim mt-6">No credit card to start</p>
        </div>
      </section>

      {/* ── plans ── */}
      <section className="band-sm band--line">
        <div className="wrap">
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`plan ${plan.featured ? "plan--featured" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono-tag">{plan.name}</span>
                  {plan.featured && (
                    <span className="mono-tag" style={{ color: "var(--accent)" }}>
                      Most popular
                    </span>
                  )}
                </div>
                <div className="mt-5 flex items-end gap-2">
                  <span className="plan__price">{plan.amount}</span>
                  {plan.unit && (
                    <span className="mono-tag mono-tag--dim pb-1">{plan.unit}</span>
                  )}
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  {plan.blurb}
                </p>
                <div className="plan__feats mt-5 mb-7">
                  {plan.features.map((feat) => (
                    <div key={feat} className="plan__feat">
                      <span className="check-sq" style={{ marginTop: 1 }}>
                        <Check strokeWidth={2.6} />
                      </span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto">
                  {plan.cta.ember ? (
                    <Link href={plan.cta.href} className="btn-ember w-full">
                      {plan.cta.label} <ArrowRight />
                    </Link>
                  ) : (
                    <Link href={plan.cta.href} className="btn-mint w-full">
                      {plan.cta.label}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="console mt-10">
            <div className="console__bar">
              <span className="console__dot" />
              usage — passed through at cost
            </div>
            <div className="console__body">
              <p className="lead" style={{ maxWidth: "70ch" }}>
                Voice minutes, phone numbers, and SMS are billed at provider cost with no markup.
                You only pay for what you use, and you can watch usage in real time from your
                dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="band band--line">
        <div className="wrap-tight">
          <h2 className="section-title">Questions, answered.</h2>
          <div className="rows mt-10">
            {FAQS.map(([q, a]) => (
              <div key={q} className="row" style={{ gridTemplateColumns: "1fr" }}>
                <span>
                  <span className="row__title">{q}</span>
                  <span className="row__body block" style={{ maxWidth: "75ch" }}>{a}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[22ch]">
            Start free. Upgrade when Veyra is answering your calls.
          </h2>
          <p className="lead mx-auto mt-5 max-w-[46ch]">
            Build voice and chat agents, provision real numbers, and wire your tools. Move up the
            moment Veyra is live and earning its keep.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/contact" className="btn-ember">
              Contact sales <ArrowRight />
            </Link>
            <Link href="/signup" className="btn-mint">
              Start free
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
