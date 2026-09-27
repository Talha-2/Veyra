"use client";

/* Composites for the company pages (About, legal). Kept apart from the
   shared scenes because nothing else on the site needs them. */

import { useEffect, useState } from "react";
import { AudioLines, CalendarCheck, Check, Database, Phone, PhoneForwarded, PhoneMissed } from "lucide-react";

import { VeyraMark } from "./brand";
import { StickyStory } from "./motion";
import { PhoneFrame } from "./scenes";

/* ── hero: the mark, ringing, with what it did overnight ─────────────── */

const CHIPS = [
  { icon: Phone, text: "Answered · 2:14 AM", pos: { left: "4%", top: "24%" }, delay: 0, wide: true },
  { icon: CalendarCheck, text: "Booked · Thu, 8–11 AM", pos: { right: "2%", top: "4%" }, delay: 1.1, wide: true },
  { icon: PhoneForwarded, text: "Handed to Sam, dispatch", pos: { left: "0%", top: "70%" }, delay: 2.2, wide: false },
  { icon: AudioLines, text: "Answered in Spanish", pos: { right: "4%", top: "76%" }, delay: 0.6, wide: false },
];

export function RingingMark() {
  return (
    <div className="relative mx-auto h-[min(460px,96vw)] w-full max-w-[880px]" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="mk-breathe absolute" style={{ width: "min(520px, 110vw)", aspectRatio: "1", background: "var(--mk-glow)", filter: "blur(30px)", opacity: 0.55 }} />
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute rounded-full" style={{ width: 176, height: 176, border: "1.5px solid rgba(233,107,52,0.45)", animation: `mk-ping 3.6s cubic-bezier(0.22,1,0.36,1) ${i * 1.2}s infinite` }} />
        ))}
        <div className="relative" style={{ filter: "drop-shadow(0 30px 60px rgba(233,107,52,0.35))" }}><VeyraMark size={176} /></div>
      </div>
      {CHIPS.map((c) => (
        <div key={c.text} className={`absolute ${c.wide ? "" : "max-sm:hidden"}`} style={c.pos}>
          <div className="mk-float flex items-center gap-2.5 rounded-full bg-[var(--mk-card)] py-2.5 pl-2.5 pr-5 text-[14px] font-medium whitespace-nowrap text-[var(--mk-ink)]" style={{ boxShadow: "var(--mk-shadow-float)", animationDelay: `${c.delay}s` }}>
            <span className="flex size-8 items-center justify-center rounded-full" style={{ background: "rgba(233,107,52,0.12)", color: "var(--mk-ember)" }}><c.icon size={16} /></span>
            {c.text}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── why Veyra exists: a phone's recent calls, told in four beats ────── */

const WHY = [
  { k: "It rings.", body: "A plumber is under a sink. A dentist is with a patient. The front desk is already on another line." },
  { k: "No one’s free.", body: "The work in front of you comes first, so the call rings out." },
  { k: "They hang up.", body: "Plenty of callers never leave a voicemail. They call the next business on the list, and it answers." },
  { k: "Veyra picks up.", body: "On the first ring, in your business’s name. Then it does the work, and brings your team in when it matters." },
];

const CALLS = [
  { name: "Maria Delgado", kind: "mobile", time: "7:42 AM", outcome: "Booked · tomorrow, 8–11" },
  { name: "+1 312 555 0142", kind: "Chicago, IL", time: "9:15 AM", outcome: "Question answered" },
  { name: "Tom Byrne", kind: "mobile", time: "12:03 PM", outcome: "Handed to Sam" },
  { name: "Lena Kowalski", kind: "work", time: "2:47 PM", outcome: "Quote sent by text" },
  { name: "Ahmed Raza", kind: "mobile", time: "6:30 PM", outcome: "Answered in Urdu" },
];

function Recents({ beat }: { beat: number }) {
  const answered = beat >= 3;
  const ringing = beat === 0;
  // beat 0: the first call is ringing; 1–2: every call missed; 3: every call answered
  const missed = beat === 1 ? 3 : beat === 2 ? CALLS.length : 0;
  return (
    <div className="flex h-full flex-col" style={{ background: "#fff", color: "#1d1d1f", fontSize: "clamp(9px, 3.7cqw, 14px)", paddingTop: "15%" }}>
      <div style={{ padding: "0 6%" }}>
        <div style={{ color: "#8e8e93" }}>Today</div>
        <div style={{ fontSize: "2.3em", fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.1 }}>Recents</div>
        <div className="mt-[0.5em] inline-flex items-center gap-[0.4em] rounded-full" style={{ padding: "0.3em 0.8em", fontWeight: 500, background: answered ? "rgba(52,199,89,0.14)" : missed ? "rgba(255,59,48,0.1)" : "rgba(0,0,0,0.05)", color: answered ? "#248a3d" : missed ? "#d70015" : "#6e6e73", transition: "all 500ms var(--mk-ease)" }}>
          {answered ? <><Check style={{ width: "1.1em" }} /> Every call answered</> : missed ? <><PhoneMissed style={{ width: "1.1em" }} /> {missed} missed today</> : <>Incoming call…</>}
        </div>
      </div>

      {/* the incoming call banner */}
      <div style={{ margin: "5% 4% 0", display: "grid", gridTemplateRows: ringing ? "1fr" : "0fr", transition: "grid-template-rows 500ms var(--mk-ease)" }}>
        <div className="overflow-hidden">
          <div className="flex items-center gap-[0.8em] rounded-[1.2em]" style={{ padding: "0.9em 1em", background: "#1d1d1f", color: "#fff" }}>
            <span className="relative flex shrink-0 items-center justify-center rounded-full" style={{ width: "2.6em", height: "2.6em", background: "#34c759" }}>
              <span className="absolute inset-0 rounded-full" style={{ border: "2px solid #34c759", animation: "mk-ping 1.6s ease-out infinite" }} />
              <Phone style={{ width: "1.2em" }} />
            </span>
            <div className="min-w-0"><div style={{ fontWeight: 600 }}>Maria Delgado</div><div style={{ color: "#a1a1a6" }}>ringing…</div></div>
          </div>
        </div>
      </div>

      <div className="mt-[4%] flex flex-col" style={{ padding: "0 4%" }}>
        {CALLS.map((c, i) => {
          const isMissed = i < missed;
          return (
            <div key={c.name} className="flex items-center gap-[0.8em]" style={{ padding: "0.85em 2%", borderTop: i ? "1px solid rgba(0,0,0,0.06)" : undefined, opacity: ringing && i === 0 ? 0.35 : 1, transition: "opacity 500ms" }}>
              <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: "2.2em", height: "2.2em", background: answered ? "rgba(52,199,89,0.14)" : isMissed ? "rgba(255,59,48,0.1)" : "#f2f2f4", color: answered ? "#248a3d" : isMissed ? "#ff3b30" : "#8e8e93", transition: "all 500ms var(--mk-ease)", transitionDelay: `${i * 70}ms` }}>
                {answered ? <Check style={{ width: "1.1em" }} /> : isMissed ? <PhoneMissed style={{ width: "1.05em" }} /> : <Phone style={{ width: "1em" }} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ fontWeight: 600, color: isMissed ? "#ff3b30" : "#1d1d1f", transition: "color 500ms", transitionDelay: `${i * 70}ms` }}>{c.name}</div>
                <div className="truncate" style={{ color: answered ? "#248a3d" : "#8e8e93" }}>{answered ? c.outcome : isMissed ? (beat === 2 ? "No voicemail" : "Missed") : c.kind}</div>
              </div>
              <span style={{ color: "#8e8e93" }}>{c.time}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-center gap-[0.5em]" style={{ padding: "0 6% 12%", color: "#6e6e73", opacity: answered ? 1 : 0, transition: "opacity 600ms var(--mk-ease) 300ms" }}>
        <VeyraMark size={18} /> Answered by Veyra
      </div>
    </div>
  );
}

/** Pinned: four short claims step through while a phone's call log fills with missed calls, then flips. */
export function WhyStory() {
  return (
    <StickyStory beats={WHY.length} height={4}>
      {(beat) => (
        <div className="mk-wrap grid items-center gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
          <div>
            <p className="mk-eyebrow">Why Veyra exists</p>
            <div className="mt-6 flex flex-col gap-3">
              {WHY.map((b, i) => (
                <div key={b.k} className={i === beat ? "" : "max-lg:hidden"} style={{ transition: "opacity 600ms var(--mk-ease), transform 600ms var(--mk-ease)", opacity: i === beat ? 1 : 0.22, transform: i === beat ? "none" : "translateX(-6px)" }}>
                  <h3 className={`mk-h1 ${i === 3 && beat === 3 ? "mk-accent" : ""}`}>{b.k}</h3>
                  <div style={{ display: "grid", gridTemplateRows: i === beat ? "1fr" : "0fr", transition: "grid-template-rows 600ms var(--mk-ease)" }}>
                    <p className="mk-lead overflow-hidden" style={{ maxWidth: "36ch" }}><span className="block pt-3 pb-2">{b.body}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-[min(230px,30vh)] lg:w-[min(340px,40vh)]"><PhoneFrame width="100%"><Recents beat={beat} /></PhoneFrame></div>
          </div>
        </div>
      )}
    </StickyStory>
  );
}

/* ── how it is built: two layers, one contract ───────────────────────── */

const LAYERS = [
  {
    icon: Database,
    kicker: "The app layer",
    title: "Owns all the data. Never runs AI.",
    body: "Veyra Desk and Veyra Studio. Your accounts, contacts, conversations, tickets and settings live here, and only here.",
    items: ["Veyra Desk", "Veyra Studio", "Contacts", "Inbox", "Tickets", "Settings", "Billing"],
  },
  {
    icon: AudioLines,
    kicker: "The agent layer",
    title: "Runs all the AI. Owns no data.",
    body: "The voice and chat agent. It asks the app for what it needs on each call and hands the results straight back.",
    items: ["Voice calls", "Chat", "Speech in", "Speech out", "The talker", "The worker", "Tools"],
  },
];

function LayerCard({ layer }: { layer: (typeof LAYERS)[number] }) {
  return (
    <article className="mk-card flex h-full flex-col p-8 md:p-10">
      <span className="flex size-16 items-center justify-center rounded-[20px]" style={{ background: "rgba(233,107,52,0.14)", color: "var(--mk-ember-soft)" }}><layer.icon size={30} /></span>
      <p className="mk-kicker mt-8">{layer.kicker}</p>
      <h3 className="mk-h3 mt-2">{layer.title}</h3>
      <p className="mk-body mt-3">{layer.body}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-8">{layer.items.map((i) => <span key={i} className="mk-pill">{i}</span>)}</div>
    </article>
  );
}

/** The two cards with requests travelling between them along one contract. */
export function LayerDiagram() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_140px_1fr] lg:gap-0">
      <LayerCard layer={LAYERS[0]} />
      <div className="relative flex items-center justify-center py-6 lg:py-0" aria-hidden="true">
        {/* the wire: vertical on phones, horizontal beside the cards */}
        <div className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 lg:left-0 lg:top-1/2 lg:h-[1.5px] lg:w-full lg:translate-x-0 lg:-translate-y-1/2" style={{ background: "rgba(233,107,52,0.35)" }} />
        <span className="mk-contract-dot absolute size-2.5 rounded-full" style={{ background: "var(--mk-ember)", boxShadow: "0 0 14px 3px rgba(233,107,52,0.7)" }} />
        <span className="mk-contract-dot mk-contract-dot--back absolute size-2.5 rounded-full" style={{ background: "var(--mk-ember-soft)", boxShadow: "0 0 14px 3px rgba(255,176,138,0.6)" }} />
        <div className="relative z-[1] flex flex-col items-center gap-2">
          <span className="mk-small max-lg:hidden">config out</span>
          <span className="mk-pill" style={{ background: "var(--mk-night)", boxShadow: "inset 0 0 0 1px rgba(233,107,52,0.45)", color: "var(--mk-night-ink)" }}>One contract</span>
          <span className="mk-small max-lg:hidden">results in</span>
        </div>
      </div>
      <LayerCard layer={LAYERS[1]} />
      <style>{`
        .mk-contract-dot { left: calc(50% - 5px); top: 0; animation: mk-wire-y 2.8s cubic-bezier(0.45,0,0.55,1) infinite; }
        .mk-contract-dot--back { animation-direction: reverse; animation-delay: 1.4s; }
        @keyframes mk-wire-y { 0% { top: 0; opacity: 0; } 12%, 88% { opacity: 1; } 100% { top: calc(100% - 10px); opacity: 0; } }
        @keyframes mk-wire-x { 0% { left: 0; opacity: 0; } 12%, 88% { opacity: 1; } 100% { left: calc(100% - 10px); opacity: 0; } }
        @media (min-width: 1024px) {
          .mk-contract-dot { top: calc(50% - 5px); left: 0; animation-name: mk-wire-x; }
        }
        @media (prefers-reduced-motion: reduce) { .mk-contract-dot { display: none; } }
      `}</style>
    </div>
  );
}

/* ── legal pages: a table of contents that follows the reader ────────── */

export function Contents({ items }: { items: { id: string; title: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const onScroll = () => {
      // the last section whose top has passed a third of the way down the screen
      let current = items[0]?.id;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.34) current = it.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  return (
    <nav aria-label="On this page">
      <p className="mk-kicker mb-4">On this page</p>
      <ol className="flex flex-col border-l border-[var(--mk-line)]">
        {items.map((it, i) => {
          const on = it.id === active;
          return (
            <li key={it.id}>
              <a href={`#${it.id}`} aria-current={on ? "location" : undefined}
                className={`-ml-px flex gap-3 border-l-2 py-2 pl-4 text-[14px] leading-[1.4] transition-colors duration-200 hover:!text-[var(--mk-ink)] ${on ? "border-[var(--mk-ember)] font-medium" : "border-transparent"}`}
                style={{ color: on ? "var(--mk-ink)" : "var(--mk-ink-3)" }}>
                <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span>{it.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
