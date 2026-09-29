---
title: Inbox and conversations
description: Read every conversation the agent had, see what it did, and follow up with assignments, notes, reminders and tickets.
---

The inbox is where your team reads every conversation with customers. Each conversation shows the customer's messages, the agent's replies, the steps the agent took, any calls, and your team's notes, reminders and tickets, in one timeline. Open it at **Desk → Inbox**.

## The layout

The inbox has up to four panes, from left to right:

1. **Views**: built-in views, channels and saved views.
2. **The conversation list**, with search and sort.
3. **The thread**: the timeline and the message box.
4. **Details** about the customer. Show or hide it with **Show details** in the thread header.

Each conversation has its own address (`{{APP_URL}}/desk/inbox/` followed by its number), so you can bookmark it or paste a link to a colleague.

## Views

The built-in views are:

| View | Shows |
|---|---|
| **All** | Open conversations, and snoozed ones whose time has come. |
| **Assigned to me** | Open conversations assigned to you. |
| **Unassigned** | Open conversations nobody owns yet. |
| **Unread** | Open conversations with messages nobody has read. |
| **Starred** | Conversations anyone has starred. |
| **Snoozed** | Conversations sleeping until a later time. |
| **Closed** | Closed conversations. Nothing is ever deleted. |

Under **Channels**, pick **Call**, **SMS**, **Email**, **Chat** or **Fax** to show only that channel. Today, conversations come from **Call** (voice sessions) and **Chat**.

## Find a conversation

- Type in **Search name, number or message** to search contact names, phone numbers, email addresses and message text.
- Select **Sort** to order by **Recent**, **Oldest**, **Unread**, **Created** or **Contact**.
- Select a tag in the details pane to show only conversations with that tag.
- Press ↑ and ↓ (or j and k) to move through the list.

The list shows up to 80 conversations at a time. Narrow it with a view, a channel or a search.

### Saved views

A saved view keeps a set of filters as one click.

1. Filter the list by channel, tag or search.
2. Next to **Saved**, select **+**.
3. Enter a name in **Name this view**.
4. Turn on **Share with team** if everyone should see it.
5. Select **Save view**.

To delete a saved view you created, hover it and select the bin icon.

## Read a thread

In the timeline:

- The customer's messages are on the left. The agent's replies are on the right with an **Agent** badge. A colleague's messages are on the right with their name.
- Above an agent reply, you can see the steps it took, such as a knowledge search or a lookup.
- A call shows as a card with its summary. Open the card to read the transcript and the agent's work. See [Calls and recordings](/docs/desk/calls).
- Notes, reminders and tickets appear in the timeline at the time they were added.

Filter the timeline with **All**, **Customer**, **Agent**, **Team** or **Calls**.

Hover a message to **Pin** it. Pins are personal: the messages you pinned are listed at the top of the thread (for example **2 pinned**), so you can jump back to them. On the agent's messages you can also choose **Good reply** or **Bad reply**. The team's ratings show on the dashboard.

## Work a conversation

The thread header has these controls:

| Control | What it does |
|---|---|
| **Assign** | Choose who owns the conversation. Add an optional **Handover note**, which is saved as a note. |
| **Star** | Mark the conversation for the **Starred** view. |
| **Tags** | Add or remove tags. |
| **Snooze** | Hide it until **Later today**, **Tomorrow**, **This weekend** or **Next week**. It returns to **All** at that time. **Wake it now** brings it back early. |
| **Close conversation** | Move it to **Closed**. **Reopen conversation** brings it back. |
| **More actions** | **Add a note**, **Set a reminder…**, **Raise a ticket…**, **Assign or transfer…**, do-not-disturb, and block. |

### Internal notes

Notes are for the team. The customer never sees them.

1. In the message box, select **Internal note**. The box turns amber.
2. Write the note.
3. Press Ctrl + Enter (⌘ + Enter on a Mac) or select **Save note**.

### Reminders

1. Select **Set a reminder** in the message box, or **More actions → Set a reminder…**.
2. Enter **What** and **When**.
3. Select **Set reminder**.

The reminder shows in the thread and in the details pane. When it is past due, it shows on your dashboard under **Overdue**.

### Raise a ticket

1. Select **Raise a ticket** in the message box, or **More actions → Raise a ticket…**.
2. Enter a **Subject** and, if you like, **Details**.
3. Choose a **Priority** and a **Type**.
4. Choose people under **Assign to**, or leave it empty to use the type's default people.
5. Select **Create ticket**.

The ticket is linked to the conversation and its contact. See [Tickets](/docs/desk/tickets).

### Bulk actions

Hover a conversation's picture and tick the box that appears to select it. With conversations selected, you can **Mark as read**, **Star**, **Assign** (or **Unassign everyone**), **Close**, or **Reopen** in the **Closed** view.

## The details pane

The details pane shows who the customer is and what is open on them:

- The contact's name, company, phone, email and stage, with links to **Call**, **Email** and **Profile**. **Call** and **Email** open your device's phone or email app.
- If the conversation has no contact yet, select **Create contact**. The whole history moves to the new contact.
- **Do not disturb** and **Block** switches for the address the customer used.
- **Conversation tags**, **Tickets**, **Reminders**, **Activity** and **Files**.

**Block** and **Do not disturb** (on for 30 days) stop Veyra from sending messages to that address, from the agent or through the API.

## Replying to customers

> [!SOON]
> Replying to customers from Desk is coming soon. Replies go out by SMS or email, and neither channel is live yet. On those conversations the **Reply** tab is off and shows **Coming soon**. **New conversation** is also coming soon. Notes, reminders, tickets and assignments work today.

On call conversations, **Reply** is off because a call cannot be answered in text. On chat conversations, **Reply** is also off: the agent answers chats, and a person cannot take over a chat from Desk today. Use **Internal note** in both cases.
