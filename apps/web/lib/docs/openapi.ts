import fs from "node:fs";
import path from "node:path";

import { API_BASE } from "@/components/mk/links";
import { slugify } from "./content";

/* The API reference, generated from content/docs/openapi.json: the document
   the app serves at /api/v1/openapi.json, snapshotted by
   `npm run docs:sync-openapi`. The app's PublicApiTest keeps it in step with
   the routes, so nothing here is hand-written. */

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let cache: Json | null = null;
export function spec(): Json {
  if (!cache) cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "docs", "openapi.json"), "utf8"));
  return cache;
}

export interface Tag { name: string; slug: string; description: string }
export interface Param { name: string; in: string; required: boolean; type: string; description: string; enumValues?: string[]; example?: unknown }
export interface Field { name: string; type: string; required: boolean; description: string; enumValues?: string[]; depth: number }
export interface Response { status: string; description: string; schemaName: string | null; example: unknown }
export interface Operation {
  id: string;
  anchor: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  scope: string | null;
  publishable: boolean;
  params: Param[];
  body: { schemaName: string | null; fields: Field[]; example: unknown } | null;
  responses: Response[];
  samples: { lang: string; label: string; code: string }[];
}
export interface EventType { type: string; description: string; example: unknown; headers: Param[] }

const METHODS = ["get", "post", "put", "patch", "delete"];

export function tags(): Tag[] {
  return (spec().tags ?? []).map((t: Json) => ({ name: t.name, slug: slugify(t.name), description: t.description ?? "" }));
}

export function tagBySlug(slug: string): Tag | undefined {
  return tags().find((t) => t.slug === slug);
}

function deref(node: Json): Json {
  let n = node;
  while (n && typeof n === "object" && typeof n.$ref === "string") {
    const parts = n.$ref.replace(/^#\//, "").split("/");
    n = parts.reduce((acc: Json, key: string) => acc?.[key], spec());
  }
  return n;
}

function refName(node: Json): string | null {
  return typeof node?.$ref === "string" ? node.$ref.split("/").pop() : null;
}

function typeOf(schema: Json): string {
  if (!schema) return "any";
  const name = refName(schema);
  if (name) return name;
  const s = schema;
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map(typeOf).join(" | ");
  const t = Array.isArray(s.type) ? s.type.filter((x: string) => x !== "null") : [s.type];
  const nullable = Array.isArray(s.type) && s.type.includes("null");
  let base = t.filter(Boolean).join(" | ") || (s.properties ? "object" : "any");
  if (base === "array") base = `${typeOf(s.items)}[]`;
  if (s.format && base === "string") base = `string (${s.format})`;
  return nullable ? `${base} or null` : base;
}

/** An object schema as rows, nested objects indented one level (no deeper). */
export function fieldsOf(schemaNode: Json, depth = 0): Field[] {
  const s = deref(schemaNode);
  if (!s || typeof s !== "object") return [];
  const required: string[] = s.required ?? [];
  const rows: Field[] = [];
  for (const [name, raw] of Object.entries<Json>(s.properties ?? {})) {
    const prop = deref(raw);
    rows.push({
      name,
      type: typeOf(raw),
      required: required.includes(name),
      description: prop?.description ?? "",
      enumValues: prop?.enum,
      depth,
    });
    const inner = prop?.type === "object" || (Array.isArray(prop?.type) && prop.type.includes("object")) ? prop : null;
    if (inner?.properties && depth < 1 && !refName(raw)) rows.push(...fieldsOf(inner, depth + 1));
  }
  return rows;
}

function paramOf(raw: Json): Param {
  const p = deref(raw);
  return {
    name: p.name,
    in: p.in,
    required: !!p.required,
    type: typeOf(p.schema),
    description: p.description ?? "",
    enumValues: p.schema?.enum,
    example: p.example,
  };
}

function exampleFor(content: Json): unknown {
  const media = content?.["application/json"];
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const ex = media.examples ? Object.values<Json>(media.examples)[0] : undefined;
  return ex?.value;
}

function fillPath(p: string, params: Param[]): string {
  return p.replace(/\{(\w+)\}/g, (_, name) => String(params.find((x) => x.name === name)?.example ?? 42));
}

function queryString(params: Param[]): string {
  const q = params.filter((p) => p.in === "query" && p.required && p.example !== undefined);
  return q.length ? "?" + q.map((p) => `${p.name}=${encodeURIComponent(String(p.example))}`).join("&") : "";
}

function samples(method: string, p: string, params: Param[], body: unknown, publishable: boolean): Operation["samples"] {
  const url = `${API_BASE}${fillPath(p, params)}${queryString(params)}`;
  const key = publishable ? "$VEYRA_KEY" : "$VEYRA_SECRET_KEY";
  const hasBody = body !== undefined && method !== "get" && method !== "delete";
  const json = hasBody ? JSON.stringify(body, null, 2) : "";
  const M = method.toUpperCase();

  const curl = [`curl ${M === "GET" ? "" : `-X ${M} `}"${url}" \\`, `  -H "Authorization: Bearer ${key}"`];
  if (hasBody) curl[curl.length - 1] += " \\", curl.push(`  -H "Content-Type: application/json" \\`, `  -d '${json.replace(/'/g, "'\\''")}'`);

  const envVar = publishable ? "VEYRA_KEY" : "VEYRA_SECRET_KEY";
  const js = [
    `const res = await fetch("${url}", {`,
    ...(M !== "GET" ? [`  method: "${M}",`] : []),
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${envVar}}\`,`,
    ...(hasBody ? [`    "Content-Type": "application/json",`] : []),
    `  },`,
    ...(hasBody ? [`  body: JSON.stringify(${json.replace(/\n/g, "\n  ")}),`] : []),
    `});`,
    `const data = await res.json();`,
  ].join("\n");

  const py = [
    `import os, requests`,
    ``,
    `res = requests.${method}(`,
    `    "${url}",`,
    `    headers={"Authorization": f"Bearer {os.environ['${envVar}']}"},`,
    ...(hasBody ? [`    json=${json.replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None").replace(/\n/g, "\n    ")},`] : []),
    `)`,
    `data = res.json()`,
  ].join("\n");

  return [
    { lang: "bash", label: "cURL", code: curl.join("\n") },
    { lang: "js", label: "JavaScript", code: js },
    { lang: "python", label: "Python", code: py },
  ];
}

export function operations(tagName: string): Operation[] {
  const out: Operation[] = [];
  for (const [p, item] of Object.entries<Json>(spec().paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op || !(op.tags ?? []).includes(tagName)) continue;
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(paramOf);
      const reqMedia = op.requestBody?.content?.["application/json"];
      const bodyExample = exampleFor(op.requestBody?.content);
      const responses: Response[] = Object.entries<Json>(op.responses ?? {}).map(([status, raw]) => {
        const r = deref(raw);
        const schema = r?.content?.["application/json"]?.schema;
        return { status, description: r?.description ?? "", schemaName: refName(schema), example: exampleFor(r?.content) };
      });
      out.push({
        id: op.operationId ?? `${method}-${p}`,
        anchor: slugify(op.summary ?? op.operationId ?? `${method} ${p}`),
        method,
        path: p,
        summary: op.summary ?? "",
        description: (op.description ?? "").replace(/\n\nRequires the `[^`]+` scope\.(?: Publishable keys allowed\.)?\s*$/, ""),
        scope: op["x-scope"] ?? null,
        publishable: !!op["x-publishable"],
        params,
        body: reqMedia ? { schemaName: refName(reqMedia.schema), fields: fieldsOf(reqMedia.schema), example: bodyExample } : null,
        responses,
        samples: samples(method, p, params, bodyExample, !!op["x-publishable"]),
      });
    }
  }
  return out;
}

export function events(): EventType[] {
  return Object.entries<Json>(spec().webhooks ?? {}).map(([type, item]) => {
    const op = item.post ?? Object.values(item)[0];
    return {
      type,
      description: op?.description ?? "",
      example: exampleFor(op?.requestBody?.content),
      headers: (op?.parameters ?? []).map(paramOf),
    };
  });
}

export function scopes(): Record<string, string> {
  return spec()["x-scopes"] ?? {};
}

export function info(): { title: string; version: string; description: string } {
  const i = spec().info ?? {};
  return { title: i.title ?? "Veyra API", version: i.version ?? "", description: i.description ?? "" };
}
