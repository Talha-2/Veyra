import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/docs/code";
import { Markdown } from "@/components/docs/markdown";
import { API_BASE } from "@/components/mk/links";
import { info, operations, scopes, tags } from "@/lib/docs/openapi";

export const metadata: Metadata = {
  title: "API reference · Docs",
  description: "Every endpoint of the Veyra API, generated from its OpenAPI document.",
};

export default function ReferenceHome() {
  const i = info();
  const sc = scopes();
  const scopeRows = Array.isArray(sc) ? sc.map((s: string) => [s, ""]) : Object.entries(sc);

  return (
    <div className="dk-page dk-page--guide">
      <article className="dk-article dk-article--wide">
        <header className="dk-article__head">
          <p className="dk-eyebrow">API reference · v{i.version}</p>
          <h1>{i.title}</h1>
          <p className="dk-lead">Generated from the OpenAPI document the API itself serves, so it always matches what the API does.</p>
        </header>

        <div className="dk-prose">
          <h2 id="base-url">Base URL</h2>
          <CodeBlock code={API_BASE} lang="text" />
          <p>
            The machine-readable document is at <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noopener noreferrer"><code>{API_BASE}/openapi.json</code></a>. Import it into Postman, Insomnia or a code generator.
          </p>
        </div>

        <Markdown source={i.description.replace(/\*\*(\w[^*]*)\.\*\*/g, "\n## $1\n\n")} />

        <div className="dk-prose">
          <h2 id="resources">Resources</h2>
        </div>
        <div className="dk-grid dk-grid--2">
          {tags().map((t) => (
            <Link key={t.slug} href={`/docs/api-reference/${t.slug}`} className="dk-card">
              <h3>{t.name}</h3>
              <p>{t.description.replace(/`/g, "")}</p>
              <span className="dk-card__count">{operations(t.name).length} endpoints</span>
            </Link>
          ))}
          <Link href="/docs/api-reference/events" className="dk-card">
            <h3>Webhook events</h3>
            <p>What Veyra sends to your endpoints, and when.</p>
          </Link>
        </div>

        {scopeRows.length > 0 && (
          <div className="dk-prose">
            <h2 id="scopes">Scopes</h2>
            <div className="dk-table">
              <table>
                <thead><tr><th>Scope</th><th>Allows</th></tr></thead>
                <tbody>
                  {scopeRows.map(([s, d]) => (
                    <tr key={String(s)}><td><code>{String(s)}</code></td><td>{String(d)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
