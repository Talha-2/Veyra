---
title: API keys and webhooks
description: Create API keys, add webhook endpoints and browse the API reference from the Studio Developer page.
---

**Studio → Developer** is where you connect Veyra to your own systems. Developers use it to run the same agent and data behind their own products: a REST API over contacts, conversations, tickets, leads, calls, knowledge and agent chat, and webhooks that tell your systems when something changes.

The page has four tabs: **Get started**, **API keys**, **Webhooks** and **API reference**. The header shows how many active keys and webhook endpoints you have.

This page covers what you do in Studio. For how to call the API, see [API overview](/docs/api/overview), [Authentication and scopes](/docs/api/authentication) and [Webhooks](/docs/api/webhooks).

## Get started

The **Get started** tab walks through three steps (create a server key, make a first request to `GET /me`, add a webhook endpoint) and lists the **Connection details** your integration needs:

| Detail | Value |
| --- | --- |
| **Base URL** | `{{API_BASE}}` |
| **Authentication** | `Authorization: Bearer vy_sk_…` |
| **Webhook signature** | `X-Veyra-Signature: sha256=<hmac>` |
| **OpenAPI 3.1** | `{{API_BASE}}/openapi.json` |

A first request looks like this:

```bash
curl {{API_BASE}}/me \
  -H "Authorization: Bearer $VEYRA_API_KEY"
```

It returns the key's organization and scopes, which proves the key, the URL and the header are right.

## API keys

There are two kinds of key.

| Kind | Starts with | Where it may be used | What it can hold |
| --- | --- | --- | --- |
| Server key | `vy_sk_` | Only on your servers. Never in a browser or an app. | Any scope. |
| Publishable key | `vy_pk_` | Safe to put in a web page. | Only `knowledge:read` and `chat:write`. |

A publishable key can only call the endpoints marked as publishable: reading its own details, searching knowledge, and agent chat. Use it for [chat on your website](/docs/api/website-chat).

### Create a key

1. Open **Studio → Developer → API keys** and press **New API key**.
2. Enter a **Name**. Name it after the system that uses it, for example "Helpdesk sync", so you know what breaks if you revoke it.
3. Switch on **Publishable key** if the key will sit in a web page.
4. Under **Access**, tick the scopes it needs, as **Read** or **Write** per resource. **Read only**, **Everything** and **Clear** are shortcuts. **Everything** is not available for a publishable key.
5. Press **Create key**.
6. Copy the key from **Copy your new API key now**. It is shown once and cannot be shown again; Veyra stores only a hash of it.

Give each key only the access its system needs. The scopes are:

| Scope | Allows |
| --- | --- |
| `contacts:read` | List, fetch and look up contacts. |
| `contacts:write` | Create, update and delete contacts. |
| `conversations:read` | List conversations and read their messages and notes. |
| `messages:write` | Record outbound messages and add internal notes. |
| `tickets:read` | List and fetch tickets and their notes. |
| `tickets:write` | Create and update tickets, and add notes. |
| `leads:read` | List and fetch leads and pipelines. |
| `leads:write` | Create and update leads, and move them between stages. |
| `calls:read` | List calls and read transcripts, summaries and handoffs. |
| `knowledge:read` | List, fetch and search knowledge documents. |
| `knowledge:write` | Create, update and delete knowledge documents. |
| `webhooks:read` | List webhook endpoints. |
| `webhooks:write` | Create and delete webhook endpoints. |
| `chat:write` | Chat with your agent: start sessions, send messages, read replies. |

See [Authentication and scopes](/docs/api/authentication) for how scopes are checked.

> [!NOTE]
> Sending SMS and email is not connected yet. A message you record through the API with `messages:write` appears in the Desk conversation as queued, and stays queued.

### Manage keys

The list shows each key's name, kind (**Server** or **Publishable**), its prefix, its scopes, when it was last used and who created it. From a key's menu:

- **Copy prefix** copies the first characters of the key, so you can tell keys apart.
- **Revoke key** stops the key at once. Anything using it stops working immediately. Revoked keys stay in the list, marked **Revoked**.

## Webhooks

Webhooks send a signed JSON `POST` to your URL a moment after something changes, for example when a ticket is raised, a call ends or a lead moves stage.

### Add an endpoint

1. Open **Studio → Developer → Webhooks** and press **Add endpoint**.
2. Enter the **HTTPS URL**. It must start with `https://`.
3. Leave **All events** on to receive every event, including event types added in the future, or switch it off and choose events.
4. Press **Add endpoint**.
5. Copy the signing secret from **Copy the signing secret for this endpoint**. It is shown once.

Your endpoint should answer with any 2xx status within 5 seconds.

### Verify deliveries

Each delivery carries the headers `X-Veyra-Event`, `X-Veyra-Delivery` and `X-Veyra-Signature: sha256=<hex>`. The signature is the HMAC-SHA256 of the raw request body, keyed with the endpoint's signing secret. Compute it yourself and reject any delivery that does not match. See [Webhooks](/docs/api/webhooks) for code examples, and the **Event catalog** section of the tab for every event you can subscribe to.

### Test and monitor

- **Send test** sends a signed test event now, so you can see exactly what a real one looks like.
- Each endpoint shows a strip of its recent deliveries. Open **Recent deliveries** to see the payload that was sent and the response your server gave.
- The switch on each endpoint turns delivery on or off. **Delete endpoint** in its menu removes it; it stops receiving events at once.

An endpoint that fails 10 times in a row is turned off automatically, with the reason shown on the endpoint. Fix your server, press **Send test**, then switch it back on.

You can also manage endpoints through the API. See the [Webhooks API reference](/docs/api-reference/webhooks).

## API reference

The **API reference** tab shows every endpoint, generated from the same OpenAPI description as the public reference. The public version needs no sign-in, so you can share it with a partner before they have an account:

- [Authentication](/docs/api-reference/authentication)
- [Contacts](/docs/api-reference/contacts), [Conversations](/docs/api-reference/conversations), [Messages](/docs/api-reference/messages)
- [Tickets](/docs/api-reference/tickets), [Leads](/docs/api-reference/leads), [Pipelines](/docs/api-reference/pipelines)
- [Calls](/docs/api-reference/calls), [Knowledge](/docs/api-reference/knowledge)
- [Webhooks](/docs/api-reference/webhooks), [Agent chat](/docs/api-reference/agent-chat)

For list formats, errors and the rate limit, see [Lists, errors and rate limits](/docs/api/pagination-errors).
