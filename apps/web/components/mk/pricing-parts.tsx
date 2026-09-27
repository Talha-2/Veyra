"use client";

/* Client pieces of the pricing page: the FAQ accordion (state) and the art
   for the usage band. Everything else on the page renders on the server. */

import { useId, useState } from "react";
import { MessageSquareText, Phone, PhoneCall, Plus } from "lucide-react";

/* ── FAQ: one question open at a time, fully keyboard and reader friendly ── */

export function FaqAccordion({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="border-t border-[var(--mk-line)]">
      {items.map(([q, a], i) => {
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
                <span className="mk-h4 transition-colors group-hover:text-[var(--mk-ember-deep)]">{q}</span>
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

/* ── usage art: provider cost in, the same cost out ───────────────────── */

const LINES = [
  { icon: PhoneCall, label: "Voice minutes" },
  { icon: Phone, label: "Phone numbers" },
  { icon: MessageSquareText, label: "SMS" },
];

/**
 * Three usage lines travel from the provider to your bill unchanged. The
 * middle stage is Veyra, and it adds nothing: the "+ $0" chip is the point.
 */
export function PassThroughArt() {
  return (
    <div className="relative mx-auto w-full" aria-hidden="true">
      <style>{`@keyframes mk-flow { from { stroke-dashoffset: 28; } to { stroke-dashoffset: 0; } }`}</style>
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Stage title="Provider cost" caption="What the carrier charges">
          {LINES.map((l) => <Row key={l.label} icon={l.icon} label={l.label} />)}
        </Stage>
        <Flow />
        <div className="mk-card--night relative flex flex-col items-center justify-center gap-4 rounded-[var(--mk-radius-card)] px-6 py-10 text-center" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 40px 90px -30px rgba(233,107,52,0.45)" }}>
          <div className="absolute inset-0 rounded-[inherit] opacity-60" style={{ background: "var(--mk-glow)", filter: "blur(30px)" }} />
          <span className="relative flex size-20 items-center justify-center rounded-[24px]" style={{ background: "linear-gradient(145deg, #2c2c30, #0e0e10)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)" }}>
            <svg width="44" height="44" viewBox="0 0 16 16">
              {[[2, 6, 10], [5, 3, 13], [8, 5, 11], [11, 2, 14], [14, 6, 10]].map(([x, y1, y2], i) => (
                <line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke="#f07a45" strokeWidth="1.9" strokeLinecap="round" style={{ transformOrigin: "center", transformBox: "fill-box", animation: `mk-bar ${1 + i * 0.15}s ease-in-out ${i * 0.1}s infinite` }} />
              ))}
            </svg>
          </span>
          <p className="relative text-[clamp(44px,5vw,64px)] font-semibold leading-none tracking-[-0.05em]">+ $0</p>
          <p className="mk-small relative">Veyra’s markup</p>
        </div>
        <Flow />
        <Stage title="Your bill" caption="The same amount, line for line">
          {LINES.map((l) => <Row key={l.label} icon={l.icon} label={l.label} same />)}
        </Stage>
      </div>
    </div>
  );
}

function Stage({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--mk-radius-card)] p-6" style={{ background: "var(--mk-night-card)" }}>
      <p className="mk-h4">{title}</p>
      <p className="mk-small mt-1">{caption}</p>
      <div className="mt-5 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, same = false }: { icon: typeof Phone; label: string; same?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--mk-night-card-2)" }}>
      <Icon size={18} style={{ color: "var(--mk-ember-soft)" }} />
      <span className="whitespace-nowrap text-[15px] font-medium">{label}</span>
      <span className="ml-auto h-1.5 w-10 shrink-0 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <span className="block h-full w-2/3 rounded-full" style={{ background: same ? "var(--mk-ember-soft)" : "var(--mk-night-ink-2)" }} />
      </span>
    </div>
  );
}

function Flow() {
  return (
    <div className="flex items-center justify-center">
      {/* site.css sets `svg { display: block }`, so the wrappers carry the breakpoints */}
      <div className="hidden md:block">
        <svg viewBox="0 0 64 24" className="h-6 w-14">
          <line x1="2" y1="12" x2="54" y2="12" stroke="#ffb08a" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 10" style={{ animation: "mk-flow 1.2s linear infinite" }} />
          <path d="M52 6 L60 12 L52 18" fill="none" stroke="#ffb08a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="md:hidden">
        <svg viewBox="0 0 24 44" className="h-11 w-6">
          <line x1="12" y1="2" x2="12" y2="34" stroke="#ffb08a" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 10" style={{ animation: "mk-flow 1.2s linear infinite" }} />
          <path d="M6 32 L12 40 L18 32" fill="none" stroke="#ffb08a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
