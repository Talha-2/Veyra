---
title: Add chat to your website
description: Put a chat with your agent on your own website, calling the chat API from the browser with a publishable key and a session token.
---

You can put a chat with your agent on any web page. The page calls the [chat API](/docs/api/chat) straight from the visitor's browser, using a publishable key. Every chat appears in Desk as a web chat conversation, so your team can follow it and reply.

Read [Chat with your agent](/docs/api/chat) first. It explains sessions, replies and the stream of events. This page covers what is different in a browser.

## Why a session token

A publishable key (`vy_pk_`) is in your page's source, so anyone can copy it. If the key alone were enough, anyone with it could read every chat on your site by trying session ids.

So with a publishable key, every call after the session is created must also send that session's token in the `X-Chat-Session-Token` header:

- `POST /chat/sessions` returns `session_token`, a string starting with `cs_`.
- `GET /chat/sessions/{id}`, `GET /chat/sessions/{id}/messages` and `POST /chat/sessions/{id}/messages` need `X-Chat-Session-Token: cs_...` with a publishable key.
- Without the token, or with the wrong one, they return 403 with `"type": "permission_error"`.

A session's token does not change. It works with any key of your organization that has `chat:write`. Server keys do not need to send it.

## Create a publishable key

1. Open **Studio → Developer** and select **New API key**.
2. Name it after the site, for example "Website chat".
3. Turn on **Publishable key**.
4. Under **Access**, give it **Write** for chat (`chat:write`). Add **Read** for knowledge (`knowledge:read`) only if your page also calls knowledge search.
5. Select **Create key** and copy it.

A publishable key cannot hold any other scope, and cannot call any route except `GET /me`, knowledge search and the chat routes. See [Authentication and scopes](/docs/api/authentication#what-publishable-keys-can-call).

## The flow

1. **Start a session once.** On the visitor's first chat, call `POST /chat/sessions` with a random `visitor.id`. Keep the returned `id` and `session_token` in the browser, for example in `localStorage`.
2. **Resume it on later visits** with the saved `id` and token. With a publishable key, `POST /chat/sessions` always starts a new session, even for a `visitor.id` it has seen before, so the saved token is the only way back into a chat.
3. **Load earlier messages** with `GET /chat/sessions/{id}/messages` and the token.
4. **Send messages** with `POST /chat/sessions/{id}/messages` and the token, and stream the reply.

The API allows requests from any website origin, so no server of your own is needed for this.

## A complete example

Save this as an HTML file, replace `vy_pk_REPLACE_ME` with your publishable key, and open it over `https://`, or from a local development server on your own machine. Browsers only allow `crypto.randomUUID()` on secure pages, and a file opened straight from disk may not count as one.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chat with us</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f5f5f7; }
    #chat { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #ddd; display: flex; flex-direction: column; height: 560px; }
    #log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 80%; padding: 8px 12px; border-radius: 12px; line-height: 1.4; white-space: pre-wrap; }
    .visitor { align-self: flex-end; background: #0a66ff; color: #fff; }
    .agent { align-self: flex-start; background: #eee; color: #111; }
    #form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #ddd; }
    #input { flex: 1; padding: 8px; font: inherit; }
  </style>
</head>
<body>
  <div id="chat">
    <div id="log" aria-live="polite"></div>
    <form id="form">
      <input id="input" autocomplete="off" maxlength="5000" placeholder="Ask us anything" aria-label="Message" required>
      <button id="send" type="submit" disabled>Send</button>
    </form>
  </div>

  <script>
    const API_BASE = '{{API_BASE}}';
    const PUBLISHABLE_KEY = 'vy_pk_REPLACE_ME';

    const log = document.getElementById('log');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const sendButton = document.getElementById('send');
    let session = null; // { id, session_token, ... }

    // The session this browser started, kept between visits.
    function savedSession() {
      try { return JSON.parse(localStorage.getItem('veyra_chat_session')); } catch (e) { return null; }
    }
    function saveSession(s) {
      try { localStorage.setItem('veyra_chat_session', JSON.stringify({ id: s.id, session_token: s.session_token })); } catch (e) {}
    }

    // Every call sends the publishable key; calls on a session also send its token.
    async function api(path, options = {}) {
      const headers = { Authorization: 'Bearer ' + PUBLISHABLE_KEY, 'Content-Type': 'application/json', ...options.headers };
      if (session) headers['X-Chat-Session-Token'] = session.session_token;
      const res = await fetch(API_BASE + path, { ...options, headers });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const error = new Error(body?.error?.message || 'HTTP ' + res.status);
        error.status = res.status;
        throw error;
      }
      return res;
    }

    // textContent, never innerHTML: replies are text, not markup.
    function bubble(role, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return div;
    }

    async function start() {
      // Resume the saved session; if it is gone, start a new one.
      session = savedSession();
      let history = { data: [] };
      if (session) {
        try {
          history = await (await api('/chat/sessions/' + session.id + '/messages?limit=50')).json();
        } catch (e) {
          session = null;
        }
      }
      if (!session) {
        const res = await api('/chat/sessions', {
          method: 'POST',
          body: JSON.stringify({ visitor: { id: 'web_' + crypto.randomUUID() } }),
        });
        session = await res.json();
        saveSession(session);
      }

      // Earlier messages come newest first from the API, so reverse them.
      for (const m of history.data.reverse()) {
        if (m.body) bubble(m.direction === 'inbound' ? 'visitor' : 'agent', m.body);
      }
      sendButton.disabled = false;
    }

    async function send(text) {
      bubble('visitor', text);
      const reply = bubble('agent', '...');
      let answer = '';

      const res = await api('/chat/sessions/' + session.id + '/messages', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: JSON.stringify({ message: text, stream: true }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const event = JSON.parse(line.slice(6));
            if (event.type === 'tool' && event.status === 'running' && !answer) {
              reply.textContent = event.label + '...';
            } else if (event.type === 'delta') {
              answer += event.text;
              reply.textContent = answer;
            } else if (event.type === 'message') {
              reply.textContent = event.message.body;
            } else if (event.type === 'error' && !answer) {
              console.warn('Agent error:', event.message);
              reply.textContent = 'Sorry, I could not answer that. Your message is saved and our team can see it.';
            }
          }
        }
        log.scrollTop = log.scrollHeight;
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !session) return;
      input.value = '';
      sendButton.disabled = true;
      try {
        await send(text);
      } catch (err) {
        console.warn(err);
        bubble('agent', err.status === 429
          ? 'You are sending messages too quickly. Please wait a minute and try again.'
          : 'Sorry, your message could not be sent. Please try again.');
      } finally {
        sendButton.disabled = false;
        input.focus();
      }
    });

    start().catch((err) => {
      console.warn(err);
      bubble('agent', 'Chat is not available right now.');
    });
  </script>
</body>
</html>
```

What the example does:

- It starts a session on the first visit and saves its `id` and `session_token` in `localStorage`. Later visits resume it and show the history again. If the saved session cannot be read, it starts a new one.
- It sends the token on every call after the session is created, by adding `X-Chat-Session-Token` in one place (`api()`).
- It streams replies and shows the agent's current step, such as "Searching knowledge...", until the first words of the reply arrive.
- It writes all text with `textContent`, so nothing in a message is run as HTML.

Messages added to the conversation by other means, for example with `POST /conversations/{id}/messages` from your server, show up the next time the page loads. To show them while the visitor is on the page, poll `GET /chat/sessions/{id}/messages` with `updated_since` every so often and add messages you have not shown yet. Keep the polling slow: see the limits below.

> [!SOON]
> Your team cannot reply to a chat from Desk yet. They can read every chat there, add notes and raise tickets.

## Rate limits

Two limits apply to a website chat:

- **120 requests a minute per key.** Every visitor on your site uses the same publishable key, so they all share this limit. Each page load makes one request (the history, or starting the session) and each message makes one.
- **30 messages a minute per key and session** for `POST /chat/sessions/{id}/messages`. One visitor sending quickly does not slow down anyone else.

Over either limit, the API returns 429. Browsers cannot read the `Retry-After` and `X-RateLimit-*` headers on these cross-origin responses, so on a 429 wait about a minute before sending again, as the example tells the visitor.

If your site is busy, create the sessions from your own server instead (see below), and consider a separate publishable key per site.

## Security

A publishable key is public. Plan for someone using it outside your page:

- **They can talk to your agent.** Anyone can start sessions and send messages, and the agent can use all its skills and actions in these chats, just as it does in **Talk**. Review what your agent's actions can do before you put it on a public page, and limit messages per visitor on your side if you can.
- **They can read what the agent can read.** Only put knowledge into your agent that is fine for anyone to see. With `knowledge:read`, the key can also search it directly.
- **The session token protects the chat.** Only the browser that started a session holds its token. With a publishable key, `POST /chat/sessions` always starts a new session, so sending someone else's `visitor.id` never returns their chat.
- **The browser cannot claim to be a customer.** With a publishable key, `visitor.email` and `visitor.phone` are never used to link the chat to an existing contact, because anyone could send someone else's details. To link signed-in customers, create the session on your server (below).
- **Never put a server key (`vy_sk_`) in the page.**

### Link signed-in customers from your server

If your visitors sign in to your site and you want their chats linked to their contact, create the session on your server with a server key, after you have checked who the user is:

1. The browser asks your server for a chat session.
2. Your server calls `POST /chat/sessions` with a server key, a `visitor.id` from your user record, and the user's verified `email` or `phone`.
3. Your server returns only `id` and `session_token` to the browser.
4. The browser uses the publishable key and that token for everything else, exactly as in the example.

This works because the session token is accepted with any key of your organization. With a server key, calling `POST /chat/sessions` again with the same `visitor.id` returns the user's open session, so your server can hand the same chat back each time they sign in.

## Test it

1. Open your page and send a message. The agent's reply streams in.
2. In Desk, open the inbox. The chat appears as a web chat conversation called "Website chat".
3. Reload your page. The conversation so far is shown again.

If the page shows "Chat is not available right now", open the browser console. A 401 means the key is wrong or revoked; a 403 `insufficient_scope` means the key does not have `chat:write`.
