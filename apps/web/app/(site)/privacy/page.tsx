import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Veyra",
  description:
    "What Veyra collects, what it never does with your conversations, and how to export or delete your data.",
};

/* Legal prose per packet delta D2: body type at readable measure, mono section
   labels, hairline separators, no cards, no decoration. Honest and current —
   no compliance certifications are claimed because none exist yet. */

const SECTIONS: { label: string; title: string; body: React.ReactNode }[] = [
  {
    label: "01 — what we collect",
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
    label: "02 — what we never do",
    title: "Your conversations are not training data",
    body: (
      <>
        <p>
          We do not train models on your conversations. We do not sell your data. We do not share
          it with anyone except the infrastructure providers required to run the service, acting
          on our instructions.
        </p>
      </>
    ),
  },
  {
    label: "03 — subprocessors",
    title: "The providers the service runs on",
    body: (
      <>
        <p>
          Calls, transcription, speech, and reasoning are processed by the infrastructure named on
          our site: LiveKit (real-time audio), Deepgram (speech-to-text), Cartesia and ElevenLabs
          (text-to-speech), OpenAI and xAI (language models), Composio (tool integrations), and
          Twilio (telephony). Each receives only what its role requires.
        </p>
      </>
    ),
  },
  {
    label: "04 — your controls",
    title: "Export and deletion",
    body: (
      <>
        <p>
          You can export your data or ask us to delete your workspace at any time by writing to{" "}
          <a href="mailto:dev@z360.biz" style={{ color: "var(--accent)" }}>dev@z360.biz</a>. Deletion
          removes your account data and conversation history from our systems; provider-side logs
          expire on their own schedules.
        </p>
      </>
    ),
  },
  {
    label: "05 — questions",
    title: "Talk to a person",
    body: (
      <p>
        Privacy questions go to{" "}
        <a href="mailto:dev@z360.biz" style={{ color: "var(--accent)" }}>dev@z360.biz</a> and are
        answered by the team that builds the product, within one business day.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <section className="band" style={{ paddingTop: "clamp(3.5rem, 7vw, 6rem)" }}>
      <div className="wrap" style={{ maxWidth: 760 }}>
        <h1 className="display-hero" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", textWrap: "balance" }}>
          Privacy policy
        </h1>
        <p className="mono-tag mono-tag--dim mt-4">Last updated — August 2026</p>
        <p className="lead mt-6 max-w-[52ch]">
          Written to be read. What we collect, what we never do, and the controls you keep.
        </p>

        <div className="mt-12">
          {SECTIONS.map((s) => (
            <div key={s.label} className="py-8" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="mono-tag" style={{ color: "var(--accent-text)" }}>{s.label}</p>
              <h2 className="mt-3 text-[20px]" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
                {s.title}
              </h2>
              <div className="legal-prose mt-4 flex flex-col gap-4 text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: "68ch" }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
