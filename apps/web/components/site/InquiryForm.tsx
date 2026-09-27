"use client";

/* The site's one form, used by /contact and /start.

   Posts to the desk's public lead-intake endpoint, so every submission lands
   in Veyra Desk as a contact + lead + ticket — the product handling its own
   front door. Carries the packet's rules: five visible fields maximum, a
   honeypot the server drops silently, a designed error state that names the
   recovery and loses nothing, and the response-time promise stated under the
   button. */

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Send } from "lucide-react";
import { Spinner } from "@/components/ui";
import { API_URL } from "@/lib/api";

type Status = "idle" | "sending" | "sent" | "error";

export function InquiryForm({
  topics,
  defaultTopic = "",
  messageLabel = "What are you building?",
  messagePlaceholder = "A voice agent that books appointments and answers billing questions after hours.",
  submitLabel = "Send message",
  successTitle = "Thanks — we will be in touch.",
  showPhone = false,
}: {
  /** when given, renders the demo-focus dropdown and files its value as the topic */
  topics?: string[];
  defaultTopic?: string;
  messageLabel?: string;
  messagePlaceholder?: string;
  submitLabel?: string;
  successTitle?: string;
  showPhone?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState(defaultTopic || (topics ? topics[0] : ""));
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");

  const sending = status === "sending";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/api/desk/leads/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company,
          phone,
          topic,
          message,
          source: "form",
          website: trap,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <span className="check-sq" style={{ width: 44, height: 44, borderRadius: "var(--radius-md)" }}>
          <Check size={22} strokeWidth={2.4} />
        </span>
        <h2 className="mt-6 text-[24px]" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
          {successTitle}
        </h2>
        <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Your note is in our inbox — filed by the same system we sell. Expect a reply within one
          business day, from a real person who has read it.
        </p>
        <Link href="/" className="btn-mint mt-8">
          Back to site
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={sending}>
      <div className="mb-5">
        <label className="field-label" htmlFor="inq-name">Name</label>
        <input id="inq-name" name="name" className="field" type="text" autoComplete="name"
          placeholder="Jordan Rivera" required disabled={sending}
          value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="mb-5">
        <label className="field-label" htmlFor="inq-email">Work email</label>
        <input id="inq-email" name="email" className="field" type="email" autoComplete="email"
          placeholder="jordan@company.com" required disabled={sending}
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="mb-5">
        <label className="field-label" htmlFor="inq-company">
          Company <span style={{ color: "var(--text-tertiary)" }}>(optional)</span>
        </label>
        <input id="inq-company" name="company" className="field" type="text" autoComplete="organization"
          placeholder="Acme Inc." disabled={sending}
          value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>

      {showPhone && (
        <div className="mb-5">
          <label className="field-label" htmlFor="inq-phone">
            Phone <span style={{ color: "var(--text-tertiary)" }}>(optional)</span>
          </label>
          <input id="inq-phone" name="phone" className="field" type="tel" autoComplete="tel"
            placeholder="+1 (555) 010-0199" disabled={sending}
            value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      )}

      {topics && (
        <div className="mb-5">
          <label className="field-label" htmlFor="inq-topic">What should the demo focus on?</label>
          <span className="field-wrap block">
            <select id="inq-topic" name="topic" className="field" disabled={sending}
              value={topic} onChange={(e) => setTopic(e.target.value)}>
              {topics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={15} className="chev" />
          </span>
        </div>
      )}

      <div className="mb-7">
        <label className="field-label" htmlFor="inq-message">{messageLabel}</label>
        <textarea id="inq-message" name="message" className="field" rows={4}
          placeholder={messagePlaceholder} disabled={sending}
          value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      {/* honeypot — hidden from people, filled by bots, dropped by the server */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="inq-website">Website</label>
        <input id="inq-website" name="website" type="text" tabIndex={-1} autoComplete="off"
          value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      {status === "error" && (
        <div className="form-error mb-5" role="alert">
          <AlertTriangle size={15} />
          <span>
            We couldn&rsquo;t send that. Nothing was lost — your message is still here. Try again,
            or email <a href="mailto:trazzaq744@gmail.com" style={{ color: "var(--accent-text)" }}>trazzaq744@gmail.com</a> directly.
          </span>
        </div>
      )}

      <button type="submit" className="btn-ember w-full" disabled={sending}>
        {sending ? (
          <>
            <Spinner size={14} /> Sending
          </>
        ) : (
          <>
            <Send size={14} /> {submitLabel}
          </>
        )}
      </button>

      <p className="mt-4 text-center text-[12.5px]" style={{ color: "var(--text-tertiary)" }}>
        We reply within one business day. No lists, no noise.
      </p>
    </form>
  );
}
