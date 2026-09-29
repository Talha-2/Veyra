"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface SidebarGroup { title: string; links: { href: string; label: string; method?: string }[] }

/** The docs navigation: every group open on desktop; a drawer under 1024px. */
export function DocsSidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const current = groups.flatMap((g) => g.links).find((l) => l.href === pathname);

  return (
    <aside className="dk-side" data-open={open}>
      <button type="button" className="dk-side__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{current?.label ?? "Documentation"}</span>
        <ChevronDown size={16} />
      </button>
      <nav className="dk-side__nav" aria-label="Documentation">
        {groups.map((g) => (
          <div key={g.title} className="dk-side__group">
            <p className="dk-side__title">{g.title}</p>
            <ul>
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} aria-current={l.href === pathname ? "page" : undefined}>
                    {l.method && <span className={`dk-method dk-method--${l.method}`}>{l.method === "delete" ? "DEL" : l.method.toUpperCase()}</span>}
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

/** "On this page": the current page's headings, the visible one highlighted. */
export function OnThisPage({ items }: { items: { id: string; text: string; depth: number }[] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = items.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

  if (items.length < 2) return null;
  return (
    <nav className="dk-toc" aria-label="On this page">
      <p className="dk-toc__title">On this page</p>
      <ul>
        {items.map((h) => (
          <li key={h.id} data-depth={h.depth}>
            <a href={`#${h.id}`} aria-current={active === h.id ? "true" : undefined}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
