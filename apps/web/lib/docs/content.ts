import fs from "node:fs";
import path from "node:path";

import { API_BASE, APP_URL } from "@/components/mk/links";

/* The guides: Markdown files in content/docs, listed by content/docs/nav.json.
   Authoring rules are in content/docs/AUTHORING.md. Everything here runs at
   build time; pages are static. */

const ROOT = path.join(process.cwd(), "content", "docs");

export interface NavPage { slug: string; title: string }
export interface NavGroup { title: string; pages: NavPage[] }
export interface Heading { depth: 2 | 3; text: string; id: string }
export interface Doc {
  slug: string;
  title: string;
  description: string;
  body: string;
  headings: Heading[];
  group: string;
  prev: NavPage | null;
  next: NavPage | null;
}

export function navGroups(): NavGroup[] {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "nav.json"), "utf8"));
}

/** Only pages whose file exists: a page listed before it is written is hidden, not broken. */
export function publishedGroups(): NavGroup[] {
  return navGroups()
    .map((g) => ({ ...g, pages: g.pages.filter((p) => fs.existsSync(fileFor(p.slug))) }))
    .filter((g) => g.pages.length > 0);
}

function fileFor(slug: string) {
  return path.join(ROOT, `${slug}.md`);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** `{{API_BASE}}` and `{{APP_URL}}` become this deployment's real addresses. */
export function fillPlaceholders(text: string): string {
  return text.replaceAll("{{API_BASE}}", API_BASE).replaceAll("{{APP_URL}}", APP_URL);
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: raw.slice(m[0].length) };
}

/** `##` and `###` headings outside code fences, for "On this page". */
export function headingsOf(markdown: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*#*$/);
    if (m) {
      const text = m[2].replace(/\*\*|__|`/g, "");
      out.push({ depth: m[1].length as 2 | 3, text, id: slugify(text) });
    }
  }
  return out;
}

export function loadDoc(slug: string): Doc | null {
  const file = fileFor(slug);
  if (!fs.existsSync(file)) return null;
  const { data, body: raw } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const body = fillPlaceholders(raw);

  const groups = publishedGroups();
  const flat = groups.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })));
  const i = flat.findIndex((p) => p.slug === slug);

  return {
    slug,
    title: data.title ?? flat[i]?.title ?? slug,
    description: data.description ?? "",
    body,
    headings: headingsOf(body),
    group: flat[i]?.group ?? "",
    prev: i > 0 ? flat[i - 1] : null,
    next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null,
  };
}
