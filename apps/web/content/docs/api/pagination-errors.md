---
title: Lists, errors and rate limits
description: How list endpoints page with cursors, the error format and every status code, and how to stay under the rate limit.
---

This page covers the rules every endpoint shares: how lists are paged, how errors look, and how many requests a key may make.

## Lists

Every list endpoint returns the same shape:

```json
{
  "object": "list",
  "data": [
    { "id": 42, "object": "contact", "name": "Maya Hartley" }
  ],
  "has_more": true,
  "next_cursor": "eyJpZCI6NDEsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0"
}
```

| Field | Meaning |
| --- | --- |
| `data` | The records on this page, newest first. |
| `has_more` | `true` if another page follows. |
| `next_cursor` | Pass it as `cursor` to get the next page. `null` on the last page. |

Lists are ordered newest first, by `id`.

### Parameters

These query parameters work on every list:

| Parameter | Meaning |
| --- | --- |
| `limit` | Records per page, from 1 to 100. The default is 25. |
| `cursor` | The `next_cursor` from the previous page. Pass it back unchanged. |
| `updated_since` | Only records whose `updated_at` is at or after this time, in ISO 8601, for example `2026-09-01T00:00:00Z`. |

Many lists have their own filters too, such as `q` and `stage` on contacts. The [API reference](/docs/api-reference/contacts) lists them for each endpoint.

A `limit` outside 1 to 100, a cursor that was changed, or a time that cannot be read returns a 422 that names the field.

URL-encode `updated_since`. A time with an offset such as `+02:00` contains a `+`, which means a space in a query string if you do not encode it. Using UTC with a `Z` avoids this.

### Page through a list

Keep the same filters on every page and pass each `next_cursor` back as `cursor` until `has_more` is `false`.

```js
// Node.js 18 or later
const API_BASE = '{{API_BASE}}';
const headers = { Authorization: `Bearer ${process.env.VEYRA_API_KEY}` };

async function* listAll(path, params = {}) {
  let cursor = null;
  do {
    const query = new URLSearchParams({ ...params, limit: '100' });
    if (cursor) query.set('cursor', cursor);

    const res = await fetch(`${API_BASE}${path}?${query}`, { headers });
    const page = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${page.error.type}: ${page.error.message}`);

    yield* page.data;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
}

for await (const contact of listAll('/contacts', { stage: 'qualified' })) {
  console.log(contact.id, contact.display_name);
}
```

```python
import os
import requests

API_BASE = "{{API_BASE}}"
session = requests.Session()
session.headers["Authorization"] = f"Bearer {os.environ['VEYRA_API_KEY']}"


def list_all(path, **params):
    params["limit"] = 100
    while True:
        res = session.get(f"{API_BASE}{path}", params=params, timeout=10)
        page = res.json()
        if not res.ok:
            raise RuntimeError(f"{res.status_code} {page['error']['type']}: {page['error']['message']}")
        yield from page["data"]
        if not page["has_more"]:
            return
        params["cursor"] = page["next_cursor"]


for contact in list_all("/contacts", stage="qualified"):
    print(contact["id"], contact["display_name"])
```

`requests` URL-encodes `params` for you, including the cursor and `updated_since`.

### Sync changes with `updated_since`

To keep a copy of Veyra's records in your own system, fetch only what changed since your last run:

1. Before you start a run, note the current time in UTC.
2. List with `updated_since` set to the time you noted at the start of the previous run, and page through every result.
3. Save the time from step 1 for the next run.

Taking the time before the run starts means a record that changes while you are paging is picked up next time. Your code may then see the same record twice, so write records by `id`.

Deleted records do not appear in lists. To learn about deleted contacts, subscribe to the `contact.deleted` [webhook](/docs/api/webhooks).

## Errors

Every error has the same shape and a matching HTTP status:

```json
{
  "error": {
    "type": "validation_error",
    "message": "The subject field is required.",
    "fields": {
      "subject": ["The subject field is required."]
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `type` | A stable code. Use it in your code. |
| `message` | A description for people. It may change; do not match on it. |
| `fields` | 422 validation errors only: the messages for each field that failed. |
| `required_scope` | `insufficient_scope` errors only: the scope the route needs. |

### Status codes and types

| Status | `type` | When |
| --- | --- | --- |
| 401 | `authentication_error` | No key, an unknown key, a revoked key, or the key's organization no longer exists. |
| 403 | `insufficient_scope` | The key does not have the scope the route needs. `required_scope` names it. |
| 403 | `permission_error` | A publishable key called a route that is not publishable, or a chat call with a publishable key had a missing or wrong `X-Chat-Session-Token`. |
| 404 | `not_found` | No record with that id in this key's organization, or no such route. |
| 405 | `method_not_allowed` | The route exists but not with that HTTP method. |
| 422 | `validation_error` | A parameter or body field is wrong. `fields` names each one. |
| 422 | `not_permitted` | Recording a message to an address that is blocked or has do-not-disturb on. |
| 422 | `channel_not_supported` | Recording a message on a conversation whose channel does not take messages from the API. |
| 429 | `rate_limited` | Too many requests. Wait for the number of seconds in `Retry-After`. |
| 500 | `api_error` | Something failed on Veyra's side. It is logged. |
| 503 | `agent_unavailable` | Chat only: the agent could not reply. The visitor's message is still saved. |

A 403 with `insufficient_scope` looks like this:

```json
{
  "error": {
    "type": "insufficient_scope",
    "message": "This key lacks the tickets:write scope. Add it by creating a key that has it.",
    "required_scope": "tickets:write"
  }
}
```

A 422 on a field that refers to another record, such as a `contact_id` that does not exist in your organization, names that field in `fields`:

```json
{
  "error": {
    "type": "validation_error",
    "message": "The selected contact id is invalid.",
    "fields": {
      "contact_id": ["The selected contact id is invalid."]
    }
  }
}
```

### Which errors to retry

| Retry | Do not retry without a change |
| --- | --- |
| 429, after `Retry-After` | 401: fix or replace the key |
| 500, with a growing wait | 403: use a key with the right scope |
| Network errors and timeouts | 404, 405: check the id and the route |
| | 422: fix the request using `fields` |

A 503 `agent_unavailable` from chat has already saved the visitor's message. Sending the same message again records it twice, so let the visitor decide whether to try again.

Take care when you retry a request that creates something, such as `POST /tickets`. If the first attempt reached Veyra before the connection failed, a retry creates a second record. Check first, for example by listing recent tickets, before you retry a create.

## Rate limits

Each key may make **120 requests a minute**. The limit is per key: two keys have separate limits.

Every request made with a valid key counts, including ones that fail with 403, 404 or 422. A request refused with 429 does not count.

Responses to requests made with a valid key carry these headers:

| Header | Meaning |
| --- | --- |
| `X-RateLimit-Limit` | Requests allowed in the window: `120`. |
| `X-RateLimit-Remaining` | Requests left in the current window. |
| `X-RateLimit-Reset` | When the window resets, in Unix seconds. |
| `Retry-After` | On a 429 only: seconds to wait before trying again. |

Over the limit, the API answers 429:

```json
{
  "error": {
    "type": "rate_limited",
    "message": "Rate limit of 120 requests a minute reached. Retry in 12 s."
  }
}
```

Sending chat messages has a second limit: `POST /chat/sessions/{id}/messages` accepts **30 requests a minute per key and session**. A 429 from this limit has the same error shape and a `Retry-After` header. See [Chat with your agent](/docs/api/chat#rate-limits).

### Back off and retry

Wait for `Retry-After` on a 429. For 5xx and network errors, wait longer after each attempt and stop after a few tries.

```js
async function veyra(path, options = {}, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`{{API_BASE}}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${process.env.VEYRA_API_KEY}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (err) {
      if (attempt >= attempts) throw err; // network error
    }

    if (res && res.status !== 429 && res.status < 500) return res;
    if (attempt >= attempts) return res;

    const retryAfter = Number(res?.headers.get('Retry-After'));
    const waitSeconds = retryAfter > 0 ? retryAfter : Math.min(2 ** attempt, 30);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }
}

const res = await veyra('/tickets?limit=10');
const body = await res.json();
if (!res.ok) throw new Error(`${body.error.type}: ${body.error.message}`);
```

```python
import os
import time
import requests

API_BASE = "{{API_BASE}}"
session = requests.Session()
session.headers["Authorization"] = f"Bearer {os.environ['VEYRA_API_KEY']}"


def veyra(method, path, attempts=5, **kwargs):
    for attempt in range(1, attempts + 1):
        try:
            res = session.request(method, f"{API_BASE}{path}", timeout=10, **kwargs)
        except requests.ConnectionError:
            if attempt == attempts:
                raise
            res = None

        if res is not None and res.status_code != 429 and res.status_code < 500:
            return res
        if attempt == attempts:
            return res

        retry_after = res.headers.get("Retry-After") if res is not None else None
        wait = int(retry_after) if retry_after else min(2 ** attempt, 30)
        time.sleep(wait)


res = veyra("GET", "/tickets", params={"limit": 10})
body = res.json()
if not res.ok:
    raise RuntimeError(f"{body['error']['type']}: {body['error']['message']}")
```

Only use this helper for requests that are safe to repeat, such as `GET`. See [Which errors to retry](#which-errors-to-retry).

To avoid 429s, spread steady work over time instead of sending it in bursts, and watch `X-RateLimit-Remaining`. For changes you would otherwise poll for, use [webhooks](/docs/api/webhooks) instead.
