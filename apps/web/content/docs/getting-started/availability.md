---
title: What's live and coming soon
description: Which Veyra features work today, and which are shown in the product but not available yet.
---

Veyra shows some features before they work, so you can see where the product is going. In the app, those features carry a **Coming soon** tag and their controls are turned off. This page lists what works today and what does not, so you can plan around it.

## Live today

### Talking to the agent

| Feature | Where | Notes |
|---|---|---|
| Voice in the browser | **Studio → Talk** | The same voice agent that will answer phone calls. Each session is saved as a call in Desk. |
| Chat | **Studio → Talk** | Each chat is saved as a conversation in Desk. |
| Chat API | [Chat with your agent](/docs/api/chat) | Put the agent in your own website or app. Works with publishable keys from a browser. |

### Building the agent (Studio)

| Feature | Guide |
|---|---|
| Identity, greeting, business profile | [Identity and greeting](/docs/studio/identity) |
| Voice and languages | [Voice and languages](/docs/studio/voice) |
| Knowledge: write, upload, import a web page | [Knowledge](/docs/studio/knowledge) |
| Skills | [Skills](/docs/studio/skills) |
| Experts (talker and worker) | [Experts](/docs/studio/experts) |
| Built-in actions, HTTP request actions | [Integrations and actions](/docs/studio/integrations) |
| Integrations through Composio | [Integrations and actions](/docs/studio/integrations) |
| Memory | [Memory](/docs/studio/memory) |
| Automations that run on a schedule or by hand (**Run now**) | [Automations](/docs/studio/automations) |
| Ask, the Studio assistant | [Ask](/docs/studio/ask) |

### Working conversations (Desk)

| Feature | Guide |
|---|---|
| Inbox: read threads, assign, tag, star, snooze, close, saved views | [Inbox and conversations](/docs/desk/inbox) |
| Internal notes, reminders, raising tickets from a conversation | [Inbox and conversations](/docs/desk/inbox) |
| Block and do-not-disturb on an address | [Inbox and conversations](/docs/desk/inbox) |
| Calls list and call detail for browser voice sessions: summary, transcript, handoffs, tool calls | [Calls and recordings](/docs/desk/calls) |
| Contacts: stages, owners, tags, notes, CSV export | [Contacts](/docs/desk/contacts) |
| Leads and pipelines: board, list, table, CSV import | [Leads and pipelines](/docs/desk/leads) |
| Tickets: board, list, table, bulk changes, notes | [Tickets](/docs/desk/tickets) |
| Team workload and in-app notifications | [Team and notifications](/docs/desk/team) |

### Developers

| Feature | Guide |
|---|---|
| API keys (server and publishable) and scopes | [Authentication and scopes](/docs/api/authentication) |
| Webhooks | [Webhooks](/docs/api/webhooks) |
| The REST API: contacts, conversations, messages, tickets, leads, pipelines, calls, knowledge, agent chat | [API overview](/docs/api/overview) |

## Coming soon

These features appear in the product, or are planned, but do not work yet. Do not build a process that depends on them.

| Feature | What you see today | What works instead |
|---|---|---|
| Phone numbers and real phone calls | **Studio → Telephony** is tagged **Coming soon**. No phone line can reach the agent. | Test by voice in **Studio → Talk**. |
| Outbound calls | The agent cannot place calls. | None today. |
| Call transfer to a person's phone | The **Extension** column on team pages is tagged **Coming soon**. | Raise a ticket for a person to follow up. |
| Call recording | **Record calls** in **Studio → Identity** is turned off. Browser voice sessions are not recorded. | Each call keeps its transcript and summary. |
| Maximum call length | **Maximum length** in **Studio → Identity** is tagged **Coming soon**. | None today. |
| SMS and texts | Replying by SMS is tagged **Coming soon** in Desk. | Chat, and the chat API. |
| WhatsApp | Not available as a channel. | Chat, and the chat API. |
| Email as a channel (sending and receiving) | Replying by email is tagged **Coming soon** in Desk. | Chat, and the chat API. |
| Fax | Replying by fax is tagged **Coming soon** in Desk. | None today. |
| Starting a new conversation from Desk | **New conversation** in the inbox and **Message** on a contact are tagged **Coming soon**. | None today. |
| Evaluations | **Studio → Evaluations** is tagged **Coming soon**. | Test by hand in **Studio → Talk**. |
| Team invitations by link or email | **Invite** in **Studio → Settings → Team & access** is tagged **Coming soon**. | None today. |
| Automation triggers from a webhook or an app event | These triggers are tagged **Coming soon** on an automation. | Schedule the automation, or use **Run now**. |
| MCP server actions | You can add an MCP server in Studio, but the agent cannot call its tools yet. | HTTP request actions, or an integration through Composio. |
| Email notifications | The **Email** column in notification preferences is tagged **Coming soon**. | In-app notifications in Desk. |
| Mobile app | Not available. | Use Desk in a mobile browser. |

> [!NOTE]
> The API accepts messages on SMS and email conversations, but they stay queued and are not delivered while these channels are not live. See [API overview](/docs/api/overview).

## How to tell in the app

- A **Coming soon** tag sits next to the name of anything that does not work yet.
- Its button or switch is turned off, and hovering it shows "Coming soon".
- Setup steps that cannot be done yet, like connecting a phone number on the **Studio → Overview** checklist, are shown last and do not count toward setup.

This page is updated as features go live.
