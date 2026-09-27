import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Contents } from "@/components/mk/company-parts";
import { Reveal } from "@/components/mk/motion";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Veyra collects, what it never does with your conversations, and how to export or delete your data.",
};

/* Legal prose, made to be read: one 760px column, 17px body, a contents
   list that stays in view on desktop, and no motion beyond the hero. The
   policy's words are unchanged from the previous page. Honest and current:
   no compliance certifications are claimed because none exist yet. */

const EMAIL = "trazzaq744@gmail.com";

/* the site resets link colour on every <a>, so the legal links carry theirs inline */
const LINK = { color: "var(--mk-ember-deep)", textDecoration: "underline", textDecorationThickness: 1, textUnderlineOffset: 4 } as const;
const mail = <a href={`mailto:${EMAIL}`} className="font-medium" style={LINK}>{EMAIL}</a>;

const SECTIONS: { id: string; label: string; title: string; body: React.ReactNode }[] = [
  {
    id: "what-we-collect",
    label: "What we collect",
    title: "Account and conversation data",
    body: (
      <>
        <p>
          To provide the service we store your account details (name, email, workspace settings)
          and the data your agents handle: call recordings and transcripts, messages, contacts,
          tickets, and the knowledge documents you upload. This is your operational data — it
          exists so your team can see and act on it in Veyra.
        </p>
        <p>
          Usage metering (voice minutes, messages, phone numbers) is recorded to bill at provider
          cost and to show you real-time usage in your dashboard.
        </p>
      </>
    ),
  },
  {
    id: "what-we-never-do",
    label: "What we never do",
    title: "Your conversations are not training data",
    body: (
      <p>
        We do not train models on your conversations. We do not sell your data. We do not share
        it with anyone except the infrastructure providers required to run the service, acting
        on our instructions.
      </p>
    ),
  },
  {
    id: "subprocessors",
    label: "Subprocessors",
    title: "The providers the service runs on",
    body: (
      <p>
        Calls, transcription, speech, and reasoning are processed by the infrastructure named on
        our site: LiveKit (real-time audio), Deepgram (speech-to-text), Cartesia and ElevenLabs
        (text-to-speech), OpenAI and xAI (language models), Composio (tool integrations), and
        Twilio (telephony). Each receives only what its role requires.
      </p>
    ),
  },
  {
    id: "your-controls",
    label: "Your controls",
    title: "Export and deletion",
    body: (
      <p>
        You can export your data or ask us to delete your workspace at any time by writing to{" "}
        {mail}. Deletion removes your account data and conversation history from our systems;
        provider-side logs expire on their own schedules.
      </p>
    ),
  },
  {
    id: "questions",
    label: "Questions",
    title: "Talk to a person",
    body: (
      <p>
        Privacy questions go to {mail} and are answered by the team that builds the product,
        within one business day.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <section className="pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="mk-wrap mk-wrap--text">
          <Reveal variant="rise">
            <p className="mk-eyebrow">Legal</p>
            <h1 className="mk-h1 mt-3">Privacy policy</h1>
            <p className="mk-small mt-5">Last updated August 2026</p>
            <p className="mk-lead mt-6 max-w-[40ch]">Written to be read. What we collect, what we never do, and the controls you keep.</p>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-[var(--mk-line)] pb-[clamp(88px,12vw,168px)]">
        <div className="mk-wrap grid gap-10 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,760px)_minmax(0,1fr)] lg:gap-0 lg:pt-16">
          <aside className="lg:pr-6">
            <div className="mk-wrap--text mx-auto lg:sticky lg:top-[calc(var(--mk-nav-h)+40px)] lg:mx-0"><Contents items={SECTIONS.map((s) => ({ id: s.id, title: s.label }))} /></div>
          </aside>
          <div className="min-w-0">
            {SECTIONS.map((s, i) => (
              <article key={s.id} id={s.id} className={`scroll-mt-[calc(var(--mk-nav-h)+32px)] py-10 ${i ? "border-t border-[var(--mk-line)]" : "pt-0"}`}>
                <p className="mk-kicker">{String(i + 1).padStart(2, "0")} · {s.label}</p>
                <h2 className="mk-h3 mt-3">{s.title}</h2>
                <div className="mk-body mt-5 flex flex-col gap-5">{s.body}</div>
              </article>
            ))}
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--mk-line)] pt-8">
              <Link href="/terms" className="mk-link">Read the terms of service <ChevronRight /></Link>
              <Link href="/security" className="mk-link">How we protect your data <ChevronRight /></Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
