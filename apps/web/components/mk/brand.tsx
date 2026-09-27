/* Veyra's mark and the partner-logo registry for the company site.

   The mark matches the app's: a graphite tile with five Ember amplitude
   bars. Partner logos are the vendors' own full-colour SVGs, served from
   /public/logos, so they stay sharp at any size. A partner without a real
   logo file renders as a typeset wordmark on the same tile — never a
   look-alike glyph. */

export function VeyraMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: "28%",
        background: "linear-gradient(145deg, #2c2c30, #0e0e10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 1px 2px rgba(0,0,0,0.2)",
      }}
      aria-hidden="true"
    >
      <svg width="58%" height="58%" viewBox="0 0 16 16">
        {[[2, 6, 10], [5, 3, 13], [8, 5, 11], [11, 2, 14], [14, 6, 10]].map(([x, y1, y2]) => (
          <line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke="#f07a45" strokeWidth="1.9" strokeLinecap="round" />
        ))}
      </svg>
    </span>
  );
}

export function VeyraLogo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <VeyraMark size={size} />
      <span style={{ fontSize: size * 0.72, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>Veyra</span>
    </span>
  );
}

export interface Partner {
  name: string;
  /** file under /public/logos/color, or null for a typeset wordmark */
  logo: string | null;
  kind: "voice" | "model" | "telephony" | "app";
}

export const PARTNERS: Partner[] = [
  { name: "OpenAI", logo: "openai", kind: "model" },
  { name: "LiveKit", logo: "livekit", kind: "voice" },
  { name: "Deepgram", logo: "deepgram", kind: "voice" },
  { name: "Cartesia", logo: null, kind: "voice" },
  { name: "ElevenLabs", logo: "elevenlabs", kind: "voice" },
  { name: "Groq", logo: null, kind: "model" },
  { name: "Twilio", logo: "twilio", kind: "telephony" },
  { name: "Telnyx", logo: "telnyx", kind: "telephony" },
  { name: "Composio", logo: "composio", kind: "app" },
  { name: "Langfuse", logo: "langfuse", kind: "model" },
];

export const APPS: Partner[] = [
  { name: "Gmail", logo: "gmail", kind: "app" },
  { name: "Google Calendar", logo: "googlecalendar", kind: "app" },
  { name: "Google Sheets", logo: "googlesheets", kind: "app" },
  { name: "Google Drive", logo: "googledrive", kind: "app" },
  { name: "Outlook", logo: "outlook", kind: "app" },
  { name: "Slack", logo: "slack", kind: "app" },
  { name: "HubSpot", logo: "hubspot", kind: "app" },
  { name: "Salesforce", logo: "salesforce", kind: "app" },
  { name: "Stripe", logo: "stripe", kind: "app" },
  { name: "Notion", logo: "notion", kind: "app" },
  { name: "Shopify", logo: "shopify", kind: "app" },
  { name: "Calendly", logo: "calendly", kind: "app" },
  { name: "WhatsApp", logo: "whatsapp", kind: "app" },
  { name: "Zendesk", logo: "zendesk", kind: "app" },
  { name: "Intercom", logo: "intercom", kind: "app" },
  { name: "Airtable", logo: "airtable", kind: "app" },
  { name: "QuickBooks", logo: "quickbooks", kind: "app" },
  { name: "Mailchimp", logo: "mailchimp", kind: "app" },
  { name: "Microsoft Teams", logo: "microsoft_teams", kind: "app" },
  { name: "Jira", logo: "jira", kind: "app" },
  { name: "Asana", logo: "asana", kind: "app" },
  { name: "Pipedrive", logo: "pipedrive", kind: "app" },
  { name: "Zoho", logo: "zoho", kind: "app" },
  { name: "Square", logo: "square", kind: "app" },
  { name: "DocuSign", logo: "docusign", kind: "app" },
  { name: "Dropbox", logo: "dropbox", kind: "app" },
  { name: "GitHub", logo: "github", kind: "app" },
  { name: "Linear", logo: "linear", kind: "app" },
  { name: "Discord", logo: "discord", kind: "app" },
];

/** A partner logo on a white app-icon tile. `size` is the tile edge in px. */
export function LogoTile({ partner, size = 88, width, className = "" }: { partner: Partner; size?: number; /** a CSS width that overrides `size`, e.g. "100%" */ width?: string; className?: string }) {
  return (
    <div className={`mk-logo-tile ${className}`} style={{ width: width ?? size, containerType: "inline-size" }} title={partner.name}>
      {partner.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/logos/color/${partner.logo}.svg`} alt={partner.name} loading="lazy" decoding="async" />
      ) : (
        <span style={{ fontSize: "20cqw" }}>{partner.name}</span>
      )}
    </div>
  );
}

/** A logo on its own, no tile: for large showcase rows. */
export function LogoMark({ partner, height = 40, className = "" }: { partner: Partner; height?: number; className?: string }) {
  if (!partner.logo) {
    return <span className={className} style={{ fontSize: height * 0.62, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: `${height}px`, whiteSpace: "nowrap" }}>{partner.name}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/logos/color/${partner.logo}.svg`} alt={partner.name} className={className} style={{ height, width: "auto" }} loading="lazy" decoding="async" />;
}
