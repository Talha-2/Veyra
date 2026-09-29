---
title: Webhooks
description: Receive signed HTTP POSTs when contacts, messages, calls, tickets, leads and automation runs change, and verify that they came from Veyra.
---

A webhook endpoint is a URL on your server that Veyra POSTs to when something changes in your organization: a ticket is raised, a lead moves stage, a call ends. Use webhooks instead of polling the API for changes.

Events fire whatever made the change: an operator in Desk, the agent during a call or chat, an automation, or your own API calls.

## Register an endpoint

The URL must start with `https://` and be at most 500 characters. It must be reachable from the internet: Veyra refuses to deliver to private, loopback and reserved IP addresses, and it does not follow redirects.

### In Studio

1. Open **Studio → Developer** and select the **Webhooks** tab.
2. Select **Add endpoint**.
3. Enter the **HTTPS URL**.
4. Leave **All events** on to receive every event, including event types added later. Or turn it off and choose the events you want.
5. Select **Add endpoint**.
6. Copy the signing secret. It is shown once, right after you add the endpoint.

Each endpoint card has a **Send test** button that sends a signed `test.ping` event straight away, and a list of **Recent deliveries** with what was sent and what your server answered.

### With the API

Use a server key with `webhooks:write`:

```bash
curl -X POST "{{API_BASE}}/webhook-endpoints" \
  -H "Authorization: Bearer $VEYRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://hooks.example.com/veyra", "events": ["ticket.created", "call.ended"]}'
```

Use `["*"]` for every event, including ones added later. The response includes the signing `secret`. It is returned only in this response, so store it now:

```json
{
  "id": 9,
  "object": "webhook_endpoint",
  "url": "https://hooks.example.com/veyra",
  "events": ["ticket.created", "call.ended"],
  "enabled": true,
  "disabled_reason": null,
  "consecutive_failures": 0,
  "last_delivered_at": null,
  "created_at": "2026-09-26T09:12:40Z",
  "updated_at": "2026-09-26T09:12:40Z",
  "secret": "whsec_..."
}
```

`GET /webhook-endpoints` and `GET /webhook-endpoints/{id}` (scope `webhooks:read`) show each endpoint's state, and `DELETE /webhook-endpoints/{id}` removes one. See the [Webhooks reference](/docs/api-reference/webhooks).

The API cannot change an endpoint after it is created. To change its events or URL, create a new endpoint and delete the old one. To switch an endpoint off and on, use the switch on its card in Studio.

## Events

| Event | Sent when |
| --- | --- |
| `contact.created` | A contact was created by an operator, the agent, a lead form or the API. |
| `contact.updated` | A contact's name, phone, email, company, stage, source, owner or value changed. |
| `contact.deleted` | A contact was deleted. `data.object` is the contact as it was. |
| `message.created` | Any new message on a conversation, inbound or outbound. This includes each visitor message and agent reply in a chat, and replies your team writes in Desk. |
| `message.received` | An inbound message arrived, on any channel. Also sent as `message.created`. |
| `email.received` | An inbound email arrived. Also sent as `message.created` and `message.received`. |
| `fax.received` | An inbound fax arrived. Also sent as `message.created` and `message.received`. |
| `call.started` | A call was created. |
| `call.ended` | A call finished: completed, failed, busy or unanswered. |
| `ticket.created` | A ticket was raised by an operator, the agent or the API. |
| `ticket.updated` | A ticket's subject, body, status, priority, type, contact or conversation changed. |
| `lead.created` | A contact was added to a pipeline. |
| `lead.updated` | A lead's value, source, follow-up date, note, contact or pipeline changed. |
| `lead.stage_changed` | A lead moved to another stage. |
| `run.started` | An automation run started. |
| `run.completed` | An automation run finished successfully. |
| `run.failed` | An automation run failed. |

> [!SOON]
> `email.received` and `fax.received` depend on the email and fax channels, which are not connected yet. You can subscribe to them today, but they are not sent until those channels are live. Inbound web chat messages already arrive as `message.received`.

> [!SOON]
> Phone calls are coming soon. Today `call.started` and `call.ended` are sent for voice sessions in the browser.

Changes to fields not listed above, such as a lead's position in a column, do not send an `*.updated` event. One change can send more than one event: moving a lead to another stage and editing its value in the same save sends both `lead.stage_changed` and `lead.updated`.

### The test event

**Send test** in Studio delivers a `test.ping` event to the endpoint, whatever events it subscribes to. Its `data.object` is `{"object": "test", "message": "Hello from Veyra. This is what a delivery looks like."}`. Answer it with a 2xx like any other event, and ignore event types you do not handle.

## What a delivery looks like

Each delivery is an HTTP `POST` with a JSON body and these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `User-Agent` | `Veyra-Webhooks/1.0` |
| `X-Veyra-Event` | The event type, for example `contact.updated`. |
| `X-Veyra-Delivery` | The id of this delivery attempt. A retry has a new one. |
| `X-Veyra-Attempt` | `1`, or `2` for the retry. |
| `X-Veyra-Signature` | `sha256=` followed by the hex HMAC-SHA256 of the raw body. |

The body is an event:

```json
{
  "id": "evt_01j8z6q9x4k2m7c3v5b1n0p8r6",
  "object": "event",
  "type": "contact.updated",
  "created_at": "2026-09-28T14:03:11Z",
  "organization_id": 1,
  "data": {
    "object": {
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
    },
    "previous_attributes": {
      "stage": "new"
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `id` | The event's id, starting `evt_`. It is the same on a retry, so use it to ignore duplicates. |
| `type` | The event type. |
| `created_at` | When the event happened, in ISO 8601 UTC. |
| `organization_id` | The organization it happened in. |
| `data.object` | The record, in the same shape the API returns for it, so one parser serves both. |
| `data.previous_attributes` | On `*.updated` and `lead.stage_changed` only: the old values of the fields that changed. |

On `lead.stage_changed`, `previous_attributes` holds the old `pipeline_stage_id`. The new stage is in `data.object.stage`.

Automation run events carry a `run` object:

```json
{
  "id": 51,
  "object": "run",
  "automation_id": 4,
  "trigger": "schedule",
  "status": "done",
  "result": "Sent the morning digest.",
  "error": null,
  "started_at": "2026-09-28T14:03:11Z",
  "ended_at": "2026-09-28T14:03:11Z",
  "created_at": "2026-09-26T09:12:40Z",
  "updated_at": "2026-09-28T14:03:11Z"
}
```

The payload of every event is in the [Webhooks reference](/docs/api-reference/webhooks).

## Verify the signature

Anyone can send a POST to your URL. Before you trust a delivery, check that it was signed with your endpoint's secret:

1. Read the **raw** request body, exactly as received. Do not parse it and serialize it again; the bytes would change and the signature would not match.
2. Compute the HMAC-SHA256 of the raw body, using the whole signing secret (including `whsec_`) as the key, and write it as lowercase hex.
3. Put `sha256=` in front and compare it with the `X-Veyra-Signature` header using a constant-time comparison.
4. If they differ, answer 401 and do nothing else.

Keep the signing secret in an environment variable, like an API key.

### Node.js

With Express, read the body as raw bytes on this route:

```js
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const secret = process.env.VEYRA_WEBHOOK_SECRET;

function isFromVeyra(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/veyra/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  if (!isFromVeyra(req.body, req.get('X-Veyra-Signature'), secret)) {
    return res.sendStatus(401);
  }

  const event = JSON.parse(req.body.toString('utf8'));
  res.sendStatus(204); // acknowledge first, then do the work

  handleEvent(event).catch((err) => console.error('webhook handling failed', event.id, err));
});

async function handleEvent(event) {
  switch (event.type) {
    case 'ticket.created':
      console.log('New ticket', event.data.object.id);
      break;
    default:
      // Ignore event types you do not handle, including test.ping.
  }
}

app.listen(3001);
```

`crypto.timingSafeEqual` throws if the two buffers have different lengths, which is why the length is checked first.

### Python

With Flask:

```python
import hashlib
import hmac
import json
import os

from flask import Flask, request

app = Flask(__name__)
SECRET = os.environ["VEYRA_WEBHOOK_SECRET"]


def is_from_veyra(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), (signature_header or "").encode())


@app.post("/veyra/webhooks")
def veyra_webhook():
    raw = request.get_data()
    if not is_from_veyra(raw, request.headers.get("X-Veyra-Signature"), SECRET):
        return "", 401

    event = json.loads(raw)
    if event["type"] == "ticket.created":
        print("New ticket", event["data"]["object"]["id"])
    # Ignore event types you do not handle, including test.ping.
    return "", 204
```

For slow work, put the event on a queue and answer 204 straight away.

### PHP

```php
<?php

$secret = getenv('VEYRA_WEBHOOK_SECRET');
$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_VEYRA_SIGNATURE'] ?? '';

$expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);

if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit;
}

$event = json_decode($rawBody, true);

if ($event['type'] === 'ticket.created') {
    error_log('New ticket ' . $event['data']['object']['id']);
}
// Ignore event types you do not handle, including test.ping.

http_response_code(204);
```

In Laravel, read the raw body with `$request->getContent()` and the header with `$request->header('X-Veyra-Signature')`. Exclude the route from CSRF protection.

## Answer quickly

Answer with any 2xx status within **5 seconds**. Anything else counts as a failed delivery: a 3xx, 4xx or 5xx status, no answer in time, or a connection that cannot be made. Veyra waits at most 3 seconds to connect.

Do the real work after you answer, or on a queue. A handler that calls other services before answering is the most common cause of timeouts.

## Delivery and retries

Events are sent a moment after the change, once it is saved. An event from a change that was rolled back is never sent.

Each event is sent to each subscribed endpoint once. If that attempt fails, Veyra retries **once, straight away**, only when:

- your server answered 5xx or 429, or
- the connection failed quickly, for example because nothing was listening.

A timeout or a 4xx answer is not retried. There are no later retries, so an event that fails twice is not sent again. Design for this:

- Use the event `id` to ignore an event you have already processed. The retry has the same `id`, and `X-Veyra-Attempt: 2`.
- Do not rely on the order events arrive in. Compare `updated_at` on the record if order matters.
- If you must not miss a change, also run a regular sync with `updated_since` (see [Lists, errors and rate limits](/docs/api/pagination-errors#sync-changes-with-updatedsince)), and fetch the latest version of a record from the API when in doubt.

## Automatic disabling

An endpoint that fails **10 events in a row** is turned off, so it stops receiving events. An event that fails on both attempts counts as one failure. One successful delivery resets the count to zero.

When an endpoint is turned off:

- `enabled` becomes `false` and `disabled_reason` says why, for example `Turned off after 10 failed deliveries in a row.`
- Its card in Studio says **Turned off automatically**.
- Events that happen while it is off are not stored for later.

To turn it back on:

1. Fix the problem. **Recent deliveries** on the endpoint's card shows each attempt, with what was sent, the status your server answered and its response body.
2. Select **Send test** and check that it is delivered.
3. Switch the endpoint back on with the switch on its card. This resets the failure count.

Then catch up on what you missed with an `updated_since` sync.

`consecutive_failures` on the endpoint shows how close it is to being turned off. Studio shows a warning on the card when the last few deliveries failed.

## Test locally

Your development machine is usually not reachable from the internet, and Veyra does not deliver to private addresses. Use a tunnelling tool that gives you a public HTTPS URL forwarding to your local server, register that URL as an endpoint, and use **Send test**.
