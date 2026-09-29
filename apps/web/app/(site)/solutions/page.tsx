import Link from "next/link";
import {
  ArrowRight, BookOpen, Briefcase, CalendarClock, CalendarCheck, Check, ChevronRight, CircleAlert, Droplets, House, Inbox,
  KeyRound, MapPin, MessageSquareText, PhoneForwarded, PhoneOutgoing, ReceiptText, Route, ShieldCheck, Stethoscope,
  UserPlus, Wrench, type LucideIcon,
} from "lucide-react";

import type { Metadata } from "next";

import { APPS, LogoTile, PARTNERS, type Partner } from "@/components/mk/brand";
import { SIGN_UP_URL, DEMO_URL, demoLinkProps as demoProps } from "@/components/mk/links";
import { CountUp, HorizontalScroll, Marquee, Parallax, Reveal, Stagger, TextReveal } from "@/components/mk/motion";
import { PhoneFrame, VoiceOrb } from "@/components/mk/scenes";
import { IndustryCall, type IndustryId } from "@/components/mk/solutions-parts";
import { ChannelStatus, Soon } from "@/components/mk/soon";

export const metadata: Metadata = {
  title: "Solutions",
  description: "How Veyra answers the calls home services, healthcare, real estate and professional services teams get every day, and what it does in their tools.",
};

/* Solutions. One story per industry: the calls that business gets, a call
   playing on a phone, the tools it works in, and what the team sees after.
   The businesses in the scenes are demo businesses, not customers. */

const ALL: Partner[] = [...APPS, ...PARTNERS];
const logo = (name: string): Partner => ALL.find((p) => p.name === name) ?? { name, logo: null, kind: "app" };

type Industry = {
  id: IndustryId;
  name: string;
  icon: LucideIcon;
  headline: string;
  lead: string;
  quote: string;
  calls: { icon: LucideIcon; title: string; body: string; soon?: boolean }[];
  tools: string[];
  after: { name: string; initials: string; meta: string; status: string; summary: string; did: [string, string][]; flag?: string };
  guard?: { title: string; body: string };
};

const INDUSTRIES: Industry[] = [
  {
    id: "home-services",
    name: "Home services",
    icon: Wrench,
    headline: "The first company to answer gets the job.",
    lead: "Plumbers, HVAC, electricians, cleaners. When a pipe bursts at night, the caller rings the next number on the list. Veyra picks up every time.",
    quote: "Water is coming through my ceiling.",
    calls: [
      { icon: Droplets, title: "Emergencies at 2 AM", body: "It follows your rules for what counts as urgent, and reaches whoever is on call with a brief." },
      { icon: ReceiptText, title: "Quotes and bookings", body: "Prices come from your price sheet, word for word. The visit goes straight into the crew’s calendar." },
      { icon: CalendarClock, title: "Reschedules", body: "It finds the visit by the caller’s number, offers the two nearest windows and moves it." },
      { icon: MapPin, title: "“Do you come out to me?”", body: "It checks your service area before it books, and says so kindly when the answer is no." },
    ],
    tools: ["Google Calendar", "Google Sheets", "QuickBooks", "Square", "Slack", "Gmail"],
    after: {
      name: "Maria Delgado", initials: "MD", meta: "Call · 2:41 · 11:48 PM", status: "Transferred",
      summary: "Kitchen ceiling leak. Caller shut off the main valve on the agent’s instructions. Transferred to Dev, on call, with a brief.",
      did: [["Google Sheets", "Checked the on-call rota"], ["Slack", "Posted the brief to #on-call"], ["Google Calendar", "Held a slot tomorrow for the repair"]],
      flag: "Asked for a quote on the ceiling repair. Ticket #318 for the office.",
    },
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: Stethoscope,
    headline: "A front desk that never sends patients to voicemail.",
    lead: "Dental, physio, veterinary and specialist practices. Your team is with patients. Veyra takes the phone: bookings, reschedules and the same ten questions, all day.",
    quote: "I need to move my cleaning on Thursday.",
    calls: [
      { icon: UserPlus, title: "New patients", body: "It asks your intake questions, takes their details and books a first visit in the slots you keep for it." },
      { icon: CalendarClock, title: "Reschedules and cancellations", body: "Found, moved and confirmed in one call, with a text of the new time." },
      { icon: PhoneForwarded, title: "Anything urgent", body: "It asks the triage questions you write and routes by your answers, to your on-call line when you say so.", soon: true },
      { icon: MessageSquareText, title: "Office questions", body: "Hours, parking, which insurers you accept, what to bring. Answered from what you wrote." },
    ],
    tools: ["Google Calendar", "Outlook", "Gmail", "Microsoft Teams", "Google Sheets", "Slack"],
    after: {
      name: "James Okafor", initials: "JO", meta: "Call · 1:52 · 10:06 AM", status: "Rescheduled",
      summary: "Moved a cleaning from Thursday 9:00 AM to Tuesday 4:00 PM. Patient asked whether they are due for X-rays.",
      did: [["Google Calendar", "Found the visit, Thu 9:00 AM"], ["Google Calendar", "Rescheduled to Tue 4:00 PM"], ["Gmail", "Sent the new time"]],
      flag: "X-ray question left for the front desk to answer.",
    },
    guard: { title: "Your rules, not its judgment.", body: "It doesn’t give medical advice. It asks the questions you write, routes by your answers, and you decide exactly what it says to anyone describing an emergency." },
  },
  {
    id: "real-estate",
    name: "Real estate",
    icon: House,
    headline: "Call the lead back while they’re still looking.",
    lead: "Buyers ask about three listings at once. The agent who calls first usually gets the showing. Veyra calls every inquiry back, answers from the listing and books the tour.",
    quote: "Is 14 Alder Lane still available?",
    calls: [
      { icon: PhoneOutgoing, title: "Instant call-backs", body: "Hand it the new inquiry and it calls the buyer back right away, by name, about the home they asked about.", soon: true },
      { icon: BookOpen, title: "Listing questions", body: "Bedrooms, parking, HOA fees, school district. From the listing sheet you uploaded, never a guess." },
      { icon: Route, title: "Qualifying, politely", body: "Budget, timeline, pre-approval, and whether they have a home to sell first." },
      { icon: KeyRound, title: "Showings, booked", body: "Straight onto the right agent’s calendar, with the details sent to the buyer." },
    ],
    tools: ["HubSpot", "Salesforce", "Pipedrive", "Google Calendar", "Calendly", "DocuSign"],
    after: {
      name: "Priya Shah", initials: "PS", meta: "Outbound call · 3:37 · 4:02 PM", status: "Showing booked",
      summary: "Buyer for 14 Alder Lane. Budget up to $650k, pre-approved, looking to move within 60 days. Showing Friday 5:30 PM with Maya.",
      did: [["HubSpot", "Created the contact and a deal"], ["Google Calendar", "Booked Maya, Fri 5:30 PM"], ["Gmail", "Sent the address and details"]],
    },
  },
  {
    id: "professional",
    name: "Professional services",
    icon: Briefcase,
    headline: "Every new client, taken in properly.",
    lead: "Accountants, law firms, agencies and consultancies. Your hours are what you sell. Veyra takes intake, books consults and answers billing questions, so you only pick up for the work.",
    quote: "I got a letter from the IRS.",
    calls: [
      { icon: UserPlus, title: "New client intake", body: "Your intake questions, asked the same way every time. The answers land on the contact before the consult." },
      { icon: CalendarCheck, title: "Consults, booked", body: "On the right person’s calendar, by practice area and the length of meeting you set." },
      { icon: Route, title: "The right person", body: "“Who handles payroll?” It routes by your team list, or takes a message with everything they need." },
      { icon: ReceiptText, title: "Billing questions", body: "It looks up the invoice and can send a payment link, so the office doesn’t chase." },
    ],
    tools: ["Outlook", "Microsoft Teams", "HubSpot", "QuickBooks", "Stripe", "DocuSign"],
    after: {
      name: "Daniel Reyes", initials: "DR", meta: "Call · 3:05 · 9:12 AM", status: "Consult booked",
      summary: "Prospective client, personal return. Received an IRS letter about last year’s return. 30-minute consult Wednesday 11:00 AM with Hannah.",
      did: [["HubSpot", "Created the contact, stage New client"], ["Outlook", "Booked Hannah, Wed 11:00 AM"], ["Outlook", "Emailed the intake form"]],
    },
    guard: { title: "It takes the question. You give the advice.", body: "It never gives legal, tax or financial advice. It gathers the facts, books the person who does, and says so plainly to the caller." },
  },
];

const byId = (id: IndustryId) => INDUSTRIES.find((i) => i.id === id)!;

/* a day of calls on one home-services line; each card is one call */
const DAY: { time: string; quote: string; did: string; tool: string | null; outcome: string; soon?: boolean }[] = [
  { time: "6:52 AM", quote: "No hot water since this morning.", did: "Asked the three questions you set for water heaters, then booked the first open window.", tool: "Google Calendar", outcome: "Booked, today 12 to 3" },
  { time: "9:15 AM", quote: "How much is a drain cleaning?", did: "Quoted the price from your price sheet, word for word, and booked Thursday.", tool: "Google Sheets", outcome: "Quoted and booked" },
  { time: "12:40 PM", quote: "Can you push me to next week?", did: "Found the visit by the caller’s number, offered two windows and moved it.", tool: "Google Calendar", outcome: "Rescheduled" },
  { time: "3:05 PM", quote: "I think I was charged twice.", did: "Found the invoice, didn’t promise a refund, and opened a billing ticket for the office.", tool: "QuickBooks", outcome: "Ticket for the office" },
  { time: "6:30 PM", quote: "Do you come out to Skokie?", did: "Checked your service area. Skokie isn’t in it, so it said so, kindly, and noted the call.", tool: null, outcome: "Answered from your area list" },
  { time: "11:48 PM", quote: "Water is coming through the ceiling.", did: "Talked them to the shut-off valve, posted to #on-call and transferred to Dev with a brief.", tool: "Slack", outcome: "Warm transfer", soon: true },
];

const LEAD_STEPS: { icon: LucideIcon; time: string; title: string; body: string; soon?: boolean }[] = [
  { icon: Inbox, time: "4:02 PM", title: "A lead comes in", body: "Priya asks about 14 Alder Lane on your website." },
  { icon: PhoneOutgoing, time: "4:02 PM", title: "Veyra calls her back", body: "By name, about that home, while the listing is still on her screen.", soon: true },
  { icon: CalendarCheck, time: "4:06 PM", title: "The showing is booked", body: "On Maya’s calendar, in your CRM, and in Priya’s inbox." },
];

/* ── pieces ─────────────────────────────────────────────────────────── */

function IndustryHeader({ ind }: { ind: Industry }) {
  return (
    <div className="max-w-[860px]">
      <Reveal variant="blur" className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.12)", color: "var(--mk-ember)" }}><ind.icon size={22} /></span>
        <p className="mk-eyebrow">{ind.name}</p>
      </Reveal>
      <Reveal delay={80}><h2 className="mk-h1 mt-5">{ind.headline}</h2></Reveal>
      <Reveal delay={160}><p className="mk-lead mt-6 max-w-[48ch]">{ind.lead}</p></Reveal>
    </div>
  );
}

/** The phone playing this industry's call, beside the four calls it gets most. */
function IndustryStage({ ind, flip = false }: { ind: Industry; flip?: boolean }) {
  return (
    <div className={`mt-16 grid grid-cols-1 items-center gap-14 lg:mt-20 lg:gap-20 ${flip ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"}`}>
      <div className={`relative flex justify-center ${flip ? "lg:order-2" : ""}`}>
        <div aria-hidden="true" className="mk-breathe absolute left-1/2 top-1/2 size-[min(460px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "var(--mk-glow)", filter: "blur(50px)", opacity: 0.45 }} />
        <Parallax speed={0.1} className="relative">
          <Reveal variant="zoom" className="w-[min(290px,70vw)] lg:w-[330px]">
            <PhoneFrame width="100%"><IndustryCall industry={ind.id} /></PhoneFrame>
          </Reveal>
        </Parallax>
      </div>
      <div>
        <Reveal><p className="mk-kicker">The calls it gets</p></Reveal>
        <Stagger className="mt-6 grid gap-x-10 gap-y-9 sm:grid-cols-2" step={110}>
          {ind.calls.map((c) => (
            <div key={c.title} className="border-t border-[var(--mk-line)] pt-6">
              <div className="flex items-center justify-between gap-3"><c.icon size={26} className="text-[var(--mk-ember)]" />{c.soon && <Soon />}</div>
              <h3 className="mk-h4 mt-4">{c.title}</h3>
              <p className="mk-body mt-2">{c.body}</p>
            </div>
          ))}
        </Stagger>
      </div>
    </div>
  );
}

/** What the team finds in Desk afterwards: a faithful miniature of a finished call. */
function AfterCall({ after }: { after: Industry["after"] }) {
  return (
    <div className="mk-card flex h-full flex-col p-7 sm:p-9">
      <p className="mk-kicker">What your team sees in Desk</p>
      {/* the status wraps under the name when the card is narrow */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full font-semibold" style={{ background: "rgba(233,107,52,0.14)", color: "var(--mk-ember-deep)" }}>{after.initials}</span>
        <div className="min-w-0 grow basis-[180px]">
          <p className="mk-h4 truncate">{after.name}</p>
          <p className="mk-small">{after.meta}</p>
        </div>
        <span className="mk-pill mk-pill--ember shrink-0">{after.status}</span>
      </div>
      <p className="mk-body mt-6">{after.summary}</p>
      <ul className="mt-6 flex flex-col gap-3 border-t border-[var(--mk-line)] pt-6">
        {after.did.map(([tool, text], i) => (
          <li key={i} className="flex items-center gap-3">
            <LogoTile partner={logo(tool)} size={34} />
            <span className="mk-body min-w-0 flex-1">{text}</span>
            <Check size={18} className="shrink-0 text-[var(--mk-mint)]" />
          </li>
        ))}
      </ul>
      {after.flag && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(233,107,52,0.08)" }}>
          <CircleAlert size={20} className="mt-0.5 shrink-0 text-[var(--mk-ember)]" />
          <p className="mk-small" style={{ color: "var(--mk-ink-2)" }}>{after.flag}</p>
        </div>
      )}
    </div>
  );
}

/** The tools this industry runs, as big app icons. */
function WorksIn({ ind }: { ind: Industry }) {
  return (
    <div className="mk-card flex h-full flex-col p-7 sm:p-9">
      <p className="mk-kicker">Works in</p>
      <h3 className="mk-h3 mt-3 max-w-[20ch]">The tools you already run for {ind.name.toLowerCase()}.</h3>
      <Stagger className="mt-8 grid grid-cols-3 justify-items-center gap-x-3 gap-y-7" step={70}>
        {ind.tools.map((t) => (
          <figure key={t} className="flex flex-col items-center gap-3">
            <LogoTile partner={logo(t)} size={84} />
            <figcaption className="mk-small text-center">{t}</figcaption>
          </figure>
        ))}
      </Stagger>
      <p className="mk-small mt-auto pt-8">Using something else? <Link href="/integrations" className="mk-link">Reach it with a custom action <ChevronRight /></Link></p>
    </div>
  );
}

function Guard({ guard }: { guard: NonNullable<Industry["guard"]> }) {
  return (
    <Reveal className="mk-card mk-card--alt mt-6 flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:p-9">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: "rgba(63,216,160,0.14)", color: "var(--mk-mint)" }}><ShieldCheck size={28} /></span>
      <div>
        <h3 className="mk-h4">{guard.title}</h3>
        <p className="mk-body mt-1 max-w-[70ch]">{guard.body}</p>
      </div>
    </Reveal>
  );
}

function IndustryAfter({ ind }: { ind: Industry }) {
  return (
    <>
      <div className="mt-16 grid grid-cols-1 gap-6 lg:mt-24 lg:grid-cols-2">
        <Reveal variant="rise" className="h-full"><WorksIn ind={ind} /></Reveal>
        <Reveal variant="rise" delay={120} className="h-full"><AfterCall after={ind.after} /></Reveal>
      </div>
      {ind.guard && <Guard guard={ind.guard} />}
    </>
  );
}

/* ── page ───────────────────────────────────────────────────────────── */

export default function SolutionsPage() {
  const hs = byId("home-services");
  const hc = byId("healthcare");
  const re = byId("real-estate");
  const ps = byId("professional");

  return (
    <>
      {/* ── hero: four phones, four industries, four calls ───────────── */}
      <section className="relative overflow-hidden pt-16 pb-6 md:pt-24">
        <div className="mk-wrap text-center">
          <Reveal variant="blur"><p className="mk-eyebrow">Solutions</p></Reveal>
          <Reveal variant="rise" delay={80}><h1 className="mk-display mx-auto mt-3 max-w-[14ch]">Built around the calls you actually get.</h1></Reveal>
          <Reveal variant="rise" delay={180}>
            <p className="mk-lead mx-auto mt-6 max-w-[44ch]">A burst pipe at midnight. A patient moving a cleaning. A buyer asking about a listing. One agent learns your business and handles each the way you would.</p>
          </Reveal>
          <Reveal variant="rise" delay={280} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started</a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Request a demo</a>
          </Reveal>
          <Reveal variant="fade" delay={360} className="mt-8"><ChannelStatus /></Reveal>
        </div>
        {/* four phones at two depths: the inner pair drifts faster than the outer */}
        <div className="mk-wrap mk-wrap--wide mt-8 grid grid-cols-2 items-start gap-4 pt-12 pb-16 sm:gap-6 lg:grid-cols-4 lg:gap-10">
          {INDUSTRIES.map((ind, i) => (
            <Parallax key={ind.id} speed={i === 1 || i === 2 ? 0.16 : 0.06} className={i > 1 ? "max-lg:hidden" : ""}>
              <a href={`#${ind.id}`} className="group flex flex-col items-center gap-5">
                <Reveal variant="pop" delay={i * 120} className="w-full max-w-[280px]">
                  <PhoneFrame width="100%" className="transition-transform duration-500 group-hover:-translate-y-2"><IndustryCall industry={ind.id} /></PhoneFrame>
                </Reveal>
                <span className="mk-body mk-strong inline-flex items-center gap-1">{ind.name} <ChevronRight size={16} className="text-[var(--mk-ink-3)]" /></span>
              </a>
            </Parallax>
          ))}
        </div>
      </section>

      {/* ── the four industries, picked in one tap ───────────────────── */}
      <section className="mk-section mk-alt">
        <div className="mk-wrap">
          <div className="mb-12 max-w-[760px]">
            <Reveal><p className="mk-eyebrow">Four industries, one agent</p></Reveal>
            <Reveal delay={80}><h2 className="mk-h1 mt-2">Different calls. The same care.</h2></Reveal>
          </div>
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" step={110}>
            {INDUSTRIES.map((ind) => (
              <a key={ind.id} href={`#${ind.id}`} className="mk-card mk-card-lift flex min-h-[260px] flex-col p-8 sm:min-h-[340px]">
                <span className="flex size-16 items-center justify-center rounded-2xl" style={{ background: "rgba(233,107,52,0.1)", color: "var(--mk-ember)" }}><ind.icon size={30} /></span>
                <h3 className="mk-h3 mt-8">{ind.name}</h3>
                <p className="mk-body mt-3">“{ind.quote}”</p>
                <span className="mk-link mt-auto pt-8">See the call <ChevronRight /></span>
              </a>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── home services: a night band with a day of calls ──────────── */}
      <section id="home-services" className="mk-night scroll-mt-[52px]">
        <div className="mk-wrap pt-[clamp(88px,12vw,168px)]">
          <IndustryHeader ind={hs} />
          <IndustryStage ind={hs} />
        </div>
        <div className="mt-[clamp(88px,10vw,140px)]">
          <HorizontalScroll
            header={
              <div className="mk-wrap mb-8 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="mk-eyebrow">One line, one day</p>
                  <h3 className="mk-h2 mt-2 max-w-[16ch]">Six calls you’d otherwise miss.</h3>
                </div>
                <p className="mk-body max-w-[36ch]">From before the office opens to long after it closes, each call ends with something done, or with the right person on the line.</p>
              </div>
            }
          >
            {DAY.map((d) => (
              <article key={d.time} className="mk-card flex shrink-0 flex-col p-8" style={{ width: "min(380px, 80vw)", height: "min(470px, calc(100svh - 330px))", minHeight: 380 }}>
                <div className="flex items-center justify-between gap-3"><p className="mk-kicker">{d.time}</p>{d.soon && <Soon />}</div>
                <h4 className="mk-h3 mt-4">“{d.quote}”</h4>
                <p className="mk-body mt-4">{d.did}</p>
                <div className="mt-auto flex items-center gap-4 border-t border-[var(--mk-line)] pt-5">
                  {d.tool ? (
                    <LogoTile partner={logo(d.tool)} size={48} />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-[24%]" style={{ background: "rgba(233,107,52,0.14)", color: "var(--mk-ember-soft)" }}><BookOpen size={22} /></span>
                  )}
                  <div className="min-w-0">
                    <p className="mk-body mk-strong">{d.outcome}</p>
                    <p className="mk-small">{d.tool ?? "Your knowledge"}</p>
                  </div>
                </div>
              </article>
            ))}
          </HorizontalScroll>
        </div>
        <div className="mk-wrap pb-[clamp(88px,12vw,168px)]">
          <IndustryAfter ind={hs} />
        </div>
      </section>

      {/* ── healthcare ───────────────────────────────────────────────── */}
      <section id="healthcare" className="mk-section scroll-mt-[52px] overflow-hidden">
        <div className="mk-wrap">
          <IndustryHeader ind={hc} />
          <IndustryStage ind={hc} flip />
          <IndustryAfter ind={hc} />
        </div>
      </section>

      {/* ── real estate: speed to lead ───────────────────────────────── */}
      <section id="real-estate" className="mk-section mk-alt scroll-mt-[52px] overflow-hidden">
        <div className="mk-wrap">
          <IndustryHeader ind={re} />
          <Stagger className="relative mt-14 grid gap-5 md:grid-cols-3" step={160}>
            {LEAD_STEPS.map((s, i) => (
              <div key={s.title} className="mk-card flex flex-col p-7">
                <div className="flex items-center justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: i === 1 ? "var(--mk-ember)" : "rgba(233,107,52,0.1)", color: i === 1 ? "#fff" : "var(--mk-ember)" }}><s.icon size={22} /></span>
                  <span className="mk-pill tabular-nums">{s.time}</span>
                </div>
                <h3 className="mk-h4 mt-6">{s.title}{s.soon && <Soon inline />}</h3>
                <p className="mk-body mt-2">{s.body}</p>
              </div>
            ))}
          </Stagger>
          <IndustryStage ind={re} />
          <IndustryAfter ind={re} />
        </div>
      </section>

      {/* ── professional services ────────────────────────────────────── */}
      <section id="professional" className="mk-night mk-section scroll-mt-[52px] overflow-hidden">
        <div className="mk-wrap">
          <IndustryHeader ind={ps} />
          <IndustryStage ind={ps} flip />
          <IndustryAfter ind={ps} />
        </div>
      </section>

      {/* ── underneath: the same agent ───────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-wrap--text mk-wrap">
          <TextReveal className="mk-h2" text="Underneath every industry is the same agent. You give it your knowledge, your tools and your rules. It shows up the same way on every line." />
        </div>
        <Stagger className="mk-wrap mt-24 grid gap-12 text-center sm:grid-cols-2 lg:grid-cols-4" step={120}>
          {[
            [<><span key="lt" className="align-top text-[0.55em]">&lt;</span><CountUp to={1.2} decimals={1} suffix="s" /></>, "Voice to voice, the target every call is measured against"],
            [<CountUp key="l" to={8} />, "Languages in Studio, each with its own voice"],
            [<CountUp key="a" to={1500} suffix="+" />, "Apps it can work in, one sign-in each"],
            [<CountUp key="c" to={100} suffix="+" />, "Countries you can call and answer", true],
          ].map(([fig, label, soon], i) => (
            <div key={i}>
              <div className="mk-h1">{fig}</div>
              <p className="mk-body mx-auto mt-3 max-w-[22ch]">{label}</p>
              {soon && <Soon className="mt-3" />}
            </div>
          ))}
        </Stagger>
        <div className="mt-24">
          <Reveal variant="fade"><p className="mk-small mb-8 text-center">Some of the tools these teams connect</p></Reveal>
          <Marquee duration={70} gap={28}>
            {APPS.map((p) => <LogoTile key={p.name} partner={p} size={104} />)}
          </Marquee>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="mk-section mk-alt relative overflow-hidden">
        <div className="mk-wrap relative text-center">
          <Reveal variant="zoom" className="mb-10 flex justify-center"><VoiceOrb size={180} /></Reveal>
          <Reveal><h2 className="mk-display mx-auto max-w-[14ch]">Tell it your business.</h2></Reveal>
          <Reveal delay={100}><p className="mk-lead mx-auto mt-6 max-w-[40ch]">Describe what you do in plain English. Veyra drafts the first skills from it. You review them, turn them on, and it picks up.</p></Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started <ArrowRight /></a>
            <a href={DEMO_URL} {...demoProps} className="mk-btn mk-btn--ghost">Talk to our team</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
