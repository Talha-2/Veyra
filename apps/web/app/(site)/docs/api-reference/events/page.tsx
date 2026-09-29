import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/docs/code";
import { Markdown } from "@/components/docs/markdown";
import { OnThisPage } from "@/components/docs/sidebar";
import { slugify } from "@/lib/docs/content";
import { events } from "@/lib/docs/openapi";

export const metadata: Metadata = {
  title: "Webhook events · API reference",
  description: "Every event Veyra sends to your webhook endpoints, with example payloads.",
};

/* Events whose channel is not connected yet: the event exists in the API,
   but nothing sends it today. */
const NOT_LIVE = new Set(["email.received", "fax.received"]);

export default function EventsPage() {
  const list = events();
  const headers = list[0]?.headers ?? [];

  return (
    <div className="dk-page dk-page--guide">
      <article className="dk-article dk-article--wide">
        <header className="dk-article__head">
          <p className="dk-eyebrow">API reference</p>
          <h1>Webhook events</h1>
          <p className="dk-lead">
            Veyra POSTs a signed JSON event to each of your endpoints that subscribes to it. Registering endpoints and verifying signatures is covered in <Link href="/docs/api/webhooks">the webhooks guide</Link>.
          </p>
        </header>

        <div className="dk-prose">
          <h2 id="headers">Headers on every delivery</h2>
          <div className="dk-table">
            <table>
              <thead><tr><th>Header</th><th>Value</th></tr></thead>
              <tbody>
                {headers.map((h) => (
                  <tr key={h.name}><td><code>{h.name}</code></td><td>{h.description || (h.example ? `The event type, for example ${String(h.example)}.` : "")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 id="all-events">All events</h2>
          <div className="dk-table">
            <table>
              <thead><tr><th>Event</th><th>When</th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.type}>
                    <td><a href={`#${slugify(e.type)}`}><code>{e.type}</code></a></td>
                    <td>{NOT_LIVE.has(e.type) ? "Coming soon: the channel is not connected yet." : e.description.split(/(?<=\.)\s/)[0].replace(/`/g, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {list.map((e) => (
          <section key={e.type} className="dk-event" id={slugify(e.type)}>
            <h2><code>{e.type}</code></h2>
            {NOT_LIVE.has(e.type) && (
              <blockquote className="dk-callout dk-callout--soon" data-label="Coming soon">
                <p>This event is defined, but its channel is not connected yet, so Veyra does not send it today.</p>
              </blockquote>
            )}
            <Markdown source={e.description} />
            {e.example !== undefined && (
              <details className="dk-op__errors" open={false}>
                <summary>Example payload</summary>
                <CodeBlock code={JSON.stringify(e.example, null, 2)} lang="json" />
              </details>
            )}
          </section>
        ))}
      </article>
      <OnThisPage items={[{ id: "headers", text: "Headers", depth: 2 }, { id: "all-events", text: "All events", depth: 2 }]} />
    </div>
  );
}
