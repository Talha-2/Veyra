"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const LABELS: Record<string, string> = {
  bash: "Terminal", sh: "Terminal", shell: "Terminal", json: "JSON", js: "JavaScript", javascript: "JavaScript",
  ts: "TypeScript", typescript: "TypeScript", python: "Python", py: "Python", php: "PHP", html: "HTML", http: "HTTP", text: "",
};

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="dk-code__copy"
      aria-label={done ? "Copied" : "Copy code"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** A fenced code block: language label and a copy button. */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const label = LABELS[lang ?? ""] ?? (lang ?? "");
  return (
    <div className="dk-code">
      <div className="dk-code__bar">
        <span>{label}</span>
        <CopyButton text={code} />
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

/** The same request in several languages, one tab each. */
export function CodeTabs({ samples }: { samples: { lang: string; label: string; code: string }[] }) {
  const [i, setI] = useState(0);
  const cur = samples[i];
  return (
    <div className="dk-code">
      <div className="dk-code__bar">
        <div className="dk-code__tabs" role="tablist">
          {samples.map((s, k) => (
            <button key={s.label} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}>
              {s.label}
            </button>
          ))}
        </div>
        <CopyButton text={cur.code} />
      </div>
      <pre><code>{cur.code}</code></pre>
    </div>
  );
}
