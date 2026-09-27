"use client";

/* Composites for the platform page that need client state: the talker and
   worker diagram (animated wires), the three-lane timeline of one reply,
   and the tabbed webhook code card. Everything here is deterministic on the
   server and the browser, so hydration never sees two different numbers. */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AudioLines, BrainCircuit, Check, Phone, Sparkles } from "lucide-react";

import { APPS, LogoTile, VeyraMark } from "./brand";
import { Reveal, useInView, useReducedMotion } from "./motion";
import { Waveform } from "./scenes";

/* ── wires: dashed lines that flow, vertical on phones, horizontal on wide screens ── */

const WIRE_CSS = `
.pf-wire-wrap { position: relative; width: 2px; height: 76px; margin-inline: auto; display: flex; }
.pf-wire { display: block; width: 2px; height: 100%; background-image: repeating-linear-gradient(180deg, var(--pf-c) 0 6px, transparent 6px 13px); background-size: 2px 13px; animation: pf-flow-y 0.8s linear infinite; }
.pf-wire[data-rev='true'] { animation-direction: reverse; }
.pf-wire-label { position: absolute; top: 50%; transform: translateY(-50%); left: calc(100% + 14px); white-space: nowrap; font-size: 13px; color: var(--mk-ink-2); }
.pf-wire-label[data-side='left'] { left: auto; right: calc(100% + 14px); }
@media (min-width: 1280px) {
  .pf-wire-wrap { width: 100%; height: auto; flex-direction: column; align-items: stretch; gap: 10px; }
  .pf-wire { width: 100%; height: 2px; background-image: repeating-linear-gradient(90deg, var(--pf-c) 0 6px, transparent 6px 13px); background-size: 13px 2px; animation-name: pf-flow-x; }
  .pf-wire-label, .pf-wire-label[data-side='left'] { position: static; transform: none; text-align: center; }
}
@keyframes pf-flow-y { to { background-position: 0 13px; } }
@keyframes pf-flow-x { to { background-position: 13px 0; } }
@media (prefers-reduced-motion: reduce) { .pf-wire { animation: none; } }
`;

function Wire({ label, reverse = false, color = "var(--mk-ember)", side = "right" }: { label: string; reverse?: boolean; color?: string; side?: "left" | "right" }) {
  return (
    <div className="pf-wire-wrap" style={{ ["--pf-c" as string]: color } as CSSProperties}>
      <span className="pf-wire-label font-mono" data-side={side}>{label}</span>
      <span className="pf-wire" data-rev={reverse} />
    </div>
  );
}

function NodeCard({ icon, tint, kicker, title, lines, children }: { icon: ReactNode; tint: string; kicker: string; title: string; lines: string[]; children?: ReactNode }) {
  return (
    <div className="mk-card flex h-full flex-col p-7">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: tint }}>{icon}</span>
        <span className="mk-kicker">{kicker}</span>
      </div>
      <h3 className="mk-h3 mt-5">{title}</h3>
      <ul className="mt-4 flex flex-col gap-2.5">
        {lines.map((l) => (
          <li key={l} className="flex items-start gap-2.5 text-[14px] leading-snug text-[var(--mk-ink-2)]">
            <Check size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[var(--mk-ink-3)]" />{l}
          </li>
        ))}
      </ul>
      {children && <div className="mt-auto pt-6">{children}</div>}
    </div>
  );
}

/**
 * The talker/worker architecture as a diagram: the caller talks to the
 * talker; the talker delegates to the worker and speaks from what comes
 * back; the worker acts in your tools. Stacks vertically below 1280px.
 */
export function AgentDiagram() {
  const tools = [APPS.find((a) => a.logo === "googlecalendar")!, APPS.find((a) => a.logo === "hubspot")!, APPS.find((a) => a.logo === "stripe")!];
  return (
    <div className="mx-auto max-w-[420px] xl:grid xl:max-w-none xl:grid-cols-[112px_minmax(64px,1fr)_minmax(0,300px)_minmax(150px,1.3fr)_minmax(0,300px)_minmax(64px,1fr)_96px] xl:items-center">
      <style>{WIRE_CSS}</style>

      <Reveal variant="pop" className="flex flex-col items-center gap-3">
        <span className="flex size-[88px] items-center justify-center rounded-full" style={{ background: "var(--mk-ink)", color: "var(--mk-bg)", boxShadow: "var(--mk-shadow-float)" }}>
          <Phone size={34} strokeWidth={1.7} />
        </span>
        <span className="mk-small">The caller</span>
      </Reveal>

      <Reveal variant="fade" delay={150}><Wire label="speech" color="var(--mk-ink-3)" /></Reveal>

      <Reveal variant="pop" delay={250} className="h-full">
        <NodeCard
          icon={<AudioLines size={24} className="text-[var(--mk-ember)]" />}
          tint="rgba(233,107,52,0.12)"
          kicker="Talker"
          title="The front desk"
          lines={["Owns every word callers hear", "A small, fast model", "Answers simple questions itself"]}
        >
          <Waveform bars={22} height={28} />
        </NodeCard>
      </Reveal>

      <Reveal variant="fade" delay={400}>
        <div className="flex justify-center gap-12 xl:flex-col xl:gap-7">
          <Wire label="delegate()" side="left" />
          <Wire label="guidance" reverse color="var(--mk-violet)" />
        </div>
      </Reveal>

      <Reveal variant="pop" delay={500} className="h-full">
        <NodeCard
          icon={<BrainCircuit size={24} className="text-[var(--mk-violet)]" />}
          tint="rgba(139,108,255,0.14)"
          kicker="Worker"
          title="The back office"
          lines={["Runs your skills and experts", "Looks things up, books, writes", "Never speaks to the caller"]}
        >
          <div className="flex flex-wrap gap-2">
            {["Lookup", "Book", "Ticket"].map((s) => <span key={s} className="mk-pill">{s}</span>)}
          </div>
        </NodeCard>
      </Reveal>

      <Reveal variant="fade" delay={650}><Wire label="acts" color="var(--mk-violet)" /></Reveal>

      <Reveal variant="pop" delay={750} className="flex flex-col items-center gap-3">
        <div className="flex gap-3 xl:flex-col">
          {tools.map((p) => <LogoTile key={p.name} partner={p} size={72} />)}
        </div>
        <span className="mk-small">Your tools</span>
      </Reveal>
    </div>
  );
}

/* ── one reply, three lanes ───────────────────────────────────────────── */

type Seg = { from: number; to: number; text: string };
const LANES: { who: string; style: CSSProperties; segs: Seg[] }[] = [
  { who: "Caller", style: { background: "var(--mk-ink)", color: "var(--mk-bg)" }, segs: [{ from: 0, to: 26, text: "Can you move my Thursday visit?" }] },
  {
    who: "Talker",
    style: { background: "var(--mk-ember)", color: "white" },
    segs: [
      { from: 27, to: 50, text: "Sure, one moment while I pull that up." },
      { from: 51, to: 73, text: "Found it. Checking open times now." },
      { from: 74, to: 100, text: "Tuesday 8\u2060–\u206011, or Wednesday 1\u2060–\u20604?" },
    ],
  },
  {
    who: "Worker",
    style: { background: "rgba(139,108,255,0.16)", color: "var(--mk-ink)" },
    segs: [
      { from: 28, to: 47, text: "Found booking 4471" },
      { from: 48, to: 72, text: "Checked the calendar · 2 open windows" },
    ],
  },
];

/**
 * The same reply drawn as three lanes over time: while the worker looks
 * things up, the talker keeps the caller company with real progress.
 * Segments wipe in left to right the first time the card is seen.
 */
export function ReplyLanes() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const on = inView || reduced;
  const ordered = LANES.flatMap((l) => l.segs.map((s) => ({ ...s, who: l.who, style: l.style }))).sort((a, b) => a.from - b.from);

  return (
    <div ref={ref} className="mk-card p-6 sm:p-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="mk-h4">One reply, three lanes</h3>
        <span className="mk-small">Time runs left to right</span>
      </div>

      {/* wide screens: lanes */}
      <div className="mt-8 hidden flex-col gap-3 md:flex">
        {LANES.map((lane) => (
          <div key={lane.who} className="grid grid-cols-[88px_1fr] items-center gap-4">
            <span className="mk-small font-medium">{lane.who}</span>
            <div className="relative h-16 rounded-2xl" style={{ background: "var(--mk-bg-alt)" }}>
              {lane.segs.map((s) => (
                <div
                  key={s.text}
                  className="absolute top-1.5 bottom-1.5 flex items-center rounded-xl px-3 text-[14px] font-medium leading-tight"
                  style={{
                    ...lane.style,
                    left: `${s.from}%`,
                    width: `${s.to - s.from}%`,
                    clipPath: on ? "inset(0 0 0 0 round 12px)" : "inset(0 100% 0 0 round 12px)",
                    transition: reduced ? "none" : `clip-path 700ms var(--mk-ease) ${s.from * 26}ms`,
                  }}
                >
                  {s.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* phones: the same events, in order */}
      <ol className="mt-6 flex flex-col gap-2.5 md:hidden">
        {ordered.map((s, i) => (
          <li
            key={s.text}
            className="flex items-start gap-3"
            style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(10px)", transition: reduced ? "none" : `opacity 600ms var(--mk-ease) ${i * 120}ms, transform 700ms var(--mk-ease) ${i * 120}ms` }}
          >
            <span className="mt-0.5 inline-flex h-6 w-16 shrink-0 items-center justify-center rounded-full text-[12px] font-medium" style={s.style}>{s.who}</span>
            <span className="text-[14px] leading-snug text-[var(--mk-ink-2)]">{s.text}</span>
          </li>
        ))}
      </ol>

      <p className="mk-small mt-8 max-w-[60ch]">The talker fills the wait with progress the worker has actually made, and only says it’s done once the worker confirms it.</p>
    </div>
  );
}

/* ── Ask: a request, the agent's steps, and a streamed answer ─────────── */

const ASK_STEPS = ["Read your skills and automations", "Drafted the skill: Urgent leak", "Drafted the automation: Text the on-call tech"];
const ASK_ANSWER = "Done. When a caller mentions a leak, the agent now raises an urgent ticket and texts whoever is on call. Both are drafts until you turn them on.";
const ASK_WORDS = ASK_ANSWER.split(" ");

/**
 * Ask, the chat with the agent itself, at a size you can read: the steps
 * tick off one by one, then the answer streams in word by word and the
 * drafts it made appear beneath it. Plays once, the first time it is seen.
 */
export function AskStream() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  // 0..steps: steps done; then words streamed; then drafts shown
  const total = ASK_STEPS.length + ASK_WORDS.length + 1;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) { setTick(total); return; }
    let t = 0;
    let timer = 0;
    const next = () => {
      t += 1;
      setTick(t);
      if (t < total) timer = window.setTimeout(next, t <= ASK_STEPS.length ? 750 : t === total - 1 ? 500 : 55);
    };
    timer = window.setTimeout(next, 600);
    return () => window.clearTimeout(timer);
  }, [inView, reduced, total]);

  const stepsDone = Math.min(tick, ASK_STEPS.length);
  const words = Math.max(0, Math.min(ASK_WORDS.length, tick - ASK_STEPS.length));
  const drafts = tick >= total;

  return (
    <div ref={ref} className="mk-card flex flex-col" style={{ boxShadow: "var(--mk-shadow-float)", minHeight: 540 }}>
      <div className="flex items-center gap-3 border-b border-[var(--mk-line)] px-6 py-4">
        <VeyraMark size={26} />
        <span className="text-[14px] font-semibold">Ask</span>
        <span className="mk-small ml-auto">Veyra Studio</span>
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
        <div className="max-w-[85%] self-end rounded-[20px] px-4 py-3 text-[15px] leading-snug" style={{ background: "var(--mk-bg-alt)" }}>
          When someone calls about a leak, raise an urgent ticket and text the on-call tech.
        </div>
        <div className="flex gap-3.5">
          <VeyraMark size={30} />
          <div className="min-w-0 flex-1">
            <ul className="flex flex-col gap-2">
              {ASK_STEPS.map((s, i) => {
                const done = i < stepsDone;
                const active = i === stepsDone && tick < ASK_STEPS.length && inView;
                return (
                  <li key={s} className="flex items-center gap-2.5 text-[14px]" style={{ color: done ? "var(--mk-ink-2)" : "var(--mk-ink-3)", opacity: done || active ? 1 : 0.45, transition: "opacity 400ms, color 400ms" }}>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full" style={{ background: done ? "rgba(52,199,89,0.16)" : "transparent", boxShadow: done ? undefined : "inset 0 0 0 1.5px var(--mk-line-strong)" }}>
                      {done ? <Check size={12} strokeWidth={3} style={{ color: "#248a3d" }} /> : active ? <span className="size-1.5 rounded-full bg-[var(--mk-ember)]" style={{ animation: "mk-typing 1s ease-in-out infinite" }} /> : null}
                    </span>
                    {s}
                  </li>
                );
              })}
            </ul>
            <p className="mt-5 min-h-[4.5em] text-[15px] leading-relaxed">
              {ASK_WORDS.slice(0, words).join(" ")}
              {words > 0 && words < ASK_WORDS.length && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-[var(--mk-ink)]" style={{ animation: "mk-caret 1s step-end infinite" }} />}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2" style={{ opacity: drafts ? 1 : 0, transform: drafts ? "none" : "translateY(12px)", transition: "opacity 600ms var(--mk-ease), transform 700ms var(--mk-ease)" }}>
              {[["Skill", "Urgent leak", "Step-gated"], ["Automation", "Text the on-call tech", "App event"]].map(([k, t, m]) => (
                <div key={t} className="rounded-2xl border border-[var(--mk-line)] p-4">
                  <div className="flex items-center justify-between"><span className="mk-kicker">{k}</span><span className="mk-pill mk-pill--ember">Draft</span></div>
                  <div className="mt-2 text-[15px] font-semibold">{t}</div>
                  <div className="mk-small mt-0.5">{m}</div>
                </div>
              ))}
            </div>
            <div className="mt-5" style={{ opacity: drafts ? 1 : 0, transition: "opacity 600ms var(--mk-ease) 200ms" }}>
              <span className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-medium" style={{ background: "var(--mk-ink)", color: "var(--mk-bg)" }}><Sparkles size={15} /> Review and turn on</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the webhook code card ────────────────────────────────────────────── */

const SAMPLES: { tab: string; lang: "js" | "py" | "http"; code: string }[] = [
  {
    tab: "Node",
    lang: "js",
    code: `import { createHmac, timingSafeEqual } from "node:crypto";

// Recompute the signature over the raw body,
// then compare in constant time.
export function isFromVeyra(rawBody, header, secret) {
  const digest = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(\`sha256=\${digest}\`);
  const b = Buffer.from(header ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}`,
  },
  {
    tab: "Python",
    lang: "py",
    code: `import hashlib
import hmac

# Recompute the signature over the raw body,
# then compare in constant time.
def is_from_veyra(raw_body, header, secret):
    digest = hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(
        f"sha256={digest}", header or ""
    )`,
  },
  {
    tab: "Delivery",
    lang: "http",
    code: `POST /webhooks/veyra HTTP/1.1
Host: hooks.example.com
Content-Type: application/json
X-Veyra-Signature: sha256=5d41c0e7…a9f2

{
  "id": "evt_Q2m8LkT1xR4a",
  "type": "call.ended",
  "created_at": "2026-09-27T19:13:22+00:00",
  "data": { … }
}`,
  },
];

const KEYWORDS = new Set(["import", "from", "export", "function", "const", "return", "def", "and", "or", "POST"]);
const TOKEN = /(\/\/.*$|#.*$)|(^[A-Z][A-Za-z-]+:(?= ))|("[^"]*"|`[^`]*`|f"[^"]*")|(\b[A-Za-z_]+\b)/g;

function paint(line: string, lang: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    const [text, comment, header, str, word] = m;
    if (m.index > last) out.push(line.slice(last, m.index));
    let color: string | undefined;
    if (comment && !(lang === "js" && comment.startsWith("#"))) color = "var(--mk-night-ink-3)";
    else if (str) color = "var(--mk-mint)";
    else if (header && lang === "http") color = "var(--mk-sky)";
    else if (word && KEYWORDS.has(word)) color = "var(--mk-ember-soft)";
    out.push(color ? <span key={m.index} style={{ color }}>{text}</span> : text);
    last = m.index + text.length;
    if (text.length === 0) TOKEN.lastIndex++;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** A dark code card with Node, Python and raw-delivery tabs. */
export function WebhookCode() {
  const [active, setActive] = useState(0);
  const sample = SAMPLES[active];
  return (
    <div className="mk-card mk-card--night" style={{ boxShadow: "var(--mk-shadow-float)" }}>
      <div className="flex items-center justify-end gap-3 border-b px-5 py-3.5 sm:justify-between" style={{ borderColor: "var(--mk-night-line)" }}>
        <span className="hidden text-[13px] font-medium text-[var(--mk-night-ink-2)] sm:inline">Verify a webhook</span>
        <div className="flex gap-1" role="tablist" aria-label="Code sample">
          {SAMPLES.map((s, i) => (
            <button
              key={s.tab}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className="h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors"
              style={i === active ? { background: "rgba(255,255,255,0.12)", color: "var(--mk-night-ink)" } : { color: "var(--mk-night-ink-2)" }}
            >
              {s.tab}
            </button>
          ))}
        </div>
      </div>
      <pre className="overflow-x-auto px-5 py-6 font-mono text-[13px] leading-[1.75] sm:px-7 sm:text-[14px]" style={{ color: "var(--mk-night-ink)", minHeight: 360 }}>
        <code>
          {sample.code.split("\n").map((line, i) => (
            <span key={`${active}-${i}`} className="block">{line ? paint(line, sample.lang) : " "}</span>
          ))}
        </code>
      </pre>
    </div>
  );
}
