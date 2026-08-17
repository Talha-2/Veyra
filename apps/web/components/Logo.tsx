/* Veyra's mark.

   Drawn from the system's own grammar rather than a generic glyph: Veyra's
   signature graphic is the spectrogram, so the mark is a four-bar amplitude
   cluster knocked out of an Ember tile. Squared bar ends, because DESIGN.md
   keeps even the smallest accents squared — the only true circle in the system
   is the 7px console status dot.

   Two things changed from the previous heartbeat polyline:

   • GEOMETRY. The tile was rx=8 on a 28 box (~29%), which read rounder than a
     system whose containers are all 5.6px. It is now 20% of the box, so it
     renders at exactly 5.6px at 28px and stays proportional at every size.
   • ONE ACCENT PER LOCKUP. The wordmark used to tint its "a" Ember while the
     tile was already Ember. The Two-Voice Rule rations accents, and two in one
     lockup compete, so the tile carries the colour and the wordmark is ink.

   The bars are sized to survive the smallest place this renders (22px in the
   desk sidebar): 2.6/28 of the width each, which stays ≥2 device px there. */

const BARS = [
  { x: 5.2, h: 10 },
  { x: 10.2, h: 18 },
  { x: 15.2, h: 13 },
  { x: 20.2, h: 7 },
];
const BAR_W = 2.6;

export function LogoMark({
  size = 28,
  mono = false,
  label,
}: {
  size?: number;
  /** single-colour rendition for inverted or one-ink contexts */
  mono?: boolean;
  /** give the mark an accessible name when it stands alone */
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      style={{ flexShrink: 0 }}
    >
      {/* 5.6 of 28 is the container radius expressed in the viewBox, so the
          tile stays exactly on-system at every rendered size */}
      <rect
        width="28"
        height="28"
        rx="5.6"
        fill={mono ? "currentColor" : "var(--accent)"}
      />
      {BARS.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={(28 - b.h) / 2}
          width={BAR_W}
          height={b.h}
          fill={mono ? "var(--bg)" : "var(--text-on-accent)"}
        />
      ))}
    </svg>
  );
}

export function Logo({
  size = 28,
  wordmark = true,
  suffix,
  mono = false,
}: {
  size?: number;
  wordmark?: boolean;
  suffix?: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} mono={mono} label={wordmark ? undefined : "Veyra"} />
      {wordmark && (
        <span
          className="title"
          style={{ fontSize: size * 0.66, letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          Veyra
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
