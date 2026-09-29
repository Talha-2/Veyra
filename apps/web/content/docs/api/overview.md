---
title: API overview
description: What the Veyra REST API does, how its requests and responses are shaped, and how to make your first call.
---

The Veyra API gives your own systems the same data your team works with in Veyra Desk: contacts, conversations and messages, tickets, leads and pipelines, calls, and the knowledge your agent answers from. You can also chat with your organization's AI agent from your product or website, and receive signed webhooks when records change.

Use it to sync Desk with your CRM or helpdesk, to raise tickets from your own tools, to keep your agent's knowledge up to date, or to run Veyra behind your own interface instead of (or as well as) Desk.

## Base URL

Every endpoint is under one base URL:

```text
{{API_BASE}}
```

All requests use HTTPS. Request and response bodies are JSON. Send `Content-Type: application/json` with every request that has a body.

The machine-readable description of the API is an OpenAPI 3.1 document at `{{API_BASE}}/openapi.json`. It needs no key, so you can load it into an HTTP client or code generator before you create one.

## What the API covers

| Area | What you can do | Scopes | Reference |
| --- | --- | --- | --- |
| Contacts | List, search, look up by phone or email, create, update, delete | `contacts:read`, `contacts:write` | [Contacts](/docs/api-reference/contacts) |
| Conversations | List threads, read their messages and internal notes | `conversations:read` | [Conversations](/docs/api-reference/conversations) |
| Messages | Record outbound messages, add internal notes | `messages:write` | [Messages](/docs/api-reference/messages) |
| Tickets | List, create, update, add notes | `tickets:read`, `tickets:write` | [Tickets](/docs/api-reference/tickets) |
| Leads and pipelines | List pipelines and leads, create and update leads, move them between stages | `leads:read`, `leads:write` | [Leads](/docs/api-reference/leads), [Pipelines](/docs/api-reference/pipelines) |
| Calls | List calls, read transcripts, summaries and the steps the agent took | `calls:read` | [Calls](/docs/api-reference/calls) |
| Knowledge | Manage documents, search them the way the agent does | `knowledge:read`, `knowledge:write` | [Knowledge](/docs/api-reference/knowledge) |
| Webhooks | Register endpoints that receive signed events | `webhooks:read`, `webhooks:write` | [Webhooks](/docs/api-reference/webhooks) |
| Agent chat | Start chat sessions and talk to your agent | `chat:write` | [Agent chat](/docs/api-reference/agent-chat) |

> [!SOON]
> Sending SMS and email is not connected yet. An outbound message you record through the API is stored with `status: "queued"` and appears in Desk, but it is not delivered to the customer. Phone calls are also coming soon; today the calls list holds voice sessions from the browser.

## Objects

A single object is returned as the object itself, not wrapped in another field. Every object has:

| Field | Meaning |
| --- | --- |
| `id` | A numeric id, unique within its type. |
| `object` | The type name, such as `contact`, `ticket` or `message`. |
| `created_at` | When it was created, in ISO 8601 UTC, for example `2026-09-28T14:03:11Z`. |
| `updated_at` | When it last changed, in the same format. |

A contact looks like this:

```json
{
  "id": 42,
  "object": "contact",
  "name": "Maya Hartley",
  "display_name": "Maya Hartley",
  "phone": "+14155552671",
  "email": "maya@hartley.co",
  "company": "Hartley & Co",
  "stage": "qualified",
  "source": "call",
  "value": 4800,
  "owner_id": 3,
  "tags": ["vip"],
  "last_contact_at": "2026-09-28T14:03:11Z",
  "created_at": "2026-09-26T09:12:40Z",
  "updated_at": "2026-09-28T14:03:11Z"
}
```

Some other conventions:

- Fields without a value are usually present and set to `null`. Treat a missing field the same as `null`.
- A successful delete returns `{"id": 42, "object": "contact", "deleted": true}`.
- A list returns `{"object": "list", "data": [...], "has_more": ..., "next_cursor": ...}`. See [Lists, errors and rate limits](/docs/api/pagination-errors).
- An error returns `{"error": {"type": ..., "message": ...}}` with a matching HTTP status.
- Every key belongs to one organization. You only ever see and change that organization's records; an id from another organization returns 404.

## Versioning

The version is part of the path: `/api/v1`. This documentation describes v1, the only version today. Write your code so that it ignores response fields it does not know about.

## Make your first request

You need an API key. Create one in **Studio → Developer** (see [Authentication and scopes](/docs/api/authentication)), then store it in an environment variable rather than in your code:

```bash
export VEYRA_API_KEY="vy_sk_..."
```

`GET /me` works with any valid key and tells you which key you used, which organization it belongs to and which scopes it has. It is a good first call.

```bash
curl "{{API_BASE}}/me" \
  -H "Authorization: Bearer $VEYRA_API_KEY"
```

```js
// Node.js 18 or later
const res = await fetch('{{API_BASE}}/me', {
  headers: { Authorization: `Bearer ${process.env.VEYRA_API_KEY}` },
});
const body = await res.json();
if (!res.ok) throw new Error(body.error.message);
console.log(body.organization.name, body.scopes);
```

```python
import os
import requests

res = requests.get(
    "{{API_BASE}}/me",
    headers={"Authorization": f"Bearer {os.environ['VEYRA_API_KEY']}"},
    timeout=10,
)
body = res.json()
if not res.ok:
    raise RuntimeError(body["error"]["message"])
print(body["organization"]["name"], body["scopes"])
```

The response:

```json
{
  "object": "api_key",
  "id": 5,
  "name": "Helpdesk sync",
  "prefix": "vy_sk_8fKq2mX",
  "type": "server",
  "scopes": ["contacts:read", "tickets:write"],
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

If you get a 401, the key is missing, mistyped or revoked; the error message says which.

## Next steps

- [Authentication and scopes](/docs/api/authentication): key types, scopes and rotating keys.
- [Lists, errors and rate limits](/docs/api/pagination-errors): paging through lists, handling errors, staying under the rate limit.
- [Webhooks](/docs/api/webhooks): get notified when records change.
- [Chat with your agent](/docs/api/chat): talk to your agent from your backend.
- [Add chat to your website](/docs/api/website-chat): a chat box on your site with a publishable key.
- The [API reference](/docs/api-reference/authentication) lists every endpoint with its parameters and examples.
