---
title: Tickets
description: Track every follow-up the team or the agent has promised, from the moment it is raised until it is resolved.
---

A ticket is a follow-up that needs a person. The agent raises one when a customer's issue cannot be solved in the conversation; your team raises them from a conversation, a contact or the Tickets page. Open them at **Desk → Tickets**.

Each ticket has a reference number, such as **#12**, that you can read to a customer.

## Statuses and priorities

| Status | Meaning |
|---|---|
| **Open** | New, not started. |
| **In progress** | Someone is working on it. |
| **Pending** | Waiting on something, such as the customer or another team. |
| **Resolved** | Done. |
| **Closed** | Finished and filed. |

Setting a ticket to **Resolved** or **Closed** records when it was resolved. Moving it back to an earlier status clears that time.

Priorities are **Low**, **Normal**, **High** and **Urgent**. Lists sort urgent tickets first. When there are open urgent tickets, the page header shows a red badge (for example **3 urgent**); select it to see them.

## Find tickets

- Choose a scope: **Open** (everything not resolved), **Mine** (not resolved and assigned to you), **Raised by agent** (not resolved and raised by the agent) or **Resolved** (resolved and closed).
- Search with **Search tickets**. It matches the subject and the contact's name.
- Open the filters to choose a **Type** or a **Priority**.
- Switch between **Board**, **List** and **Table**.

The scope, filters and view are part of the page address, so you can share them as a link.

## Board

The board has one column per status. In the **Resolved** scope the columns are **Resolved** and **Closed**; in the other scopes they are **Open**, **In progress** and **Pending**. Drag a card to another column to change its status, or within a column to change its order. Select **Add ticket** at the bottom of a column to create a ticket in that status.

Each card shows the subject, reference, contact, type, priority, an **Agent** badge if the agent raised it, and the people assigned.

## List

The list groups tickets by status. Each row shows the subject, reference, contact, type, priority, assignees and when it was last updated. Change the status from the status pill on the row. Select **Add** on a group to create a ticket in that status.

## Table

The table shows 50 tickets per page. Select **Ticket**, **Ref**, **Priority**, **Status** or **Updated** to sort.

Tick the boxes to select several tickets, then change their **Status** or **Priority**, or assign them, all at once. Each ticket records the change in its own activity.

## Create a ticket

From the Tickets page:

1. Select **New ticket**.
2. Enter a **Subject** and, if you like, **Details**.
3. Choose a **Priority** and a **Type**.
4. Choose people under **Assign**. If you leave it empty, the type's default people are assigned.
5. Select **Create ticket**.

Use this for a follow-up that did not start in a conversation. You can also raise a ticket:

- from a conversation, with **Raise a ticket**, which links it to the conversation and its contact (see [Inbox and conversations](/docs/desk/inbox#raise-a-ticket));
- from a contact's page, with **Ticket** (see [Contacts](/docs/desk/contacts));
- through the API, with `POST /tickets` (see the [Tickets reference](/docs/api-reference/tickets)).

## Tickets the agent raises

When a customer needs something the agent cannot finish, the worker raises a ticket with the **Create ticket** action. The agent is instructed never to tell a customer "I've passed this to the team" until that ticket exists.

A ticket raised by the agent:

- carries the **Raised by the agent** label and shows the agent as its creator;
- is linked to the call or conversation it came from, and to the contact if one is known;
- gets the type's default people as assignees when the agent names a type that exists, and each of them gets an in-app notification;
- appears on the call page under **Tickets from this call**.

When a call ends with work left unfinished, the agent can raise one ticket after the call, recording what was done and what the team needs to do next.

Use the **Raised by agent** scope to check these tickets. If it is empty, nothing the agent promised is still open.

## A ticket's page

Select a ticket to open it. The header shows the reference, status, priority and, when there is one, **Open conversation**.

The main panel shows who opened the ticket, when, where it came from (for example **Created by hand** or **From web chat**), and its details.

On the side:

- **Status**, **Priority** and **Type**: change them from the selectors.
- **Assigned**: choose the people who own it.
- **Tags**: select the edit button to add or remove tags.
- **Contact**: the customer, with their phone, email and company.
- **Linked conversation**: the thread the ticket came from.

### Discussion

**Discussion** combines the team's notes with the ticket's activity (status, priority and assignment changes). Filter it with **All**, **Notes** or **Activity**.

To add a note, write what the next person should know and select **Save note**. Notes are for the team; the customer never sees them.

## Ticket types

A ticket type groups tickets (for example Billing, Repair, Complaint) and can have default people who are assigned automatically. Every new organization starts with one type, **General**.

Ticket types are managed in **Studio → Settings → Ticket types**. You need access to Studio to change them. See [Organization and team](/docs/studio/settings).
