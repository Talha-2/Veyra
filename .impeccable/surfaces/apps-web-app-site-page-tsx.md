---
version: 1
slug: "apps-web-app-site-page-tsx"
primary_target: "apps/web/app/(site)/page.tsx"
related_targets: ["apps/web/app/(site)/layout.tsx","apps/web/app/(site)/platform/page.tsx","apps/web/app/(site)/pricing/page.tsx","apps/web/app/(site)/solutions/page.tsx","apps/web/app/(site)/integrations/page.tsx","apps/web/app/(site)/security/page.tsx","apps/web/app/(site)/company/page.tsx","apps/web/app/(site)/contact/page.tsx","apps/web/components/SiteNav.tsx","apps/web/components/site/SiteFooter.tsx","apps/web/components/site/graphics.tsx"]
---

# Marketing site — surface brief

**Scope:** the whole `(site)` route group — landing, platform, solutions, pricing, integrations, security, company, contact — plus shared chrome (SiteNav, SiteFooter, site graphics) and the site layer of `globals.css`. Studio, Desk, and auth surfaces are out of scope; shared classes they use (`eyebrow`, `serif`, `chip`, `text-gradient`, `btn-gradient`, early `.mock`, `rail2`, `showcase-frame`) must keep working.

**Visitor mode:** Persuade.

**Audience & job:** business owners / ops leads who want customer conversations handled without engineers; secondary developer audience needs credibility (latency figures, infra names, an API surface). Business-led words, infrastructure-grade surface (confirmed 2026-08-03).

**Action:** primary = Request a demo (Ember pill); secondary = Start building free (Mint pill). Binary CTA pair everywhere; never a third button beside them.

**Proof:** the live LiveKit voice demo (strongest), real latency/scale figures (<1.2s, ~100ms barge-in, 1000+ tools, 100+ countries, 42+ languages), the infrastructure stack strip (LiveKit, Deepgram, Cartesia, OpenAI, Composio, ElevenLabs, Twilio). No customer logos exist — do not fabricate.

**Chosen direction (user-pinned):** the Vapi style reference — "neon spectrogram across midnight concrete." Void/Carbon/Slab surfaces, Iron hairline skeleton, Cream text, weight-300 display headlines, wide-tracked mono labels, Ember/Mint pill pair, 5.6px containers, flat and shadowless, six-color spectrogram quarantined to the hero waveform. Craft bar: vapi.ai / Linear / Vercel. Both themes stay: dark is the definitive rendition, light is its warm-paper counterpart (confirmed 2026-08-03).

**Memorable moment:** the full-bleed six-color spectrogram under the hero, and the inverted cream "TALK TO VERA" console pill that starts a real call.

**Unresolved:** Privacy/Terms pages are stubs (`#`); calendar URL comes from env; no image assets exist or are wanted (graphics are code-drawn).
