"use client";

/* Developer tooling: a tabbed code block, and a live API playground driven by
   the public OpenAPI spec. The spec is the single source of truth, so the
   playground never drifts from the API. */

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Play, Terminal } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Spinner } from "@/components/ui";

/* ── tabbed, copyable code ─────────────────────────────────────────────── */

export type Snippet = { label: string; lang: string; code: string };

export function CodeBlock({ snippets, height }: { snippets: Snippet[]; height?: number }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const active = snippets[i] ?? snippets[0];

  const copy = () => {
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  return (
    <div className="code-block">
      <div className="code-block__bar">
        <div className="code-block__tabs">
          {snippets.map((s, idx) => (
            <button key={s.label} className={`code-tab ${idx === i ? "active" : ""}`} onClick={() => setI(idx)}>
              {s.label}
            </button>
          ))}
        </div>
        <button className="code-copy" onClick={copy} title="Copy">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-block__body" style={height ? { maxHeight: height } : undefined}>
        <code>{active.code}</code>
      </pre>
    </div>
  );
}

/* ── live API playground ───────────────────────────────────────────────── */

type Op = {
  method: string;
  path: string;
  summary: string;
  description: string;
  params: { name: string; in: string; required: boolean }[];
  body: any | null;
};

const KEY_STORE = "rv-playground-key";

// Build a plausible example body straight from the schema, so the developer
// starts from something valid instead of an empty object.
function exampleFor(schema: any, spec: any, depth = 0): any {
  if (!schema || depth > 4) return null;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return exampleFor(spec?.components?.schemas?.[name], spec, depth + 1);
  }
  if (schema.anyOf || schema.oneOf) return exampleFor((schema.anyOf || schema.oneOf)[0], spec, depth + 1);
  if (schema.default !== undefined) return schema.default;
  if (schema.example !== undefined) return schema.example;

  switch (schema.type) {
    case "object": {
      const out: any = {};
      for (const [k, v] of Object.entries<any>(schema.properties || {})) out[k] = exampleFor(v, spec, depth + 1);
      return out;
    }
    case "array":
      return [];
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return "";
  }
}

export function ApiPlayground() {
  const [spec, setSpec] = useState<any>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [sel, setSel] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<{ status: number; ms: number; text: string } | null>(null);

  useEffect(() => {
    try { setApiKey(sessionStorage.getItem(KEY_STORE) || ""); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/v1/openapi.json`)
      .then((r) => r.json())
      .then((s) => {
        setSpec(s);
        const list: Op[] = [];
        for (const [path, methods] of Object.entries<any>(s.paths || {})) {
          for (const [method, op] of Object.entries<any>(methods)) {
            list.push({
              method: method.toUpperCase(),
              path,
              summary: op.summary || path,
              description: op.description || "",
              params: (op.parameters || []).map((p: any) => ({ name: p.name, in: p.in, required: !!p.required })),
              body: op.requestBody?.content?.["application/json"]?.schema ?? null,
            });
          }
        }
        list.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
        setOps(list);
      })
      .catch(() => setOps([]));
  }, []);

  const op = ops[sel];

  // reset the form whenever the selected operation changes
  useEffect(() => {
    if (!op) return;
    setRes(null);
    setPathVals({});
    setBodyText(op.body ? JSON.stringify(exampleFor(op.body, spec), null, 2) : "");
  }, [sel, op, spec]);

  const url = useMemo(() => {
    if (!op) return "";
    let p = op.path;
    for (const prm of op.params.filter((x) => x.in === "path")) {
      p = p.replace(`{${prm.name}}`, pathVals[prm.name] || `{${prm.name}}`);
    }
    const query = op.params
      .filter((x) => x.in === "query" && pathVals[x.name])
      .map((x) => `${encodeURIComponent(x.name)}=${encodeURIComponent(pathVals[x.name])}`)
      .join("&");
    return `${API_URL}${p}${query ? `?${query}` : ""}`;
  }, [op, pathVals]);

  const send = async () => {
    if (!op) return;
    setSending(true);
    const t0 = performance.now();
    try {
      const init: RequestInit = {
        method: op.method,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      };
      if (op.method !== "GET" && op.method !== "DELETE" && bodyText.trim()) init.body = bodyText;
      const r = await fetch(url, init);
      const text = await r.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not json */ }
      setRes({ status: r.status, ms: Math.round(performance.now() - t0), text: pretty });
    } catch (e: any) {
      setRes({ status: 0, ms: Math.round(performance.now() - t0), text: String(e.message || e) });
    } finally {
      setSending(false);
    }
  };

  const saveKey = (v: string) => {
    setApiKey(v);
    try { sessionStorage.setItem(KEY_STORE, v); } catch { /* ignore */ }
  };

  if (!ops.length) {
    return <div className="flex items-center gap-2 py-8"><Spinner size={16} /><span className="text-secondary text-[13px]">Loading the API spec</span></div>;
  }

  const pathParams = op?.params.filter((p) => p.in === "path") || [];
  const queryParams = op?.params.filter((p) => p.in === "query") || [];

  return (
    <div className="pg">
      {/* operation list */}
      <aside className="pg__ops">
        {ops.map((o, i) => (
          <button key={`${o.method}${o.path}`} className={`pg__op ${i === sel ? "active" : ""}`} onClick={() => setSel(i)}>
            <span className={`verb verb--${o.method.toLowerCase()}`}>{o.method}</span>
            <span className="pg__op-path">{o.path.replace("/v1", "")}</span>
          </button>
        ))}
      </aside>

      {/* request builder */}
      <div className="pg__main">
        <div className="mb-3">
          <div className="text-[14px] font-semibold">{op?.summary}</div>
          {op?.description && <p className="hint mt-0.5">{op.description}</p>}
        </div>

        <div className="pg__url">
          <span className={`verb verb--${op?.method.toLowerCase()}`}>{op?.method}</span>
          <span className="mono truncate text-[12px]">{url}</span>
        </div>

        <div className="mt-3">
          <label className="label">API key</label>
          <input
            className="input mono"
            type="password"
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
            placeholder="z360_sk_live_..."
          />
          <p className="hint mt-1">Paste a key from above. It stays in this tab only and is never sent anywhere except your API.</p>
        </div>

        {(pathParams.length > 0 || queryParams.length > 0) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[...pathParams, ...queryParams].map((p) => (
              <div key={p.name}>
                <label className="label">
                  {p.name}
                  <span className="text-tertiary ml-1 text-[11px]">{p.in}{p.required ? ", required" : ""}</span>
                </label>
                <input
                  className="input mono h-9 text-[12px]"
                  value={pathVals[p.name] || ""}
                  onChange={(e) => setPathVals((v) => ({ ...v, [p.name]: e.target.value }))}
                  placeholder={p.in === "path" ? `${p.name}` : ""}
                />
              </div>
            ))}
          </div>
        )}

        {op?.body && (
          <div className="mt-3">
            <label className="label">Request body</label>
            <textarea className="pg__body mono" value={bodyText} onChange={(e) => setBodyText(e.target.value)} spellCheck={false} />
          </div>
        )}

        <button className="btn btn-primary mt-4" onClick={send} disabled={sending || !apiKey}>
          {sending ? <Spinner size={15} /> : <Play size={15} />} Send request
        </button>
        {!apiKey && <p className="hint mt-2">Add an API key to send a request.</p>}

        {res && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className={`badge ${res.status >= 200 && res.status < 300 ? "badge-success" : "badge-danger"}`}>
                {res.status || "network error"}
              </span>
              <span className="text-tertiary mono text-[11px]">{res.ms} ms</span>
            </div>
            <pre className="pg__res mono">{res.text}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function TerminalHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="hint flex items-center gap-1.5">
      <Terminal size={13} /> {children}
    </p>
  );
}
