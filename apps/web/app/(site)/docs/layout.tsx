import { DocsSidebar, type SidebarGroup } from "@/components/docs/sidebar";
import { publishedGroups } from "@/lib/docs/content";
import { tags } from "@/lib/docs/openapi";

import "./docs.css";

/* Public documentation: product guides (Markdown in content/docs) and the API
   reference generated from the app's OpenAPI document. Inside the site's
   chrome, with its own three-column reading layout. */

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const groups: SidebarGroup[] = [
    { title: "Overview", links: [{ href: "/docs", label: "Documentation home" }] },
    ...publishedGroups().map((g) => ({ title: g.title, links: g.pages.map((p) => ({ href: `/docs/${p.slug}`, label: p.title })) })),
    {
      title: "API reference",
      links: [
        { href: "/docs/api-reference", label: "Reference overview" },
        ...tags().map((t) => ({ href: `/docs/api-reference/${t.slug}`, label: t.name })),
        { href: "/docs/api-reference/events", label: "Webhook events" },
      ],
    },
  ];

  return (
    <div className="dk">
      <div className="dk-shell">
        <DocsSidebar groups={groups} />
        <div className="dk-main">{children}</div>
      </div>
    </div>
  );
}
