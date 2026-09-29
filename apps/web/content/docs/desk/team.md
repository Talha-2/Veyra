---
title: Team and notifications
description: See who is on the team and what each person is carrying, and choose which events notify you.
---

Desk's **Team** page answers a shift question: who is busy, who is free, and who can take the next conversation. **Notifications** tells you when something needs you. Changing who is on the team and what they can open happens in Studio.

## The Team page

Open **Desk → Team**. At the top, four tiles show:

| Tile | Shows |
|---|---|
| **People** | Members of this organization. |
| **Active now** | People who used Veyra in the last five minutes. |
| **Open conversations** | Conversations assigned across the team. |
| **Open tickets** | Tickets assigned and not yet resolved. |

Sort the list with **Busiest first**, **Available first** or **Name**, and search with **Name, email or extension**.

Each row shows:

| Column | Meaning |
|---|---|
| **Person** | Name and email. The dot on the picture shows presence. |
| **Status** | **Active now** (in the last five minutes), **Away** (in the last hour), or when the person was last seen. **Not signed in** if they have no session. |
| **Role** | **Owner**, **Admin** or **Member**. |
| **Workload** | Open conversations and open tickets assigned to the person, with a bar compared with the busiest person. **Free** means nothing is assigned. |
| **Extension** | The number the agent will dial to transfer a call to this person. |
| **Can open** | **Desk**, **Studio** or both. |

> [!NOTE]
> Presence comes from each person's last activity in the app. On a server that does not record sessions in its database, **Active now** shows a dash and presence is unknown.

> [!SOON]
> Transferring a call to a person is coming soon, because phone lines are not live yet. The **Extension** column is tagged **Coming soon**. You can still record an extension for each person in Studio.

## Manage the team

The Team page in Desk is read-only. Owners and admins see a **Manage in Studio** button, which opens **Studio → Settings → Team & access**. There they can:

- change a member's **Role**;
- choose what each person **Can open**: Desk, Studio or both;
- set a member's extension;
- remove a member with **Remove from team**. They lose access to Desk and Studio immediately.

An organization always keeps at least one owner. See [Organization and team](/docs/studio/settings) and [Studio and Desk access](/docs/getting-started/concepts#studio-and-desk-access).

> [!SOON]
> Inviting new people by link or email is coming soon. **Invite** is turned off in **Studio → Settings → Team & access**.

## Notifications

Open **Desk → Notifications** to see alerts for you in the current organization. The header says how many are unread.

- Choose **All** or **Unread**.
- Select a notification to open what it is about. Opening it marks it as read.
- Select **Mark all read** to clear the unread count.
- Select **Preferences** to choose what reaches you.

### What sends a notification today

Today, Desk creates an in-app notification when **the agent raises a ticket** and the ticket's type has default people. Each of those people is notified, and the notification opens the ticket.

## Notification preferences

Select **Preferences** on the Notifications page to open **What reaches you**. For each event you choose whether it shows **In Desk** and whether it arrives by **Email**. The switches at the top of each column turn an entire column on or off. Your choices are yours alone and apply only to this organization.

The events are:

| Event | Why you might want it |
|---|---|
| A conversation is assigned to you | Someone, or the agent, hands you a thread to answer. |
| A new conversation arrives unassigned | Useful for whoever triages. Noisy for everyone else. |
| A ticket is assigned to you | A ticket lands on you, by hand or by its type's default. |
| The agent raises a ticket | The agent told a caller the team would follow up. |
| An agent action needs a human to check | An action timed out and may or may not have happened. |
| An automation run fails | A workflow stopped partway through. |
| A reminder is due | A reminder you set on a conversation or contact comes due. |

Select **Save preferences** to keep your changes.

> [!SOON]
> Email notifications are coming soon. The **Email** column is tagged **Coming soon** and its switches are turned off. Today, only the agent-raised ticket notification described above is delivered, in Desk. Check **Desk → Calls → Needs review** and your dashboard for the other events.
