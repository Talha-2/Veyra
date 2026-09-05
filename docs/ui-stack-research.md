# UI Stack Research — Libraries and Frameworks for the Veyra Site Build

August 2026 · Companion to [website-strategy.md](website-strategy.md) · Grounded in web research + what this repo already ships

The rule this document applies throughout: **prefer what is already installed and working** unless a candidate is clearly better for a named job. The repo already runs Next.js 15 + React 19 + Tailwind v4, shadcn/ui on Base UI, lucide-react, and self-hosted Inter + Geist Mono. Every recommendation below either confirms that choice against the 2026 landscape or names the one thing worth adding.

## 1. Component libraries (cards, dropdowns, dialogs, forms)

**Verdict: keep shadcn/ui on Base UI — it is the 2026 default, and we're already on it.**

- **shadcn/ui** is the consensus pick for new Next.js + Tailwind projects in 2026 (75k+ GitHub stars). Components are scaffolded into the repo as owned code — no version upgrades, no dependency conflicts, no abstraction between the app and the component. That ownership model is why our conformance layer (Vera/Veyra tokens over `data-slot` selectors in `globals.css`) works at all.
- **Base UI** (from the MUI team) reached v1.0 stable in December 2025 with 35 components and full-time engineering; as of July 2026 shadcn/ui defaults to Base UI for new projects. Our components are already Base UI-backed — we're on the current default, not a legacy branch.
- **Radix UI** was acquired by WorkOS and development slowed; it remains the most-downloaded headless library (~130M monthly npm downloads) but is the wrong direction for new work. **Do not mix Radix primitives into this repo** — the two APIs differ (`render` prop vs `asChild`, no `onInteractOutside`), and we've already hit that class of bug once.
- Full-featured kits (MUI, Chakra, Ant) are not candidates: they bring their own theme systems that would fight DESIGN.md.

**Cards specifically:** the shadcn `Card` (already conformed to the 5.6px/hairline system) is the only card primitive; the marketing site's `.console` panels are bespoke by design and stay that way — they are the brand, not a gap.

## 2. Animation and motion

**Verdict: CSS-first (already the pattern), add `motion` only when a real orchestrated moment demands it, GSAP only for the spectrogram-class set pieces.**

- **Modern CSS covers most of what the packet needs**: `@keyframes`, `transition`, scroll-driven `animation-timeline`, and `@view-transition` all ship natively in 2026 with zero JS overhead. The site's existing micro-motion (fade/rise under 300ms, hover states, the pulsing demo orb) is CSS and should stay CSS. `prefers-reduced-motion` handling already exists — every addition must respect it.
- **Motion** (the rebranded Framer Motion, now framework-agnostic) is the right choice *if* we add React-lifecycle animation: enter/exit transitions, layout animations, gestures. MIT, tree-shakeable (`LazyMotion` keeps the bundle small). Candidate uses: the `/start` form success-state transition, staggered product-row reveals. **Not installed until one of those is actually built** — the current CSS handles today's site.
- **GSAP became fully free in April 2025** (Webflow acquisition — including formerly-paid plugins like SplitText, DrawSVG, ScrollSmoother). It is the strongest tool for timeline-choreographed scenes — the class of thing our hero spectrogram would be if it ever animates as a sequence. Noted as available; not needed for the current build.
- **Avoid**: scroll-jacking libraries, parallax kits, animated counters (banned by the packet), AOS-style scattershot entrance libraries — one authored moment beats scattered effects, and the design system is flat and quiet by commitment.

## 3. Images and media

**Verdict: `next/image` end to end — it's built in and we're on Next 15.**

- `next/image` gives AVIF/WebP negotiation, responsive `srcset`, lazy-loading, and layout-shift prevention (dimensions required) with sharp under the hood. All packet screenshots (Studio/Desk captures) go through it with real `alt` text per the accessibility rules.
- Product loops per the packet are **compressed silent MP4/WebM with poster frames** (`<video autoplay loop muted playsinline>`), never GIF. Lazy-load below the fold. Stills ship first if a loop isn't ready.
- No image CDN needed while deploying on Vercel (its optimizer handles it); Docker builds already use the standalone output.
- **Avoid**: carousels (packet ban — static grids only), lightbox libraries (nothing needs one), background-video heroes (the live demo is the hero).

## 4. Icons, fonts, and supporting cast

- **Icons: lucide-react** (already everywhere, consistent 2px stroke). One set, functionally used, 16–20px. Do not mix Phosphor/Tabler/Heroicons in — switching buys nothing and mixing costs consistency.
- **Fonts: self-hosted Inter + Geist Mono via `next/font`** (already done) — zero external requests, no layout shift, subset + preloaded. No change.
- **Forms**: native form handling + fetch is enough for the two site forms (5 fields max by packet rule). React Hook Form + Zod is the 2026 default for *complex* forms — worth adopting inside Studio/Desk if their forms grow, unnecessary for the marketing site.
- **Toasts**: the app's custom `Toasts` module works; **sonner** is the drop-in upgrade candidate (near-identical `toast.success/error` API) if toast UX ever needs stacking/swipe — noted, not adopted.
- **Command palette: cmdk** when the ⌘K search hinted in Desk's sidebar gets built.
- **Virtualization: @tanstack/react-virtual** when any list (inbox rows, integration catalog) exceeds a few hundred items. Not before.

## 5. What this means for the build batches

| Job | Tool | Status |
|---|---|---|
| Site forms (/contact, /start) | Native form + fetch, console styling | Build now (Batch 1–2) |
| Cards/dropdowns/dialogs anywhere new | shadcn (Base UI) + conformance layer | Already in place |
| Micro-motion, reveals | CSS transitions/keyframes + reduced-motion | Already the pattern |
| Orchestrated moments (future hero loop) | Motion (React) or GSAP (timeline scenes) | Deferred until designed |
| Screenshots/loops | next/image + MP4/WebM posters | Use as assets land |
| Icons / fonts | lucide-react / next/font (Inter + Geist Mono) | No change |

Nothing new gets installed for Batches 1–6. The first justified additions, in order of likely need: Motion (when an orchestrated moment ships), sonner (if toast UX grows), cmdk (⌘K).

## Sources

- [Untitled UI — 14 Best React UI Component Libraries in 2026](https://www.untitledui.com/blog/react-component-libraries)
- [ShadcnDeck — Radix vs Base UI in 2026](https://www.shadcndeck.com/blog/radix-vs-base-ui)
- [PkgPulse — shadcn/ui vs Base UI vs Radix (2026)](https://www.pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026)
- [Dualite — Best UI Component Libraries in 2026](https://dualite.dev/blogs/best-ui-component-libraries)
- [hontran.dev — GSAP vs Framer Motion in 2026](https://www.hontran.dev/blog/gsap-vs-framer-motion)
- [SmashingApps — Best Free JavaScript Animation Libraries in 2026](https://www.smashingapps.com/best-free-javascript-animation-libraries-in-2026/)
- [CSSAWWWARDS — Best CSS Animation Libraries 2026](https://cssawwwards.com/blog/best-css-animation-libraries-2026)
- [Timace — Best Web Animation Libraries in 2026](https://www.timace.io/best/best-animation-libraries)
