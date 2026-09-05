# Veyra — Website Strategy and Copy Packet

One brand, one website. Positioning, sitemap, page-by-page direction, conversion design, and build direction for veyra's public site.

Revision 1 · August 2026 · Internal · Grounded in PRODUCT.md, DESIGN.md, VOICE.md, README.md and the shipped site

**Contents**

1. Executive Summary
2. Strategic Positioning
3. Brand Architecture
4. Sitemap and Navigation
5. Page-by-Page Direction
6. Design Guidelines (deltas only)
7. Conversion and Forms
8. Outside-the-Website Action Items
9. Open Decisions and Verification Items

---

## 1. Executive Summary

Veyra is an AI voice-agent platform: agents that answer, call, and close on every channel, built by a deep agent from a plain-English description, operated from one inbox (Veyra Desk). The site already exists — eight pages on a committed visual system ("neon spectrogram across midnight concrete") — and its copy is largely right. What the site lacks is not story but **function and finish**:

- Every "Request a demo" button currently dead-ends: no calendar link is configured, so CTAs fall back to a contact form that **does not submit anywhere** (a simulated client-side success). Leads are silently discarded.
- Privacy and Terms are dead links. No legal pages exist.
- No page has SEO metadata. No sitemap, no robots, no structured data.
- The live demo widget names one model stack; VOICE.md names another.
- The public footer deep-links into the authenticated app.

This packet keeps the positioning, fixes the funnel, and writes down the rules so the site stays coherent as it grows. The conversion spine becomes: **`/start`** (one branded conversion surface: book a demo through a real form, or start free), a **real** contact endpoint that files every inquiry into Veyra Desk as a ticket and a lead — the product handling its own front door is the strongest demo we have — and an SEO layer that makes the existing story legible to search.

**The three honest proofs** (in order of strength): the live in-browser voice call on the homepage; the named infrastructure stack and measured numbers (<1.2s voice-to-voice target, ~100ms barge-in, 42+ languages, 100+ countries, 1000+ tools); and the real product surfaces (Studio and Desk) shown as screenshots. There are no customer logos, testimonials, or case studies, and none are invented. The design handles the absence.

## 2. Strategic Positioning

One sentence per surface:

- **Veyra (homepage):** your customers reach out; Veyra answers, calls, and closes.
- **/platform:** one grounded agent on every channel — built visually, or built for you by the deep agent behind approval gates.
- **/solutions:** one agent, tuned to the way your business actually works.
- **/pricing:** start free; pay a flat fee when it's answering real calls; usage passes through at provider cost.
- **/start:** see Veyra with your business in it.

**Why this works.** The category ("AI receptionist", "voice agent toolkit") is crowded at both ends. Vapi and Retell sell developer toolkits; Veyra sells the **built outcome** — describe your business and an autonomous builder plans, delegates to system experts, and ships the deployment (numbers, workflows, knowledge, voice) with human approval gates — plus the **operating surface** (Veyra Desk: one inbox for every channel, tickets, assignment, team workload). The audience is business-led with a technical shadow: owners and ops leads who need it to work, and the engineer they ask to check it. The design says "serious infrastructure"; the words say "you don't need engineers."

**Vocabulary rules baked into all copy** (from PRODUCT.md, enforced):

- Sparse, confident, concrete. No marketing flourish. **No exclamation marks.**
- No "revolutionary / cutting-edge / transformative" class words.
- Never invent prices, customers, testimonials, or benchmarks. The claim allowlist is: <1.2s voice-to-voice target; ~100ms barge-in stop; 1000+ tool integrations; 100+ countries; 42+ languages; semantic turn detection; mid-call provider failover; warm (AI-briefed) + cold transfers with callback fallback.
- The human handoff is a feature, never an apology.
- One brain, every channel — voice, chat, phone, SMS are never presented as separate products.
- Platform jargon stays quarantined: RAG/MCP/orchestration never headline; they may appear in technical-depth rows only.

**The skim standard:** every section lands its point through headline and visual alone; paragraphs are optional depth. The live demo outranks any sentence about the demo.

## 3. Brand Architecture

- **Veyra** is the master brand: the company and the platform share the name. Text wordmark on the marketing site; the spectrogram-bar logomark (`Logo.tsx`) belongs to app surfaces.
- **Veyra Studio** (builder) and **Veyra Desk** (CRM) are product surfaces, not sub-brands. They appear in copy and screenshots; they are **never public navigation destinations** — the public site does not deep-link into authenticated routes. (Today's footer violates this; fixed in this packet.)
- Naming in copy: "the platform" for the whole; "the deep agent" for the builder capability; "Veyra Desk" when the inbox/CRM is the subject.
- Legacy identifiers (`vera.desk.*` localStorage keys, `rv-theme`, seed emails) are internal only and listed as action items; no user-visible copy says "Vera".

## 4. Sitemap and Navigation

Eleven pages: eight existing plus `/start`, `/privacy`, `/terms`.

| Page | URL | Why it exists | Primary CTA | Main nav |
|---|---|---|---|---|
| Home | `/` | The whole story in one skim; hosts the live demo | Request a demo | logo |
| Platform | `/platform` | The product in one scrollable story, six anchored sections | Request a demo | Yes |
| Solutions | `/solutions` | Six industries recognize themselves | Request a demo | Yes |
| Integrations | `/integrations` | "Does it work with X?" answered in one page | Request a demo | Yes |
| Pricing | `/pricing` | Kills usage anxiety; free start, flat fee, pass-through usage | Start building free | Yes |
| Start | `/start` | One branded conversion surface (demo form + self-serve) | Book my demo | Button only |
| Security | `/security` | Answers the technical evaluator's checklist | Talk to us | Footer |
| Company | `/company` | Why we exist; how we build | Talk to us | Yes |
| Contact | `/contact` | One routed front door; the form actually files | Send | Footer + CTAs |
| Privacy / Terms | `/privacy`, `/terms` | Legal, honest, one set | n/a | Footer |

**Navigation.** Desktop header: Veyra wordmark | Platform, Solutions, Integrations, Pricing, Company | theme toggle, Sign in, **Request a demo** (Ember pill → `/start`), **Sign up** (Mint pill → `/signup`). No dropdowns. Mobile: full-bleed sheet, same items, CTA pair pinned. The header CTA is always the demo; pricing converts through its own "Start free."

**Footer** groups: Product (Platform, Solutions, Integrations, Pricing, Security), Company (About, Contact, Start), Legal (Privacy, Terms). The Studio column and the Docs link into `/studio/*` are removed from the public footer.

## 5. Page-by-Page Direction

The eight existing pages keep their structure and most of their copy — they already follow the skim standard. Below: what each page is for, what changes, and its SEO block. (Current headlines are retained unless noted.)

### / — Home

Purpose: the whole story in one skim; host the one asset no competitor page has — a live call with the product. Audience: everyone. H1: **"Your customers reach out. Veyra answers, calls, and closes."**

Sections (existing, retained): hero + spectrogram · `#demo` live call ("Talk to Veyra, live.") · "Runs on" infrastructure strip · platform overview + deep-agent block · five product rows · reliability section ("Most agents demo well and die on real calls.") · stat grid · closing CTA pair.

Changes: demo CTAs point to `/start`; per-page metadata added.

SEO: title "Veyra — AI agents that answer, call, and close"; description "AI agents that talk to your customers on every channel, act in your tools, and hand off to a human when it matters. Talk to one live, right now."; JSON-LD `Organization` + `WebSite` (site-wide, injected in layout).

### /platform

Purpose: the product in one scrollable story; the six anchors (`#voice #agent #workflows #telephony #desk #integrations`) are stable link targets used across the site. H1: **"One agent. Every way your customers reach you."**

Changes: metadata only. SEO: title "The Veyra Platform — One Agent, Every Channel"; description "Voice, phone, chat, and SMS on one grounded agent. Build it visually or let the deep agent build it for you, behind approval gates."

### /solutions

Purpose: recognition — six industries see their worst call day named. H1: **"One agent, tuned to the way your business actually works."** Changes: metadata only. SEO: title "Veyra Solutions — Healthcare, Home Services, Real Estate & More"; description "A front desk that never sends patients to voicemail. Follow-up the second a lead lands. Six industries, one agent underneath."

### /integrations

Purpose: "does it work with my stack?" answered in one page; the categories and the MCP/custom-HTTP rows carry it. H1: **"Connect the tools you already run."** Changes: metadata only. SEO: title "Veyra Integrations — 1000+ Tools via Composio"; description "One connection and the agent can act: CRM, calendars, support, payments, messaging, docs. Managed OAuth, your own MCP servers welcome."

### /pricing

Purpose: remove pricing anxiety. The story is confirmed: **Starter Free ("free forever", no credit card) · Growth $99/month · Scale "Let's talk"**, usage passed through at provider cost with no markup, watchable in real time. H1: **"Simple pricing that scales with your conversations."**

Changes: metadata + JSON-LD (`SoftwareApplication` with the $99 offer; `FAQPage` from the six real FAQ rows). SEO: title "Veyra Pricing — Start Free, $99/mo Growth"; description "Start free, no credit card. $99 a month when Veyra is answering real calls. Voice minutes, numbers, and SMS pass through at provider cost."

### /start — NEW

Purpose: one branded conversion surface for both platform paths; every "Request a demo" resolves here until an external booking link exists. Audience: visitors ready to act. Layout: two equal console cards over a quiet band.

- Headline: **"See Veyra with your business in it."**
- Left card — *Book a 20-minute demo.* "Tell us a little about your business and we'll show you Veyra configured for it, not a canned tour." Fields (five, no more): Name · Work email · Company · Phone (optional) · What should the demo focus on? (dropdown: Answering our phones / Following up with leads / A specific workflow / Something else). Button: **Book my demo**. Under the form: "We reply within one business day."
- Right card — *Start building free.* "Set it up yourself. Full platform, free to start, no credit card." Button: **Create your account** → `/signup`. Small line: "No sales call required."
- Bottom band: "Want proof before either? **Talk to Veyra live** — it's answering on the homepage." → `/#demo`.

The form posts to the same `/api/site/contact` endpoint as `/contact` (topic prefilled "Demo request") and files a ticket + lead in Veyra Desk. The product handling its own front door is the demo.

SEO: title "Book a Veyra Demo or Start Free"; description "Book a 20-minute demo of Veyra configured for your business, or start free and set it up yourself. No credit card required."

### /security

Purpose: the technical evaluator's checklist, answered plainly; no certification claims because none exist — the honesty is the credibility. H1: **"Trusted with your calls, your data, and your customers."** Changes: metadata only; stays out of main nav (footer Legal + Product). SEO: title "Security at Veyra"; description "Server-side credentials, signed webhooks, least-privilege scopes, no training on your conversations, and failure modes that degrade to a human."

### /company

Purpose: why Veyra exists (the demo-vs-real-line gap; p95 is the product) and how we build. H1: **"We are building the agent that actually picks up."** Changes: metadata only. Open-source status is deliberately not mentioned (founder decision, revisit later). SEO: title "About Veyra"; description "Most voice agents demo well and die on real calls. We build for p95, ground answers in your business, and degrade to a human on purpose."

### /contact

Purpose: one routed front door that **actually files**. Keep the two-column console-form design; replace the simulated submit with a real POST to `/api/site/contact`. Add a designed error state ("We couldn't send that. Nothing was lost — try again, or email us directly.") alongside the existing success state. H1: **"Let's get Veyra answering your calls."** The page becomes a server component (metadata) wrapping a client form component. SEO: title "Contact Veyra"; description "Tell us what you're building. A person reads every message and replies within one business day."; JSON-LD `ContactPage`.

### /privacy and /terms — NEW

Honest, plain, current: what is collected (account data, conversation data processed to provide the service), what is not done (no training on customer conversations, no selling data), subprocessors named as the infrastructure strip (LiveKit, Deepgram, Cartesia, OpenAI/xAI, ElevenLabs, Composio, Twilio), export/delete on request, contact address. Terms: service description, acceptable use, usage billing at provider cost, no-warranty/limitation clauses in plain language. No compliance certifications are claimed. Marked for counsel review before any paid customer relies on them. Prose layout per Design delta D2.

## 6. Design Guidelines — deltas only

`DESIGN.md` is the contract: Void/Carbon/Slab surfaces, Iron hairlines, Cream ink, Ember + Mint CTA pair, 5.6px container radius, full-pill actions, weight-300 display, wide-tracked mono labels, flat and shadowless, spectrogram quarantined to the hero. Nothing in this packet overrides it. Deltas:

- **D1 — /start console cards.** The two doors are `.console` panels with titlebars ("book a demo" / "start free"), equal width, form inside the left panel. The form is the page; no other visuals.
- **D2 — Legal prose.** Privacy/Terms use the site's body type at 65–72ch measure, mono uppercase section labels, hairline separators, no cards, no decoration. A "last updated" mono line under the H1.
- **D3 — Structured data is invisible.** JSON-LD adds no visual surface; never render badges for it.
- **D4 — Error states are designed.** Form failure uses the danger token with recovery copy, same console styling as success; never a browser alert.

## 7. Conversion and Forms

Fixed CTA vocabulary, verbatim site-wide (repetition builds the path):

- **"Request a demo"** — Ember pill. Header, footer, and page heroes/closes. Resolves to `NEXT_PUBLIC_CALENDAR_URL` when set, else `/start`.
- **"Start building free"** — Mint pill. Every page. → `/signup`. ("Start free" allowed on /pricing plan cards only.)
- **"Talk to us"** — Ember variant on /security and /company. → `/contact`.
- **"Talk to Veyra"** — tertiary console pill. → `/#demo`. The proof path.
- **"Book my demo"** — the /start form submit only.

**One backend, two forms.** `POST /api/site/contact` accepts `{name, email, company?, phone?, topic?, message, website?}` — `website` is a honeypot; filled means bot, silently accepted and dropped. Per-IP rate limit. On success: upsert Contact by email, create a Ticket (`channel="form"`, subject from topic) and a Lead (source "Website") in Veyra Desk. The `/contact` form and the `/start` demo form are the only two instances, sharing the endpoint and the response-time promise: **"We reply within one business day"** — stated on both, honored by the team.

Confirmation states are designed, not default: success names what happens next; failure names the recovery and loses nothing.

## 8. Outside-the-Website Action Items

1. **Answer the tickets.** The forms now file into Veyra Desk; someone must own the "one business day" promise and the demo calendar.
2. **Booking tool.** Decide on a calendar vendor (Cal.com/Calendly/TidyCal) or keep the form-first flow; when decided, set `NEXT_PUBLIC_CALENDAR_URL` (also in `docker-compose.yml`) and demo CTAs upgrade automatically.
3. **Lead notification.** Wire a notification (email or SMS via Veyra itself) when a `channel="form"` ticket lands, so inquiries aren't discovered by accident.
4. **Legacy key rename.** `vera.desk.*` and `rv-theme` localStorage keys, `team@vera.demo` seed, and the `creator.startswith("vera")` heuristic in `desk.py` — rename in one coordinated pass (off-site, cosmetic except the heuristic).
5. **Domain + deploy.** The Vercel deployment serves the marketing site; Desk/Studio need `NEXT_PUBLIC_API_URL` pointed at a hosted API before those surfaces work publicly.
6. **Counsel review** of /privacy and /terms before the first paid customer.

## 9. Open Decisions and Verification Items

1. **Booking vendor and URL** (action item 2). The site works form-first meanwhile.
2. **Model-chip naming.** The live demo chips name a specific stack; VOICE.md names a different primary. Resolve to whatever `apps/agent` actually runs, or genericize to capability labels ("streaming STT → realtime LLM → flash TTS"). Never let marketing copy and runtime drift again.
3. **Public API docs.** The footer used to link the authed `/studio/developers`. Decide whether a public `/docs` page is worth building; until then the API goes unadvertised.
4. **Open source.** MIT-licensed repo exists; founder decision (this revision): not publicized. Revisit when the credibility trade-off changes.
5. **Pricing evolution.** Free / $99 / "Let's talk" is confirmed for this revision. If usage-included tiers or annual billing ship, /pricing and its JSON-LD offer must change together.

**The five-minute test** (acceptance): What does Veyra do? — hero sentence. Can I see it work? — one scroll, live call. What does it cost? — pricing in one screen, no traps. Will it work with my tools? — integrations page, one skim. Is it safe? — security page, plain rows. What do I click? — "Request a demo" everywhere, "Start building free" beside it.
