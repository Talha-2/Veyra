import Link from "next/link";
import {
  ArrowRight, Briefcase, Building2, BookOpen, Check, GitBranch, Landmark,
  MessageSquare, Plug, ShoppingBag, Stethoscope, Users, Wrench,
  type LucideIcon,
} from "lucide-react";
import Reveal from "@/components/Reveal";

/* Solutions — how Vera is used across industries and jobs. Server Component:
   returns inner content only. The shared (site)/layout owns the nav, the fixed
   aurora, and the footer, so this is one continuous surface, separated by
   whitespace, never borders or filled bands. */

type UseCase = {
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  tasks: string[];
};

const USE_CASES: UseCase[] = [
  {
    icon: Stethoscope,
    tag: "Healthcare",
    title: "A front desk that never sends patients to voicemail",
    body: "Practices lose bookings the moment the phone rings through to a machine. Vera answers every call, books and reschedules against your calendar, triages by urgency, and hands the rare emergency straight to your on call line.",
    tasks: ["Book and reschedule", "Intake and insurance questions", "Warm transfer to on call"],
  },
  {
    icon: Wrench,
    tag: "Home services",
    title: "Every missed call is a job that went to a competitor",
    body: "When a pipe bursts, the first company to pick up wins the work. Vera captures the job, quotes the visit, checks the crew's availability, and books the slot, day or night, so leads never ring out.",
    tasks: ["Capture and qualify the job", "Quote and schedule the visit", "Dispatch the right crew"],
  },
  {
    icon: Building2,
    tag: "Real estate",
    title: "Follow up on every lead the second it lands",
    body: "Speed to lead decides who tours the property. Vera calls new inquiries within seconds, answers questions on the listing, qualifies budget and timeline, and books the showing straight onto the agent's calendar.",
    tasks: ["Instant speed to lead", "Qualify budget and timeline", "Book the showing"],
  },
  {
    icon: ShoppingBag,
    tag: "E commerce",
    title: "Order questions answered before they become tickets",
    body: "Where is my order, returns, and sizing swamp support at peak. Vera looks up the order, starts the return, tracks the shipment, and applies the right policy, on chat and on the phone, with no queue.",
    tasks: ["Order status and tracking", "Returns and exchanges", "Escalate the edge cases"],
  },
  {
    icon: Landmark,
    tag: "Financial services",
    title: "High volume calls handled with a careful hand",
    body: "Balance checks, payment reminders, and appointment setting eat your team's day. Vera handles the routine securely, stays grounded in your policies, and never improvises an answer it cannot back up.",
    tasks: ["Balance and payment questions", "Appointment setting", "Grounded, compliant answers"],
  },
  {
    icon: Users,
    tag: "Recruiting",
    title: "Screen every applicant while the role is still hot",
    body: "Good candidates ghost when screening takes days. Vera calls applicants the moment they apply, runs the phone screen, checks availability and must haves, and books qualified people onto the recruiter's calendar.",
    tasks: ["Instant phone screens", "Check availability and must haves", "Book onto the calendar"],
  },
];

const OUTCOMES: [string, string][] = [
  ["24 by 7", "coverage with no queue"],
  ["<1.2s", "voice to voice, target"],
  ["42+", "languages, no setup"],
  ["100+", "countries reachable"],
];

const COMMON: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BookOpen,
    title: "Grounded in your playbook",
    body: "Vera answers from your knowledge base and business profile, not a generic script, so every industry gets your policies and your tone.",
  },
  {
    icon: Plug,
    title: "Wired to your tools",
    body: "It reads your CRM, calendar, and order system through managed OAuth and takes the action live, from booking a slot to starting a return.",
  },
  {
    icon: GitBranch,
    title: "Escalates on your terms",
    body: "When a call needs a person, Vera warm transfers with context or books a callback. It degrades to safe instead of guessing.",
  },
  {
    icon: MessageSquare,
    title: "Every channel, one agent",
    body: "Voice, chat, phone, and SMS run on the same brain, so a customer gets the same answer wherever they reach you.",
  },
];

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
        color: "var(--accent-text)", display: "grid", placeItems: "center",
      }}
    >
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}

export default function SolutionsPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 9vw, 7rem)", paddingBottom: "1.5rem" }}>
        <div className="wrap text-center">
          <Reveal>
            <span className="eyebrow mb-6 justify-center"><Briefcase size={13} /> Solutions</span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-hero mx-auto max-w-4xl">
              One agent, tuned to the way{" "}
              <span className="text-gradient">your business actually works.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-7 max-w-2xl">
              From the healthcare front desk to home services dispatch, Vera answers the phone, runs
              your workflow, and closes the loop in your tools. Same grounded brain, tuned to the
              calls your team can never get to fast enough.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Book a demo</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── use cases ── */}
      <section className="band-sm">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><GitBranch size={13} /> Where Vera earns its keep</span>
              <h2 className="section-title">Built for the calls that break the day.</h2>
              <p className="lead mt-4 max-w-2xl">
                Every one of these runs on the same platform: grounded answers, visual workflows, and
                a thousand tools the agent can act in. Only the playbook changes.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u, i) => (
              <Reveal key={u.tag} delay={(i % 3) * 80}>
                <div className="glass-card">
                  <div className="glass-card__top">
                    <span className="glass-card__icon"><u.icon size={18} strokeWidth={1.9} /></span>
                    <span className="glass-card__tag">{u.tag}</span>
                  </div>
                  <h3 className="glass-card__title">{u.title}</h3>
                  <p className="glass-card__body">{u.body}</p>
                  <div className="chips mt-5">
                    {u.tasks.map((t) => (
                      <span key={t} className="chip"><Check size={12} /> {t}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── outcomes strip ── */}
      <section className="band-sm">
        <div className="wrap">
          <div className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
            {OUTCOMES.map(([fig, label], i) => (
              <Reveal key={label} variant="scale" delay={i * 90}>
                <div className="text-center">
                  <div className="figure text-gradient">{fig}</div>
                  <div className="mono mt-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── the common thread ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="section-head mb-12">
              <span className="eyebrow mb-5"><Users size={13} /> Same brain, your business</span>
              <h2 className="section-title">Different industries. One agent underneath.</h2>
              <p className="lead mt-4 max-w-2xl">
                You do not stitch together a bot per team. You ground one agent in your knowledge and
                point it at your tools, and it shows up the same on every line.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {COMMON.map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) * 90}>
                <div className="flex items-start gap-4">
                  <IconTile icon={c.icon} />
                  <div>
                    <h3 className="text-[18px] font-semibold leading-snug">{c.title}</h3>
                    <p className="text-secondary mt-1.5 text-[15px] leading-relaxed">{c.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── closing CTA ── */}
      <section className="band">
        <div className="wrap-tight text-center">
          <Reveal variant="scale">
            <Briefcase size={30} strokeWidth={1.5} className="mx-auto mb-6 glow-pulse" style={{ color: "var(--accent)" }} />
          </Reveal>
          <Reveal delay={80}>
            <h2 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              Tell Vera your business. <span className="text-gradient">Watch it pick up.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="lead mx-auto mt-5 max-w-xl">
              Describe your industry in plain English and the deep agent drafts the workflows,
              knowledge, and voice for you. Approve it, and Vera is on the phone.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-gradient btn-lg">Start building free <ArrowRight /></Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Book a demo</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
