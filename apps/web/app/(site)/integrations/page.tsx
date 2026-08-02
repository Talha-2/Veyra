import Link from "next/link";
import {
  ArrowRight, CalendarDays, CreditCard, FileText, LifeBuoy, MessageSquare,
  Plug, Server, Shield, Users, Webhook,
  type LucideIcon,
} from "lucide-react";
import Reveal from "@/components/Reveal";

/* Integrations — Vera connects to a thousand tools through Composio with managed
   OAuth. Server Component: returns inner content only. The shared (site)/layout
   owns the nav, the fixed aurora, and the footer, so this is one continuous
   surface, separated by whitespace, never borders or filled bands. */

type Category = {
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  tools: string[];
};

const CATEGORIES: Category[] = [
  {
    icon: Users,
    tag: "CRM",
    title: "Log every contact and move the deal",
    body: "Vera creates and updates records, writes the call summary, and advances the deal the moment the conversation ends.",
    tools: ["HubSpot", "Salesforce", "Pipedrive", "Vera Desk"],
  },
  {
    icon: CalendarDays,
    tag: "Calendars",
    title: "Book straight into the day",
    body: "It reads real availability and books, reschedules, or cancels without ever double booking a slot.",
    tools: ["Google Calendar", "Outlook", "Calendly", "Cal.com"],
  },
  {
    icon: LifeBuoy,
    tag: "Support",
    title: "Open and resolve tickets",
    body: "Vera raises tickets, pulls the customer's history, and answers from your help center before a human is ever paged.",
    tools: ["Zendesk", "Intercom", "Freshdesk", "Help Scout"],
  },
  {
    icon: CreditCard,
    tag: "Payments",
    title: "Take and track payments",
    body: "Send a payment link, check an invoice, or confirm a charge, read straight from your billing system on the call.",
    tools: ["Stripe", "Square", "PayPal", "QuickBooks"],
  },
  {
    icon: MessageSquare,
    tag: "Messaging",
    title: "Reach out on any channel",
    body: "Fire a text, post to a channel, or send the follow up email the instant a call wraps, with no copy and paste.",
    tools: ["Slack", "WhatsApp", "Twilio SMS", "Gmail"],
  },
  {
    icon: FileText,
    tag: "Docs and data",
    title: "Read and write your records",
    body: "Look up an order in a sheet, file notes to a doc, or update a row in your database in real time as the agent works.",
    tools: ["Google Drive", "Notion", "Sheets", "Airtable"],
  },
];

const STATS: [string, string][] = [
  ["1000+", "apps via Composio"],
  ["1 click", "to connect a tool"],
  ["OAuth", "fully managed"],
  ["0", "keys in the browser"],
];

const EXTEND: Category[] = [
  {
    icon: Server,
    tag: "MCP",
    title: "Bring your own MCP servers",
    body: "Point Vera at a Model Context Protocol server and its tools appear alongside the catalog. Your internal systems become actions the agent can take, with the same approval and logging as everything else.",
    tools: [],
  },
  {
    icon: Webhook,
    tag: "Custom",
    title: "Wire up any HTTP endpoint",
    body: "Have an API the catalog does not cover? Define a custom HTTP action with your headers and auth, map the parameters once, and the agent calls it live like any other tool.",
    tools: [],
  },
];

export default function IntegrationsPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "1.5rem" }}>
        <div className="wrap text-center">
          <Reveal>
            <span className="eyebrow mb-6 justify-center"><Plug size={13} /> Integrations</span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-hero mx-auto max-w-4xl">
              Connect the tools you already run.{" "}
              <span className="text-gradient">Wired up in minutes.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-7 max-w-2xl">
              Vera reaches a thousand apps through Composio with managed OAuth. Connect a tool once
              and the agent reads it, fills the parameters itself, and takes the action live on the
              call. No glue code, no keys in the browser.
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

      {/* ── categories ── */}
      <section className="band-sm">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><Plug size={13} /> Every part of your stack</span>
              <h2 className="section-title">One connection, and the agent can act.</h2>
              <p className="lead mt-4 max-w-2xl">
                Group by what the work needs. Each app comes with its actions and parameters mapped,
                so the agent books, charges, or files without you writing an adapter.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c, i) => (
              <Reveal key={c.tag} delay={(i % 3) * 80}>
                <div className="glass-card">
                  <div className="glass-card__top">
                    <span className="glass-card__icon"><c.icon size={18} strokeWidth={1.9} /></span>
                    <span className="glass-card__tag">{c.tag}</span>
                  </div>
                  <h3 className="glass-card__title">{c.title}</h3>
                  <p className="glass-card__body">{c.body}</p>
                  <div className="chips mt-5">
                    {c.tools.map((t) => (
                      <span key={t} className="chip">{t}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── managed OAuth stats ── */}
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

      {/* ── beyond the catalog: MCP + custom HTTP ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><Server size={13} /> Beyond the catalog</span>
              <h2 className="section-title">Your own tools, first class.</h2>
              <p className="lead mt-4 max-w-2xl">
                The catalog covers the tools most teams share. When you need your own, bring an MCP
                server or wire a raw endpoint, and it behaves like every other action Vera runs.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-2">
            {EXTEND.map((e, i) => (
              <Reveal key={e.tag} variant="scale" delay={i * 100}>
                <div className="glass-card accent">
                  <div className="glass-card__top">
                    <span className="glass-card__icon"><e.icon size={18} strokeWidth={1.9} /></span>
                    <span className="glass-card__tag soon">{e.tag}</span>
                  </div>
                  <h3 className="glass-card__title">{e.title}</h3>
                  <p className="glass-card__body">{e.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── connect in the Studio ── */}
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
                <Plug size={22} strokeWidth={1.8} />
              </span>
              <h3 className="section-title" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
                Connect your first tool in the Studio.
              </h3>
              <p className="lead mx-auto mt-3 max-w-lg">
                Open the workspace, authorize a tool with managed OAuth, and drop it into a workflow.
                The agent starts using it on the very next call.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link href="/studio" className="btn btn-gradient btn-lg">Connect tools in the Studio <ArrowRight /></Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── closing CTA ── */}
      <section className="band">
        <div className="wrap-tight text-center">
          <Reveal variant="scale">
            <Shield size={30} strokeWidth={1.5} className="mx-auto mb-6 glow-pulse" style={{ color: "var(--accent)" }} />
          </Reveal>
          <Reveal delay={80}>
            <h2 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              Your stack, <span className="text-gradient">one connection away.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-5 max-w-xl">
              Plug Vera into the tools you already run and let it do the work between the words:
              book, charge, update, and follow up, live on every call.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Talk to sales</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
