import Link from "next/link";
import {
  ArrowRight, Bot, Check, MessageSquare, Phone, Sparkles, ShieldCheck, Zap,
} from "lucide-react";
import Reveal from "@/components/Reveal";

/* Pricing — inner content only. The shared (site) layout owns the nav,
   the fixed aurora background, and the footer, so this page returns a
   fragment and lets the one continuous surface show through. */

type Plan = {
  name: string;
  amount: string;
  unit?: string;
  blurb: string;
  featured?: boolean;
  badge?: string;
  features: string[];
  cta: { href: string; label: string; cls: string };
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    amount: "Free",
    blurb: "Everything you need to try Vera end to end",
    features: [
      "Build voice and chat agents",
      "The visual workflow builder",
      "Knowledge base for grounded answers",
      "The live demo playground",
      "Community support",
    ],
    cta: { href: "/signup", label: "Start free", cls: "btn-secondary" },
  },
  {
    name: "Growth",
    amount: "$99",
    unit: "per month",
    blurb: "For teams putting Vera on real conversations",
    featured: true,
    badge: "Most popular",
    features: [
      "Everything in Starter, plus",
      "The deep agent builder",
      "Telephony: real numbers, calls, and SMS",
      "Integrations with managed OAuth",
      "Evals and simulated callers",
      "Email support",
    ],
    cta: { href: "/signup", label: "Start building", cls: "btn-gradient" },
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
    cta: { href: "/contact", label: "Contact sales", cls: "btn-secondary" },
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
    "Yes. Provision new numbers inside Vera across more than a hundred countries, or connect numbers you already own. The same agent you tuned for voice runs on whichever line you point at it.",
  ],
  [
    "What languages are supported?",
    "Vera handles 42 plus languages with streaming speech to text that follows callers in real time, including code switching mid sentence. No configuration change is needed when a caller switches languages.",
  ],
  [
    "Can I self host or bring my own models?",
    "On Scale you can bring your own models and custom voices and route to your preferred providers. Talk to us about self hosting and data residency options for regulated teams.",
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
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "1.5rem" }}>
        <div className="wrap text-center">
          <Reveal>
            <span className="eyebrow mb-6 justify-center"><Sparkles size={13} /> Pricing</span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-hero mx-auto max-w-4xl" style={{ fontSize: "clamp(2.4rem, 5.2vw, 3.9rem)" }}>
              Simple pricing that scales with{" "}
              <span className="text-gradient">your conversations.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-6 max-w-2xl">
              One flat platform fee, plus usage at cost. Start free and pay only when Vera is
              placing calls, answering chats, and closing for you.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <p className="text-tertiary mt-5 text-[13px]">
              No credit card to start. Upgrade the moment Vera goes live.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── plans ── */}
      <section className="band-sm">
        <div className="wrap">
          <div className="price-grid">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 80}>
                <div className={`price-card ${plan.featured ? "featured" : ""}`}>
                  {plan.badge && (
                    <span
                      className="chip"
                      style={{
                        position: "absolute",
                        top: -13,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "var(--gradient-brand)",
                        color: "var(--text-on-accent)",
                        borderColor: "transparent",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Sparkles size={12} /> {plan.badge}
                    </span>
                  )}

                  <div className="eyebrow mb-5">{plan.name}</div>

                  <div className="flex items-end gap-2">
                    <span className="price-amt">{plan.amount}</span>
                    {plan.unit && (
                      <span className="text-tertiary pb-1.5 text-[13px]">{plan.unit}</span>
                    )}
                  </div>
                  <p className="text-tertiary mt-3 text-[13.5px] leading-relaxed">{plan.blurb}</p>

                  <div className="my-6" style={{ height: 1, background: "var(--border)" }} />

                  <div className="mb-7">
                    {plan.features.map((feat) => (
                      <div key={feat} className="price-feat">
                        <Check size={16} strokeWidth={2.2} />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  <Link href={plan.cta.href} className={`btn ${plan.cta.cls} w-full`}>
                    {plan.cta.label} <ArrowRight size={15} />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── usage note ── */}
      <section className="band-sm">
        <div className="wrap-tight">
          <Reveal variant="scale">
            <div className="glass-card text-center" style={{ padding: "26px 30px" }}>
              <span
                className="mx-auto mb-4 inline-flex items-center justify-center"
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                  color: "var(--accent-text)",
                }}
              >
                <Zap size={20} strokeWidth={1.8} />
              </span>
              <p className="lead" style={{ color: "var(--text-secondary)" }}>
                Voice minutes, phone numbers, and SMS are billed at provider cost, passed straight
                through with no markup. You only pay for what you use, and you can watch usage in
                real time from your dashboard.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="band">
        <div className="wrap-tight">
          <Reveal>
            <h2 className="section-title mb-10 text-center">Questions, answered.</h2>
          </Reveal>
          <div className="flex flex-col gap-8">
            {FAQS.map(([q, a], i) => (
              <Reveal key={q} delay={(i % 2) * 70}>
                <div>
                  <h3 className="text-[17px] font-semibold">{q}</h3>
                  <p className="text-secondary mt-2 text-[15px] leading-relaxed">{a}</p>
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
            <div className="mb-6 flex items-center justify-center gap-3 text-tertiary">
              <Phone size={18} strokeWidth={1.6} />
              <MessageSquare size={18} strokeWidth={1.6} />
              <Bot size={18} strokeWidth={1.6} />
              <ShieldCheck size={18} strokeWidth={1.6} />
            </div>
            <h2 className="section-title" style={{ fontSize: "clamp(2rem, 4.4vw, 3.1rem)" }}>
              Start free. Upgrade when Vera is{" "}
              <span className="text-gradient">answering your calls.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="lead mx-auto mt-5 max-w-xl">
              Build voice and chat agents, provision real numbers, and wire your tools. Move to a
              paid plan the moment Vera is live and earning its keep.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">
                Start free <ArrowRight />
              </Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">
                Contact sales
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
