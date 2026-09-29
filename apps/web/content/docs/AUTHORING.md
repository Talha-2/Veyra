# Writing Veyra docs

The public docs live at `/docs` on the company site. Each guide is one Markdown file in this folder, at the path named by its `slug` in `nav.json` (`studio/skills` → `studio/skills.md`). The API reference (`/docs/api-reference/...`) is generated from `openapi.json`; do not hand-write endpoint reference pages.

## File format

```markdown
---
title: Skills
description: One sentence, shown under the title and in search results.
---

Opening paragraph: what this is and when you use it. No "In this guide we will".

## A section

...
```

- Start with the frontmatter above: `title` and `description` only.
- Do not repeat the title as an `#` heading; the page renders it. Use `##` and `###` for sections (they become the "On this page" list).
- One idea per section. Short paragraphs. Numbered steps for procedures ("1. Open **Studio → Skills**.").
- UI labels in **bold**, exactly as the app shows them. Paths as **Studio → Knowledge**.
- Code in fenced blocks with a language: `bash`, `json`, `js`, `ts`, `python`, `php`, `html`.
- Tables with GFM pipes.
- Link other pages as `/docs/<slug>` (e.g. `/docs/api/webhooks`), and reference pages as `/docs/api-reference/<tag-slug>` where tag slugs are: `authentication`, `contacts`, `conversations`, `messages`, `tickets`, `leads`, `pipelines`, `calls`, `knowledge`, `webhooks`, `agent-chat`.

## Placeholders

Write these literally; the site replaces them when rendering:

- `{{API_BASE}}`: the API base URL, e.g. in `curl {{API_BASE}}/contacts`.
- `{{APP_URL}}`: the web app (Studio and Desk), e.g. `{{APP_URL}}/studio/developer`.

Never hard-code a Veyra domain or `localhost`.

## Callouts

GitHub-style alerts, on their own blockquote:

```markdown
> [!NOTE]
> Helpful context.

> [!TIP]
> A shortcut or good practice.

> [!WARNING]
> Something that can go wrong or cost money.

> [!SOON]
> This feature is coming soon. Say what works today instead.
```

## Honesty rules (binding)

- Document only what the product does today, verified in the code (`apps/app-layer`, `apps/agent-layer`). If you are unsure, read the controller, model or page.
- Anything not live gets a `> [!SOON]` callout and no instructions that would fail. Not live today: phone numbers and real phone calls (telephony), SMS/texts, WhatsApp, email as a channel (sending and receiving), outbound calls, call transfer to a person's phone, call recording settings, evaluations, team invitations by link/email, webhook and app-event automation triggers, email notifications, the mobile app.
- Live today: voice in the browser and chat through Studio **Talk**; the chat API; knowledge, skills, experts, actions, integrations (Composio), memory, automations (scheduled and manual runs), Ask; Desk inbox, tickets, contacts, leads/pipelines, calls list for web voice sessions, notes; API keys, scopes, webhooks, the public REST API.
- No invented customers, metrics, limits, prices or SLAs. Quote numbers only from code or `openapi.json` (e.g. rate limit 120 requests a minute per key).
- Plain, direct English for people who may not be native speakers. No marketing language, no exclamation marks.
