import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Markdown } from "@/components/docs/markdown";
import { OnThisPage } from "@/components/docs/sidebar";
import { loadDoc, publishedGroups } from "@/lib/docs/content";

type Props = { params: Promise<{ slug: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return publishedGroups().flatMap((g) => g.pages.map((p) => ({ slug: p.slug.split("/") })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = loadDoc((await params).slug.join("/"));
  return doc ? { title: `${doc.title} · Docs`, description: doc.description } : {};
}

export default async function GuidePage({ params }: Props) {
  const doc = loadDoc((await params).slug.join("/"));
  if (!doc) notFound();

  return (
    <div className="dk-page dk-page--guide">
      <article className="dk-article">
        <header className="dk-article__head">
          {doc.group && <p className="dk-eyebrow">{doc.group}</p>}
          <h1>{doc.title}</h1>
          {doc.description && <p className="dk-lead">{doc.description}</p>}
        </header>
        <Markdown source={doc.body} />
        <nav className="dk-pager" aria-label="Previous and next">
          {doc.prev ? (
            <Link href={`/docs/${doc.prev.slug}`} className="dk-pager__link">
              <span><ArrowLeft size={14} /> Previous</span>
              <b>{doc.prev.title}</b>
            </Link>
          ) : <span />}
          {doc.next && (
            <Link href={`/docs/${doc.next.slug}`} className="dk-pager__link dk-pager__link--next">
              <span>Next <ArrowRight size={14} /></span>
              <b>{doc.next.title}</b>
            </Link>
          )}
        </nav>
      </article>
      <OnThisPage items={doc.headings} />
    </div>
  );
}
