import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* Security / trust — control rows on hairlines, the credentials guarantee
   as a console panel, and the failure-direction posture. */

const TRUST: { tag: string; title: string; body: string }[] = [
  {
    tag: "keys",
    title: "Credentials stay server-side",
    body: "API keys and OAuth tokens live on the server, encrypted at rest. They are never sent to the browser, and your customers never touch them. The agent acts with them; nobody sees them.",
  },
  {
    tag: "approval",
    title: "Approval before anything goes live",
    body: "Nothing the deep agent builds ships on its own. You review the workflows, the voice, and the knowledge, and not a single call can land until you approve it.",
  },
  {
    tag: "webhooks",
    title: "Signed and verified webhooks",
    body: "Every inbound event is signed and checked before it reaches your agent, so whatever triggers an action is provably from where it claims to be.",
  },
  {
    tag: "data",
    title: "You own your data",
    body: "We do not train on your conversations or sell your data. Your knowledge, transcripts, and customer records stay yours, and you can export or delete them.",
  },
  {
    tag: "transit",
    title: "Encrypted at the provider",
    body: "Calls run on carrier-grade infrastructure with encryption in transit at the provider level, handled by the same vendors that power regulated contact centers.",
  },
  {
    tag: "scope",
    title: "Least-privilege access",
    body: "Each tool connects with only the permissions it needs. Revoke a connection in one click and the agent loses that access immediately.",
  },
];

const RELIABILITY: { title: string; body: string; metric: string }[] = [
  {
    title: "Degrade to safe",
    body: "When something breaks, Vera falls back to a human or a callback. It never invents a policy just to fill the silence.",
    metric: "human fallback",
  },
  {
    title: "Provider failover",
    body: "If a voice or model provider degrades mid-call, Vera fails over automatically, so the caller hears a voice, not dead air.",
    metric: "mid-call",
  },
  {
    title: "Grounded, never guessing",
    body: "The agent answers from your knowledge or it says it does not know. A confident wrong answer is treated as a failure, not a feature.",
    metric: "no improvising",
  },
  {
    title: "Warm handoffs, always",
    body: "Transfers carry context, and a busy or failed target falls back to a callback instead of stranding the caller on hold.",
    metric: "context carried",
  },
];

export default function SecurityPage() {
  return (
    <>
      {/* ── hero ── */}
      <section className="band" style={{ paddingTop: "clamp(4rem, 8vw, 6.5rem)" }}>
        <div className="wrap">
          <div style={{ maxWidth: 780 }}>
            <h1 className="display-hero" style={{ textWrap: "balance" }}>
              Trusted with your calls, your data, and your customers.
            </h1>
            <p className="lead-lg mt-7 max-w-[56ch]">
              Vera runs on infrastructure you can put in front of real customers. Credentials stay
              server-side, nothing ships without your approval, and every action the agent takes
              is scoped, signed, and logged.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/contact" className="btn-ember">
                Talk to us <ArrowRight />
              </Link>
              <Link href="/signup" className="btn-mint">
                Start building free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── controls ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[22ch]">The boring parts, taken seriously.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            You are putting Vera in front of real customers, so the controls are not an add-on.
            They are how the platform is built.
          </p>
          <div className="rows mt-12">
            {TRUST.map((t) => (
              <div key={t.tag} className="row">
                <span className="row__tag">{t.tag}</span>
                <span>
                  <span className="row__title">{t.title}</span>
                  <span className="row__body block" style={{ maxWidth: "70ch" }}>{t.body}</span>
                </span>
                <span />
              </div>
            ))}
          </div>

          <div className="console mt-10">
            <div className="console__bar">
              <span className="console__dot" />
              credentials — the guarantee
            </div>
            <div className="console__body">
              <p className="lead" style={{ maxWidth: "70ch" }}>
                Credentials never touch the browser. The agent holds your keys server-side and
                acts on your behalf, so a token cannot leak from a page, a device, or a customer's
                session. You connect a tool once; Vera does the rest without exposing the secret.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── reliability posture ── */}
      <section className="band band--line">
        <div className="wrap">
          <h2 className="section-title max-w-[24ch]">Built to fail in the right direction.</h2>
          <p className="lead mt-5 max-w-[58ch]">
            Trust is not only who can see your data — it is how the agent behaves when a call, a
            provider, or a tool goes sideways.
          </p>
          <div className="rows mt-12">
            {RELIABILITY.map((r) => (
              <div key={r.title} className="row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>
                  <span className="row__title">{r.title}</span>
                  <span className="row__body block">{r.body}</span>
                </span>
                <span className="row__metric">{r.metric}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── close ── */}
      <section className="band band--line">
        <div className="wrap-tight text-center">
          <h2 className="section-title mx-auto max-w-[22ch]">
            Put it in front of your customers with confidence.
          </h2>
          <p className="lead mx-auto mt-5 max-w-[48ch]">
            Start building on a platform that keeps your credentials, your data, and your callers
            safe by default. Have a security review team? We will walk them through it.
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
