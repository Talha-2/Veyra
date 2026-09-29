---
title: Desk overview
description: Veyra Desk is the team's workspace for everything the agent handles: conversations, calls, contacts, leads and tickets.
---

Veyra Desk is where your team works with customers. The agent answers first; Desk shows you everything it did, and gives your team the tools to follow up. Desk opens at `{{APP_URL}}/desk`.

Desk is for the people who handle customers every day. Building and changing the agent happens in [Veyra Studio](/docs/studio/overview), which is granted separately.

## Who can open Desk

Every role opens Desk by default: **Owner**, **Admin** and **Member**. An owner or admin can change who opens what in **Studio → Settings → Team & access**. See [Core concepts](/docs/getting-started/concepts#studio-and-desk-access).

If you have both products, switch between them from the menu at the top of the sidebar. It shows the product you are in and your organization. Under **Products**, choose **Veyra Desk** or **Veyra Studio**. Under **Organizations**, switch to another organization you belong to.

## The pages

The sidebar has these pages:

| Page | What it is for |
|---|---|
| **Dashboard** | Your day: what needs you, what the agent did, and how the team is loaded. |
| **Inbox** | Every conversation, with the agent's replies and the steps it took. See [Inbox and conversations](/docs/desk/inbox). |
| **Calls** | Every voice session, with summary, transcript and actions. See [Calls and recordings](/docs/desk/calls). |
| **Contacts** | Everyone the business deals with. See [Contacts](/docs/desk/contacts). |
| **Leads** | Contacts moving through a sales pipeline. See [Leads and pipelines](/docs/desk/leads). |
| **Tickets** | Follow-ups for the team, including those the agent raised. See [Tickets](/docs/desk/tickets). |
| **Team** | Who is on the team and what each person is carrying. See [Team and notifications](/docs/desk/team). |
| **Notifications** | Alerts for you, such as a ticket the agent raised. See [Team and notifications](/docs/desk/team#notifications). |

Press Ctrl + K (⌘ + K on a Mac) to open the command palette and jump to any page by typing its name.

## The dashboard

**Dashboard** is where Desk opens. It greets you and shows:

- **Needs you**: three tabs. **Conversations** assigned to you, **Tickets** assigned to you, and **Overdue** items: your reminders and lead follow-ups that are past their date.
- The numbers for the period you choose (**7 days**, **14 days** or **30 days**): **Conversations**, **Agent handled alone**, **Calls answered** and **New leads**. **Agent handled alone** also shows its share of all conversations.
- **What the agent did**: a summary of the agent's work, its latest actions, and the team's ratings of its replies.
- **Team workload**, **Tickets** by status, and **Channels** where conversations started.

When an action the agent took needs a person to check it, a warning appears at the top with a **Review calls** button. See [Calls that need review](/docs/desk/calls#calls-that-need-review).

## How work reaches Desk

Work arrives in Desk in these ways today:

- **A customer talks to the agent.** Voice sessions and chats become conversations in the inbox. Calls also appear under **Calls**.
- **The agent does something.** A ticket it raises appears under **Tickets** with the **Raised by the agent** label, and its actions appear on the call or conversation.
- **Your team adds it.** People create tickets, leads and contacts by hand, or import leads from a CSV file.
- **Your systems add it.** The REST API can create contacts, tickets, leads and notes. See [API overview](/docs/api/overview).

Your own tests from **Studio → Talk** also land in Desk. They are named **Studio test · *your name***, so they are easy to tell apart from customers.

> [!SOON]
> Phone numbers, SMS and email are not live yet, so customers cannot reach the agent by phone or text today, and your team cannot reply to customers from Desk. Customers reach the agent by chat through the [chat API](/docs/api/chat) on your website. See [What's live and coming soon](/docs/getting-started/availability).

## The agent and the team, side by side

Desk always shows who did what:

- Messages from the agent carry an **Agent** badge. Messages from a colleague show their name.
- Tickets, notes and activity created by the agent show a robot icon.
- On every call you can see what the agent said and, separately, what it actually did, so a promise the agent made can be checked against a record.

Your team can rate the agent's replies with **Good reply** or **Bad reply**. Those ratings show on the dashboard and help whoever maintains the agent in Studio.
