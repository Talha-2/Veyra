"use client";

/* Client pieces of the pricing page: the FAQ accordion (state). Everything
   else on the page renders on the server. */

import { useId, useState } from "react";
import { Plus } from "lucide-react";

import { Soon } from "./soon";

/* ── FAQ: one question open at a time, fully keyboard and reader friendly ── */

/** Items are [question, answer, soon?]; `soon` tags a question the product cannot answer yes to today. */
export function FaqAccordion({ items }: { items: [string, string, boolean?][] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="border-t border-[var(--mk-line)]">
      {items.map(([q, a, soon], i) => {
        const isOpen = open === i;
        const btn = `${base}-q${i}`;
        const panel = `${base}-a${i}`;
        return (
          <div key={q} className="border-b border-[var(--mk-line)]">
            <h3>
              <button
                id={btn}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : i)}
                className="group flex w-full items-center justify-between gap-6 py-7 text-left"
              >
                <span className="mk-h4 transition-colors group-hover:text-[var(--mk-ember-deep)]">{q}{soon && <Soon inline />}</span>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(127,127,127,0.1)", transition: "transform 450ms var(--mk-ease), background-color 300ms", transform: isOpen ? "rotate(45deg)" : "none" }}
                  aria-hidden="true"
                >
                  <Plus size={18} />
                </span>
              </button>
            </h3>
            <div
              id={panel}
              role="region"
              aria-labelledby={btn}
              inert={!isOpen}
              style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 500ms var(--mk-ease)" }}
            >
              <div className="overflow-hidden">
                <p className="mk-body max-w-[62ch] pb-8" style={{ opacity: isOpen ? 1 : 0, transition: "opacity 400ms var(--mk-ease)" }}>{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
