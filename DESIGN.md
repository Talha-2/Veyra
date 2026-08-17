---
name: Veyra
description: The voice-AI console — neon spectrogram across midnight concrete, rendered flat and shadowless.
colors:
  ember: "#e96b34"
  ember-hover-dark: "#f07d4a"
  ember-hover-light: "#d55f2c"
  mint-pulse: "#62f6b5"
  mint-pulse-hover: "#79f8c0"
  void: "#0e0e13"
  carbon: "#09090b"
  slab: "#18181b"
  iron: "#27272a"
  iron-strong: "#3f3f46"
  cream: "#fffaea"
  cream-muted: "#a1a1aa"
  cream-faint: "#71717a"
  paper: "#faf8f2"
  paper-subtle: "#f4f1e8"
  parchment: "#fffdf6"
  ink: "#131316"
  ink-muted: "#52525b"
  ink-faint: "#8b8b94"
  hairline-warm: "#e5e2d8"
  pearl: "#d8d7d4"
  spectro-sky: "#4dcafa"
  spectro-orchid: "#de94e2"
  spectro-volt: "#ffdd03"
  spectro-violet: "#9977ff"
  spectro-mint: "#62f6b5"
  spectro-ember: "#e96b34"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.55rem, 5.9vw, 4.25rem)"
    fontWeight: 300
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.85rem, 3.7vw, 2.8rem)"
    fontWeight: 300
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 510
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "-0.006em"
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.08em"
  # Full size ramp actually shipped (mirrors the pinned Vapi reference scale).
  # Micro steps 10–15px carry mono labels, meta, and console body text; 17px
  # is lead/title; 24px (1.5rem) opens sub-feature headings; larger sizes are
  # the clamp()-driven display/headline steps above.
  scale: [10px, 10.5px, 11px, 11.5px, 12px, 12.5px, 13px, 13.5px, 14px, 14.5px, 15px, 16px, 17px, 18px, 1.5rem, 22px, 24px, 26px, 2.2rem, 2.55rem, 2.8rem, 3.4rem, 4.25rem]
rounded:
  xs: "4px"
  container: "5.6px"
  lg: "12px"
  pill: "9999px"
spacing:
  gutter: "24px"
  band: "clamp(3.25rem, 6vw, 5.5rem)"
  band-sm: "clamp(2rem, 3.6vw, 3.25rem)"
  console-body: "20px"
  plan-pad: "28px"
components:
  button-ember:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.void}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 24px"
  button-ember-hover:
    backgroundColor: "{colors.ember-hover-dark}"
  button-mint:
    backgroundColor: "{colors.mint-pulse}"
    textColor: "{colors.void}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 24px"
  button-mint-hover:
    backgroundColor: "{colors.mint-pulse-hover}"
  console-pill:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.void}"
    rounded: "{rounded.pill}"
    padding: "17px 38px"
  console-panel:
    backgroundColor: "{colors.carbon}"
    rounded: "{rounded.container}"
  chip:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.cream-muted}"
    rounded: "{rounded.container}"
    padding: "5px 11px"
  field:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.cream}"
    rounded: "{rounded.container}"
    height: "44px"
    padding: "0 14px"
---

# Design System: Veyra

<!-- Scope note: this document records the MARKETING SITE's built system — the
     `.site-shell` subtree under apps/web/app/(site)/, styled by the
     "MARKETING SITE — the Veyra console" section of apps/web/app/globals.css.
     The app-wide tokens (:root / [data-theme="dark"]) at the top of that file
     are shared with Veyra Studio and Veyra Desk; the site consumes them but does
     not own them. The DESK INBOX section directly above the marketing section
     is an adjacent, separately scoped system (the desk app) — it is not
     documented here and site work must not reach into it. -->

## Overview

**Creative North Star: "Neon spectrogram across midnight concrete"**

Veyra's marketing site is a voice-AI platform rendered as the console it is. The
canvas is near-black Void, panels are Carbon, raised elements are Slab; the
structure is drawn entirely in 1px Iron hairlines; the ink is warm Cream, never
pure white. Headlines whisper at weight 300 while wide-tracked Geist Mono
labels do the organizing. Color is rationed with intent: the six-hue neon
spectrogram appears exactly once — as the full-bleed hero waveform — and
everywhere else the only chromatic voices are the Ember Orange / Mint Pulse
action pair. This is the user-pinned Vapi-reference direction (PRODUCT.md,
2026-08-03): dark is the definitive brand rendition; light is the same token
system re-expressed on warm paper (Cream surfaces, near-black ink, warm
hairlines), not a separate design.

The system explicitly refuses the aurora/glass/gradient SaaS hero: it is flat
and shadowless throughout (`--shadow-card: none`; the only "shadows" are 1px
ring-borders and the focus ring). Depth comes from the three near-black surface
steps and hairline borders. The site's "images" are code-drawn product consoles
(`components/site/graphics.tsx`) built from the system's own grammar — Carbon
panels, mono titlebars, log lines, node rails — never stock art or browser
chrome. Everything about it says "serious infrastructure you can operate."

**Key Characteristics:**
- Void/Carbon/Slab surface ladder with Iron 1px hairline structure; zero box-shadows
- Cream ink (#fffaea) at weight-300 display sizes; 12px uppercase +0.08em Geist Mono labels
- Ember + Mint full-pill CTA pair with near-black labels — always binary, never a third
- Six-color spectrogram quarantined to the hero waveform (`.spectro`) only
- 5.6px container radius everywhere; actions are full pills — nothing in between
- One authored entrance (hero `.rise` stagger) plus the spectrogram's breathe; all other sections static
- Both themes ship from one token set; light is the warm-paper counterpart, dark is definitive

## Colors

A near-monochrome console where the only loud color is a rationed neon accent pair, plus one quarantined six-hue burst.

### Primary
- **Ember Orange** (#e96b34): the primary action. Fills the `.btn-ember` pill (label is Void near-black, not white), marks the featured pricing plan's border, the active workflow node, the agent's transcript label, and row-tag hover. Identical hex in both themes; only its hover shifts (lighter #f07d4a in dark, deeper #d55f2c in light).

### Secondary
- **Mint Pulse** (#62f6b5): the secondary action and the "live/ok" signal. Fills the `.btn-mint` pill (hard-coded, same in both themes), tints the `.check-sq` feature-bullet squares at 16%, and doubles as dark-theme `--success` (the console dot, "done" log lines).

### Tertiary — the spectrogram six (quarantined)
The vivid six-hue palette lives ONLY inside `.spectro` (the hero waveform), cycling `6n`: **Sky** (#4dcafa), **Orchid** (#de94e2), **Volt Yellow** (#ffdd03), **Violet** (#9977ff), **Mint Pulse** (#62f6b5), **Ember** (#e96b34). Dark-theme chart tokens reuse these hues (`--chart-1..5`), but no marketing-site component outside `.spectro` may.

### Neutral
- **Void Canvas** (#0e0e13): dark page background (`--bg`) and the near-black text on both CTA pills.
- **Carbon** (#09090b): dark surface for cards, consoles, chips, fields (`--surface`).
- **Slab** (#18181b): dark raised step — elevated panels, inputs-on-carbon (`--surface-raised`).
- **Iron** (#27272a): the structural skeleton — every dark hairline border (`--border`); **Iron Strong** (#3f3f46) for emphasized borders.
- **Cream** (#fffaea): dark-theme primary ink (`--text-primary`); with **Cream Muted** (#a1a1aa) secondary and **Cream Faint** (#71717a) tertiary text.
- **Paper** (#faf8f2) / **Paper Subtle** (#f4f1e8) / **Parchment** (#fffdf6): the light theme's warm surfaces.
- **Ink** (#131316) with **Ink Muted** (#52525b) and **Ink Faint** (#8b8b94): light-theme text.
- **Warm Hairline** (#e5e2d8) and **Pearl** (#d8d7d4): light-theme borders; Pearl-at-22%-white is the near-white wire under the dark nav.

### Named Rules
**The Quarantine Rule.** The six-color spectrogram palette appears in `.spectro` and nowhere else. Any other graphic that needs a waveform uses `.gwave` — single-color Ember bars.

**The Two-Voice Rule.** Outside the hero waveform, the only accents on any screen are Ember and Mint. Semantic colors (success/warn/danger/info) speak only inside console mocks' log lines and status dots.

## Typography

**Display Font:** Inter (self-hosted variable, 100–900; the seasonSans stand-in — with ui-sans-serif, system-ui fallback)
**Body Font:** Inter (same family; the site is single-family for prose)
**Label/Mono Font:** Geist Mono (self-hosted variable — with ui-monospace fallback)

**Character:** Whispered and technical. Display sizes run *light* (300) with tight negative tracking, so scale does the talking, not weight; every organizing label flips to wide-tracked uppercase mono, which reads as machine annotation against the quiet humanist headlines. Variable-font in-between weights (510, 570, 650) are used deliberately.

### Hierarchy
- **Display** (300, clamp(2.55rem, 5.9vw, 4.25rem), 1.06, -0.025em): `.display-hero` — the hero headline only, balanced-wrapped, centered.
- **Headline** (300, clamp(1.85rem, 3.7vw, 2.8rem), 1.12, -0.02em): `.section-title` — every section heading; stands alone with no eyebrow above it.
- **Title** (510, 17px, -0.01em): `.row__title` — list-row and card titles. Stat figures reuse display weight 300 at clamp(2.3rem, 3.8vw, 3.4rem) with tabular numerals.
- **Body** (400, 16px, 1.65, -0.006em): base prose. `.lead` (17px, 1.55) and `.lead-lg` (clamp(1.05rem, 1.4vw, 1.2rem)) carry section intros in secondary color, capped around 46–62ch.
- **Label** (Geist Mono 500, 12px, +0.08em, UPPERCASE): `.mono-tag` — the system's connective tissue: nav links, row tags, stat captions, console titlebars (11px), field labels (11px), footer heads (11px), CTA pill labels (weight 570). Node tags drop to 10px.

### Named Rules
**The Standing Headline Rule.** Headings stand alone. No eyebrows, no kickers, no mono-tag stacked above a `.section-title` — the mono voice labels rows, stats, and consoles, never headlines.

**The Mono Address Rule.** Anything that names, tags, or navigates is 11–12px uppercase Geist Mono at +0.08em; anything that persuades is Inter. The two voices never blend mid-element.

## Layout

A single centered column: `.wrap` (max-width 1200px, 24px side gutters) for sections, `.wrap-tight` (880px) for closing CTAs. Vertical rhythm is the `.band` (clamp(3.25rem, 6vw, 5.5rem) block padding; `.band-sm` at clamp(2rem, 3.6vw, 3.25rem) for the logo strip) — and every band below the hero fold opens with `.band--line`, a 1px top hairline, so the page reads as a stack of ruled console sections. The hero itself is unruled: headline → lead → pill pair → inverted console-pill → full-bleed spectrogram closing the fold.

Recurring grids: `.feature-sec` (copy beside a console mock, 1fr/1fr above 900px, `.flip` swaps order), `.rows` (hairline-separated list rows on a 176px-tag / 1fr / auto-metric grid, collapsing to one column below 720px), `.stat-grid` (four hairline-divided stats, 2×2 below 860px), and the `.logo-strip` (one quiet space-between row of monochrome wordmark text). Nav links appear from 768px. Density is editorial, not cramped: rows breathe at 22px block padding, consoles pad 20px.

**The Hairline Skeleton Rule.** Sections, rows, plan features, and footer are all separated by the same 1px `--border` hairline. Never introduce a divider of any other weight, color, or style.

## Elevation & Depth

Flat and shadowless — explicitly. `--shadow-xs` and `--shadow-card` are `none`; `--hero-glow` is `none`; `--accent-glow` is transparent. Depth is conveyed entirely by the surface ladder (Void canvas → Carbon panel → Slab raised in dark; Paper → Parchment → white in light) plus 1px hairline borders. The tokens named `--shadow-raised`/`--shadow-overlay` are actually 1px ring-borders (`0 0 0 1px`), not shadows. The only true box-shadow in the system is the focus ring (`0 0 0 2px var(--bg), 0 0 0 4px` Ember at ~50%). The sticky nav gets a 12px backdrop-blur over an 88% background — the sole translucency.

### Named Rules
**The No-Shadow Rule.** Nothing casts a shadow, ever — not on hover, not on overlay. If an element needs separation, give it the next surface step and a hairline.

## Shapes

Near-sharp console geometry with exactly two silhouettes. Containers — consoles, cards, chips, plans, fields — take the 5.6px radius (`--radius-md`); actions — Ember/Mint buttons, the console pill — are full pills (9999px). There is nothing in between: no 8px "friendly" cards, no rounded-square buttons. Small square accents (check squares at 4px, workflow node dots at 2.5px, dotgrid dots at 1px) keep even the tiniest marks squared rather than circular; the only true circle is the 7px console status dot. Borders are always 1px solid. Graphics are code-drawn in this same geometry — the spectrogram is 5.6px-radius bars, waveform bars are 2px-radius, no clipped imagery anywhere.

**The Two-Silhouette Rule.** If it holds content it's a 5.6px rectangle; if you click it to act it's a full pill.

## Components

All classes below are scoped to the marketing site (`.site-shell` subtree); Studio and Desk have their own component layers over the shared tokens.

### Buttons (the Ember/Mint pair)
- **Character:** binary and disciplined — one primary, one secondary, never a third sibling.
- **Shape:** full pill (9999px), 44px tall, 0 24px padding; compact `--sm` variant 32px / 0 16px / 11px label for nav and footer.
- **Primary (`.btn-ember`):** Ember (#e96b34) fill with a near-black Void (#0e0e13) label — 12px uppercase Geist-feel at weight 570, +0.08em. Used for "Request a demo."
- **Secondary (`.btn-mint`):** Mint (#62f6b5) fill, same Void label, hard-coded identically in both themes. Used for "Start building free" / "Sign up."
- **Hover / Active:** background steps one token (Ember → #f07d4a dark / #d55f2c light; Mint → #79f8c0); active scales to 0.98. 150ms ease-out. No shadows, no glows.
- **Tertiary is a link:** `.link-mono` — a quiet uppercase mono text link (secondary color → primary on hover) with a 13px arrow. It is never rendered as a third pill.

### Console pill (signature CTA)
`.console-pill` — the inverted "TALK TO VERA" pill: background is `--text-primary` (Cream on dark, Ink on light), text is `--bg`, 14px uppercase mono at +0.08em, 17px 38px padding, with a 2×2 `.dotgrid` of 4px squares. Hover scales up 1.03 (the one growing hover in the system); reduced-motion removes the transform.

### Cards / Containers (`.console`)
- **Corner Style:** 5.6px.
- **Background:** `--surface` (Carbon / Parchment) with a 1px `--border` hairline; internal `.console__body` pads 20px.
- **Titlebar (`.console__bar`):** 11px uppercase mono in tertiary color, 10px 16px padding, bottom hairline, a 7px status dot (success-colored by default), and a `.spacer` pushing a right-aligned readout. Every code-drawn graphic (build log, workflow node rail, telephony card, inbox, integration wall, transcript) lives inside one.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Plans (`.plan`):** the same recipe at 28px padding; the featured plan swaps its hairline for an Ember border — that is the entire "most popular" treatment. Price figures are weight-300 44px.

### List rows (`.rows` / `.row`)
The workhorse content pattern: hairline-separated rows on a 176px mono-tag / body / right-aligned mono-metric grid, 22px block padding. Linked rows hover with a 3% text-primary tint and the tag turns Ember. Titles 17px/510, bodies 14px secondary capped at 62ch.

### Chips (`.chip`)
5.6px-radius, 1px hairline, surface background, 12.5px/500 secondary text, 5px 11px padding; `.chip--mono` variant (11px uppercase mono, +0.05em) for tool/status tags inside consoles. Also consumed by the desk app.

### Inputs / Fields (`.field`)
- **Style:** 44px tall, 5.6px radius, `--surface` background, 1px `--border-strong` stroke, 14px text; textareas grow from 120px.
- **Label (`.field-label`):** 11px uppercase mono in secondary color, 8px below-gap.
- **Focus:** border turns Ember — no ring, no glow, 150ms.

### Navigation (`.site-nav`)
Sticky, 60px row: uppercase 650-weight "Veyra" wordmark left; desktop-only center links in 12px uppercase mono at weight 400 (secondary → primary on hover and on `aria-current="page"`); theme toggle, "Sign in" mono link, and the compact Ember/Mint pair right. Background is 88% `--bg` with 12px backdrop-blur; the bottom border is the near-white Pearl wire (rgba(216,215,212,0.22)) on dark, `--border-strong` on light. Mobile opens a full-bleed `.site-menu` sheet — hairline-separated 14px mono links with the full-width pill pair at the bottom.

### Footer (`.site-footer`)
Top hairline, five-column grid (brand blurb + compact pill pair, then link columns under 11px uppercase mono heads), 14px secondary links, and a hairline-topped bottom row with the copyright (mono, tracking relaxed) and the theme toggle.

### Spectro (signature graphic)
`.spectro` — the full-bleed hero waveform: 96 flex bars, 5.6px radius, 118px tall, colors cycling the quarantined six-hue palette every 6 bars, heights on an interleaved 11n cycle with 13n bars carved to 14% as silences. Under `prefers-reduced-motion: no-preference` the bars breathe (scaleY 1 → 0.68, 3.4s ease-in-out, staggered on 3n/7n cycles). Rendered by `<Spectro />` in `components/site/graphics.tsx`; used once, in the hero.

### Code-drawn graphics (`components/site/graphics.tsx`)
The site's imagery is the product drawn in its own grammar: `ConsoleMock` (deep-agent build log), `WorkflowMock` (node rail: 9px square dots on a 1px rail, active node Ember), `TelephonyMock` (live call card with `.gwave` Ember amplitude bars), `InboxMock`, `IntegrationGrid` (chip wall), `TranscriptMock`. No stock assets, no screenshots, no browser-chrome frames.

## Do's and Don'ts

### Do:
- **Do** build every action as one of exactly two pills: Ember primary + Mint secondary, 12px uppercase +0.08em labels in near-black (#0e0e13) — and demote any third action to a `.link-mono` text link.
- **Do** give every container the 5.6px radius and a 1px hairline; step to the next surface token (Carbon → Slab / Paper → Parchment) when something must feel raised.
- **Do** open every below-the-fold section with `.band--line` and let `.section-title` stand alone at weight 300.
- **Do** label with 11–12px uppercase Geist Mono at +0.08em (row tags, stat captions, console bars, field labels) and keep prose in Inter.
- **Do** draw new "product imagery" as `.console` mocks in the system's own grammar — mono titlebar, status dot, hairline internals.
- **Do** style both themes through the tokens; dark (Void/Carbon/Iron/Cream) is the definitive rendition, light is its warm-paper counterpart from the same variables.
- **Do** honor `prefers-reduced-motion`: the `.rise` entrance, spectro breathe, and console-pill scale all switch off.

### Don't:
- **Don't** use the six-color spectrogram palette outside `.spectro`; in-console waveforms are single-color Ember `.gwave` bars.
- **Don't** add box-shadows, glows, gradients, or glass effects anywhere — `--shadow-card` is `none` by design; the nav's backdrop-blur is the only translucency.
- **Don't** place an eyebrow, kicker, or mono-tag above a headline; headlines stand alone.
- **Don't** introduce a third CTA sibling, a non-pill button, or an 8px "friendly" card radius — the system has exactly two silhouettes.
- **Don't** push display or section headings above weight 300, or brighten dark-theme text past Cream (#fffaea) to pure white.
- **Don't** add entrance animations beyond the hero's `.rise` stagger; sections below the fold arrive static.
- **Don't** reach into the DESK INBOX or Studio class layers from site pages, or use `.site-*`/marketing classes inside the apps — the systems share tokens, not components.
- **Don't** invent customer logos, testimonials, or new metrics; the proof strip is the real infrastructure stack and the published numbers (PRODUCT.md).
