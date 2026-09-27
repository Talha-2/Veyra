"use client";

/* The site's one form, used by /contact and /start.

   Posts JSON to the app layer's public inquiry endpoint, so every request
   lands with the team in Veyra Desk. Four states, each designed:
   • idle: large fields, errors shown inline once a field has been left;
   • sending: the button says so and the fields lock;
   • sent: a check draws itself and says what happens next;
   • failed: nothing is lost, and the email address is one tap away. */

import { useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Loader2, Mail } from "lucide-react";

import { INQUIRY_ENDPOINT } from "./links";

export type Topic = "demo" | "sales" | "support" | "other";
type Field = "name" | "email" | "company" | "phone" | "topic" | "message";
type Status = "idle" | "sending" | "sent" | "failed";

/** The address the old contact and legal pages publish. */
const EMAIL = "trazzaq744@gmail.com";

const TOPICS: { value: Topic; label: string }[] = [
  { value: "demo", label: "Demo" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function check(field: Field, value: string): string | null {
  const v = value.trim();
  switch (field) {
    case "name":
      return v ? null : "Tell us your name.";
    case "email":
      if (!v) return "We need an email address to reply to.";
      return EMAIL_RE.test(v) ? null : "That email doesn’t look right. Check for a typo.";
    case "phone":
      return !v || v.replace(/\D/g, "").length >= 7 ? null : "That number looks short. Include the area code.";
    default:
      return null;
  }
}

/* The field look: a large, soft well that turns white with an Ember ring on focus.
   The app-wide `*:focus-visible` rule in globals.css is unlayered, so it beats
   these utilities: the field sets its radius inline and hands that rule its
   own ring through the --ring variable the rule reads. */
const FIELD =
  "block w-full border bg-[var(--mk-bg-alt)] px-5 text-[17px] leading-[1.4] text-[var(--mk-ink)] transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-[var(--mk-ink-3)] hover:border-[var(--mk-line-strong)] focus:bg-[var(--mk-card)] disabled:opacity-60";
const FIELD_OK = "border-transparent focus:border-[var(--mk-ember)] focus:shadow-[0_0_0_4px_rgba(233,107,52,0.18)]";
const FIELD_BAD = "border-red-500 bg-red-50/60 focus:border-red-500 focus:shadow-[0_0_0_4px_rgba(239,68,68,0.16)]";
const ring = (bad: boolean) => ({ borderRadius: 16, outline: "none", ["--ring" as string]: `0 0 0 4px ${bad ? "rgba(239,68,68,0.16)" : "rgba(233,107,52,0.18)"}` });

export function InquiryForm({
  page,
  topic: initialTopic = "demo",
  pickTopic = true,
  messageLabel = "How can we help?",
  messagePlaceholder = "We run a three-location clinic and miss calls every Monday morning.",
  submitLabel = "Send message",
  successTitle = "Message received.",
}: {
  /** the site path the request came from, filed with it */
  page: string;
  topic?: Topic;
  /** false keeps the topic fixed (the demo page) */
  pickTopic?: boolean;
  messageLabel?: string;
  messagePlaceholder?: string;
  submitLabel?: string;
  successTitle?: string;
}) {
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const [values, setValues] = useState({ name: "", email: "", company: "", phone: "", message: "" });
  const [topic, setTopic] = useState<Topic>(initialTopic);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const sending = status === "sending";

  function set(field: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    // once a field has been left, keep its message in step with what is typed
    if (touched[field] || errors[field]) setErrors((e) => ({ ...e, [field]: check(field, value) ?? undefined }));
    if (status === "failed") setStatus("idle");
  }

  function leave(field: keyof typeof values) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: check(field, values[field]) ?? undefined }));
  }

  function focusFirst(fields: Partial<Record<Field, string>>) {
    const first = (["name", "email", "company", "phone", "topic", "message"] as Field[]).find((f) => fields[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;

    const found: Partial<Record<Field, string>> = {};
    (["name", "email", "phone"] as const).forEach((f) => {
      const msg = check(f, values[f]);
      if (msg) found[f] = msg;
    });
    setTouched({ name: true, email: true, phone: true });
    setErrors(found);
    setNotice(null);
    if (Object.keys(found).length) {
      focusFirst(found);
      return;
    }

    setStatus("sending");
    const trim = (s: string) => s.trim() || undefined;
    try {
      const fields = {
        name: values.name.trim(),
        email: values.email.trim(),
        company: trim(values.company),
        phone: trim(values.phone),
        topic,
        message: trim(values.message),
      };
      // The Laravel app when it is configured; otherwise the old intake
      // endpoint, which takes the same fields plus a `source`.
      const res = await fetch(INQUIRY_ENDPOINT.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(INQUIRY_ENDPOINT.legacy ? { ...fields, source: "form", website: "" } : { ...fields, page }),
      });

      if (res.ok) {
        setStatus("sent");
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }

      if (res.status === 422) {
        const data = (await res.json().catch(() => null)) as { message?: string; errors?: Record<string, string[]> } | null;
        const server: Partial<Record<Field, string>> = {};
        const known: Field[] = ["name", "email", "company", "phone", "topic", "message"];
        let unplaced = false;
        for (const [key, list] of Object.entries(data?.errors ?? {})) {
          if (known.includes(key as Field) && list?.[0]) server[key as Field] = list[0];
          else unplaced = true;
        }
        setErrors(server);
        setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(server).map((k) => [k, true])) }));
        setNotice(unplaced || !Object.keys(server).length ? data?.message ?? "Some details need another look." : null);
        setStatus("idle");
        focusFirst(server);
        return;
      }

      setStatus("failed");
    } catch {
      setStatus("failed");
    }
  }

  function reset() {
    setValues({ name: "", email: "", company: "", phone: "", message: "" });
    setTopic(initialTopic);
    setErrors({});
    setTouched({});
    setNotice(null);
    setStatus("idle");
  }

  if (status === "sent") {
    const first = values.name.trim().split(/\s+/)[0];
    return (
      <div className="flex flex-col items-center py-8 text-center" aria-live="polite">
        <DrawnCheck />
        <h3 ref={doneRef} tabIndex={-1} className="mk-h3 mt-8" style={{ outline: "none" }}>{successTitle}</h3>
        <p className="mk-body mt-3 max-w-[34ch]">
          Thanks{first ? `, ${first}` : ""}. A person reads every message and replies within one business day, at{" "}
          <span className="mk-strong">{values.email.trim()}</span>.
        </p>
        <button type="button" onClick={reset} className="mk-btn mk-btn--ghost mt-8">Send another message</button>
      </div>
    );
  }

  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(topic === "demo" ? "Demo request" : "Question for Veyra")}&body=${encodeURIComponent(
    [values.message.trim(), "", values.name.trim(), values.company.trim(), values.phone.trim()].filter((l, i) => i < 2 || l).join("\n"),
  )}`;

  const fieldClass = (f: Field) => `${FIELD} ${errors[f] ? FIELD_BAD : FIELD_OK}`;
  const describe = (f: Field) => (errors[f] ? id(`${f}-error`) : undefined);

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={sending} className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Row label="Name" htmlFor={id("name")} error={errors.name} errorId={id("name-error")}>
          <input id={id("name")} name="name" type="text" autoComplete="name" placeholder="Jordan Rivera" required
            disabled={sending} value={values.name} onChange={(e) => set("name", e.target.value)} onBlur={() => leave("name")}
            aria-invalid={!!errors.name} aria-describedby={describe("name")} className={`${fieldClass("name")} h-14`} style={ring(!!errors.name)} />
        </Row>
        <Row label="Work email" htmlFor={id("email")} error={errors.email} errorId={id("email-error")}>
          <input id={id("email")} name="email" type="email" inputMode="email" autoComplete="email" placeholder="jordan@company.com" required
            disabled={sending} value={values.email} onChange={(e) => set("email", e.target.value)} onBlur={() => leave("email")}
            aria-invalid={!!errors.email} aria-describedby={describe("email")} className={`${fieldClass("email")} h-14`} style={ring(!!errors.email)} />
        </Row>
        <Row label="Company" optional htmlFor={id("company")} error={errors.company} errorId={id("company-error")}>
          <input id={id("company")} name="company" type="text" autoComplete="organization" placeholder="Northwind Services"
            disabled={sending} value={values.company} onChange={(e) => set("company", e.target.value)}
            aria-invalid={!!errors.company} aria-describedby={describe("company")} className={`${fieldClass("company")} h-14`} style={ring(!!errors.company)} />
        </Row>
        <Row label="Phone" optional htmlFor={id("phone")} error={errors.phone} errorId={id("phone-error")}>
          <input id={id("phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 312 555 0199"
            disabled={sending} value={values.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => leave("phone")}
            aria-invalid={!!errors.phone} aria-describedby={describe("phone")} className={`${fieldClass("phone")} h-14`} style={ring(!!errors.phone)} />
        </Row>
      </div>

      {pickTopic && (
        <fieldset disabled={sending}>
          <legend className="mb-3 text-[14px] font-medium text-[var(--mk-ink)]">What is it about?</legend>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="radiogroup" aria-describedby={describe("topic")}>
            {TOPICS.map((t) => {
              const on = topic === t.value;
              return (
                <label key={t.value}
                  className={`relative inline-flex h-12 cursor-pointer items-center justify-center rounded-full px-5 text-[17px] font-medium transition-[background-color,color,box-shadow] duration-200 has-[:focus-visible]:shadow-[0_0_0_4px_rgba(233,107,52,0.25)] ${on ? "bg-[var(--mk-ink)] text-[var(--mk-bg)]" : "bg-[var(--mk-bg-alt)] text-[var(--mk-ink-2)] hover:text-[var(--mk-ink)]"}`}>
                  <input type="radio" name="topic" value={t.value} checked={on} onChange={() => setTopic(t.value)} className="absolute inset-0 cursor-pointer opacity-0" style={{ outline: "none" }} />
                  {t.label}
                </label>
              );
            })}
          </div>
          {errors.topic && <FieldError id={id("topic-error")}>{errors.topic}</FieldError>}
        </fieldset>
      )}

      <Row label={messageLabel} optional htmlFor={id("message")} error={errors.message} errorId={id("message-error")}>
        <textarea id={id("message")} name="message" rows={5} placeholder={messagePlaceholder}
          disabled={sending} value={values.message} onChange={(e) => set("message", e.target.value)}
          aria-invalid={!!errors.message} aria-describedby={describe("message")} className={`${fieldClass("message")} min-h-[152px] resize-y py-4`} style={ring(!!errors.message)} />
      </Row>

      {notice && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50 px-5 py-4 text-[17px] leading-[1.45] text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      {status === "failed" && (
        <div role="alert" className="rounded-[20px] bg-[var(--mk-bg-alt)] p-5 sm:p-6" style={{ boxShadow: "inset 0 0 0 1.5px rgba(233,107,52,0.35)" }}>
          <div className="flex items-start gap-3">
            <AlertCircle size={22} className="mt-0.5 shrink-0 text-[var(--mk-ember)]" />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold text-[var(--mk-ink)]">We couldn’t send that. Email us instead.</p>
              <p className="mt-1 text-[17px] leading-[1.5] text-[var(--mk-ink-2)]">
                Your message is still here. Send it by email with one tap, or try the button again in a minute.
              </p>
              <a href={mailto} className="mk-link mt-3 break-all"><Mail size={16} /> {EMAIL}</a>
            </div>
          </div>
        </div>
      )}

      <div>
        <button type="submit" disabled={sending} className="mk-btn mk-btn--primary w-full disabled:cursor-wait" style={{ height: 56 }}>
          {sending ? <><Loader2 className="animate-spin" /> Sending</> : status === "failed" ? <>Try again</> : <>{submitLabel} <ArrowRight /></>}
        </button>
        <p className="mt-4 text-center text-[14px] text-[var(--mk-ink-3)]">A person reads every message. We reply within one business day.</p>
      </div>
    </form>
  );
}

function Row({ label, optional, htmlFor, error, errorId, children }: { label: string; optional?: boolean; htmlFor: string; error?: string; errorId: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-2 block text-[14px] font-medium text-[var(--mk-ink)]">
        {label}{optional && <span className="font-normal text-[var(--mk-ink-3)]"> (optional)</span>}
      </label>
      {children}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-red-600">
      <AlertCircle size={15} className="shrink-0" /> {children}
    </p>
  );
}

/** A circle that draws itself, then the tick. Final frame is the resting style,
    so reduced motion (which drops the animation) still shows the finished mark. */
function DrawnCheck() {
  return (
    <div className="relative" style={{ width: 96, height: 96 }} aria-hidden="true">
      <div className="absolute inset-0 rounded-full" style={{ background: "rgba(233,107,52,0.12)", animation: "mk-check-pop 700ms var(--mk-ease-spring) both" }} />
      <svg viewBox="0 0 96 96" className="relative h-full w-full">
        <circle cx="48" cy="48" r="44" fill="none" stroke="var(--mk-ember)" strokeWidth="3" strokeLinecap="round" strokeDasharray="277" strokeDashoffset="0"
          transform="rotate(-90 48 48)" style={{ animation: "mk-check-ring 700ms var(--mk-ease) both" }} />
        <path d="M30 49.5 l12 12 l24 -26" fill="none" stroke="var(--mk-ember)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="56" strokeDashoffset="0"
          style={{ animation: "mk-check-tick 450ms var(--mk-ease) 520ms both" }} />
      </svg>
      <style>{`
        @keyframes mk-check-ring { from { stroke-dashoffset: 277; } to { stroke-dashoffset: 0; } }
        @keyframes mk-check-tick { from { stroke-dashoffset: 56; } to { stroke-dashoffset: 0; } }
        @keyframes mk-check-pop { from { transform: scale(0.6); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
}
