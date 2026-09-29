---
title: Authentication and scopes
description: Server and publishable API keys, how to create them, the scopes they carry, and how to rotate and revoke them.
---

Every request to the API, except `GET /openapi.json`, needs an API key. A key belongs to one organization, carries a set of scopes that decide what it may do, and is sent as a bearer token.

## Two kinds of key

| | Server key | Publishable key |
| --- | --- | --- |
| Prefix | `vy_sk_` | `vy_pk_` |
| Where it lives | Your servers only | Can be put in a web page |
| Scopes it can hold | Any | `knowledge:read` and `chat:write` only |
| Routes it can call | Any route its scopes allow | Only routes marked publishable (below) |

A key is the prefix followed by 40 letters and digits, for example `vy_sk_` + 40 characters.

Use a **server key** for anything that runs on your own infrastructure: a sync job, a backend, a script. Use a **publishable key** only for code that runs in a visitor's browser, such as a chat box on your website.

> [!WARNING]
> Never put a server key in a web page, a mobile app, a public repository or anything else a user can download. Anyone who has it can do everything its scopes allow. Load it from an environment variable or a secrets manager.

## Create a key

1. Open **Studio → Developer** (`{{APP_URL}}/studio/developer`).
2. Select **New API key**.
3. Enter a **Name**. Name it after the system that will use it, such as "Helpdesk sync", so you know what stops working if you revoke it.
4. For a key that will run in a browser, turn on **Publishable key**. Only the scopes a publishable key can hold stay available.
5. Under **Access**, choose **Read** and **Write** for each area the system needs. **Read only** selects every read scope; **Clear** removes them all.
6. Select **Create key**.
7. Copy the key from **Copy your new API key now** and store it somewhere safe.

The full key is shown only once. Veyra stores a hash of it, not the key itself, so a lost key cannot be recovered: revoke it and create another. The key list shows only the first 14 characters (the `prefix`), so you can tell keys apart.

You cannot change a key's scopes after you create it. To give a system more or less access, create a new key with the right scopes and revoke the old one.

## Send the key

Put the key in the `Authorization` header with the `Bearer` scheme:

```bash
curl "{{API_BASE}}/contacts?limit=5" \
  -H "Authorization: Bearer $VEYRA_API_KEY"
```

```js
const res = await fetch('{{API_BASE}}/contacts?limit=5', {
  headers: { Authorization: `Bearer ${process.env.VEYRA_API_KEY}` },
});
```

```python
import os
import requests

res = requests.get(
    "{{API_BASE}}/contacts",
    params={"limit": 5},
    headers={"Authorization": f"Bearer {os.environ['VEYRA_API_KEY']}"},
    timeout=10,
)
```

The key decides the organization. There is no organization id in the path, and a key can never read or change another organization's records: their ids return 404.

To check a key, call `GET /me`. Any valid key may call it, publishable keys included. It returns the key's `name`, `prefix`, `type` (`server` or `publishable`), `scopes` and `organization`. See the [Authentication reference](/docs/api-reference/authentication).

## Scopes

Each route needs one scope. A key without it gets a 403.

| Scope | Allows | Publishable |
| --- | --- | --- |
| `contacts:read` | List, fetch and look up contacts. | No |
| `contacts:write` | Create, update and delete contacts. | No |
| `conversations:read` | List conversations and read their messages and notes. | No |
| `messages:write` | Record outbound messages and add internal notes. | No |
| `tickets:read` | List and fetch tickets and their notes. | No |
| `tickets:write` | Create and update tickets, and add notes. | No |
| `leads:read` | List and fetch leads and pipelines. | No |
| `leads:write` | Create and update leads, and move them between stages. | No |
| `calls:read` | List calls and read transcripts, summaries and handoffs. | No |
| `knowledge:read` | List, fetch and search knowledge documents. | Yes |
| `knowledge:write` | Create, update and delete knowledge documents. | No |
| `webhooks:read` | List webhook endpoints. | No |
| `webhooks:write` | Create and delete webhook endpoints. | No |
| `chat:write` | Chat with your agent: start sessions, send messages, read replies. | Yes |

A write scope does not include its read scope. A system that creates tickets and then reads them back needs both `tickets:write` and `tickets:read`.

Give each key only the scopes its system needs. If one key leaks, that limits what someone can do with it.

## What publishable keys can call

A publishable key can call only these routes, and only when it holds the listed scope:

| Route | Scope |
| --- | --- |
| `GET /me` | Any valid key |
| `POST /knowledge/search` | `knowledge:read` |
| `POST /chat/sessions` | `chat:write` |
| `GET /chat/sessions/{id}` | `chat:write` |
| `GET /chat/sessions/{id}/messages` | `chat:write` |
| `POST /chat/sessions/{id}/messages` | `chat:write` |

Every other route answers a publishable key with 403 and `"type": "permission_error"`, even for `GET /knowledge/documents`.

The chat routes also need the session's token in the `X-Chat-Session-Token` header when called with a publishable key, so one visitor cannot read another visitor's chat. See [Add chat to your website](/docs/api/website-chat).

Anything a publishable key can reach is effectively public, because anyone can copy it from your page. Only put knowledge in your agent that you are happy for anyone to search.

## Authentication errors

A missing, unknown or revoked key returns 401 with `"type": "authentication_error"`. The message says which case it is:

```json
{
  "error": {
    "type": "authentication_error",
    "message": "That API key is not valid. Check it was copied whole; keys start with vy_sk_ or vy_pk_."
  }
}
```

A valid key without the route's scope returns 403 with `"type": "insufficient_scope"` and the scope it needs:

```json
{
  "error": {
    "type": "insufficient_scope",
    "message": "This key lacks the tickets:write scope. Add it by creating a key that has it.",
    "required_scope": "tickets:write"
  }
}
```

See [Lists, errors and rate limits](/docs/api/pagination-errors) for every error type.

## Rotate and revoke keys

Revoking a key takes effect at once. Anything still using it gets a 401 from its next request. To replace a key without downtime:

1. Create a new key with the same scopes.
2. Deploy the new key to the system that uses the old one.
3. In **Studio → Developer → API keys**, check the old key's row. It shows when the key was last used; Veyra updates this at most once a minute. Wait until it stops changing.
4. Open the old key's menu and select **Revoke key**.

Revoking cannot be undone. Revoked keys stay in the list under **revoked keys**, so you can see who created them and when they stopped. A request with a revoked key gets a 401 that says the date it was revoked.

If a key may have leaked, revoke it first and replace it afterwards.

## Good practice

- Create one key per system. Then you can revoke one without breaking the others, and **Used** tells you which systems are active.
- Keep server keys in environment variables or a secrets manager, never in source code or client-side code.
- Give each key only the scopes it needs.
- Never log full keys. The `prefix` is enough to identify one.
