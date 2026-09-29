---
title: Quickstart
description: From sign-up to a working agent, a conversation in Desk, and your first API request.
---

This guide takes you from a new account to an agent that answers from your own business information, then to your first API request. It takes about fifteen minutes.

## 1. Create your account and organization

1. Open `{{APP_URL}}/register`.
2. Enter your **Name**, **Email** and **Password**, confirm the password, and select **Create account**.
3. On **Create organization**, enter your **Organization name** and check the **Timezone**. Veyra guesses the timezone from your browser.
4. Select **Create organization**.

You are the owner of the new organization, so you can open both Studio and Desk. Veyra opens Studio first.

### What you get automatically

Every new organization starts with a working agent, so you can talk to it straight away:

| Item | Starting value |
|---|---|
| Agent name | Ava |
| Greeting | "Thanks for calling *your organization*, this is Ava. How can I help?" |
| Experts | **Front desk** (the talker, which speaks) and **Operations** (the worker, which does tasks) |
| Built-in actions | **Find contact**, **Create ticket**, **Recent calls**, **Recent tickets** |
| Ticket type | **General** |
| Lead pipeline | **Sales**, with the stages New, Contacted, Quoted and Won |

You can change all of these in Studio. If the words talker and worker are new, see [Core concepts](/docs/getting-started/concepts).

## 2. Add your business information

The business profile holds the facts the agent must always have. It is part of the agent's instructions on every conversation.

1. Open **Studio → Identity**.
2. Scroll to **Business profile**.
3. Fill in **Business name**, **Industry**, **Timezone**, **Website**, **Address** and a one-paragraph **Description**.
4. Select **Save changes**.

In the same page you can change the agent's name and greeting. See [Identity and greeting](/docs/studio/identity).

## 3. Add knowledge

Knowledge is for everything longer: prices, policies, service areas, opening hours, FAQs. The agent searches it when a question needs it.

1. Open **Studio → Knowledge**.
2. Select **Add**, then one of:
   - **Write a document**: give it a **Title** and write the **Content**.
   - **Upload files**: TXT, MD, CSV, HTML, PDF or DOCX, up to 20 files at a time and 20 MB each.
   - **Import a web page**: paste a **URL**. The page text becomes a document.

Write one topic per paragraph. Paragraphs are what the agent retrieves. More in [Knowledge](/docs/studio/knowledge).

## 4. Talk to your agent

**Studio → Talk** connects you to the same agent your customers reach, with the same knowledge, skills, memory and actions.

**By chat:**

1. Open **Studio → Talk**.
2. Type a question a customer would ask in **Write a message as a customer**, for example "What are your opening hours?", and send it.
3. The reply streams in. When the agent uses a tool, such as a knowledge search, you see the step above its reply.

**By voice:**

1. In the message box, select the voice button (**Talk with voice**).
2. Select **Start talking** and allow microphone access when your browser asks.
3. Speak as a customer would. Press Space to mute and Escape to end.
4. When you end, **Session ended** shows the length of the call. Select **View call in Desk** to see it.

> [!NOTE]
> Voice runs in the browser. If **Start talking** is disabled, voice is not set up on this deployment. Chat still works.

Try asking for something that needs work done, like "I need someone to call me back about a refund". The front desk hands this to the worker, which can raise a ticket with the **Create ticket** action. More in [Talk: test your agent](/docs/studio/talk).

## 5. See the conversation in Desk

Every Talk session is saved in Desk, just like a customer's.

1. Open the product menu at the top of the sidebar (it shows **Veyra Studio** and your organization name) and choose **Veyra Desk**. From a chat in Talk you can also select **Open in Desk**.
2. Open **Inbox**. Your test chat is a **Chat** conversation named **Studio test · *your name***.
3. Open **Calls** to see a voice session. The call page shows **What happened** (a summary written when the call ends), the **Handoffs** between the front desk and the worker, and the **Transcript**.
4. If the agent raised a ticket, it is in **Tickets** with the **Raised by the agent** label.

Your test sessions use their own identity, so they never mix with a real customer's history. See [Inbox and conversations](/docs/desk/inbox) and [Calls and recordings](/docs/desk/calls).

## 6. Create an API key

1. Go back to Studio and open **Studio → Developer**.
2. Select **New API key**.
3. Give the key a name, for example "Quickstart".
4. Leave **Publishable key** off. A server key is for your servers only.
5. Choose at least one scope, for example `contacts:read`.
6. Select **Create key**.
7. Copy the key now. It starts with `vy_sk_` and is shown only once.

More in [API keys and webhooks](/docs/studio/developer) and [Authentication and scopes](/docs/api/authentication).

## 7. Send your first request

`GET /me` returns the key you called with, its organization and its scopes. Any valid key may call it.

```bash
curl {{API_BASE}}/me \
  -H "Authorization: Bearer vy_sk_your_key_here"
```

A successful response looks like this:

```json
{
  "object": "api_key",
  "id": 5,
  "name": "Quickstart",
  "prefix": "vy_sk_8fKq2mX",
  "type": "server",
  "scopes": ["contacts:read"],
  "organization": {
    "id": 1,
    "object": "organization",
    "name": "Northwind",
    "slug": "northwind",
    "timezone": "America/Chicago"
  },
  "created_at": "2026-09-20T10:00:00Z",
  "last_used_at": "2026-09-28T14:03:11Z"
}
```

A `401` means the key is missing, mistyped or revoked.

> [!WARNING]
> Keep server keys out of web pages and mobile apps. Anyone with the key can do whatever its scopes allow. To put chat on a website, use a publishable key. See [Add chat to your website](/docs/api/website-chat).

## Next steps

- Learn the vocabulary in [Core concepts](/docs/getting-started/concepts).
- Teach the agent a procedure with [Skills](/docs/studio/skills).
- Connect other apps in [Integrations and actions](/docs/studio/integrations).
- Chat with your agent from your own product: [Chat with your agent](/docs/api/chat).
- Check [What's live and coming soon](/docs/getting-started/availability).
