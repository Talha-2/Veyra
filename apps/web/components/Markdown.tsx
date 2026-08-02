"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* Renders the deep agent's replies as real markdown — headers, bold, lists,
   tables, code — so a structured answer reads like the reference console, not a
   wall of raw text. Styled inline to stay theme-aware without a global reset. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="da-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (p) => <a {...p} target="_blank" rel="noreferrer" />,
          table: (p) => (
            <div className="da-md__tablewrap">
              <table {...p} />
            </div>
          ),
          code: ({ className, children, ...p }: any) => {
            const inline = !String(className || "").includes("language-");
            return inline ? (
              <code className="da-md__code" {...p}>{children}</code>
            ) : (
              <pre className="da-md__pre"><code {...p}>{children}</code></pre>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
