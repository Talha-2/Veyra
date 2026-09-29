import type { MetadataRoute } from "next";

import { publishedGroups } from "@/lib/docs/content";
import { tags } from "@/lib/docs/openapi";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://veyra.vercel.app";

/* Public marketing pages only — /studio, /desk, and auth routes stay out. */
const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/platform", priority: 0.9 },
  { path: "/solutions", priority: 0.8 },
  { path: "/integrations", priority: 0.8 },
  { path: "/pricing", priority: 0.9 },
  { path: "/start", priority: 0.9 },
  { path: "/security", priority: 0.6 },
  { path: "/company", priority: 0.6 },
  { path: "/contact", priority: 0.7 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = [
    { path: "/docs", priority: 0.8 },
    ...publishedGroups().flatMap((g) => g.pages.map((p) => ({ path: `/docs/${p.slug}`, priority: 0.6 }))),
    { path: "/docs/api-reference", priority: 0.7 },
    ...tags().map((t) => ({ path: `/docs/api-reference/${t.slug}`, priority: 0.5 })),
    { path: "/docs/api-reference/events", priority: 0.5 },
  ];
  return [...ROUTES, ...docs].map((r) => ({
    url: `${BASE}${r.path}`,
    changeFrequency: "monthly",
    priority: r.priority,
  }));
}
