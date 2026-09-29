import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { slugify } from "@/lib/docs/content";
import { CodeBlock } from "./code";

/* The guides' Markdown, with the conventions in content/docs/AUTHORING.md:
   GFM tables, fenced code with a copy button, heading anchors, and GitHub
   style callouts (> [!NOTE], [!TIP], [!WARNING], [!SOON]). */

type MdNode = { type: string; value?: string; children?: MdNode[]; data?: { hProperties?: Record<string, unknown> } };

const CALLOUTS: Record<string, string> = { NOTE: "Note", TIP: "Tip", WARNING: "Warning", SOON: "Coming soon" };

/** Turn a blockquote that starts with [!KIND] into a callout, marker removed. */
function remarkCallouts() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (node.type === "blockquote") {
        const para = node.children?.[0];
        const first = para?.type === "paragraph" ? para.children?.[0] : undefined;
        const m = first?.type === "text" ? first.value?.match(/^\[!(NOTE|TIP|WARNING|SOON)\]\s*/) : null;
        if (m && first && para) {
          first.value = first.value!.slice(m[0].length);
          if (!first.value) para.children!.shift();
          if (para.children?.[0]?.type === "break") para.children.shift();
          if (!para.children?.length) node.children!.shift();
          node.data = { hProperties: { className: `dk-callout dk-callout--${m[1].toLowerCase()}`, "data-label": CALLOUTS[m[1]] } };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

function text(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(text).join("");
  if (children && typeof children === "object" && "props" in children) return text((children as { props: { children?: ReactNode } }).props.children);
  return "";
}

function Heading({ level, children }: { level: 2 | 3; children: ReactNode }) {
  const id = slugify(text(children));
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag id={id}>
      <a href={`#${id}`} className="dk-anchor" aria-hidden="true" tabIndex={-1}>#</a>
      {children}
    </Tag>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="dk-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCallouts]}
        components={{
          h2: ({ children }) => <Heading level={2}>{children}</Heading>,
          h3: ({ children }) => <Heading level={3}>{children}</Heading>,
          a: ({ href = "", children }) =>
            href.startsWith("/") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>
            ),
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const props = (child as { props?: { className?: string; children?: ReactNode } })?.props ?? {};
            const lang = /language-(\w+)/.exec(props.className ?? "")?.[1];
            return <CodeBlock code={text(props.children).replace(/\n$/, "")} lang={lang} />;
          },
          table: ({ children }) => (
            <div className="dk-table"><table>{children}</table></div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
