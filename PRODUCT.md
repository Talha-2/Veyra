# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Businesses that want their customer conversations (phone calls, chat, SMS, email) handled by AI agents without hiring engineers — owners and operations leads at service businesses (home services, clinics, agencies) and lean teams at growing companies. A secondary technical audience (developers, integrators) evaluates the platform's API, latency numbers, and infrastructure choices; they need credibility signals, not a separate pitch. Confirmed in interview (2026-08-03): landing copy speaks business-led with technical credibility — the design says "serious infrastructure," the words say "you don't need engineers."

## Product Purpose

Vera builds and runs AI voice and chat agents that talk to customers: they answer and place real phone calls, run workflows across ~1000 integrated tools, ground answers in the business's knowledge, and hand off to a human when it matters. Success = a business describes itself in plain English and gets a deployed, working agent (numbers, workflows, knowledge, voice) it can supervise.

## Positioning

The deep agent: describe your business in plain English and an autonomous builder plans, delegates to system experts, and ships the whole deployment (workflows, knowledge, telephony, voice) with human approval gates. Neighboring voice-AI platforms (Vapi, Retell) sell developer toolkits; Vera sells the built outcome plus the operating surface (Vera Desk: one inbox for every channel with tickets, assignment, team workload).

## Operating Context

- Marketing site: `apps/web/app/(site)/` — landing, platform, pricing, solutions, integrations, security, company, contact. Next.js 15 App Router, Tailwind v4, self-hosted fonts (`apps/web/app/fonts/`), lucide-react icons.
- Product surfaces: Vera Studio (`/studio` — agent builder, workflows, knowledge, telephony, evals) and Vera Desk (`/desk` — CRM/inbox). These keep their own design layer; marketing-site work must not restructure them.
- Live demo: `VoiceDemo` component (LiveKit-powered talk-to-Vera widget) embedded on the landing page — a real product demonstration, keep it working.
- Infrastructure stack (truthful, publicly claimable): LiveKit, Deepgram, Cartesia, OpenAI, Composio, ElevenLabs, Twilio.

## Capabilities and Constraints

- Real claims already published on the site (treat as confirmed): <1.2s voice-to-voice target; ~100ms barge-in stop; 1000+ tool integrations; 100+ countries reachable; 42+ languages streaming multilingual STT; semantic turn detection on VAD; provider failover mid-call; cold + warm (AI-briefed) transfers with callback fallback.
- Pricing page exists; do not invent new prices, customers, testimonials, or benchmarks anywhere.
- No customer logos or case studies exist yet — the honest proof strip is the infrastructure stack. Do not fabricate client logos.
- Theme: marketing site supports light and dark via `[data-theme]` tokens (interview 2026-08-03: keep both; dark is the definitive brand rendition, light is its warm-paper counterpart).

## Brand Commitments

- Name: Vera. Wordmark set in text (no logo asset on the marketing site); `Logo.tsx` exists for app surfaces.
- Binding visual direction (user-pinned, 2026-08-03): the Vapi style reference — "neon spectrogram across midnight concrete." Void/Carbon/Slab surfaces, Iron hairline structure, Cream text, Ember Orange + Mint Pulse CTA pair, six-color spectrogram quarantined to the hero waveform, 5.6px container radius / full-pill actions, weight-300 display headlines, wide-tracked mono labels, flat and shadowless. The reference document supplied by the user is the authority for tokens and component recipes; its craft level (vapi.ai) is the bar.
- Voice: sparse, confident, concrete; no marketing flourish, no exclamation marks. Business-led claims backed by technical specifics.

## Evidence on Hand

- Working live voice demo (LiveKit) on the landing page — the strongest proof on the site.
- Real latency/scale figures listed above (already published).
- Infrastructure partner names for the logo strip.
- Absent (do not fabricate): customer logos, testimonials, case studies, press, compliance certifications beyond what /security already states.

## Product Principles

1. Prove with the live demo and real numbers, not adjectives — the demo widget and latency figures outrank any claim.
2. Business-led words, infrastructure-grade surface: the reader should feel "this is serious engineering I can operate without engineers."
3. One brain, every channel: voice, chat, phone, and messaging are the same agent — never present them as separate products.
4. The human handoff is a feature, not a fallback apology — say it plainly.
5. Never invent commercial facts; the honest absence (no customer logos yet) is handled by design, not fabrication.

## Accessibility & Inclusion

No product-specific standard confirmed. Baseline: keep semantic structure, focus-visible rings, `prefers-reduced-motion` behavior already present in the codebase.
