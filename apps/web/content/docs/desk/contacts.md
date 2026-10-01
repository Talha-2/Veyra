---
title: Contacts
description: Everyone the business deals with, with their conversations, tickets, leads, notes and history in one place.
---

A contact is a person the business deals with. Their conversations, calls, tickets and leads all link to them, so one page shows everything about them. Open the list at **Desk → Contacts**.

## How contacts are created

There is no blank "new contact" form on the Contacts page. Contacts are created where the person first appears:

- **By the agent.** During a conversation, the worker can save the customer as a contact once it knows their name, and links the conversation to them. The activity reads "Contact created by the agent during a call" (or "during a chat"). If the phone number or email already belongs to a contact, the agent uses that contact instead of creating a duplicate.
- **From a conversation.** When a conversation has no contact yet, open the details pane in the inbox and select **Create contact**. The whole history of that conversation moves to the new contact. See [Inbox and conversations](/docs/desk/inbox#the-details-pane).
- **From a lead.** Adding a lead for someone new creates the contact too, and so does a CSV import of leads. See [Leads and pipelines](/docs/desk/leads).
- **Through the API.** `POST /contacts` creates a contact. See the [Contacts reference](/docs/api-reference/contacts).

A chat visitor is linked to an existing contact when your website passes an email or phone number that matches one (see [Chat with your agent](/docs/api/chat)). Otherwise the conversation stays anonymous until the agent or someone on the team creates a contact for it. The agent can also link an anonymous conversation to an existing contact, but only when the customer gives the phone number or email on that contact; a name alone is not enough.

## The contacts list

The list is sorted by most recent contact first, so the people you spoke to this week are at the top. It shows 40 contacts per page.

- Filter with **All**, **Starred**, or a stage: **New**, **Open**, **Qualified**, **Won** or **Lost**.
- Search with **Search contacts**. It matches name, phone, email and company.
- Switch between **Table** and **Cards**.
- Select the star on a row to star or unstar a contact.

The table columns are **Name**, **Stage**, **Channels** (the channels this person has used), **Reach** (phone or email), **Owner**, **Threads** (number of conversations) and **Last activity**.

The search, filter and layout are part of the page address, so you can share a filtered list as a link.

### Export

Select **Export CSV** to download the contacts that match the current search and stage. The file has the columns Name, Phone, Email, Company, Stage, Source, Owner, Value, Last contact and Created.

## A contact's page

Select a contact to open their page.

### The header

- The name, with a star to mark them as starred.
- The stage. Select it to change it.
- **From** and the source, such as a call, an import or the API.
- Up to three tags.
- Four facts: **Phone**, **Email**, **Last contact** and **Open pipeline value** (the total value of their leads). Hover a phone number or email to copy it.

The header buttons are:

| Button | What it does |
|---|---|
| **Call** | Opens your device's phone app with the number. It does not place a call through Veyra. |
| **Ticket** | Opens **New ticket**, raised against this contact. Enter a **Subject**, **Priority**, **Type** and **Details**, then **Create ticket**. |
| **Message** | Coming soon. |

> [!SOON]
> Sending a message to a contact is coming soon. Messages go out by SMS or email, and neither channel is live yet, so **Message** and **Send a message** are turned off. To follow up today, raise a ticket or add a note.

### Tabs

| Tab | Shows |
|---|---|
| **Activity** | What happened, grouped by day: stage changes, assignments, and what the agent did for this person. Agent entries have a robot icon. |
| **Conversations** | Every conversation with this person, with its channel, status, last message and unread count. Select one to open it in the inbox. |
| **Tickets** | Tickets about this person. Tickets the agent raised are marked "raised by the agent". |
| **Notes** | Notes for the team. Write in the box and select **Add note**, or press Ctrl + Enter. Only your team sees notes. |

### The side panels

- **Details**: name, company, stage, source, value and the date the contact was added.
- **Owner**: the person responsible for this contact. Choose **Assign an owner…** or **Change owner…**.
- **Ways to reach**: every phone number, email and web session on file. Use the **…** menu on one to **Block** it or turn on **Do not disturb**. Veyra does not send messages to a blocked address or one with do-not-disturb on.
- **Tags**: type in **Add a tag…** to add a tag.
- **Pipelines**: the leads for this contact, with pipeline, stage, source and value. If there are none, **Add as a lead** opens the Leads page.

## Stages

Each contact has one stage:

| Stage | Typical meaning |
|---|---|
| **New** | Just appeared. |
| **Open** | In an active conversation. |
| **Qualified** | A real prospect or customer need. |
| **Won** | Became a customer or closed successfully. |
| **Lost** | Did not go ahead. |

The stage belongs to the contact. A lead's stage in a pipeline is separate. See [Leads and pipelines](/docs/desk/leads).

## Change a contact's details

In Desk you can change a contact's stage, owner and tags, and add notes. To change the name, email or company, use the API (`PATCH /contacts/{id}`). The agent can also correct a contact's name, phone, email or company during a conversation, but only for the customer it is talking to; that change is recorded in **Activity**. A phone or email that already belongs to another contact is refused, so two records are never silently merged.
