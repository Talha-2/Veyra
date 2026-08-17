import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* Solutions — how Veyra is used across industries. Console cards with mono
   industry tags; the common thread as hairline rows. */

const CALENDAR_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/contact";
const bookProps = CALENDAR_URL.startsWith("http")
  ? { target: "_blank", rel: "noopener noreferrer" as const }
  : {};

type UseCase = {
  tag: string;
  title: string;
  body: string;
  tasks: string[];
};

const USE_CASES: UseCase[] = [
  {
    tag: "Healthcare",
    title: "A front desk that never sends patients to voicemail",
    body: "Practices lose bookings the moment the phone rings through to a machine. Veyra answers every call, books and reschedules against your calendar, triages by urgency, and hands the rare emergency straight to your on-call line.",
    tasks: ["Book + reschedule", "Intake questions", "Warm transfer to on-call"],
  },
  {
    tag: "Home services",
    title: "Every missed call is a job that went to a competitor",
    body: "When a pipe bursts, the first company to pick up wins the work. Veyra captures the job, quotes the visit, checks the crew's availability, and books the slot — day or night — so leads never ring out.",
    tasks: ["Capture + qualify", "Quote + schedule", "Dispatch the crew"],
  },
  {
    tag: "Real estate",
    title: "Follow up on every lead the second it lands",
    body: "Speed to lead decides who tours the property. Veyra calls new inquiries within seconds, answers questions on the listing, qualifies budget and timeline, and books the showing straight onto the agent's calendar.",
    tasks: ["Instant speed-to-lead", "Qualify budget + timeline", "Book the showing"],
  },
  {
    tag: "E-commerce",
    title: "Order questions answered before they become tickets",
    body: "Where-is-my-order, returns, and sizing swamp support at peak. Veyra looks up the order, starts the return, tracks the shipment, and applies the right policy — on chat and on the phone, with no queue.",
    tasks: ["Order status", "Returns + exchanges", "Escalate edge cases"],
  },
  {
    tag: "Financial services",
    title: "High-volume calls handled with a careful hand",
    body: "Balance checks, payment reminders, and appointment setting eat your team's day. Veyra handles the routine securely, stays grounded in your policies, and never improvises an answer it cannot back up.",
    tasks: ["Balance + payments", "Appointment setting", "Grounded answers"],
  },
  {
    tag: "Recruiting",
    title: "Screen every applicant while the role is still hot",
    body: "Good candidates ghost when screening takes days. Veyra calls applicants the moment they apply, runs the phone screen, checks availability and must-haves, and books qualified people onto the recruiter's calendar.",
    tasks: ["Instant phone screens", "Check must-haves", "Book the interview"],
  },
];

const OUTCOMES: [string, string][] = [
  ["24/7", "coverage, no queue"],
  ["<1.2s", "voice to voice, target"],
  ["42+", "languages, no setup"],
  ["100+", "countries reachable"],
];

const COMMON: { title: string; body: string; metric: string }[] = [
  {
    title: "Grounded in your playbook",
    body: "Veyra answers from your knowledge base and business profile, not a generic script — every industry gets your policies and your tone.",
    metric: "your knowledge",
  },
  {
    title: "Wired to your tools",
    body: "It reads your CRM, calendar, and order system through managed OAuth and takes the action live, from booking a slot to starting a return.",
    metric: "1000+ tools",
  },
  {
    title: "Escalates on your terms",
    body: "When a call needs a person, Veyra warm-transfers with context or books a callback. It degrades to safe instead of guessing.",
    metric: "warm + cold",
  },
  {
    title: "Every channel, one agent",
    body: "Voice, chat, phone, and SMS run on the same brain, so a customer gets the same answer wherever they reach you.",
    metric: "one brain",
  },
];

export default function SolutionsPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 8vw, 6.5rem)" }}>
        <div className="wrap text-center">
          <h1 className="display-hero mx-auto max-w-[62rem]" style={{ textWrap: "balance" }}>
            One agent, tuned to the way your business actually works.
          </h1>
          <p className="lead-lg mx-auto mt-7 max-w-[54ch]">
            From the healthcare front desk to home-services dispatch: Veyra answers the phone, runs
            your workflow, and closes the loop in your tools. Only the playbook changes.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={CALENDAR_URL} {...bookProps} className="btn-ember">
              Request a demo <ArrowRight />
            </a>
            <Link href="/signup" className="btn-mint">
              Start building free
            </Link>
          </div>
        </div>
      </section>

      {/* ── use cases ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[22ch]">Built for the calls that break the day.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            Every one of these runs on the same platform — grounded answers, visual workflows, and
            a thousand tools the agent can act in.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => (
              <div key={u.tag} className="console flex flex-col">
                <div className="console__bar">
                  <span className="console__dot" />
                  {u.tag}
                </div>
                <div className="console__body flex flex-1 flex-col">
                  <h3 className="text-[17px] font-medium leading-snug" style={{ letterSpacing: "-0.01em" }}>
                    {u.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {u.body}
                  </p>
                  <div className="chips mt-auto pt-5">
                    {u.tasks.map((t) => (
                      <span key={t} className="chip chip--mono">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── outcomes ── */}
      <section className="band band--line">
        <div className="wrap">
          <div className="stat-grid">
            {OUTCOMES.map(([fig, label]) => (
              <div key={label} className="stat">
                <div className="stat__fig">{fig}</div>
                <div className="stat__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── the common thread ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[24ch]">Different industries. One agent underneath.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            You don't stitch together a bot per team. You ground one agent in your knowledge,
            point it at your tools, and it shows up the same on every line.
          </p>
          <div className="rows mt-12">
            {COMMON.map((c) => (
              <div key={c.title} className="row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>
                  <span className="row__title">{c.title}</span>
                  <span className="row__body block">{c.body}</span>
                </span>
                <span className="row__metric">{c.metric}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[20ch]">
            Tell Veyra your business. Watch it pick up.
          </h2>
          <p className="lead mx-auto mt-5 max-w-[46ch]">
            Describe your industry in plain English and the deep agent drafts the workflows,
            knowledge, and voice. Approve it, and Veyra is on the phone.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={CALENDAR_URL} {...bookProps} className="btn-ember">
              Request a demo <ArrowRight />
            </a>
            <Link href="/signup" className="btn-mint">
              Start building free
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
