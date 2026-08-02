/* The site's "images": self-contained SVG + styled-DOM graphics that read as
   real product UI. No external assets — everything is on-brand, theme-aware, and
   animated, so the page feels alive and interactive without hotlinking stock. */

import {
  ArrowRight,
  Bot,
  Check,
  GitBranch,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

// animated voice waveform — a row of bouncing bars
export function VoiceWaveform({ bars = 28 }: { bars?: number }) {
  return (
    <div className="wave" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${(i % 9) * 0.09}s` }} />
      ))}
    </div>
  );
}

// deep-agent console: a browser frame with a live build in progress
export function ConsoleMock() {
  return (
    <div className="mock" style={{ maxWidth: 480 }}>
      <div className="mock__bar">
        <span className="mock__dot r" />
        <span className="mock__dot y" />
        <span className="mock__dot g" />
        <span className="mock__addr">vera.studio / deep agent</span>
      </div>
      <div className="mock__body">
        <div className="mk-line me">
          <span className="mk-av" style={{ background: "color-mix(in srgb, var(--voice-caller) 18%, transparent)", color: "var(--voice-caller)" }}>You</span>
          <div className="mk-bubble">Build a booking flow, wire my calendar, and deploy it.</div>
        </div>
        <div className="mk-line">
          <span className="mk-av"><Bot size={13} /></span>
          <div className="mk-bubble">
            On it. Reading your tools, then delegating to the Workflow Builder.
          </div>
        </div>
        <div className="da-preview" style={{ marginTop: 4 }}>
          <div className="da-preview__plan" style={{ marginBottom: 10 }}>
            <div className="da-preview__task done">Read connected tools</div>
            <div className="da-preview__task done">Draft the booking flow</div>
            <div className="da-preview__task run">Wire Google Calendar</div>
            <div className="da-preview__task">Publish once approved</div>
          </div>
          <div className="da-preview__handoff">
            Main <ArrowRight size={12} /> <b>Workflow Builder</b>
          </div>
        </div>
      </div>
      <div className="mock-float" style={{ right: -14, bottom: 40 }}>
        <ShieldCheck size={15} /> Approve to deploy
      </div>
    </div>
  );
}

// visual workflow / pathway graph
export function WorkflowMock() {
  const nodes: [any, string, string, boolean?][] = [
    [Sparkles, "Start", "caller intent detected"],
    [MessageSquare, "Ask", "what date works for you?"],
    [Wrench, "Act", "create calendar event", true],
    [GitBranch, "Branch", "booked / needs a human"],
    [Check, "End", "confirm and wrap up"],
  ];
  return (
    <div className="mock" style={{ maxWidth: 380 }}>
      <div className="mock__bar">
        <span className="mock__dot r" />
        <span className="mock__dot y" />
        <span className="mock__dot g" />
        <span className="mock__addr">workflow builder</span>
      </div>
      <div className="mock__body">
        <div className="mk-flow">
          {nodes.map(([Ic, title, sub, accent], i) => (
            <div key={title}>
              <div className={`mk-node ${accent ? "accent" : ""}`}>
                <span className="mk-node__ic"><Ic size={14} /></span>
                <div>
                  <b>{title}</b> <span>· {sub}</span>
                </div>
              </div>
              {i < nodes.length - 1 && <div className="mk-wire" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// telephony phone: a live inbound call
export function TelephonyMock() {
  return (
    <div style={{ position: "relative" }}>
      <div className="mk-phone">
        <div className="mk-phone__screen">
          <div className="mk-ring">
            <Phone size={30} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: "var(--stage-text-muted)" }}>Incoming call</div>
            <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>+1 415 555 0142</div>
          </div>
          <VoiceWaveform bars={18} />
          <div style={{ fontSize: 12, color: "var(--stage-text-muted)" }}>Vera is answering…</div>
        </div>
      </div>
      <div className="mock-float" style={{ left: -10, top: 30 }}>
        <Phone size={14} /> 100+ countries
      </div>
      <div className="mock-float" style={{ right: -6, bottom: 44 }}>
        <MessageSquare size={14} /> SMS in one thread
      </div>
    </div>
  );
}

// CRM unified inbox
export function InboxMock() {
  const rows: [string, string, string, string][] = [
    ["call", "Dana Okafor", "Missed call · 2m", "new lead"],
    ["sms", "Marcus Lee", "Can we reschedule to Fri?", "open"],
    ["mail", "Priya N.", "Re: quote for 20 seats", "quoted"],
    ["call", "Sam Rivera", "Voicemail · booking", "won"],
  ];
  const cls: Record<string, any> = { call: Phone, sms: MessageSquare, mail: Mail };
  return (
    <div className="mock" style={{ maxWidth: 420 }}>
      <div className="mock__bar">
        <span className="mock__dot r" />
        <span className="mock__dot y" />
        <span className="mock__dot g" />
        <span className="mock__addr">vera desk / inbox</span>
      </div>
      <div className="mock__body">
        <div className="mk-inbox">
          {rows.map(([ch, name, prev, tag]) => {
            const Ic = cls[ch];
            return (
              <div key={name} className="mk-thread">
                <span className={`mk-thread__ch ${ch}`}><Ic size={13} /></span>
                <div className="mk-thread__t">
                  <b>{name}</b>
                  <p>{prev}</p>
                </div>
                <span className="mk-tag">{tag}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// integration orbits — tools floating around the Vera core
const ORBIT_CHIPS = ["Slack", "GCal", "HubSpot", "Stripe", "Gmail", "Sheets", "Notion", "Zoom"];
export function IntegrationOrbits() {
  return (
    <div className="orbit" aria-hidden>
      <div className="orbit__ring" style={{ animation: "spin-slow 40s linear infinite" }} />
      <div className="orbit__ring r2" style={{ animation: "spin-slow 30s linear infinite reverse" }} />
      <div className="orbit__ring r3" />
      {ORBIT_CHIPS.map((label, i) => {
        const angle = (i / ORBIT_CHIPS.length) * Math.PI * 2;
        const radius = i % 2 === 0 ? 46 : 33; // alternate between two rings, as %
        const top = 50 + Math.sin(angle) * radius;
        const left = 50 + Math.cos(angle) * radius;
        return (
          <div
            key={label}
            className="orbit__chip float"
            style={{ top: `${top}%`, left: `${left}%`, animationDelay: `${(i % 5) * 0.6}s` }}
          >
            {label.slice(0, 2)}
          </div>
        );
      })}
      <div className="orbit__core">
        <Sparkles size={30} />
      </div>
    </div>
  );
}

// abstract signal arcs — connection reaching out, used as a hero flourish
export function SignalArcs({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 200" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M20 ${180 - i * 6} Q 200 ${20 + i * 30} 380 ${180 - i * 6}`}
          stroke="url(#sg)"
          strokeWidth="1.5"
          opacity={0.5 - i * 0.08}
        />
      ))}
      <circle cx="20" cy="180" r="5" fill="var(--accent)" />
      <circle cx="380" cy="180" r="5" fill="var(--accent-2)" />
    </svg>
  );
}
