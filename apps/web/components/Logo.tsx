/* Vera logomark: a clean signal pulse in a rounded tile — voice, a heartbeat,
   the pulse of the customer relationship. Wordmark set in the display face. */

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect width="28" height="28" rx="8" fill="var(--accent)" />
      <path
        d="M5 14.5h3.4l2.1-5.4a0.9 0.9 0 0 1 1.7 0.05l3 9.2 2-4.1a0.9 0.9 0 0 1 0.8-0.5H23"
        fill="none"
        stroke="var(--text-on-accent)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  size = 28,
  wordmark = true,
  suffix,
}: {
  size?: number;
  wordmark?: boolean;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {wordmark && (
        <span
          className="title"
          style={{ fontSize: size * 0.66, letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          Ver<span style={{ color: "var(--accent-text)" }}>a</span>
          {suffix && (
            <span
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginLeft: 10,
              }}
            >
              {suffix}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
