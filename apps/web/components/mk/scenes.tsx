"use client";

/* The company site's imagery. Every scene is SVG or CSS, drawn at whatever
   size the layout gives it, so it is as sharp on a 4K panel as on a phone.
   The product screens are faithful miniatures of the real Desk, Studio and
   a live call — the same names, flows and wording the app uses — not stock
   illustrations. */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, CalendarCheck, Check, Mail, MessageSquare, Phone, Search, Sparkles } from "lucide-react";

import { APPS, LogoTile, PARTNERS, VeyraMark, type Partner } from "./brand";
import { useInView, useReducedMotion } from "./motion";

/* ── the voice orb: the brand's hero object ───────────────────────────── */

export function VoiceOrb({ size = 520, className = "" }: { size?: number | string; className?: string }) {
  const s = typeof size === "number" ? `${size}px` : size;
  return (
    <div className={`relative ${className}`} style={{ width: s, aspectRatio: "1", maxWidth: "100%" }} aria-hidden="true">
      {/* the glow the orb casts on the page */}
      <div className="mk-breathe absolute" style={{ inset: "-18%", background: "radial-gradient(50% 50% at 50% 50%, rgba(233,107,52,0.42), rgba(255,95,126,0.18) 45%, rgba(139,108,255,0.08) 65%, transparent 72%)", filter: "blur(20px)" }} />
      {/* rings */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" style={{ animation: "mk-spin 60s linear infinite" }}>
        <defs>
          <linearGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb08a" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#ff5f7e" stopOpacity="0.25" />
            <stop offset="1" stopColor="#8b6cff" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <circle cx="200" cy="200" r="196" fill="none" stroke="url(#orb-ring)" strokeWidth="0.8" strokeDasharray="2 6" />
        <circle cx="200" cy="200" r="176" fill="none" stroke="url(#orb-ring)" strokeWidth="1.2" opacity="0.6" />
      </svg>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" style={{ animation: "mk-spin-rev 90s linear infinite" }}>
        <circle cx="200" cy="200" r="186" fill="none" stroke="#e96b34" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="40 14 4 14" />
      </svg>
      {/* the sphere */}
      <div className="absolute rounded-full" style={{
        inset: "13%",
        background:
          "radial-gradient(38% 34% at 34% 28%, rgba(255,255,255,0.95), rgba(255,255,255,0) 60%)," +
          "radial-gradient(70% 70% at 70% 78%, rgba(139,108,255,0.85), rgba(139,108,255,0) 62%)," +
          "radial-gradient(80% 80% at 28% 70%, rgba(255,95,126,0.9), rgba(255,95,126,0) 60%)," +
          "radial-gradient(100% 100% at 50% 40%, #ff9a62 0%, #e96b34 38%, #b33b1c 78%, #5a1a0c 100%)",
        boxShadow: "inset 0 -30px 60px rgba(40,8,30,0.45), inset 0 20px 40px rgba(255,255,255,0.25), 0 40px 120px -20px rgba(233,107,52,0.55)",
      }} />
      {/* speaking bars across the equator */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Waveform bars={11} height="22%" width="44%" color="rgba(255,255,255,0.92)" />
      </div>
    </div>
  );
}

/* ── waveform ─────────────────────────────────────────────────────────── */

const WAVE = [0.35, 0.6, 0.9, 0.55, 1, 0.7, 0.4, 0.85, 0.5, 0.95, 0.65, 0.3, 0.75, 0.5, 0.9, 0.4, 0.7, 1, 0.6, 0.35, 0.8, 0.55, 0.45, 0.9];

export function Waveform({ bars = 24, height = 48, width, color = "var(--mk-ember)", gap = 0.35, className = "" }: { bars?: number; height?: number | string; width?: number | string; color?: string; gap?: number; className?: string }) {
  return (
    <div className={`flex items-center ${className}`} style={{ height, width, gap: `${gap}em` }} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{
          flex: 1, minWidth: 2, height: `${WAVE[i % WAVE.length] * 100}%`, borderRadius: 99, background: color,
          animation: `mk-bar ${0.9 + (i % 5) * 0.18}s ease-in-out ${(i * 0.07) % 0.9}s infinite`, transformOrigin: "center",
        }} />
      ))}
    </div>
  );
}

/* ── device frames ────────────────────────────────────────────────────── */

export function PhoneFrame({ children, width = 320, className = "", style }: { children: ReactNode; width?: number | string; className?: string; style?: CSSProperties }) {
  return (
    <div className={`relative ${className}`} style={{ width, maxWidth: "100%", aspectRatio: "9 / 19.2", borderRadius: "15% / 7%", padding: "3.2%", background: "linear-gradient(145deg, #3a3a3e, #0d0d0f 40%, #26262a)", boxShadow: "0 0 0 1.5px #4a4a50 inset, 0 50px 100px -30px rgba(0,0,0,0.55), 0 30px 60px -30px rgba(0,0,0,0.4)", ...style }}>
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: "12.5% / 5.8%", background: "#000", containerType: "inline-size" }}>
        <div className="absolute left-1/2 z-10 -translate-x-1/2" style={{ top: "1.6%", width: "31%", height: "3.6%", borderRadius: 99, background: "#000" }} />
        {children}
      </div>
    </div>
  );
}

export function LaptopFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-full ${className}`}>
      <div className="relative mx-auto" style={{ width: "86%", padding: "1.4% 1.4% 2%", borderRadius: "2.2% / 3.4%", background: "linear-gradient(180deg, #2b2b2f, #111114)", boxShadow: "0 0 0 1.5px #3c3c42 inset, 0 40px 90px -30px rgba(0,0,0,0.5)" }}>
        <div className="relative overflow-hidden" style={{ aspectRatio: "16 / 10", borderRadius: "0.8% / 1.3%", background: "#fff", containerType: "inline-size" }}>{children}</div>
      </div>
      <div className="relative mx-auto" style={{ width: "100%", height: 0, paddingBottom: "2.6%", borderRadius: "0 0 40% 40% / 0 0 100% 100%", background: "linear-gradient(180deg, #d9d9de, #9d9da3)", boxShadow: "0 18px 40px -16px rgba(0,0,0,0.45)" }}>
        <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: "14%", height: "38%", borderRadius: "0 0 12px 12px", background: "#bdbdc2" }} />
      </div>
    </div>
  );
}

/* ── a live call, as the caller's phone shows it ──────────────────────── */

type Line = { who: "caller" | "agent" | "tool"; text: string; icon?: "search" | "calendar" };

const CALL: Line[] = [
  { who: "agent", text: "Northwind Services, this is Nora. How can I help?" },
  { who: "caller", text: "Hi, my furnace is making a grinding noise. Do you come out to Evanston?" },
  { who: "tool", text: "Searched knowledge · service areas", icon: "search" },
  { who: "agent", text: "We do, Evanston is in our area. I can have a technician there tomorrow between 8 and 11." },
  { who: "caller", text: "Perfect, let’s do that." },
  { who: "tool", text: "Booked · tomorrow, 8–11 AM", icon: "calendar" },
  { who: "agent", text: "You’re booked. I’ve texted you the confirmation." },
];

export function CallScreen({ loop = true }: { loop?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(1);
  const [seconds, setSeconds] = useState(12);

  useEffect(() => {
    if (!inView || reduced) { if (reduced) setShown(CALL.length); return; }
    const t = window.setInterval(() => {
      setShown((n) => (n >= CALL.length ? (loop ? 1 : n) : n + 1));
    }, 1700);
    const c = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { window.clearInterval(t); window.clearInterval(c); };
  }, [inView, reduced, loop]);

  const lines = CALL.slice(0, shown);
  const speaking = lines[lines.length - 1]?.who;
  return (
    <div ref={ref} className="flex h-full flex-col" style={{ background: "radial-gradient(120% 70% at 50% 0%, #3a1d14 0%, #120c10 45%, #050507 100%)", color: "#f5f5f7", fontSize: "clamp(9px, 3.6cqw, 13px)" }}>
      <div className="flex flex-col items-center" style={{ paddingTop: "18%" }}>
        <div className="flex items-center justify-center rounded-full" style={{ width: "22%", aspectRatio: "1", background: "linear-gradient(145deg,#ff9a62,#e96b34 55%,#9b3416)", boxShadow: "0 10px 40px -8px rgba(233,107,52,0.7)" }}>
          <Phone style={{ width: "40%", height: "40%" }} strokeWidth={1.8} />
        </div>
        <div style={{ marginTop: "5%", fontSize: "1.45em", fontWeight: 600, letterSpacing: "-0.02em" }}>Northwind Services</div>
        <div style={{ color: "#a1a1a6", marginTop: "1%" }}>Nora · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</div>
        <div style={{ width: "46%", marginTop: "6%" }}>
          <Waveform bars={18} height={22} color={speaking === "caller" ? "#a1a1a6" : "#ff9a62"} gap={0.22} />
        </div>
      </div>
      <div className="mt-auto flex flex-col justify-end gap-[0.55em] overflow-hidden" style={{ padding: "0 6% 12%", minHeight: "48%" }}>
        {lines.slice(-5).map((l, i) => (
          <div key={`${shown}-${i}-${l.text}`} className="mk-bubble-in" style={{ alignSelf: l.who === "caller" ? "flex-end" : "flex-start", maxWidth: l.who === "tool" ? "100%" : "84%", animation: "mk-bubble 480ms cubic-bezier(0.16,1,0.3,1) both" }}>
            {l.who === "tool" ? (
              <div className="inline-flex items-center gap-[0.5em] rounded-full" style={{ padding: "0.35em 0.9em", background: "rgba(255,255,255,0.08)", color: "#c7c7cc", fontSize: "0.88em" }}>
                {l.icon === "calendar" ? <CalendarCheck style={{ width: "1.1em", height: "1.1em", color: "#3fd8a0" }} /> : <Search style={{ width: "1.1em", height: "1.1em", color: "#ffb08a" }} />}
                {l.text}
              </div>
            ) : (
              <div style={{ padding: "0.6em 0.95em", borderRadius: "1.2em", lineHeight: 1.35, background: l.who === "caller" ? "#e96b34" : "rgba(255,255,255,0.1)", color: "#fff", borderBottomRightRadius: l.who === "caller" ? "0.35em" : undefined, borderBottomLeftRadius: l.who === "agent" ? "0.35em" : undefined }}>{l.text}</div>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes mk-bubble { from { opacity: 0; transform: translateY(10px) scale(0.92); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

/* ── Veyra Desk in miniature ──────────────────────────────────────────── */

const THREADS = [
  { name: "Maria Delgado", initials: "MD", tint: "#d8f3ee", ink: "#0f766e", preview: "Hi, my furnace is making a grinding noise.", time: "7:11 PM", channel: "call", active: true },
  { name: "Ahmed Raza", initials: "AR", tint: "#dbe8ff", ink: "#1d4ed8", preview: "جی دستیاب ہے۔ کیا یہ وقت مناسب ہے؟", time: "8:31 PM", channel: "sms", rtl: true },
  { name: "Tom Byrne", initials: "TB", tint: "#fdf0c8", ink: "#a16207", preview: "I need someone out Thursday morning.", time: "Yesterday", channel: "call" },
  { name: "Lena Kowalski", initials: "LK", tint: "#ece8ff", ink: "#6d28d9", preview: "Can you send the quote again?", time: "Mon", channel: "email" },
];

export function DeskScreen() {
  return (
    <div className="flex h-full text-left" style={{ fontSize: "clamp(6px, 1.05cqw, 13px)", containerType: "inline-size", background: "#fbfbfd", color: "#1d1d1f" }}>
      <div className="flex flex-col items-center gap-[1.4em] py-[1.6em]" style={{ width: "5.5%", background: "#f0f0f2", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
        <VeyraMark size={20} />
        {[MessageSquare, Phone, Mail, BookOpen].map((I, i) => <I key={i} style={{ width: "1.5em", height: "1.5em", color: i === 0 ? "#e96b34" : "#8e8e93" }} />)}
      </div>
      <div style={{ width: "30%", borderRight: "1px solid rgba(0,0,0,0.06)" }} className="flex flex-col">
        <div style={{ padding: "1.6em 1.4em 0.8em" }}>
          <div style={{ fontSize: "1.7em", fontWeight: 600, letterSpacing: "-0.03em" }}>Inbox</div>
          <div style={{ color: "#8e8e93" }}>4 conversations · <span style={{ color: "#c2541c" }}>1 unread</span></div>
        </div>
        <div className="flex flex-col gap-[0.3em] px-[0.7em]">
          {THREADS.map((t) => (
            <div key={t.name} className="flex gap-[0.8em] rounded-[0.9em]" style={{ padding: "0.9em 0.8em", background: t.active ? "rgba(233,107,52,0.1)" : "transparent" }}>
              <div className="flex shrink-0 items-center justify-center rounded-full" style={{ width: "2.8em", height: "2.8em", background: t.tint, color: t.ink, fontWeight: 600 }}>{t.initials}</div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between"><b style={{ fontWeight: 600 }}>{t.name}</b><span style={{ color: "#8e8e93" }}>{t.time}</span></div>
                <div className="truncate" dir={t.rtl ? "rtl" : undefined} style={{ color: "#6e6e73", fontFamily: t.rtl ? "'Noto Nastaliq Urdu', serif" : undefined }}>{t.preview}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-[0.8em]" style={{ padding: "1.3em 1.6em", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: "2.6em", height: "2.6em", background: "#d8f3ee", color: "#0f766e", fontWeight: 600 }}>MD</div>
          <div><b style={{ fontWeight: 600 }}>Maria Delgado</b><div style={{ color: "#8e8e93" }}>Call · +1 312 555 7781</div></div>
          <span className="ml-auto rounded-full" style={{ padding: "0.3em 0.9em", background: "rgba(52,199,89,0.14)", color: "#248a3d", fontWeight: 500 }}>Booked</span>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-[0.9em]" style={{ padding: "1.6em" }}>
          <div style={{ alignSelf: "flex-start", maxWidth: "70%", background: "#f2f2f4", padding: "0.8em 1.1em", borderRadius: "1.2em" }}>Hi, my furnace is making a grinding noise.</div>
          <div className="flex items-center gap-[0.9em] rounded-[1em]" style={{ border: "1px solid rgba(0,0,0,0.08)", padding: "0.9em 1.1em", background: "#fff" }}>
            <Phone style={{ width: "1.5em", height: "1.5em", color: "#0a84ff" }} />
            <div><b style={{ fontWeight: 600 }}>Answered by Nora</b><div style={{ color: "#8e8e93" }}>2:18 · booked a visit, tomorrow 8–11 AM</div></div>
            <div className="ml-auto" style={{ width: "22%" }}><Waveform bars={14} height={16} color="#c7c7cc" gap={0.2} /></div>
          </div>
          <div style={{ alignSelf: "flex-end", maxWidth: "70%", background: "rgba(233,107,52,0.12)", padding: "0.8em 1.1em", borderRadius: "1.2em" }}>You’re booked for tomorrow, 8–11 AM. Reply here if anything changes.</div>
          <div className="flex items-center rounded-[1.4em]" style={{ border: "1px solid rgba(0,0,0,0.1)", padding: "0.8em 1.1em", color: "#8e8e93" }}>Reply to Maria…<span className="ml-auto flex items-center justify-center rounded-full" style={{ width: "2em", height: "2em", background: "#1d1d1f" }}><Check style={{ width: "1.1em", color: "#fff" }} /></span></div>
        </div>
      </div>
      <div style={{ width: "22%", borderLeft: "1px solid rgba(0,0,0,0.06)", padding: "1.6em 1.3em" }} className="flex flex-col items-center gap-[0.6em]">
        <div className="flex items-center justify-center rounded-full" style={{ width: "5em", height: "5em", background: "#d8f3ee", color: "#0f766e", fontWeight: 600, fontSize: "1.3em" }}>MD</div>
        <b style={{ fontWeight: 600, fontSize: "1.2em" }}>Maria Delgado</b>
        <div className="mt-[1em] w-full" style={{ color: "#8e8e93" }}>
          {[["Stage", "Won"], ["Ticket", "#2 Furnace"], ["Tags", "repeat customer"]].map(([k, v]) => (
            <div key={k} className="flex justify-between" style={{ padding: "0.5em 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}><span>{k}</span><span style={{ color: "#1d1d1f" }}>{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Veyra Studio in miniature: a skill being tried ───────────────────── */

export function StudioScreen() {
  return (
    <div className="flex h-full text-left" style={{ fontSize: "clamp(6px, 1.05cqw, 13px)", containerType: "inline-size", background: "#f7f7f8", color: "#1d1d1f" }}>
      <div style={{ width: "18%", background: "#f0f0f2", padding: "1.4em 1em", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-[0.6em]" style={{ fontWeight: 600 }}><VeyraMark size={18} /> Veyra Studio</div>
        {["Overview", "Ask", "Identity", "Voice", "Skills", "Automations", "Knowledge", "Integrations"].map((l) => (
          <div key={l} className="rounded-[0.7em]" style={{ marginTop: "0.35em", padding: "0.55em 0.8em", background: l === "Skills" ? "#fff" : "transparent", color: l === "Skills" ? "#1d1d1f" : "#6e6e73", fontWeight: l === "Skills" ? 500 : 400, boxShadow: l === "Skills" ? "0 1px 2px rgba(0,0,0,0.06)" : undefined }}>{l}</div>
        ))}
      </div>
      <div className="flex-1" style={{ padding: "2.2em 2.4em" }}>
        <div style={{ color: "#8e8e93" }}>Skills</div>
        <div style={{ fontSize: "2.2em", fontWeight: 600, letterSpacing: "-0.035em" }}>Reschedule a visit</div>
        <div className="mt-[0.6em] flex gap-[0.5em]">
          <span className="rounded-full" style={{ padding: "0.2em 0.8em", background: "rgba(52,199,89,0.14)", color: "#248a3d" }}>● On</span>
          <span className="rounded-full" style={{ padding: "0.2em 0.8em", background: "#ececef" }}>Prose</span>
        </div>
        <div className="mt-[1.6em] grid gap-[1.2em]" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          <div className="rounded-[1.2em] bg-white" style={{ padding: "1.4em", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.05)" }}>
            <b style={{ fontWeight: 600 }}>Instructions</b>
            <p style={{ color: "#3a3a3c", marginTop: "0.7em", lineHeight: 1.55 }}>Find the existing appointment first. Do not ask for details you can look up.</p>
            <p style={{ color: "#3a3a3c", marginTop: "0.6em", lineHeight: 1.55 }}>Offer the two nearest windows that fit their stated constraint. If neither works, ask what they would rather have than listing everything.</p>
            <p style={{ color: "#3a3a3c", marginTop: "0.6em", lineHeight: 1.55 }}>Confirm the new window back before booking it.</p>
          </div>
          <div className="rounded-[1.2em] bg-white" style={{ padding: "1.4em", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.05)" }}>
            <b style={{ fontWeight: 600 }}>Try it</b>
            <div className="rounded-[0.8em]" style={{ marginTop: "0.8em", padding: "0.8em", border: "1px solid rgba(0,0,0,0.1)", color: "#6e6e73" }}>“I need to move my Thursday visit to next week.”</div>
            <div className="mt-[0.8em] flex flex-col gap-[0.45em]">
              {["Looked up booking 4471", "Found 2 open windows"].map((s) => <div key={s} className="flex items-center gap-[0.5em]" style={{ color: "#6e6e73" }}><Check style={{ width: "1.1em", color: "#34c759" }} />{s}</div>)}
            </div>
            <div className="rounded-[0.8em]" style={{ marginTop: "0.8em", padding: "0.8em", background: "#f2f2f4" }}>I can move you to Tuesday 8–11 or Wednesday 1–4. Which suits you?</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Ask: the agent working in Studio, as a chat ──────────────────────── */

export function AskScreen() {
  return (
    <div className="flex h-full flex-col text-left" style={{ fontSize: "clamp(7px, 1.2cqw, 14px)", containerType: "inline-size", background: "#fff", color: "#1d1d1f", padding: "6% 9%" }}>
      <div style={{ alignSelf: "flex-end", background: "#f2f2f4", padding: "0.8em 1.1em", borderRadius: "1.2em", maxWidth: "70%" }}>Draft a morning digest of yesterday’s calls and open tickets.</div>
      <div className="mt-[1.6em] flex gap-[0.9em]">
        <VeyraMark size={22} />
        <div className="flex-1">
          {["Read 14 calls from yesterday", "Checked 3 open tickets", "Drafted the automation"].map((s) => (
            <div key={s} className="flex items-center gap-[0.5em]" style={{ color: "#6e6e73", marginBottom: "0.4em" }}><Check style={{ width: "1.1em" }} />{s}</div>
          ))}
          <p style={{ marginTop: "0.8em", lineHeight: 1.6 }}>Done. <b style={{ fontWeight: 600 }}>Morning digest</b> runs at 7:00 AM and sends you a short summary: calls handled alone, anything that needs a person, and tickets past their promise.</p>
          <div className="mt-[1em] inline-flex items-center gap-[0.5em] rounded-full" style={{ padding: "0.5em 1em", background: "#1d1d1f", color: "#fff" }}><Sparkles style={{ width: "1.1em" }} /> Review and turn on</div>
        </div>
      </div>
    </div>
  );
}

/* ── logos in orbit around the mark ───────────────────────────────────── */

export function LogoOrbit({ size = 620, className = "" }: { size?: number; className?: string }) {
  const inner = PARTNERS.filter((p) => p.logo).slice(0, 6);
  const outer = APPS.slice(0, 10);
  // tile is a percentage of the orbit's width, so the whole figure scales on a phone
  const ring = (items: Partner[], radius: number, tile: number, dur: number, reverse = false) => (
    <div className="absolute inset-0" style={{ animation: `${reverse ? "mk-spin-rev" : "mk-spin"} ${dur}s linear infinite` }}>
      {items.map((p, i) => {
        const a = (i / items.length) * Math.PI * 2;
        return (
          <div key={p.name} className="absolute" style={{ width: `${tile}%`, left: `${(50 + Math.cos(a) * radius - tile / 2).toFixed(3)}%`, top: `${(50 + Math.sin(a) * radius - tile / 2).toFixed(3)}%` }}>
            <div style={{ animation: `${reverse ? "mk-spin" : "mk-spin-rev"} ${dur}s linear infinite` }}><LogoTile partner={p} width="100%" /></div>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={`relative mx-auto ${className}`} style={{ width: size, maxWidth: "100%", aspectRatio: "1" }} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.25" strokeDasharray="0.6 1.2" />
      </svg>
      {ring(inner, 24, 12, 70)}
      {ring(outer, 42, 10, 110, true)}
      <div className="absolute inset-0 flex items-center justify-center" style={{ containerType: "inline-size" }}>
        <div className="mk-breathe flex w-[20%] justify-center" style={{ filter: "drop-shadow(0 20px 40px rgba(233,107,52,0.35))" }}><VeyraMark size={Math.round(size * 0.2)} className="!h-auto !w-full aspect-square" /></div>
      </div>
    </div>
  );
}

/* ── a dotted globe with calls arcing across it ───────────────────────── */

export function Globe({ size = 560, className = "" }: { size?: number | string; className?: string }) {
  const dots = useMemo(() => {
    const out: { x: number; y: number; o: number }[] = [];
    for (let lat = -80; lat <= 80; lat += 6) {
      const r = Math.cos((lat * Math.PI) / 180);
      const count = Math.max(6, Math.round(64 * r));
      for (let i = 0; i < count; i++) {
        const lon = (i / count) * 360;
        const z = Math.cos((lon * Math.PI) / 180) * r;
        if (z < 0) continue; // back side
        // rounded, so the server and the browser print identical attributes
        out.push({ x: +(50 + Math.sin((lon * Math.PI) / 180) * r * 46).toFixed(2), y: +(50 - Math.sin((lat * Math.PI) / 180) * 46).toFixed(2), o: +(0.15 + z * 0.75).toFixed(3) });
      }
    }
    return out;
  }, []);
  const arcs = [
    ["M 22 38 Q 40 8 66 30", 0], ["M 30 62 Q 52 40 78 58", 1.2], ["M 18 52 Q 34 78 58 70", 2.1], ["M 60 24 Q 74 40 70 68", 0.6],
  ] as const;
  const s = typeof size === "number" ? `${size}px` : size;
  return (
    <div className={`relative mx-auto ${className}`} style={{ width: s, maxWidth: "100%", aspectRatio: "1" }} aria-hidden="true">
      <div className="absolute inset-[6%] rounded-full" style={{ background: "radial-gradient(60% 60% at 40% 35%, rgba(77,181,255,0.18), rgba(139,108,255,0.08) 50%, transparent 70%)" }} />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="0.42" fill="currentColor" opacity={d.o} />)}
        {arcs.map(([d, delay], i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="#e96b34" strokeWidth="0.5" strokeLinecap="round" strokeDasharray="4 80" style={{ animation: `mk-arc 3.4s linear ${delay}s infinite` }} />
            <path d={d} fill="none" stroke="#e96b34" strokeOpacity="0.18" strokeWidth="0.3" />
          </g>
        ))}
        {[[22, 38], [66, 30], [30, 62], [78, 58], [18, 52], [58, 70], [60, 24], [70, 68]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="1" fill="#e96b34" />
            <circle cx={x} cy={y} r="1" fill="none" stroke="#e96b34" strokeWidth="0.3" style={{ transformOrigin: `${x}px ${y}px`, animation: `mk-ping 2.6s ease-out ${i * 0.4}s infinite` }} />
          </g>
        ))}
      </svg>
      <style>{`@keyframes mk-arc { from { stroke-dashoffset: 84; } to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}

/* ── languages the agent speaks, floating ─────────────────────────────── */

export function LanguageCloud({ className = "" }: { className?: string }) {
  // positions keep every word inside the box at its own size (cqw = % of the box width)
  const words = [
    { t: "Hello", x: 6, y: 8, s: 13 }, { t: "Hola", x: 62, y: 4, s: 11 }, { t: "سلام", x: 26, y: 34, s: 17, rtl: true },
    { t: "नमस्ते", x: 64, y: 40, s: 9 }, { t: "Hallo", x: 4, y: 70, s: 10 }, { t: "Bonjour", x: 40, y: 72, s: 9.5 }, { t: "Olá", x: 78, y: 70, s: 8 },
  ];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ containerType: "size" }} aria-hidden="true">
      {words.map((w, i) => (
        <span key={w.t} className="mk-float absolute whitespace-nowrap" dir={w.rtl ? "rtl" : undefined}
          style={{ left: `${w.x}%`, top: `${w.y}%`, fontSize: `${w.s}cqw`, lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.03em", animationDelay: `${i * 0.7}s`, color: i === 2 ? "var(--mk-ember)" : "var(--mk-ink)", opacity: i === 2 ? 1 : 0.85, fontFamily: w.rtl ? "'Noto Nastaliq Urdu', 'Poppins', serif" : undefined }}>
          {w.t}
        </span>
      ))}
    </div>
  );
}
