import { ArrowRight, CircleAlert, Eye, Hand, PenLine, Server, Wrench, type LucideIcon } from "lucide-react";

import type { Metadata } from "next";

import { APPS, LogoTile, PARTNERS, type Partner } from "@/components/mk/brand";
import { IntegrationExplorer } from "@/components/mk/integrations-parts";
import { SIGN_UP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { CountUp, HorizontalScroll, Marquee, Parallax, Reveal, Stagger } from "@/components/mk/motion";
import { LogoOrbit } from "@/components/mk/scenes";
import { Soon } from "@/components/mk/soon";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Connect an app once with OAuth and the agent can act in it: calendars, CRMs, payments, helpdesks, messaging and 1,500+ more. Bring your own MCP servers and HTTP endpoints too.",
};

/* Integrations. Big logos first, then what the agent actually does in each
   app, how a connection is made and bounded, and the infrastructure
   underneath. */

const ALL: Partner[] = [...APPS, ...PARTNERS];
const logo = (name: string): Partner => ALL.find((p) => p.name === name) ?? { name, logo: null, kind: "app" };

type Mode = "reads" | "writes" | "approval";
const MODE: Record<Mode, { label: string; bg: string; fg: string }> = {
  reads: { label: "Reads", bg: "rgba(77,181,255,0.14)", fg: "var(--mk-sky)" },
  writes: { label: "Writes", bg: "rgba(233,107,52,0.14)", fg: "var(--mk-ember-soft)" },
  approval: { label: "Approval", bg: "rgba(139,108,255,0.18)", fg: "var(--mk-violet)" },
};

/* what the agent can do in each app, as it would on a call */
const IN_APP: { app: string; cat: string; actions: [Mode, string][]; heard: string }[] = [
  { app: "Google Calendar", cat: "Calendars", actions: [["reads", "Find open times across the team"], ["writes", "Book, move or cancel a visit"]], heard: "Tuesday at four works for me." },
  { app: "HubSpot", cat: "CRM", actions: [["reads", "Find the caller by phone number"], ["writes", "Log the call with a summary"], ["writes", "Create a deal and set its stage"]], heard: "I’m looking to sell in the spring." },
  { app: "Stripe", cat: "Payments", actions: [["reads", "Look up an invoice or a charge"], ["writes", "Send a payment link by text"], ["approval", "Issue a refund, once a person says yes"]], heard: "Can you send me the link to pay?" },
  { app: "Zendesk", cat: "Helpdesk", actions: [["reads", "Read the caller’s open tickets"], ["writes", "Open a ticket with the transcript attached"]], heard: "I called about this last week." },
  { app: "Slack", cat: "Messaging", actions: [["writes", "Post a brief to #dispatch"], ["writes", "Ping whoever is on call"]], heard: "It’s an emergency, the basement is flooding." },
  { app: "Gmail", cat: "Messaging", actions: [["reads", "Find the last thread with this customer"], ["writes", "Send the quote they asked for"]], heard: "Could you email that to me?" },
  { app: "Google Sheets", cat: "Productivity", actions: [["reads", "Look up a row: a price, an order, a rota"], ["writes", "Add the new lead to your list"]], heard: "How much is a drain cleaning?" },
  { app: "Shopify", cat: "Payments", actions: [["reads", "Check an order’s status and tracking"], ["approval", "Start a return, with your sign-off"]], heard: "Where is my order?" },
];

const STEPS: [string, string][] = [
  ["Pick the app", "Search the catalog in Studio. Calendars, CRMs, payments and 1,500+ more."],
  ["Sign in once", "With OAuth, through Composio. Veyra never sees your password, and one click in Studio disconnects the app again."],
  ["Choose what it may do", "Turn on only the actions it needs. Mark which ones write, and which need a person to approve first."],
  ["Try it before a caller does", "Run a skill in Studio’s Try it panel and watch each action it takes, before it goes live on a call."],
];

/* the actions table, as Studio shows it for one connected app */
const PANEL: { name: string; on: boolean; writes: boolean; approval: boolean }[] = [
  { name: "Find contact by phone", on: true, writes: false, approval: false },
  { name: "Create contact", on: true, writes: true, approval: false },
  { name: "Log a call", on: true, writes: true, approval: false },
  { name: "Create deal", on: true, writes: true, approval: true },
  { name: "Delete contact", on: false, writes: true, approval: false },
];

const RULES: { icon: LucideIcon; title: string; body: string; tint: string; fg: string }[] = [
  { icon: Eye, title: "Reads", body: "It looks something up: a slot, a price, an order. Nothing changes in your tools. If the network blips, it tries once more.", tint: "rgba(77,181,255,0.12)", fg: "var(--mk-sky)" },
  { icon: PenLine, title: "Writes", body: "It changes something: a booking, a record, a charge. Each write is recorded before it runs and carries a key, so it can’t land twice. It is never retried blindly.", tint: "rgba(233,107,52,0.12)", fg: "var(--mk-ember)" },
  { icon: Hand, title: "Needs approval", body: "A person confirms before it runs, while the caller waits. Use it for refunds, cancellations, anything you want a human to own.", tint: "rgba(139,108,255,0.14)", fg: "var(--mk-violet)" },
];

const ROLES: Record<string, string> = {
  OpenAI: "Language models", LiveKit: "Real-time voice", Deepgram: "Speech to text", Cartesia: "Voices", ElevenLabs: "Voices",
  Groq: "Fast inference", Twilio: "Phone numbers", Telnyx: "Phone numbers", Composio: "App connections", Langfuse: "A trace of every call",
};
/* phone lines are not connected to the agent yet */
const SOON = new Set(["Twilio", "Telnyx"]);

function Switch({ on, label }: { on: boolean; label: string }) {
  return (
    <span role="img" aria-label={`${label}: ${on ? "on" : "off"}`} className="relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--mk-mint)" : "var(--mk-line-strong)" }}>
      <span className="absolute top-[2px] size-[18px] rounded-full bg-white shadow" style={{ left: on ? 18 : 2 }} />
    </span>
  );
}

const PANEL_COLS = "grid-cols-[minmax(0,1fr)_repeat(3,62px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,76px)]";

/** Studio's actions table for one connected app, in miniature. */
function ActionsPanel() {
  return (
    <div className="mk-card p-6 sm:p-8" style={{ boxShadow: "var(--mk-shadow-float)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <LogoTile partner={logo("HubSpot")} size={60} />
        <div className="min-w-0 grow basis-[170px]">
          <p className="mk-h4">HubSpot</p>
          <p className="mk-small">Signed in with OAuth, through Composio</p>
        </div>
        <span className="mk-pill shrink-0" style={{ background: "rgba(63,216,160,0.16)", color: "var(--mk-ink)" }}>
          <span className="size-2 rounded-full" style={{ background: "var(--mk-mint)" }} /> Connected
        </span>
      </div>
      <div className={`mt-7 grid ${PANEL_COLS} items-center gap-x-1 border-b border-[var(--mk-line)] pb-3`}>
        <span className="mk-small">Action</span>
        <span className="mk-small text-center">On</span>
        <span className="mk-small text-center">Writes</span>
        <span className="mk-small whitespace-nowrap text-center">Approval</span>
      </div>
      <Stagger step={80}>
        {PANEL.map((a) => (
          <div key={a.name} className={`grid ${PANEL_COLS} items-center gap-x-1 border-b border-[var(--mk-line)] py-4 last:border-b-0`}>
            <span className="mk-body" style={{ color: a.on ? "var(--mk-ink)" : "var(--mk-ink-3)" }}>{a.name}</span>
            <span className="flex justify-center"><Switch on={a.on} label={`${a.name}, enabled`} /></span>
            <span className="flex justify-center"><Switch on={a.writes} label={`${a.name}, writes`} /></span>
            <span className="flex justify-center"><Switch on={a.approval} label={`${a.name}, needs approval`} /></span>
          </div>
        ))}
      </Stagger>
      <p className="mk-small mt-5">4 of 5 actions on · 1 needs approval</p>
    </div>
  );
}

export default function IntegrationsPage() {
  const half = Math.ceil(APPS.length / 2);
  return (
    <>
      {/* ── hero: the orbit, on black ────────────────────────────────── */}
      <section className="mk-night relative overflow-hidden pt-16 pb-[clamp(88px,12vw,160px)] md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Integrations</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[13ch]">Works in the tools you already run.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[44ch]">Sign in to an app once and the agent can act in it on a call: book the visit, log the call, send the link. You choose exactly what it may do.</p>
          </Reveal>
          <Reveal variant="rise" delay={280} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started</a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Request a demo</a>
          </Reveal>
        </div>
        <Reveal variant="zoom" delay={200} className="mt-14 flex justify-center">
          <Parallax speed={-0.1}>
            <LogoOrbit size={760} className="hidden text-white md:block" />
            <LogoOrbit size={360} className="text-white md:hidden" />
          </Parallax>
        </Reveal>
        <Reveal className="mk-wrap mt-10 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-5">
          <span className="text-[clamp(64px,9vw,128px)] font-semibold leading-none tracking-[-0.05em]"><CountUp to={1500} suffix="+" /></span>
          <span className="mk-lead whitespace-nowrap sm:text-left">apps,<br className="max-sm:hidden" /> one sign-in each</span>
        </Reveal>
      </section>

      {/* ── the rails ────────────────────────────────────────────────── */}
      <section className="mk-section--tight overflow-hidden">
        <Reveal variant="fade"><p className="mk-small mb-10 text-center">Some of the apps teams connect most</p></Reveal>
        <div className="flex flex-col gap-7">
          <Marquee duration={70} gap={32}>{APPS.slice(0, half).map((p) => <LogoTile key={p.name} partner={p} size={124} />)}</Marquee>
          <Marquee duration={80} gap={32} reverse>{APPS.slice(half).map((p) => <LogoTile key={p.name} partner={p} size={124} />)}</Marquee>
        </div>
      </section>

      {/* ── every app, by what it does: search and filter ────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-12 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">By category</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Find yours.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[46ch]">The apps teams connect most, grouped by what the agent does in them. Search by name, or by the job, like “invoice” or “book”.</p></Reveal>
          </div>
          <IntegrationExplorer />
        </div>
      </section>

      {/* ── what it does in each app: the cards travel sideways ──────── */}
      <section className="mk-night">
        <div className="pt-[clamp(88px,12vw,160px)]" />
        <HorizontalScroll
          header={
            <div className="mk-wrap mb-8 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mk-eyebrow">On a call</p>
                <h2 className="mk-h2 mt-2 max-w-[16ch]">Not a link to the app. Work done in it.</h2>
              </div>
              <p className="mk-body max-w-[36ch]">Each connected app brings its actions with it. The agent fills in the details from the conversation, then does the job while the caller is still on the line.</p>
            </div>
          }
        >
          {IN_APP.map((c) => (
            <article key={c.app} className="mk-card flex shrink-0 flex-col p-8" style={{ width: "min(400px, 82vw)", height: "min(500px, calc(100svh - 330px))", minHeight: 400 }}>
              <div className="flex items-center gap-4">
                <LogoTile partner={logo(c.app)} size={72} />
                <div>
                  <h3 className="mk-h3">{c.app}</h3>
                  <p className="mk-kicker mt-1">{c.cat}</p>
                </div>
              </div>
              <ul className="mt-8 flex flex-col gap-4">
                {c.actions.map(([m, text]) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="mk-pill shrink-0" style={{ background: MODE[m].bg, color: MODE[m].fg, height: 24, paddingInline: 10 }}>{MODE[m].label}</span>
                    <span className="mk-body" style={{ color: "var(--mk-ink)" }}>{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-[var(--mk-line)] pt-5">
                <p className="mk-small">The caller says</p>
                <p className="mk-body mt-1">“{c.heard}”</p>
              </div>
            </article>
          ))}
        </HorizontalScroll>
        <div className="pb-[clamp(88px,12vw,160px)]" />
      </section>

      {/* ── how connecting works ─────────────────────────────────────── */}
      <section className="mk-section overflow-hidden">
        <div className="mk-wrap">
          <div className="grid items-start gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
            <div>
              <Reveal><p className="mk-eyebrow">Connecting</p></Reveal>
              <Reveal delay={80}><h2 className="mk-h1 mt-2">Sign in once. Choose what it may do.</h2></Reveal>
              <Stagger as="ol" className="mt-12 flex flex-col" step={120}>
                {STEPS.map(([t, b], i) => (
                  <li key={t} className="flex gap-6 border-t border-[var(--mk-line)] py-7">
                    <span className="mk-h3 w-8 shrink-0 tabular-nums" style={{ color: "var(--mk-ember)" }}>{i + 1}</span>
                    <div>
                      <h3 className="mk-h4">{t}</h3>
                      <p className="mk-body mt-2 max-w-[44ch]">{b}</p>
                    </div>
                  </li>
                ))}
              </Stagger>
            </div>
            <div className="lg:sticky lg:top-[120px]">
              <Reveal variant="right"><ActionsPanel /></Reveal>
            </div>
          </div>

          <Stagger className="mt-24 grid gap-5 md:grid-cols-3" step={120}>
            {RULES.map((r) => (
              <div key={r.title} className="mk-card flex flex-col p-8">
                <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: r.tint, color: r.fg }}><r.icon size={26} /></span>
                <h3 className="mk-h3 mt-6">{r.title}</h3>
                <p className="mk-body mt-3">{r.body}</p>
              </div>
            ))}
          </Stagger>
          <Reveal className="mk-card mk-card--alt mt-5 flex flex-col gap-5 p-8 sm:flex-row sm:items-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.12)", color: "var(--mk-ember)" }}><CircleAlert size={26} /></span>
            <div>
              <h3 className="mk-h4">If a write times out, it doesn’t pretend.</h3>
              <p className="mk-body mt-1 max-w-[72ch]">The agent tells the caller it’s still checking, never that it’s done. The call lands in Desk under Needs review, with every action it took, so a person can confirm.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── beyond the catalog ───────────────────────────────────────── */}
      <section id="custom" className="mk-section mk-alt scroll-mt-[52px]">
        <div className="mk-wrap">
          <div className="mb-14 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">Your own systems</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Not in the catalog? Bring it.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mt-5 max-w-[46ch]">Your booking system, your order API, a vendor’s server. Each becomes an action with the same switches as every app.</p></Reveal>
          </div>
          <Stagger className="grid gap-5 lg:grid-cols-2" step={140}>
            <article className="mk-card mk-card-lift flex flex-col p-6 sm:p-10">
              <Server size={30} className="text-[var(--mk-ember)]" />
              <h3 className="mk-h3 mt-6">MCP servers</h3>
              <p className="mk-body mt-3 max-w-[46ch]">Point Veyra at a server that speaks the Model Context Protocol, yours or a vendor’s. Once it passes a test, its tools become actions you can grant.</p>
              <div className="mt-8 rounded-[22px] p-4 sm:p-6" style={{ background: "var(--mk-bg-alt)" }}>
                <p className="mk-kicker">Server URL</p>
                <div className="mt-2 flex items-center gap-3 rounded-2xl bg-[var(--mk-card)] px-4 py-3 shadow-[var(--mk-shadow-card)]">
                  <span className="mk-body min-w-0 flex-1 truncate" style={{ color: "var(--mk-ink)" }}>mcp.acme.co</span>
                  <span className="mk-pill shrink-0" style={{ background: "rgba(63,216,160,0.16)", color: "var(--mk-ink)" }}><span className="size-2 rounded-full" style={{ background: "var(--mk-mint)" }} /> Tested</span>
                </div>
                <p className="mk-kicker mt-5">4 tools found</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["lookup_order", "hold_shipment", "check_warranty", "create_rma"].map((t) => <span key={t} className="mk-pill" style={{ background: "var(--mk-card)" }}>{t}</span>)}
                </div>
              </div>
            </article>
            <article className="mk-card mk-card-lift flex flex-col p-6 sm:p-10">
              <Wrench size={30} className="text-[var(--mk-ember)]" />
              <h3 className="mk-h3 mt-6">Custom HTTP actions</h3>
              <p className="mk-body mt-3 max-w-[46ch]">Call any endpoint. The URL, method and authentication stay yours. The agent fills in the parameters from the conversation.</p>
              <div className="mt-8 rounded-[22px] p-4 sm:p-6" style={{ background: "var(--mk-bg-alt)" }}>
                <div className="flex items-center gap-3 rounded-2xl bg-[var(--mk-card)] px-4 py-3 shadow-[var(--mk-shadow-card)]">
                  <span className="mk-pill mk-pill--ember shrink-0">POST</span>
                  <span className="mk-body min-w-0 flex-1 truncate" style={{ color: "var(--mk-ink)" }}>api.acme.co/holds</span>
                </div>
                <dl className="mt-4 flex flex-col">
                  {[["Authentication", "Bearer token ••••••"], ["order_id", "Filled in by the agent"], ["reason", "Filled in by the agent"]].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-4 border-b border-[var(--mk-line)] py-3 last:border-b-0">
                      <dt className="mk-small">{k}</dt>
                      <dd className="mk-small text-right" style={{ color: "var(--mk-ink)" }}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-5">
                  <span className="mk-small inline-flex items-center gap-2"><Switch on label="Writes" /> Writes</span>
                  <span className="mk-small inline-flex items-center gap-2"><Switch on={false} label="Needs approval" /> Needs approval</span>
                </div>
              </div>
            </article>
          </Stagger>
        </div>
      </section>

      {/* ── the infrastructure underneath ────────────────────────────── */}
      <section className="mk-night mk-section overflow-hidden">
        <div className="mk-wrap">
          <div className="mx-auto mb-16 max-w-[820px] text-center">
            <Reveal><p className="mk-eyebrow">Underneath</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Built on the best voice and AI infrastructure.</h2></Reveal>
            <Reveal delay={160}><p className="mk-lead mx-auto mt-5 max-w-[46ch]">The parts of a call you never think about: hearing, speaking, the phone line and every connection, each from a specialist.</p></Reveal>
          </div>
          <Stagger className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-5" step={80}>
            {PARTNERS.map((p) => (
              <figure key={p.name} className="flex flex-col items-center gap-4 text-center">
                <LogoTile partner={p} size={120} />
                <figcaption>
                  <span className="mk-h4 block">{p.name}</span>
                  <span className="mk-small mt-1 block">{ROLES[p.name]}</span>
                  {SOON.has(p.name) && <Soon className="mt-2" />}
                </figcaption>
              </figure>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-12 flex justify-center">
            <div className="flex items-center gap-4">
              {["Google Calendar", "HubSpot", "Stripe", "Slack"].map((n, i) => (
                <div key={n} className="mk-float" style={{ animationDelay: `${i * 0.8}s` }}><LogoTile partner={logo(n)} size={i === 1 || i === 2 ? 88 : 68} /></div>
              ))}
            </div>
          </Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[13ch]">Your tools, one sign-in away.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Connect the apps you run today. The agent books, logs, sends and follows up in them, on every call.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started <ArrowRight /></a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Talk to our team</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
