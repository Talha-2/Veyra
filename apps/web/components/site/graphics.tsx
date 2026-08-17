/* The site's "images": code-drawn product consoles in the system's own
   grammar — Carbon panels, Iron hairlines, mono labels, 5.6px corners.
   No stock assets, no chrome frames; every graphic reads as the product
   working. The six-color spectrogram lives ONLY in <Spectro />. */

// ── the signature: full-bleed six-color voice spectrogram ──
export function Spectro({ bars = 96 }: { bars?: number }) {
  return (
    <div className="spectro" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

// ── ember amplitude bars used inside consoles ──
export function VoiceWaveform({ bars = 26, live = true }: { bars?: number; live?: boolean }) {
  return (
    <div className={`gwave ${live ? "live" : ""}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            animationDelay: `${(i % 9) * 0.09}s`,
            height: `${18 + ((i * 37) % 61)}%`,
          }}
        />
      ))}
    </div>
  );
}

// ── deep agent: the build console, mid-run ──
export function ConsoleMock() {
  return (
    <div className="console" style={{ width: "100%", maxWidth: 520 }}>
      <div className="console__bar">
        <span className="console__dot" />
        veyra.studio — deep agent
        <span className="spacer" />
        live
      </div>
      <div className="console__body">
        <div
          className="log-line"
          style={{ marginBottom: 14, color: "var(--text-primary)", fontWeight: 500 }}
        >
          <span className="t">you</span>
          <span>&ldquo;Answer our phones, book jobs into the calendar, and text back missed calls.&rdquo;</span>
        </div>
        <div className="log">
          <div className="log-line"><span className="t">00:01</span><span className="ok">done</span><span>read business profile and connected tools</span></div>
          <div className="log-line"><span className="t">00:04</span><span className="ok">done</span><span>draft booking workflow — 6 steps, 2 branches</span></div>
          <div className="log-line"><span className="t">00:09</span><span className="ok">done</span><span>ground knowledge base on your site</span></div>
          <div className="log-line"><span className="t">00:12</span><span className="act">run</span><span>wire google calendar · managed oauth</span></div>
          <div className="log-line"><span className="t">—</span><span className="warn">hold</span><span>publish — waiting for your approval</span></div>
        </div>
      </div>
    </div>
  );
}

// ── workflows: a compiled pathway as a node rail ──
export function WorkflowMock() {
  const nodes: [string, string, string, boolean?][] = [
    ["trigger", "Inbound call", "caller intent detected"],
    ["ask", "Collect the time", "“what date works for you?”"],
    ["act", "Create calendar event", "google calendar · booked", true],
    ["branch", "Confirmed?", "yes → confirm · no → human"],
    ["end", "Wrap up", "summary posted to veyra desk"],
  ];
  return (
    <div className="console" style={{ width: "100%", maxWidth: 440 }}>
      <div className="console__bar">
        <span className="console__dot" style={{ background: "var(--info)" }} />
        workflow — booking_flow
        <span className="spacer" />
        compiled
      </div>
      <div className="console__body" style={{ paddingBlock: 14 }}>
        <div className="nodes">
          {nodes.map(([tag, label, sub, act]) => (
            <div key={label} className={`node ${act ? "node--act" : ""}`}>
              <span className="node__tag">{tag}</span>
              <span>
                <span className="node__label">{label}</span>{" "}
                <span className="node__sub">· {sub}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── telephony: a live inbound call card ──
export function TelephonyMock() {
  return (
    <div className="console" style={{ width: "100%", maxWidth: 400 }}>
      <div className="console__bar">
        <span className="console__dot" />
        telephony — inbound
        <span className="spacer" />
        00:41
      </div>
      <div className="console__body">
        <div className="mono-tag mono-tag--dim">Incoming call</div>
        <div
          className="mono"
          style={{ fontSize: 22, fontWeight: 500, color: "var(--text-primary)", marginTop: 8, letterSpacing: "0.02em" }}
        >
          +1 415 555 0142
        </div>
        <div style={{ margin: "16px 0" }}>
          <VoiceWaveform bars={32} />
        </div>
        <div className="log">
          <div className="log-line"><span className="ok">0.9s</span><span>answered — &ldquo;Thanks for calling, how can I help?&rdquo;</span></div>
          <div className="log-line"><span className="act">sms</span><span>confirmation text queued to the same thread</span></div>
          <div className="log-line"><span className="dim">esc</span><span className="dim">warm transfer armed · front desk</span></div>
        </div>
      </div>
    </div>
  );
}

// ── veyra desk: every channel in one inbox ──
export function InboxMock() {
  const rows: [string, string, string, string][] = [
    ["call", "Dana Okafor", "Missed call · called back in 40s", "new lead"],
    ["sms", "Marcus Lee", "“Can we reschedule to Friday?”", "open"],
    ["mail", "Priya N.", "Re: quote for 20 seats", "quoted"],
    ["call", "Sam Rivera", "Voicemail · booking request", "won"],
  ];
  return (
    <div className="console" style={{ width: "100%", maxWidth: 480 }}>
      <div className="console__bar">
        <span className="console__dot" />
        veyra desk — inbox
        <span className="spacer" />
        4 open
      </div>
      <div>
        {rows.map(([ch, name, prev, tag], i) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: "12px 16px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <span className="node__tag" style={{ width: 34 }}>{ch}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{name}</span>
              <span
                style={{
                  display: "block",
                  fontSize: 12.5,
                  color: "var(--text-tertiary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {prev}
              </span>
            </span>
            <span className="chip chip--mono" style={{ flexShrink: 0 }}>{tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── integrations: the catalog as a quiet tag wall ──
const TOOLS = [
  "Slack", "Google Calendar", "HubSpot", "Stripe", "Gmail", "Sheets",
  "Notion", "Zendesk", "Salesforce", "WhatsApp", "Airtable",
];
export function IntegrationGrid() {
  return (
    <div className="console" style={{ width: "100%", maxWidth: 480 }}>
      <div className="console__bar">
        <span className="console__dot" />
        integrations — connected
        <span className="spacer" />
        managed oauth
      </div>
      <div className="console__body">
        <div className="chips">
          {TOOLS.map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
          <span className="chip chip--mono" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))" }}>
            +989 more
          </span>
        </div>
        <p style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.55, color: "var(--text-tertiary)" }}>
          Connect once. The agent reads each tool, fills the parameters itself, and takes the
          action live on the call.
        </p>
      </div>
    </div>
  );
}

// ── voice: a live transcript with the turn readout ──
export function TranscriptMock() {
  const lines: [string, string][] = [
    ["agent", "Thanks for calling Veyra. How can I help you today?"],
    ["caller", "Hi — do you have any openings this Friday afternoon?"],
    ["agent", "We do. There’s a 2:30 and a 4 o’clock. Want me to book one?"],
  ];
  return (
    <div className="console" style={{ width: "100%", maxWidth: 460 }}>
      <div className="console__bar">
        <span className="console__dot" />
        live call — deepgram → agent → cartesia
        <span className="spacer" />
        0.94s
      </div>
      <div className="console__body">
        <div className="log" style={{ gap: 12 }}>
          {lines.map(([who, text], i) => (
            <div key={i} className="log-line" style={{ alignItems: "baseline" }}>
              <span className="t" style={{ width: 46, flexShrink: 0, color: who === "agent" ? "var(--accent)" : "var(--text-tertiary)" }}>
                {who}
              </span>
              <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans), sans-serif", fontSize: 13.5 }}>
                {text}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <span className="mono-tag mono-tag--dim">booking flow · collecting time</span>
          <VoiceWaveform bars={14} />
        </div>
      </div>
    </div>
  );
}
