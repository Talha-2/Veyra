---
title: Calls and recordings
description: Review every voice session the agent took: what was said, what it did about it, and which calls need a person to check.
---

**Desk → Calls** lists every voice session the agent took. For each call you can read what was said, and check what the agent actually did: every handoff from the front desk to the worker, and every action with its result. When the agent says "I've booked that", the call page shows whether a booking action really ran.

> [!SOON]
> Phone numbers and real phone calls are coming soon. Today, calls come from voice sessions in the browser, started in **Studio → Talk**. Outbound calls, call transfer to a person and call recording are also coming soon. See [What's live and coming soon](/docs/getting-started/availability).

## The calls list

At the top, four tiles count calls and open the matching view:

| Tile | Counts |
|---|---|
| **Today** | Calls since midnight. |
| **Needs review** | Calls where an action timed out and may or may not have happened. |
| **Live now** | Calls ringing or in progress. |
| **All calls** | Every call. |

Switch views with **All**, **Today**, **Needs review** and **Live**. To search, type a number or a name in **Number or name, then Enter** and press Enter.

Each row shows:

| Column | Meaning |
|---|---|
| **Caller** | The contact, or the caller's number or address. |
| **What happened** | The call summary. It is written when the call ends. |
| **Length** | How long the call lasted. |
| **Handoffs** | How many times the front desk handed work to the worker, and how many tools ran. |
| **p95** | How fast the agent answered, in milliseconds. Shown in amber when it is over 1800 ms. |
| **Status** | For example **completed** or **failed**, or **Live** and **Review** badges. |
| **When** | The time of the call. |

The list shows 50 calls per page. Use **Newer** and **Older** to page through.

A browser session from **Studio → Talk** shows **Studio test · *your name*** as the caller. If the voice agent does not join a browser session within 15 minutes, the call is marked **failed**.

## The call page

Select a call to open it. The header shows the direction, the language, the date and the length, with badges for the status and the number of handoffs and tools. Use **Contact** to open the caller's profile and **Open conversation** to see the call in the inbox.

### What happened

A short summary of the call, written by the agent when the call ends.

### Handoffs

Each handoff is one piece of work the front desk (the talker) gave to the worker. Select a handoff to expand it:

- **Sent to the worker**: the part of the conversation the worker received.
- **Came back · private guidance, not spoken**: what the worker returned to the talker. The caller never hears this text directly; the talker says it in its own words.
- **Tools**: each action the worker called, with its kind, its status, and its **Arguments** and **Result** (or **Error**). Actions that change data carry a **Writes** badge.

A handoff is labelled **Replied**, **Needs review**, or with its failure. **Durable write confirmed** means an action that changes data finished successfully. **After the call** marks the silent pass the worker makes once the caller has hung up: it can finish work the caller already agreed to, or raise one ticket for anything left unfinished. It never contacts the caller.

If the agent handled the call without handing anything off, the page says so: the call was informational only. Tool calls made outside any handoff are listed under **Outside any handoff**.

### Transcript

The conversation turn by turn, in the language it was spoken. The caller is on the right and the agent on the left.

### Side panel

- **Call**: when, length, from, to, language, and any error.
- **Latency**: how long the agent took to start speaking after the caller stopped, as **p50** and **p95**, compared with budgets of 1.2 s and 1.8 s.
- **Tickets from this call**: tickets raised on this conversation during or after the call. If the agent promised a follow-up, there should be one here.

## Calls that need review

Some actions change another system: raising a ticket, booking in a calendar, updating a record. If such an action times out, Veyra cannot know whether it happened. It does not guess. The call is marked **Needs review**, and the call page shows the warning **Needs review before anyone calls back**, naming the action.

Before you tell the customer anything:

1. Open the call and find the action marked with a warning.
2. Read its **Arguments** to see what the agent tried to do.
3. Check the other system to see whether it took effect.
4. Only then repeat the action, or tell the customer it is done.

When nothing needs review, the **Needs review** view says so. That is the healthy state.

## Recordings

The call page has a place for the recording, and a transcript line with a time can play the recording from that point.

> [!SOON]
> Call recording is coming soon. Browser voice sessions are not recorded, so the call page shows **No recording was kept for this call**. The transcript and summary are always kept.

## From the inbox

Every call also belongs to a conversation. In **Desk → Inbox**, the call appears as a card in the timeline with its summary. Open the card to read the transcript and the agent's work without leaving the thread. See [Inbox and conversations](/docs/desk/inbox).

Calls are also available through the API. See the [Calls reference](/docs/api-reference/calls).
