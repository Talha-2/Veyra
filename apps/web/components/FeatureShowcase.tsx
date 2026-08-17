"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/* Auto-advancing feature showcase: the active step rotates on a timer (pauses
   on hover, resets on manual select), and a large product mockup fades in on a
   gradient panel. No click required — Retell-style. */

const INTERVAL = 6500;

const FEATURES = [
  {
    num: "01",
    label: "Grounded answers",
    title: "It answers from your knowledge, not its imagination.",
    desc: "Hybrid retrieval (vectors + keyword) over your knowledge base, tuned to survive STT mangled queries. If the answer isn't there, the agent says so and offers a human. It never guesses.",
    bullets: ["Dense + BM25 retrieval, fused", "Heading aware chunking", "Retrieve or transfer, never improvise"],
  },
  {
    num: "02",
    label: "Real workflows",
    title: "Booking, intake, and escalation as JSON, triggered by intent.",
    desc: "Define multistep flows that fire on caller intent, keywords, or call start. The full conversation rides along, so callers never repeat themselves. Edit and ship without redeploying.",
    bullets: ["Intent, keyword, or call start triggers", "Variables collected mid call", "Handoff to business webhooks"],
  },
  {
    num: "03",
    label: "Natural turn taking",
    title: "Turns under a second, and it stops the instant you cut in.",
    desc: "Streaming STT, preemptive generation, and flash TTS keep turns under ~1.2s. Semantic endpointing plus barge in means a real interruption stops it in ~100ms, but a cough won't kill its answer.",
    bullets: ["<1.2s voice to voice, measured", "Barge in with false interrupt recovery", "Per turn latency published live"],
  },
  {
    num: "04",
    label: "Human handoff",
    title: "When it should hand off, it does so warmly.",
    desc: "Cold SIP transfers for simple routing; warm transfers brief the human with an AI generated summary before the agent leaves the line. Busy or failed targets fall back gracefully.",
    bullets: ["Cold + warm SIP transfers", "AI briefed handoff summary", "No stranded callers on failure"],
  },
];

function Mock({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className="mock">
        <div className="mock-bar">
          <span className="mock-dot" style={{ background: "var(--voice-caller)" }} />
          <span>knowledge_base · retrieval</span>
        </div>
        <div className="mono p-5 text-[13px] leading-relaxed">
          <div style={{ color: "var(--stage-text-muted)" }}>caller › &quot;how much is the premium plan?&quot;</div>
          <div className="mt-4 space-y-2.5">
            {[
              ["pricing.md › Plans", "0.91", "Premium is $79/mo, includes priority support…"],
              ["pricing.md › Discounts", "0.74", "Annual billing saves 20%…"],
              ["faq.md › Billing", "0.66", "Plans can be changed any time…"],
            ].map(([doc, score, txt]) => (
              <div key={doc} className="flex items-start gap-2">
                <span style={{ color: "var(--accent-text)" }}>■</span>
                <span className="flex-1">
                  <span style={{ color: "var(--stage-text)" }}>{doc}</span>{" "}
                  <span style={{ color: "var(--stage-text-muted)" }}>· {score}</span>
                  <div style={{ color: "var(--stage-text-muted)" }}>{txt}</div>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--stage-border)" }}>
            <span style={{ color: "var(--voice-agent)" }}>agent ›</span> The premium plan is 79 dollars a month, and
            you save 20% if you pay annually.
          </div>
        </div>
      </div>
    );
  if (index === 1)
    return (
      <div className="mock">
        <div className="mock-bar">
          <span className="mock-dot" style={{ background: "var(--accent)" }} />
          <span>workflows / book_appointment.json</span>
        </div>
        <pre className="mono overflow-x-auto p-5 text-[13px] leading-relaxed">
{`{
  `}<span style={{ color: "var(--accent-text)" }}>&quot;trigger&quot;</span>{`: { `}<span style={{ color: "var(--accent-text)" }}>&quot;type&quot;</span>{`: `}<span style={{ color: "var(--voice-caller)" }}>&quot;intent&quot;</span>{`,
    `}<span style={{ color: "var(--accent-text)" }}>&quot;intent&quot;</span>{`: `}<span style={{ color: "var(--voice-caller)" }}>&quot;wants to book&quot;</span>{` },
  `}<span style={{ color: "var(--accent-text)" }}>&quot;variables&quot;</span>{`: [`}<span style={{ color: "var(--voice-caller)" }}>&quot;name&quot;</span>{`, `}<span style={{ color: "var(--voice-caller)" }}>&quot;service&quot;</span>{`, `}<span style={{ color: "var(--voice-caller)" }}>&quot;time&quot;</span>{`],
  `}<span style={{ color: "var(--accent-text)" }}>&quot;steps&quot;</span>{`: [
    { `}<span style={{ color: "var(--accent-text)" }}>&quot;collect&quot;</span>{`: `}<span style={{ color: "var(--voice-caller)" }}>&quot;name&quot;</span>{` },
    { `}<span style={{ color: "var(--accent-text)" }}>&quot;kb_lookup&quot;</span>{`: `}<span style={{ color: "var(--voice-caller)" }}>&quot;availability&quot;</span>{` },
    { `}<span style={{ color: "var(--accent-text)" }}>&quot;api_call&quot;</span>{`: `}<span style={{ color: "var(--voice-caller)" }}>&quot;/crm/book&quot;</span>{` }
  ]
}`}
        </pre>
      </div>
    );
  if (index === 2)
    return (
      <div className="mock">
        <div className="mock-bar">
          <span className="mock-dot dot-pulse" style={{ background: "var(--success)" }} />
          <span>live call · turn latency</span>
        </div>
        <div className="p-5 text-[13px]">
          <div className="space-y-2.5">
            <div className="flex justify-end">
              <span className="rounded-lg px-3 py-2" style={{ background: "var(--voice-caller)", color: "#fff" }}>
                actually — wait, do you—
              </span>
            </div>
            <div className="flex items-center gap-2" style={{ color: "var(--stage-text-muted)" }}>
              <span className="mono" style={{ color: "var(--accent-text)" }}>82 ms</span> barge-in · agent stopped
            </div>
            <div className="flex justify-start">
              <span className="rounded-lg px-3 py-2" style={{ background: "var(--stage-raised)" }}>
                Of course, go ahead.
              </span>
            </div>
          </div>
          <div className="mono mt-5 grid grid-cols-4 gap-2 border-t pt-4 text-center" style={{ borderColor: "var(--stage-border)" }}>
            {[["endpoint", "410"], ["llm ttft", "290"], ["tts", "120"], ["total", "1.02s"]].map(([k, v], i) => (
              <div key={k}>
                <div className="text-[18px]" style={{ color: i === 3 ? "var(--success)" : "var(--stage-text)" }}>{v}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--stage-text-muted)" }}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  return (
    <div className="mock">
      <div className="mock-bar">
        <span className="mock-dot" style={{ background: "var(--warning)" }} />
        <span>warm transfer · supervisor</span>
      </div>
      <div className="p-5 text-[13px] leading-relaxed">
        <div style={{ color: "var(--stage-text-muted)" }}>agent › briefing a teammate before I connect you…</div>
        <div className="mono mt-4 rounded-lg p-4" style={{ background: "var(--stage-raised)" }}>
          <div><span style={{ color: "var(--accent-text)" }}>caller</span>: Dana Ruiz</div>
          <div><span style={{ color: "var(--accent-text)" }}>issue</span>: double charged on invoice #4821</div>
          <div><span style={{ color: "var(--accent-text)" }}>tried</span>: verified account, needs refund approval</div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="dot" style={{ background: "var(--success)" }} />
          <span style={{ color: "var(--stage-text)" }}>Supervisor joined · handing off</span>
        </div>
      </div>
    </div>
  );
}

export default function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % FEATURES.length), INTERVAL);
    return () => clearTimeout(t);
  }, [active, paused]);

  return (
    <div
      className="grid gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-12"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* rail */}
      <div className="flex flex-col gap-2">
        {FEATURES.map((f, i) => {
          const on = i === active;
          return (
            <button
              key={f.num}
              className={`rail2 ${on ? "active" : ""}`}
              onClick={() => setActive(i)}
              aria-expanded={on}
              style={{ ["--rail-ms" as any]: `${INTERVAL}ms` }}
            >
              <div className="rail2-head">
                <span className="rail2-num">{f.num}</span>
                <span className="font-medium" style={{ fontSize: 16 }}>{f.label}</span>
              </div>
              {on && (
                <div className="mt-3 pl-[34px]">
                  <p className="text-secondary mb-3 text-[14px] leading-relaxed">{f.desc}</p>
                  <ul className="space-y-1.5">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-[13px]">
                        <Check size={15} strokeWidth={2.25} style={{ color: "var(--accent)" }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {on && !paused && <span className="rail2-progress" key={active} />}
            </button>
          );
        })}
      </div>

      {/* big mockup on a gradient panel */}
      <div className="showcase-frame flex items-center lg:sticky lg:top-24 lg:self-start">
        <div className="mock-fade w-full" key={active}>
          <Mock index={active} />
        </div>
      </div>
    </div>
  );
}
