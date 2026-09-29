import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CodeBlock, CodeTabs } from "@/components/docs/code";
import { Markdown } from "@/components/docs/markdown";
import { OnThisPage } from "@/components/docs/sidebar";
import { operations, tagBySlug, tags, type Field, type Operation, type Param } from "@/lib/docs/openapi";

type Props = { params: Promise<{ tag: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return tags().map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = tagBySlug((await params).tag);
  return tag ? { title: `${tag.name} · API reference`, description: tag.description.replace(/`/g, "") } : {};
}

function Method({ m }: { m: string }) {
  return <span className={`dk-method dk-method--${m}`}>{m === "delete" ? "DEL" : m.toUpperCase()}</span>;
}

function ParamTable({ title, rows }: { title: string; rows: Param[] }) {
  if (!rows.length) return null;
  return (
    <div className="dk-fields">
      <h4>{title}</h4>
      <ul>
        {rows.map((p) => (
          <li key={p.name}>
            <div className="dk-field__head">
              <code className="dk-field__name">{p.name}</code>
              <span className="dk-field__type">{p.type}</span>
              {p.required && <span className="dk-field__req">required</span>}
            </div>
            {p.description && <p>{p.description.replace(/`/g, "")}</p>}
            {p.enumValues && <p className="dk-field__enum">One of {p.enumValues.map((v) => <code key={v}>{v}</code>)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldTable({ title, rows }: { title: string; rows: Field[] }) {
  if (!rows.length) return null;
  return (
    <div className="dk-fields">
      <h4>{title}</h4>
      <ul>
        {rows.map((f, i) => (
          <li key={`${f.name}-${i}`} data-depth={f.depth}>
            <div className="dk-field__head">
              <code className="dk-field__name">{f.name}</code>
              <span className="dk-field__type">{f.type}</span>
              {f.required && <span className="dk-field__req">required</span>}
            </div>
            {f.description && <p>{f.description.replace(/`/g, "")}</p>}
            {f.enumValues && <p className="dk-field__enum">One of {f.enumValues.map((v) => <code key={v}>{v}</code>)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Endpoint({ op }: { op: Operation }) {
  const ok = op.responses.find((r) => r.status.startsWith("2"));
  const errors = op.responses.filter((r) => !r.status.startsWith("2"));
  return (
    <section className="dk-op" id={op.anchor}>
      <div className="dk-op__text">
        <h2>
          <a href={`#${op.anchor}`} className="dk-anchor" aria-hidden="true" tabIndex={-1}>#</a>
          {op.summary}
        </h2>
        <div className="dk-op__line">
          <Method m={op.method} />
          <code>{op.path}</code>
        </div>
        <div className="dk-op__pills">
          {op.scope ? <span className="dk-pill">Scope <code>{op.scope}</code></span> : <span className="dk-pill">Any valid key</span>}
          {op.publishable && <span className="dk-pill dk-pill--ok">Publishable keys allowed</span>}
        </div>
        {op.description && <Markdown source={op.description} />}
        <ParamTable title="Path parameters" rows={op.params.filter((p) => p.in === "path")} />
        <ParamTable title="Query parameters" rows={op.params.filter((p) => p.in === "query")} />
        <ParamTable title="Headers" rows={op.params.filter((p) => p.in === "header")} />
        {op.body && <FieldTable title={`Request body${op.body.schemaName ? ` · ${op.body.schemaName}` : ""}`} rows={op.body.fields} />}
        <div className="dk-fields">
          <h4>Responses</h4>
          <ul className="dk-responses">
            {op.responses.map((r) => (
              <li key={r.status}>
                <span className={`dk-status dk-status--${r.status[0]}`}>{r.status}</span>
                <span>{r.description}{r.schemaName && !r.status.startsWith("4") ? <> Returns <code>{r.schemaName}</code>.</> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="dk-op__code">
        <CodeTabs samples={op.samples} />
        {ok?.example !== undefined && (
          <>
            <p className="dk-op__label">Response · {ok.status}</p>
            <CodeBlock code={JSON.stringify(ok.example, null, 2)} lang="json" />
          </>
        )}
        {errors.length > 0 && errors[0].example !== undefined && (
          <details className="dk-op__errors">
            <summary>Error example · {errors[0].status}</summary>
            <CodeBlock code={JSON.stringify(errors[0].example, null, 2)} lang="json" />
          </details>
        )}
      </div>
    </section>
  );
}

export default async function TagPage({ params }: Props) {
  const tag = tagBySlug((await params).tag);
  if (!tag) notFound();
  const ops = operations(tag.name);

  return (
    <div className="dk-page dk-page--ref">
      <div className="dk-ref">
        <header className="dk-article__head">
          <p className="dk-eyebrow">API reference</p>
          <h1>{tag.name}</h1>
          <Markdown source={tag.description} />
        </header>
        {ops.map((op) => <Endpoint key={op.id} op={op} />)}
      </div>
      <OnThisPage items={ops.map((o) => ({ id: o.anchor, text: o.summary, depth: 2 }))} />
    </div>
  );
}
