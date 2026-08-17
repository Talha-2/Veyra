import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* Integrations — the catalog as console cards with mono tool tags; MCP and
   custom HTTP as first-class rows. */

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

type Category = {
  tag: string;
  title: string;
  body: string;
  tools: string[];
};

const CATEGORIES: Category[] = [
  {
    tag: "CRM",
    title: "Log every contact and move the deal",
    body: "Veyra creates and updates records, writes the call summary, and advances the deal the moment the conversation ends.",
    tools: ["HubSpot", "Salesforce", "Pipedrive", "Veyra Desk"],
  },
  {
    tag: "Calendars",
    title: "Book straight into the day",
    body: "It reads real availability and books, reschedules, or cancels without ever double-booking a slot.",
    tools: ["Google Calendar", "Outlook", "Calendly", "Cal.com"],
  },
  {
    tag: "Support",
    title: "Open and resolve tickets",
    body: "Veyra raises tickets, pulls the customer's history, and answers from your help center before a human is ever paged.",
    tools: ["Zendesk", "Intercom", "Freshdesk", "Help Scout"],
  },
  {
    tag: "Payments",
    title: "Take and track payments",
    body: "Send a payment link, check an invoice, or confirm a charge — read straight from your billing system on the call.",
    tools: ["Stripe", "Square", "PayPal", "QuickBooks"],
  },
  {
    tag: "Messaging",
    title: "Reach out on any channel",
    body: "Fire a text, post to a channel, or send the follow-up email the instant a call wraps. No copy and paste.",
    tools: ["Slack", "WhatsApp", "Twilio SMS", "Gmail"],
  },
  {
    tag: "Docs + data",
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

const EXTEND: { tag: string; title: string; body: string }[] = [
  {
    tag: "mcp",
    title: "Bring your own MCP servers",
    body: "Point Veyra at a Model Context Protocol server and its tools appear alongside the catalog. Your internal systems become actions the agent can take, with the same approval and logging as everything else.",
  },
  {
    tag: "custom http",
    title: "Wire up any endpoint",
    body: "Have an API the catalog doesn't cover? Define a custom HTTP action with your headers and auth, map the parameters once, and the agent calls it live like any other tool.",
  },
];

export default function IntegrationsPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 8vw, 6.5rem)" }}>
        <div className="wrap text-center">
          <h1 className="display-hero mx-auto max-w-[44rem]" style={{ textWrap: "balance" }}>
            Connect the tools you already run.
          </h1>
          <p className="lead-lg mx-auto mt-7 max-w-[54ch]">
            Veyra reaches a thousand apps through Composio with managed OAuth. Connect a tool once
            and the agent reads it, fills the parameters itself, and takes the action live on the
            call.
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

      {/* ── categories ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[24ch]">One connection, and the agent can act.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            Each app comes with its actions and parameters mapped, so the agent books, charges, or
            files without you writing an adapter.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <div key={c.tag} className="console flex flex-col">
                <div className="console__bar">
                  <span className="console__dot" />
                  {c.tag}
                </div>
                <div className="console__body flex flex-1 flex-col">
                  <h3 className="text-[17px] font-medium leading-snug" style={{ letterSpacing: "-0.01em" }}>
                    {c.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {c.body}
                  </p>
                  <div className="chips mt-auto pt-5">
                    {c.tools.map((t) => (
                      <span key={t} className="chip">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
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

      {/* ── beyond the catalog ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[20ch]">Your own tools, first class.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            The catalog covers the tools most teams share. When you need your own, bring an MCP
            server or wire a raw endpoint — it behaves like every other action Veyra runs.
          </p>
          <div className="rows mt-12">
            {EXTEND.map((e) => (
              <div key={e.tag} className="row">
                <span className="row__tag">{e.tag}</span>
                <span>
                  <span className="row__title">{e.title}</span>
                  <span className="row__body block" style={{ maxWidth: "70ch" }}>{e.body}</span>
                </span>
                <span />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[28ch]">Your stack, one connection away.</h2>
          <p className="lead mx-auto mt-5 max-w-[46ch]">
            Plug Veyra into the tools you already run and let it do the work between the words —
            book, charge, update, and follow up, live on every call.
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
