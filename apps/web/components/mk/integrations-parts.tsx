"use client";

/* The integrations explorer: every app on the page, grouped by what the
   agent does with it, with a search box and category filter. Logos are the
   vendors' own files; a brand without a file is a typeset wordmark. */

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { APPS, LogoTile, PARTNERS, type Partner } from "./brand";
import { Reveal, Stagger } from "./motion";

const ALL: Partner[] = [...APPS, ...PARTNERS];
const find = (name: string): Partner => ALL.find((p) => p.name === name) ?? { name, logo: null, kind: "app" };

export type Category = { id: string; name: string; body: string; apps: { name: string; tags: string }[] };

export const CATEGORIES: Category[] = [
  {
    id: "calendars", name: "Calendars", body: "Finds open times, then books, moves and cancels.",
    apps: [
      { name: "Google Calendar", tags: "book schedule appointment availability events" },
      { name: "Outlook", tags: "book schedule appointment email microsoft events" },
      { name: "Calendly", tags: "book schedule meeting links" },
      { name: "Cal.com", tags: "book schedule meeting links" },
    ],
  },
  {
    id: "crm", name: "CRM", body: "Finds the caller, logs the call and moves the deal.",
    apps: [
      { name: "HubSpot", tags: "contacts deals pipeline leads" },
      { name: "Salesforce", tags: "contacts deals opportunities leads" },
      { name: "Pipedrive", tags: "contacts deals pipeline leads" },
      { name: "Zoho", tags: "contacts deals crm leads" },
    ],
  },
  {
    id: "payments", name: "Payments", body: "Looks up invoices and orders, and sends payment links.",
    apps: [
      { name: "Stripe", tags: "invoice charge payment link refund billing" },
      { name: "Square", tags: "invoice payment point of sale billing" },
      { name: "QuickBooks", tags: "invoice accounting billing balance" },
      { name: "Shopify", tags: "orders returns tracking store commerce" },
    ],
  },
  {
    id: "helpdesk", name: "Helpdesk", body: "Reads the customer’s history and opens the ticket.",
    apps: [
      { name: "Zendesk", tags: "tickets support help center" },
      { name: "Intercom", tags: "tickets support conversations" },
      { name: "Freshdesk", tags: "tickets support" },
    ],
  },
  {
    id: "messaging", name: "Messaging", body: "Sends the follow-up and posts the brief to your team.",
    apps: [
      { name: "Gmail", tags: "email send follow-up" },
      { name: "Slack", tags: "channel post team notify" },
      { name: "WhatsApp", tags: "message text chat" },
      { name: "Microsoft Teams", tags: "channel post team notify" },
      { name: "Twilio", tags: "sms text message phone" },
      { name: "Mailchimp", tags: "email list audience marketing" },
      { name: "Discord", tags: "channel post community" },
    ],
  },
  {
    id: "productivity", name: "Productivity", body: "Reads and writes the sheets, docs and boards you run on.",
    apps: [
      { name: "Google Sheets", tags: "rows spreadsheet price list rota" },
      { name: "Google Drive", tags: "files documents" },
      { name: "Notion", tags: "docs pages database wiki" },
      { name: "Airtable", tags: "rows base records database" },
      { name: "Dropbox", tags: "files documents" },
      { name: "DocuSign", tags: "sign contract agreement envelope" },
      { name: "Asana", tags: "tasks projects" },
    ],
  },
  {
    id: "developer", name: "Developer", body: "Files the issue with the details, so nobody retypes a call.",
    apps: [
      { name: "GitHub", tags: "issues code repository" },
      { name: "Linear", tags: "issues bugs projects" },
      { name: "Jira", tags: "issues bugs tickets projects" },
    ],
  },
];

export function IntegrationExplorer() {
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      CATEGORIES.filter((c) => cat === "all" || c.id === cat)
        .map((c) => ({
          ...c,
          apps: q ? c.apps.filter((a) => `${a.name} ${a.tags} ${c.name}`.toLowerCase().includes(q)) : c.apps,
        }))
        .filter((c) => c.apps.length > 0),
    [cat, q],
  );
  const shown = groups.reduce((n, g) => n + g.apps.length, 0);

  return (
    <div>
      <Reveal className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <label className="relative block w-full max-w-[480px] xl:max-w-[330px]">
          <span className="sr-only">Search apps</span>
          <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[var(--mk-ink-3)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, or try “invoice”"
            className="mk-body h-14 w-full rounded-full bg-[var(--mk-card)] pl-13 pr-12 text-[var(--mk-ink)] shadow-[var(--mk-shadow-card)] outline-none placeholder:text-[var(--mk-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--mk-ember)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-4 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--mk-line)] text-[var(--mk-ink-2)]">
              <X size={14} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {[{ id: "all", name: "All" }, ...CATEGORIES].map((c) => {
            const on = c.id === cat;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setCat(c.id)}
                className={`mk-btn mk-btn--sm ${on ? "" : "mk-btn--ghost"}`}
                style={on ? { background: "var(--mk-ink)", color: "var(--mk-bg)" } : undefined}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </Reveal>
      <p className="mk-small mt-6" aria-live="polite">
        {shown} {shown === 1 ? "app" : "apps"} shown here. The full catalog in Studio has 1,500+.
      </p>

      {groups.length === 0 ? (
        <div className="mk-card mt-10 p-10 text-center">
          <h3 className="mk-h3">Not on this page.</h3>
          <p className="mk-body mx-auto mt-3 max-w-[48ch]">This page shows the apps teams connect most. Studio searches the full catalog of 1,500+, and anything with an API can be reached with a custom HTTP action.</p>
          <a href="#custom" className="mk-link mt-6">Reach your own systems</a>
        </div>
      ) : (
        <div className="mt-12 flex flex-col">
          {groups.map((g) => (
            <div key={g.id} className="grid grid-cols-1 gap-8 border-t border-[var(--mk-line)] py-12 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
              <div>
                <h3 className="mk-h3">{g.name}</h3>
                <p className="mk-body mt-2 max-w-[30ch]">{g.body}</p>
              </div>
              {/* re-keyed on the filter, so a new selection pops in again */}
              <Stagger key={`${cat}-${g.id}`} className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5" step={60}>
                {g.apps.map((a) => (
                  <figure key={a.name} className="group flex flex-col items-center gap-3">
                    <div className="transition-transform duration-500 ease-[var(--mk-ease)] group-hover:-translate-y-1.5 group-hover:scale-[1.04]">
                      <LogoTile partner={find(a.name)} size={96} />
                    </div>
                    <figcaption className="mk-small text-center" style={{ color: "var(--mk-ink-2)" }}>{a.name}</figcaption>
                  </figure>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
