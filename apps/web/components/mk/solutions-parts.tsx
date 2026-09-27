"use client";

/* Client-only pieces of the Solutions page: an industry call playing on a
   phone, in the same visual language as CallScreen, driven by a script per
   industry. The businesses are demo businesses, not customers. */

import { useEffect, useState } from "react";
import { CalendarCheck, PhoneForwarded, PhoneIncoming, PhoneOutgoing, Search, Send, UserPlus } from "lucide-react";

import { useInView, useReducedMotion } from "./motion";
import { Waveform } from "./scenes";

type ToolIcon = "search" | "calendar" | "transfer" | "contact" | "send";
type Line = { who: "caller" | "agent" | "tool"; text: string; icon?: ToolIcon };
type Script = { business: string; agent: string; direction: "in" | "out"; start: number; lines: Line[] };

export type IndustryId = "home-services" | "healthcare" | "real-estate" | "professional";

const SCRIPTS: Record<IndustryId, Script> = {
  "home-services": {
    business: "Northwind Services",
    agent: "Nora",
    direction: "in",
    start: 8,
    lines: [
      { who: "agent", text: "Northwind Services, this is Nora. How can I help?" },
      { who: "caller", text: "Water is coming through my kitchen ceiling. Can someone come tonight?" },
      { who: "agent", text: "I’m sorry, that’s stressful. First, can you turn off the main valve? It’s usually by the water meter." },
      { who: "caller", text: "Okay. It’s off." },
      { who: "tool", text: "Checked the on-call rota", icon: "search" },
      { who: "agent", text: "Thank you. I’m connecting you to Dev, our on-call plumber. I’ve told him what’s happening." },
      { who: "tool", text: "Transferring · Dev, on call", icon: "transfer" },
    ],
  },
  healthcare: {
    business: "Lakeside Dental",
    agent: "Ava",
    direction: "in",
    start: 14,
    lines: [
      { who: "agent", text: "Lakeside Dental, this is Ava. How can I help?" },
      { who: "caller", text: "I need to move my cleaning on Thursday. Something came up at work." },
      { who: "tool", text: "Found the visit · Thu 9:00 AM", icon: "search" },
      { who: "agent", text: "I see it. I can do Monday at 8:30 or Tuesday at 4:00. Which is better?" },
      { who: "caller", text: "Tuesday at four, please." },
      { who: "tool", text: "Rescheduled · Tue 4:00 PM", icon: "calendar" },
      { who: "agent", text: "Done. I’m sending you a text with the new time." },
    ],
  },
  "real-estate": {
    business: "Harbor & Pine",
    agent: "Leo",
    direction: "out",
    start: 3,
    lines: [
      { who: "agent", text: "Hi Priya, this is Leo from Harbor & Pine. You just asked about 14 Alder Lane. Is now a good time?" },
      { who: "caller", text: "Oh, that was quick. Yes. Is it still available?" },
      { who: "tool", text: "Read the listing · 14 Alder Lane", icon: "search" },
      { who: "agent", text: "It is. Three bedrooms, and a yard that backs onto the park. Would you like to see it before Saturday’s open house?" },
      { who: "caller", text: "Friday after five would be ideal." },
      { who: "tool", text: "Booked showing · Fri 5:30 PM", icon: "calendar" },
      { who: "agent", text: "You’re set for Friday at 5:30 with Maya. I’m sending you the details now." },
    ],
  },
  professional: {
    business: "Calder & Co",
    agent: "Iris",
    direction: "in",
    start: 21,
    lines: [
      { who: "agent", text: "Calder & Co, this is Iris. How can I help?" },
      { who: "caller", text: "I got a letter from the IRS and I don’t know what it means." },
      { who: "agent", text: "Let’s get it in front of the right person. Is this for a personal return or a business?" },
      { who: "caller", text: "Personal. I’m not a client yet." },
      { who: "tool", text: "Created contact · new client", icon: "contact" },
      { who: "agent", text: "Thanks. I’ve booked you a 30-minute consult with Hannah on Wednesday at 11, and I’m emailing you our intake form." },
      { who: "tool", text: "Emailed intake form", icon: "send" },
    ],
  },
};

function ToolGlyph({ icon }: { icon?: ToolIcon }) {
  const s = { width: "1.1em", height: "1.1em" };
  switch (icon) {
    case "calendar": return <CalendarCheck style={{ ...s, color: "#3fd8a0" }} />;
    case "transfer": return <PhoneForwarded style={{ ...s, color: "#4db5ff" }} />;
    case "contact": return <UserPlus style={{ ...s, color: "#8b6cff" }} />;
    case "send": return <Send style={{ ...s, color: "#3fd8a0" }} />;
    default: return <Search style={{ ...s, color: "#ffb08a" }} />;
  }
}

/** A call for one industry, playing line by line on the caller's phone. */
export function IndustryCall({ industry, loop = true }: { industry: IndustryId; loop?: boolean }) {
  const script = SCRIPTS[industry];
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(1);
  const [seconds, setSeconds] = useState(script.start);

  useEffect(() => {
    if (reduced) { setShown(script.lines.length); return; }
    if (!inView) return;
    const t = window.setInterval(() => {
      setShown((n) => (n >= script.lines.length ? (loop ? 1 : n) : n + 1));
    }, 1900);
    const c = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { window.clearInterval(t); window.clearInterval(c); };
  }, [inView, reduced, loop, script.lines.length]);

  const lines = script.lines.slice(0, shown);
  const speaking = lines[lines.length - 1]?.who;
  const Dir = script.direction === "out" ? PhoneOutgoing : PhoneIncoming;
  return (
    <div ref={ref} className="flex h-full flex-col" style={{ background: "radial-gradient(120% 70% at 50% 0%, #3a1d14 0%, #120c10 45%, #050507 100%)", color: "#f5f5f7", fontSize: "clamp(9px, 3.6cqw, 13px)" }}>
      <div className="flex flex-col items-center" style={{ paddingTop: "18%" }}>
        <div className="flex items-center justify-center rounded-full" style={{ width: "22%", aspectRatio: "1", background: "linear-gradient(145deg,#ff9a62,#e96b34 55%,#9b3416)", boxShadow: "0 10px 40px -8px rgba(233,107,52,0.7)" }}>
          <Dir style={{ width: "40%", height: "40%" }} strokeWidth={1.8} />
        </div>
        <div style={{ marginTop: "5%", fontSize: "1.45em", fontWeight: 600, letterSpacing: "-0.02em" }}>{script.business}</div>
        <div style={{ color: "#a1a1a6", marginTop: "1%" }}>
          {script.direction === "out" ? "Calling out" : script.agent} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </div>
        <div style={{ width: "46%", marginTop: "6%" }}>
          <Waveform bars={18} height={22} color={speaking === "caller" ? "#a1a1a6" : "#ff9a62"} gap={0.22} />
        </div>
      </div>
      <div className="mt-auto flex flex-col justify-end gap-[0.55em] overflow-hidden" style={{ padding: "0 6% 12%", minHeight: "50%" }}>
        {lines.slice(-4).map((l, i) => (
          <div key={`${shown}-${i}-${l.text}`} style={{ alignSelf: l.who === "caller" ? "flex-end" : "flex-start", maxWidth: l.who === "tool" ? "100%" : "86%", animation: "mk-sol-bubble 420ms cubic-bezier(0.16,1,0.3,1) both" }}>
            {l.who === "tool" ? (
              <div className="inline-flex items-center gap-[0.5em] rounded-full" style={{ padding: "0.35em 0.9em", background: "rgba(255,255,255,0.08)", color: "#c7c7cc", fontSize: "0.88em" }}>
                <ToolGlyph icon={l.icon} />
                {l.text}
              </div>
            ) : (
              <div style={{ padding: "0.6em 0.95em", borderRadius: "1.2em", lineHeight: 1.35, background: l.who === "caller" ? "#e96b34" : "rgba(255,255,255,0.1)", color: "#fff", borderBottomRightRadius: l.who === "caller" ? "0.35em" : undefined, borderBottomLeftRadius: l.who === "agent" ? "0.35em" : undefined }}>{l.text}</div>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes mk-sol-bubble { from { opacity: 0; transform: translateY(10px) scale(0.92); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
