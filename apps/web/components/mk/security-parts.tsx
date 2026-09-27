/* Art for the security page. Every piece is SVG or CSS, drawn at whatever
   size the layout gives it. The illustrations show how Veyra actually works:
   the real header name, the real key prefix and the real API scopes from
   the app layer, not decoration. Nothing here needs state, so it renders on
   the server. */

import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  AudioLines,
  Ban,
  BadgeCheck,
  BrainCircuit,
  Building2,
  Check,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Monitor,
  TimerOff,
  Webhook,
  Workflow,
} from "lucide-react";

type Icon = ComponentType<{ size?: number | string; className?: string; style?: CSSProperties; strokeWidth?: number }>;

/* ── the hero: a graphite shield with an Ember keyhole ────────────────── */

const ORBIT: { icon: Icon; left: string; top: string; delay: string }[] = [
  { icon: KeyRound, left: "4%", top: "20%", delay: "0s" },
  { icon: Fingerprint, left: "80%", top: "12%", delay: "1.4s" },
  { icon: Webhook, left: "2%", top: "66%", delay: "2.2s" },
  { icon: Building2, left: "80%", top: "68%", delay: "0.7s" },
];

export function ShieldArt({ size = "min(560px, 86vw)" }: { size?: string }) {
  return (
    <div className="relative mx-auto" style={{ width: size, aspectRatio: "1", maxWidth: "100%" }} aria-hidden="true">
      <div className="mk-breathe absolute" style={{ inset: "-8%", background: "radial-gradient(50% 50% at 50% 50%, rgba(233,107,52,0.34), rgba(255,95,126,0.14) 45%, rgba(139,108,255,0.06) 65%, transparent 72%)", filter: "blur(24px)" }} />
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" style={{ animation: "mk-spin 90s linear infinite" }}>
        <circle cx="200" cy="200" r="192" fill="none" stroke="#1d1d1f" strokeOpacity="0.12" strokeWidth="0.8" strokeDasharray="2 7" />
        <circle cx="200" cy="200" r="164" fill="none" stroke="#e96b34" strokeOpacity="0.32" strokeWidth="1" strokeDasharray="36 12 4 12" />
      </svg>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" style={{ animation: "mk-spin-rev 120s linear infinite" }}>
        <circle cx="200" cy="200" r="178" fill="none" stroke="#1d1d1f" strokeOpacity="0.07" strokeWidth="1" />
      </svg>
      <svg viewBox="0 0 400 400" className="mk-float absolute inset-0 h-full w-full" style={{ animationDuration: "9s" }}>
        <defs>
          <linearGradient id="sa-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3a3a3e" />
            <stop offset="0.55" stopColor="#151517" />
            <stop offset="1" stopColor="#0a0a0b" />
          </linearGradient>
          <linearGradient id="sa-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb08a" />
            <stop offset="0.5" stopColor="#ff5f7e" stopOpacity="0.7" />
            <stop offset="1" stopColor="#8b6cff" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="sa-key" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb08a" />
            <stop offset="0.5" stopColor="#e96b34" />
            <stop offset="1" stopColor="#b33b1c" />
          </linearGradient>
          <radialGradient id="sa-gloss" cx="0.3" cy="0.2" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="sa-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" /></filter>
          <filter id="sa-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="24" stdDeviation="22" floodColor="#000" floodOpacity="0.35" /></filter>
        </defs>
        <g filter="url(#sa-shadow)">
          <path d="M200 70 C234 90 268 98 302 100 V196 C302 264 258 312 200 338 C142 312 98 264 98 196 V100 C132 98 166 90 200 70 Z" fill="url(#sa-body)" />
        </g>
        <path d="M200 70 C234 90 268 98 302 100 V196 C302 264 258 312 200 338 C142 312 98 264 98 196 V100 C132 98 166 90 200 70 Z" fill="url(#sa-gloss)" stroke="url(#sa-rim)" strokeWidth="2.5" />
        <path d="M200 88 C229 105 258 112 286 114 V196 C286 254 249 296 200 319 C151 296 114 254 114 196 V114 C142 112 171 105 200 88 Z" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1.5" />
        {/* the keyhole, with its own glow */}
        <g filter="url(#sa-blur)" opacity="0.8">
          <circle cx="200" cy="184" r="26" fill="#e96b34" />
          <path d="M187 198 H213 L222 258 Q200 266 178 258 Z" fill="#e96b34" />
        </g>
        <circle cx="200" cy="184" r="24" fill="url(#sa-key)" />
        <path d="M188 198 H212 L220 256 Q200 263 180 256 Z" fill="url(#sa-key)" />
        <circle cx="193" cy="176" r="6" fill="#ffffff" fillOpacity="0.35" />
      </svg>
      {ORBIT.map(({ icon: I, left, top, delay }, i) => (
        <div key={i} className="mk-float absolute" style={{ left, top, width: "15%", animationDelay: delay }}>
          <div className="mk-logo-tile w-full">
            <I style={{ width: "46%", height: "46%", color: "var(--mk-ember)" }} strokeWidth={1.8} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── the architecture: where the data lives, and where it does not ────── */

function Node({ icon: I, kicker, title, highlight = false, children }: { icon: Icon; kicker: string; title: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div
      className="relative flex flex-col rounded-[var(--mk-radius-card)] p-7"
      style={{ background: "var(--mk-night-card)", boxShadow: highlight ? "0 0 0 1.5px var(--mk-ember), 0 40px 100px -30px rgba(233,107,52,0.5)" : "0 0 0 1px rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: highlight ? "rgba(233,107,52,0.2)" : "var(--mk-night-card-2)", color: highlight ? "var(--mk-ember-soft)" : "var(--mk-night-ink)" }}>
          <I size={22} strokeWidth={1.8} />
        </span>
        <span className="mk-kicker">{kicker}</span>
      </div>
      <p className="mk-h3 mt-5">{title}</p>
      <div className="mt-5 flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function Item({ icon: I, children, off = false }: { icon: Icon; children: ReactNode; off?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px]" style={{ background: "var(--mk-night-card-2)", color: off ? "var(--mk-night-ink-2)" : "var(--mk-night-ink)" }}>
      <span className="relative flex shrink-0">
        <I size={18} style={{ color: off ? "var(--mk-night-ink-3)" : "var(--mk-ember-soft)" }} />
        {off && <Ban size={18} className="absolute inset-0" style={{ color: "var(--mk-rose)" }} />}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-2 lg:flex-col lg:py-0">
      {/* site.css sets `svg { display: block }`, so the wrappers carry the breakpoints */}
      <div className="hidden w-full lg:block">
        <svg viewBox="0 0 88 24" className="w-full">
          <line x1="4" y1="12" x2="84" y2="12" stroke="#ffb08a" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 10" style={{ animation: "mk-flow 1.2s linear infinite" }} />
          <circle cx="4" cy="12" r="3.5" fill="#ffb08a" />
          <circle cx="84" cy="12" r="3.5" fill="#ffb08a" />
        </svg>
      </div>
      <div className="lg:hidden">
        <svg viewBox="0 0 24 48" className="h-12 w-6">
          <line x1="12" y1="4" x2="12" y2="44" stroke="#ffb08a" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 10" style={{ animation: "mk-flow 1.2s linear infinite" }} />
          <circle cx="12" cy="4" r="3.5" fill="#ffb08a" />
          <circle cx="12" cy="44" r="3.5" fill="#ffb08a" />
        </svg>
      </div>
      <span className="mk-small text-center lg:max-w-[10ch]">{label}</span>
    </div>
  );
}

const ORGS = [
  { name: "Your organization", you: true },
  { name: "Another organization" },
  { name: "Another organization" },
];

export function DataFlow() {
  return (
    <div className="grid items-stretch lg:grid-cols-[1fr_96px_1.35fr_96px_1fr]">
      <style>{`@keyframes mk-flow { from { stroke-dashoffset: 28; } to { stroke-dashoffset: 0; } }`}</style>
      <Node icon={Monitor} kicker="Your browser" title="Your work, never your keys.">
        <Item icon={Monitor}>Desk and Studio</Item>
        <Item icon={KeyRound} off>No API keys or tokens</Item>
        <p className="mk-small mt-auto pt-4">Pages show your data. The secrets that reach your tools stay on the server.</p>
      </Node>
      <Connector label="You sign in" />
      <Node icon={Database} kicker="App layer" title="Owns your data." highlight>
        <Item icon={Database}>Contacts, inbox, tickets, transcripts</Item>
        <Item icon={Lock}>Credentials, encrypted at rest</Item>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ORGS.map((o, i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center" style={{ background: o.you ? "rgba(233,107,52,0.14)" : "var(--mk-night-card-2)", boxShadow: o.you ? "inset 0 0 0 1px rgba(255,176,138,0.5)" : undefined }}>
              {o.you ? <Building2 size={20} style={{ color: "var(--mk-ember-soft)" }} /> : <Lock size={18} style={{ color: "var(--mk-night-ink-3)" }} />}
              <span className="text-[12px] leading-tight" style={{ color: o.you ? "var(--mk-night-ink)" : "var(--mk-night-ink-3)" }}>{o.name}</span>
            </div>
          ))}
        </div>
      </Node>
      <Connector label="Settings out, results in" />
      <Node icon={AudioLines} kicker="Agent layer" title="Owns no customer data.">
        <Item icon={AudioLines}>Talks on the call</Item>
        <Item icon={BrainCircuit}>Thinks through the request</Item>
        <Item icon={Workflow}>Acts in your tools</Item>
        <p className="mk-small mt-auto pt-4">It asks the app layer for what each conversation needs, and hands the results back.</p>
      </Node>
    </div>
  );
}

/* ── one piece of art per principle card ──────────────────────────────── */

function Toggle({ on }: { on: boolean }) {
  return (
    <span className="relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full" style={{ background: on ? "#34c759" : "rgba(127,127,127,0.25)" }}>
      <span className="absolute top-[2px] size-[18px] rounded-full bg-white" style={{ left: on ? 18 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </span>
  );
}

/* four of the six real API scopes; the other two are runs:read and runs:write */
const SCOPES: [string, boolean][] = [
  ["calls:read", true],
  ["calls:write", true],
  ["contacts:read", true],
  ["contacts:write", false],
];

export function PrincipleArt({ kind }: { kind: string }) {
  switch (kind) {
    case "tenants":
      return (
        <div className="grid h-full grid-cols-3 content-center gap-2.5 px-8">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex aspect-[5/4] flex-col justify-between rounded-2xl p-3" style={{ background: i === 0 ? "rgba(233,107,52,0.1)" : "var(--mk-bg-alt)", boxShadow: i === 0 ? "inset 0 0 0 1.5px var(--mk-ember)" : undefined }}>
              {i === 0 ? <Building2 size={20} className="text-[var(--mk-ember)]" /> : <Lock size={16} className="text-[var(--mk-ink-3)]" />}
              <div className="flex flex-col gap-1">
                <span className="h-1.5 w-full rounded-full" style={{ background: i === 0 ? "var(--mk-ember)" : "var(--mk-line-strong)", opacity: i === 0 ? 0.7 : 1 }} />
                <span className="h-1.5 w-2/3 rounded-full" style={{ background: i === 0 ? "var(--mk-ember)" : "var(--mk-line-strong)", opacity: i === 0 ? 0.4 : 1 }} />
              </div>
            </div>
          ))}
        </div>
      );
    case "secrets":
      return (
        <div className="flex h-full items-center justify-center gap-3 px-8">
          <div className="w-[46%] overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 1px var(--mk-line-strong)" }}>
            <div className="flex gap-1 px-2.5 py-2" style={{ background: "var(--mk-bg-alt)" }}>
              {[0, 1, 2].map((d) => <span key={d} className="size-1.5 rounded-full" style={{ background: "var(--mk-line-strong)" }} />)}
            </div>
            <div className="flex flex-col items-center gap-2 px-3 py-6">
              <span className="relative flex">
                <KeyRound size={30} className="text-[var(--mk-ink-3)]" strokeWidth={1.6} />
                <Ban size={30} className="absolute inset-0" style={{ color: "var(--mk-rose)" }} strokeWidth={1.6} />
              </span>
              <span className="mk-small">Browser</span>
            </div>
          </div>
          <div className="flex w-[40%] flex-col gap-1.5">
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "#1d1d1f" }}>
                <span className="size-1.5 rounded-full" style={{ background: "#3fd8a0", animation: `mk-breathe 2.4s ease-in-out ${r * 0.4}s infinite` }} />
                <span className="h-1 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
                {r === 1 && <KeyRound size={14} style={{ color: "#ffb08a" }} />}
              </div>
            ))}
            <span className="mk-small mt-1 text-center">Server</span>
          </div>
        </div>
      );
    case "webhooks":
      return (
        <div className="flex h-full items-center px-8">
          <div className="w-full rounded-2xl p-5 text-[13px] leading-relaxed" style={{ background: "#161618", color: "#f5f5f7" }}>
            <div><span style={{ color: "#3fd8a0", fontWeight: 600 }}>POST</span> <span style={{ color: "#a1a1a6" }}>/your/endpoint</span></div>
            <div className="mt-3" style={{ color: "#a1a1a6" }}>X-Veyra-Signature</div>
            <div className="break-all" style={{ color: "#ffb08a" }}>sha256=4c1f9a0be2…7d3e27b</div>
            <div className="mt-4 flex items-center gap-2" style={{ color: "#3fd8a0" }}><BadgeCheck size={16} /> Signature matches</div>
          </div>
        </div>
      );
    case "hashed":
      return (
        <div className="flex h-full flex-col justify-center gap-2 px-8 text-[13px]">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(233,107,52,0.1)" }}>
            <Eye size={16} className="shrink-0 text-[var(--mk-ember)]" />
            <div className="min-w-0"><p className="mk-small">Shown once, on creation</p><p className="truncate font-medium">vy_sk_8Hq2Lm4Tz9Rw…</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--mk-bg-alt)" }}>
            <Lock size={16} className="shrink-0 text-[var(--mk-ink-2)]" />
            <div className="min-w-0"><p className="mk-small">What we store</p><p className="truncate font-medium">sha256 · 3f1a7c02…90de</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--mk-bg-alt)" }}>
            <EyeOff size={16} className="shrink-0 text-[var(--mk-ink-2)]" />
            <div className="min-w-0"><p className="mk-small">What your key list shows</p><p className="truncate font-medium">vy_sk_8Hq2Lm4T…</p></div>
          </div>
        </div>
      );
    case "scopes":
      return (
        <div className="flex h-full flex-col justify-center px-8">
          <div className="rounded-2xl p-4" style={{ background: "var(--mk-bg-alt)" }}>
            <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><KeyRound size={16} className="text-[var(--mk-ember)]" /> Booking line key</div>
            {SCOPES.map(([s, on]) => (
              <div key={s} className="flex items-center justify-between py-1.5 text-[13px]">
                <span style={{ color: on ? "var(--mk-ink)" : "var(--mk-ink-3)" }}>{s}</span>
                <Toggle on={on} />
              </div>
            ))}
          </div>
        </div>
      );
    case "confirm":
      return (
        <div className="flex h-full items-center justify-center px-8">
          <div className="w-full rounded-2xl bg-white p-5" style={{ boxShadow: "var(--mk-shadow-float)" }}>
            <p className="mk-small">The agent wants to</p>
            <p className="mt-1 text-[16px] font-semibold leading-snug text-[#1d1d1f]">Cancel Tom Byrne’s Thursday visit</p>
            <div className="mt-4 flex gap-2">
              <span className="inline-flex h-9 flex-1 items-center justify-center rounded-full text-[14px] font-medium text-white" style={{ background: "#1d1d1f" }}>Approve</span>
              <span className="inline-flex h-9 flex-1 items-center justify-center rounded-full text-[14px] font-medium text-[#1d1d1f]" style={{ boxShadow: "inset 0 0 0 1.5px rgba(0,0,0,0.14)" }}>Decline</span>
            </div>
          </div>
        </div>
      );
    case "timeout":
      return (
        <div className="flex h-full items-center justify-center px-8">
          <div className="rounded-2xl px-5 py-4 text-left" style={{ background: "rgba(255,159,10,0.12)" }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#b25f00" }}><TimerOff size={16} /> Needs a human to check</p>
            <p className="mk-small mt-1.5">Book appointment timed out mid-write. Confirm in the calendar before telling the customer.</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="flex h-full flex-col justify-center gap-2 px-8">
          {["Workflows", "Voice", "Knowledge"].map((s) => (
            <div key={s} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px]" style={{ background: "var(--mk-bg-alt)" }}>
              <span className="flex size-5 items-center justify-center rounded-full" style={{ background: "#34c759" }}><Check size={12} strokeWidth={3} className="text-white" /></span>
              {s}
              <span className="mk-small ml-auto">Reviewed</span>
            </div>
          ))}
          <span className="mt-2 inline-flex h-10 items-center justify-center rounded-full text-[14px] font-medium" style={{ background: "var(--mk-ink)", color: "var(--mk-bg)" }}>Approve and go live</span>
        </div>
      );
  }
}
