import { AudioLines, Mail, MessageSquare, MessagesSquare, Phone, Smartphone, type LucideIcon } from "lucide-react";

/* "Coming soon": the one tag for anything described on the site that the
   product cannot do yet. Styled in site.css (.mk-soon), readable on light,
   alt and night bands. Never attach a date to it. When something ships,
   delete its tag here or at the call site; do not leave a stale one. */

/**
 * The tag itself. `inline` follows text (a heading, a list item): a
 * no-break space binds it to the last word, so when the line wraps the word
 * and the tag move down together instead of leaving the tag alone.
 */
export function Soon({ inline = false, className = "" }: { inline?: boolean; className?: string }) {
  const tag = <span className={`mk-soon${inline ? " mk-soon--inline" : ""}${className ? ` ${className}` : ""}`}>Coming soon</span>;
  return inline ? <>{" "}{tag}</> : tag;
}

/* Where customers can reach the agent today, and what is still coming.
   One list so every page tells the same story. */
const CHANNELS: { icon: LucideIcon; label: string; live: boolean }[] = [
  { icon: AudioLines, label: "Voice in the browser", live: true },
  { icon: MessagesSquare, label: "Chat", live: true },
  { icon: Phone, label: "Phone calls", live: false },
  { icon: MessageSquare, label: "Texts", live: false },
  { icon: Mail, label: "Email", live: false },
];

/** The channel list with each one's status: live ones plain, the rest tagged. */
export function ChannelStatus({ align = "center", className = "" }: { align?: "center" | "start"; className?: string }) {
  return (
    <ul className={`mk-channels${align === "center" ? " mk-channels--center" : ""}${className ? ` ${className}` : ""}`} aria-label="Channels">
      {CHANNELS.map((c) => (
        <li key={c.label} data-live={c.live}>
          <c.icon aria-hidden="true" />
          {c.label}
          {!c.live && <Soon />}
        </li>
      ))}
    </ul>
  );
}

/** The mobile app announcement: a quiet chip, for the home page hero. */
export function MobileAppSoon({ className = "" }: { className?: string }) {
  return (
    <p className={`mk-announce${className ? ` ${className}` : ""}`}>
      <Smartphone aria-hidden="true" />
      <span>Veyra mobile app</span>
      <Soon />
    </p>
  );
}
