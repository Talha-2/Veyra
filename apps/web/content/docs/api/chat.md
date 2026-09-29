---
title: Chat with your agent
description: Start chat sessions, send messages and get your agent's replies from your own backend, as JSON or as a stream of server-sent events.
---

The chat API lets your product talk to your organization's AI agent: the same agent that answers in Studio **Talk**, with the same skills, knowledge, memory and actions. You send the customer's message, the agent reads the conversation so far, uses its tools if it needs to, and answers.

Every chat session is a web chat conversation in Desk. Your team can read it, and reply to it, like any other conversation.

This page is about calling the chat API from your backend with a server key. To put a chat box on a website with a publishable key, read this page first and then [Add chat to your website](/docs/api/website-chat).

## Before you start

- Create a server key with the `chat:write` scope in **Studio → Developer**. See [Authentication and scopes](/docs/api/authentication).
- Set up your agent in Studio and try it in **Talk**. The chat API gives you exactly what Talk shows.

The examples use these variables:

```bash
export VEYRA_API_KEY="vy_sk_..."
```

```js
const API_BASE = '{{API_BASE}}';
const headers = {
  Authorization: `Bearer ${process.env.VEYRA_API_KEY}`,
  'Content-Type': 'application/json',
};
```

```python
import os
import requests

API_BASE = "{{API_BASE}}"
HEADERS = {"Authorization": f"Bearer {os.environ['VEYRA_API_KEY']}"}
```

## 1. Start a session

A session belongs to one visitor, identified by an id you choose. Call `POST /chat/sessions`:

```bash
curl -X POST "{{API_BASE}}/chat/sessions" \
  -H "Authorization: Bearer $VEYRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"visitor": {"id": "user_8841", "name": "Maria Delgado", "email": "maria.d@example.com"}}'
```

```js
const res = await fetch(`${API_BASE}/chat/sessions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ visitor: { id: 'user_8841', name: 'Maria Delgado', email: 'maria.d@example.com' } }),
});
const session = await res.json();
if (!res.ok) throw new Error(session.error.message);
```

```python
res = requests.post(
    f"{API_BASE}/chat/sessions",
    headers=HEADERS,
    json={"visitor": {"id": "user_8841", "name": "Maria Delgado", "email": "maria.d@example.com"}},
    timeout=10,
)
session = res.json()
if not res.ok:
    raise RuntimeError(session["error"]["message"])
```

| Field | Required | Meaning |
| --- | --- | --- |
| `visitor.id` | Yes | Your stable id for this person, up to 128 characters. |
| `visitor.name` | No | Their name, up to 120 characters. |
| `visitor.email` | No | Links the chat to an existing contact with this email. |
| `visitor.phone` | No | Links the chat to an existing contact with this phone number. |

The response:

```json
{
  "id": 318,
  "object": "chat_session",
  "conversation_id": 318,
  "status": "open",
  "contact_id": 12,
  "visitor": { "id": "user_8841", "name": "Maria Delgado", "email": "maria.d@example.com" },
  "session_token": "cs_4f1c9a...",
  "created_at": "2026-09-28T16:02:11+00:00",
  "updated_at": "2026-09-28T16:02:11+00:00"
}
```

Things to know:

- **One open session per visitor (server keys).** With a server key, calling again with the same `visitor.id` returns that visitor's open session with status 200 instead of creating a new one (201). You can call it every time the visitor comes back instead of storing the session id. With a publishable key every call starts a new session: see [Add chat to your website](/docs/api/website-chat).
- **The id is the Desk conversation.** `id` and `conversation_id` are the same number.
- **Linking to a contact (server keys).** If `email` or `phone` matches a contact that already exists, the session is linked to it and `contact_id` is set. Publishable keys never link a contact this way, because a browser can send anyone's details. The agent then knows who it is talking to, including their open tickets and recent calls. If nothing matches, this call does not create a contact. Only pass an email or phone that you have verified belongs to this visitor.
- **`session_token`** is only needed with publishable keys. A server key can ignore it. See [Add chat to your website](/docs/api/website-chat).
- **Closed conversations.** If your team closes or snoozes the conversation in Desk, the next `POST /chat/sessions` for that visitor starts a new session. `GET /chat/sessions/{id}` returns the current `status`: `open`, `snoozed` or `closed`.

## 2. Send a message

Send the visitor's text to `POST /chat/sessions/{id}/messages`. By default the call waits until the agent has finished and returns the whole reply as JSON.

```bash
curl -X POST "{{API_BASE}}/chat/sessions/318/messages" \
  -H "Authorization: Bearer $VEYRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Do you come out to Evanston?"}'
```

```js
const res = await fetch(`${API_BASE}/chat/sessions/${session.id}/messages`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ message: 'Do you come out to Evanston?' }),
  signal: AbortSignal.timeout(200_000),
});
const turn = await res.json();
if (!res.ok) throw new Error(`${turn.error.type}: ${turn.error.message}`);
console.log(turn.reply.body);
```

```python
res = requests.post(
    f"{API_BASE}/chat/sessions/{session['id']}/messages",
    headers=HEADERS,
    json={"message": "Do you come out to Evanston?"},
    timeout=(10, 200),
)
turn = res.json()
if not res.ok:
    raise RuntimeError(f"{turn['error']['type']}: {turn['error']['message']}")
print(turn["reply"]["body"])
```

`message` is required and can be up to 5,000 characters.

The response has the visitor's stored message, the agent's stored reply, and the steps the agent took:

```json
{
  "object": "chat_reply",
  "session_id": 318,
  "message": {
    "id": 9012,
    "object": "message",
    "conversation_id": 318,
    "channel": "web_chat",
    "direction": "inbound",
    "status": "received",
    "subject": null,
    "body": "Do you come out to Evanston?",
    "from": "api:user_8841",
    "to": null,
    "from_agent": false,
    "sent_by_user_id": null,
    "read_at": null,
    "created_at": "2026-09-28T16:02:15Z",
    "updated_at": "2026-09-28T16:02:15Z"
  },
  "reply": {
    "id": 9013,
    "object": "message",
    "conversation_id": 318,
    "channel": "web_chat",
    "direction": "outbound",
    "status": "sent",
    "subject": null,
    "body": "Yes, Evanston is in our service area. A diagnostic visit is $89, waived if you go ahead with the repair.",
    "from": null,
    "to": null,
    "from_agent": true,
    "sent_by_user_id": null,
    "read_at": null,
    "created_at": "2026-09-28T16:02:19Z",
    "updated_at": "2026-09-28T16:02:19Z"
  },
  "steps": [
    {
      "name": "search_knowledge",
      "label": "Searched knowledge",
      "detail": "Evanston service area",
      "status": "done",
      "summary": "Service area: ...Evanston, Oak Park and Naperville are inside the area.",
      "ms": 212
    }
  ]
}
```

A reply that uses several tools can take a while. Veyra waits up to 180 seconds for the agent, so give your HTTP client a longer timeout than its default. To show progress while the agent works, [stream the reply](#stream-the-reply).

### When the agent cannot answer

If the agent cannot reply, the call returns 503 with `"type": "agent_unavailable"`. The visitor's message is still saved, and `message_id` is its id. Your team can see it in Desk and answer there.

```json
{
  "error": {
    "type": "agent_unavailable",
    "message": "The agent is not available right now. Your message is saved and the team can see it.",
    "message_id": 9012
  }
}
```

Do not send the same message again automatically: it would be saved twice.

## Stream the reply

To show the reply as it is written, and the agent's steps as they happen, ask for server-sent events. Either add `"stream": true` to the body or send `Accept: text/event-stream`.

```bash
curl -N -X POST "{{API_BASE}}/chat/sessions/318/messages" \
  -H "Authorization: Bearer $VEYRA_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "Do you come out to Evanston?", "stream": true}'
```

The response has status 200 and `Content-Type: text/event-stream`. Each event is one `data:` line holding a JSON object, followed by a blank line. There are no `event:` lines; the kind of event is in its `type` field.

```text
data: {"type":"status","text":"Thinking"}

data: {"type":"tool","id":"call_1","name":"search_knowledge","status":"running","label":"Searching knowledge","detail":"Evanston service area"}

data: {"type":"tool","id":"call_1","name":"search_knowledge","status":"done","label":"Searched knowledge","detail":"Evanston service area","summary":"Service area: ...","ms":212}

data: {"type":"delta","text":"Yes, Evanston is in our service area."}

data: {"type":"delta","text":" A diagnostic visit is $89, waived if you go ahead with the repair."}

data: {"type":"done","content":"Yes, Evanston is in our service area. A diagnostic visit is $89, waived if you go ahead with the repair.","tokens":512,"model":"..."}

data: {"type":"message","message":{"id":9013,"object":"message","conversation_id":318,"channel":"web_chat","direction":"outbound","status":"sent","subject":null,"body":"Yes, Evanston is in our service area. A diagnostic visit is $89, waived if you go ahead with the repair.","from":null,"to":null,"from_agent":true,"sent_by_user_id":null,"read_at":null,"created_at":"2026-09-28T16:02:19Z","updated_at":"2026-09-28T16:02:19Z"}}
```

### Event types

| `type` | Fields | Meaning |
| --- | --- | --- |
| `status` | `text` | The agent has started, for example `"Thinking"`. |
| `tool` | `id`, `name`, `status`, `label`, `detail`, and when finished `summary`, `ms` | A step the agent is taking. Each step is sent when it starts (`status: "running"`) and again when it finishes (`"done"` or `"error"`), with the same `id`. |
| `delta` | `text` | The next piece of the reply. Append it to what you have. |
| `done` | `content`, `tokens`, `model` | The agent has finished. `content` is the whole reply text. |
| `message` | `message` | The stored reply, as a message object. Sent after `done`. |
| `error` | `message` | The agent could not finish. `message` describes the problem. |

A successful stream ends with `done` and then `message`. A failed one ends with `error`. If an `error` arrives after some `delta` text, the partial reply is still saved and a `message` event may follow it.

Errors found before the stream starts, such as a bad key (401), a missing scope (403), an unknown session (404), an empty message (422) or too many requests (429), are returned as normal JSON errors with that status, not as a stream. Check the status before you read events.

Once the stream has started, the status is always 200: a problem with the agent arrives as an `error` event, not as a 503.

### Read the stream

```js
// Node.js 18 or later
const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
  method: 'POST',
  headers: { ...headers, Accept: 'text/event-stream' },
  body: JSON.stringify({ message: 'Do you come out to Evanston?', stream: true }),
});
if (!res.ok) {
  const { error } = await res.json();
  throw new Error(`${error.type}: ${error.message}`);
}

const decoder = new TextDecoder();
let buffer = '';
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end;
  while ((end = buffer.indexOf('\n\n')) !== -1) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'tool' && event.status === 'running') console.log(`[${event.label}]`);
      if (event.type === 'delta') process.stdout.write(event.text);
      if (event.type === 'message') console.log(`\nSaved as message ${event.message.id}`);
      if (event.type === 'error') console.error(`\nAgent error: ${event.message}`);
    }
  }
}
```

```python
import json

with requests.post(
    f"{API_BASE}/chat/sessions/{session_id}/messages",
    headers={**HEADERS, "Accept": "text/event-stream"},
    json={"message": "Do you come out to Evanston?", "stream": True},
    stream=True,
    timeout=(10, 200),
) as res:
    if not res.ok:
        error = res.json()["error"]
        raise RuntimeError(f"{error['type']}: {error['message']}")

    for raw in res.iter_lines():
        line = raw.decode("utf-8")
        if not line.startswith("data: "):
            continue
        event = json.loads(line[6:])
        if event["type"] == "tool" and event["status"] == "running":
            print(f"[{event['label']}]")
        elif event["type"] == "delta":
            print(event["text"], end="", flush=True)
        elif event["type"] == "message":
            print(f"\nSaved as message {event['message']['id']}")
        elif event["type"] == "error":
            print(f"\nAgent error: {event['message']}")
```

The Python example decodes each line as UTF-8 itself, because `requests` does not assume UTF-8 for `text/event-stream`.

If your client disconnects in the middle of a stream, the agent stops soon after, and any reply text it had written by then is saved.

## The agent's steps

`steps` in the JSON response, and the `tool` events in a stream, show what the agent did to answer: searching knowledge, looking up the contact, raising a ticket, running one of your actions.

| Field | Meaning |
| --- | --- |
| `name` | The tool's name, for example `search_knowledge`. Your own actions appear under their names. |
| `label` | A short description for people, such as "Searched knowledge". |
| `detail` | The most useful argument, such as the search query, or `null`. |
| `status` | `done` or `error`, or `running` while a streamed step is in progress. |
| `summary` | The start of the step's result or error, up to 280 characters. |
| `ms` | How long the step took, in milliseconds. |

Use `label` and `detail` if you want to show progress to your users. `summary` can contain internal data from your knowledge and actions, so think before you show it to customers.

## 3. Read the history

`GET /chat/sessions/{id}/messages` returns the session's messages, newest first, as a paged [list](/docs/api/pagination-errors):

```bash
curl "{{API_BASE}}/chat/sessions/318/messages?limit=50" \
  -H "Authorization: Bearer $VEYRA_API_KEY"
```

It holds three kinds of message:

| Who wrote it | `direction` | `from_agent` | `sent_by_user_id` |
| --- | --- | --- | --- |
| The visitor | `inbound` | `false` | `null` |
| The agent | `outbound` | `true` | `null` |
| Someone on your team, in Desk | `outbound` | `false` | The team member's id |

To show messages in reading order, reverse the page. To pick up replies your team writes in Desk, either poll with `updated_since` set to the time of your last check, or subscribe to the `message.created` [webhook](/docs/api/webhooks) and look for messages with `sent_by_user_id` set.

`GET /chat/sessions/{id}` returns the session itself, including its `status`.

## In Desk

Each session appears in the Desk inbox as a web chat conversation with the subject "Website chat". The visitor's address is `api:` followed by your `visitor.id`, and the conversation is linked to the contact if `email` or `phone` matched one.

Your team can read the chat as it happens, reply, add notes, raise tickets and close it. Some things to know:

- The agent answers every message sent through the API, including after someone on your team has replied. The agent sees your team's replies as part of the conversation.
- The agent reads the most recent 30 messages of the conversation for each reply.
- Every visitor message sends the `message.created` and `message.received` webhooks, and every agent reply sends `message.created`.

## Rate limits

Chat calls count towards your key's limit of 120 requests a minute, like every other call.

Sending messages has a second limit: `POST /chat/sessions/{id}/messages` accepts 30 requests a minute per key and session, so a busy session never slows down the others. Over the limit you get a 429 with a `Retry-After` header. See [Lists, errors and rate limits](/docs/api/pagination-errors#rate-limits).

> [!WARNING]
> Each message runs a full agent turn, with model calls and possibly actions. Put your own limits in front of the chat API, such as a maximum number of messages per visitor, so that one user or a script cannot send it an unlimited number of messages.
