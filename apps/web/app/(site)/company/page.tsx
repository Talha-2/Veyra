import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* Company — why Vera exists, how we build, what it runs on. Story in light
   type, principles as hairline rows, the stack as a quiet strip. */

const STACK = ["LiveKit", "Deepgram", "Cartesia", "OpenAI", "Composio", "ElevenLabs", "Twilio"];

const PRINCIPLES: { tag: string; title: string; body: string }[] = [
  {
    tag: "p95",
    title: "p95 is the product",
    body: "We design for the worst calls, not the median. Hold up at the ninety-fifth percentile and the easy calls take care of themselves.",
  },
  {
    tag: "grounded",
    title: "Grounded, never guessing",
    body: "The agent answers from your knowledge or it tells the caller it does not know. A confident wrong answer is worse than an honest gap.",
  },
  {
    tag: "safe",
    title: "Degrade to safe",
    body: "When something breaks, we fall back to a human or a callback. The agent never invents a policy just to fill the silence.",
  },
  {
    tag: "one brain",
    title: "One brain, every channel",
    body: "Voice, chat, phone, and messaging run on one grounded agent with the same knowledge and tools. No channel gets a weaker version.",
  },
  {
    tag: "real",
    title: "Ship real features",
    body: "Everything we build works end to end. No dummy mimics, no screens that only look finished long enough for a screenshot.",
  },
  {
    tag: "failure",
    title: "Own the failure modes",
    body: "Barge-in, provider failover, warm transfers, and multilingual turn-taking are core concerns here, not extras we bolt on later.",
  },
];

export default function CompanyPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 8vw, 6.5rem)" }}>
        <div className="wrap">
          <div style={{ maxWidth: 780 }}>
            <h1 className="display-hero" style={{ textWrap: "balance" }}>
              We are building the agent that actually picks up.
            </h1>
            <p className="lead-lg mt-7 max-w-[56ch]">
              Most AI voice agents demo beautifully and fall apart on the first real call. Vera is
              built for the callers that break demos: grounded, sub-second, and reliable under
              conditions no scripted demo will ever show you.
            </p>
          </div>
        </div>
      </section>

      {/* ── why ── */}
      <section className="band band--line">
        <div className="wrap-tight">
          <h2 className="section-title max-w-[16ch]">Why Vera exists.</h2>
          <p className="lead-lg mt-8">
            We started Vera because the distance between a great voice demo and a voice agent you
            would put on your main line is enormous. The demo answers one clean question in a
            quiet room. The real line brings accents, background noise, people who talk over you,
            and the occasional provider outage at the worst possible moment.
          </p>
          <p className="lead-lg mt-6">
            So we build for the p95, not the p50. The median call was never the hard part. The
            product is what happens when a call goes sideways: the barge-in that stops mid-word,
            the synthesis that fails over before the caller hears silence, the honest{" "}
            <span style={{ color: "var(--accent)" }}>&ldquo;I don&rsquo;t know&rdquo;</span>{" "}
            instead of a confident wrong answer. One grounded brain runs across voice, chat,
            phone, and messaging, so the agent behaves the same everywhere your customers reach
            you.
          </p>
        </div>
      </section>

      {/* ── principles ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[14ch]">How we build.</h2>
          <p className="lead mt-5 max-w-[54ch]">
            A short list of the things we refuse to compromise on. They show up in the code, not
            just the pitch.
          </p>
          <div className="rows mt-12">
            {PRINCIPLES.map((p) => (
              <div key={p.tag} className="row">
                <span className="row__tag">{p.tag}</span>
                <span>
                  <span className="row__title">{p.title}</span>
                  <span className="row__body block" style={{ maxWidth: "70ch" }}>{p.body}</span>
                </span>
                <span />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── the stack ── */}
      <section className="band-sm band--line">
        <div className="wrap">
          <div className="logo-strip">
            <span className="mono-tag mono-tag--dim">Runs on</span>
            {STACK.map((name) => (
              <b key={name}>{name}</b>
            ))}
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[20ch]">
            Come build the agent that picks up.
          </h2>
          <p className="lead mx-auto mt-5 max-w-[46ch]">
            If reliability over flash sounds like your kind of engineering, we should talk. Start
            building today, or tell us about the calls that keep breaking.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/contact" className="btn-ember">
              Talk to us <ArrowRight />
            </Link>
            <Link href="/signup" className="btn-mint">
              Start building free
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
