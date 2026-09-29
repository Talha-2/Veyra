---
title: Organization and team
description: Organization details, who can open Studio and Desk, ticket types, lead pipelines, and your own profile and sessions.
---

**Studio → Settings** holds everything that is not the agent itself. It has three groups:

| Group | Pages |
| --- | --- |
| Organization | **Details**, **Team & access** |
| Product | **Ticket types**, **Lead pipelines** |
| You | **Profile**, **Sessions** |

You can also reach **Organization settings** from the account menu in the sidebar.

## Roles

Everyone in an organization has one role.

| Role | Can change the organization, its members and their access | Opens by default |
| --- | --- | --- |
| **Owner** | Yes | Desk and Studio |
| **Admin** | Yes | Desk and Studio |
| **Member** | No | Desk only |

The role sets what a new member can open by default, but access to Desk and Studio is set per person and can be changed. For example, an owner can give a member Studio without making them an admin, or take Studio away from an admin. Members are Desk-only by default because Studio changes how the agent behaves in live conversations.

An organization always needs at least one owner.

## Details

**Settings → Details** (owners and admins can edit):

- **Name**: what your team sees. When you rename the organization, its **Identifier** changes to match. If the agent's business name or greeting still contains the old name, they are updated to the new one; anything you wrote yourself is left alone.
- **Identifier**: follows the name. Use **Copy identifier** to copy it.
- **Timezone**: use a region name such as `Asia/Karachi`. The page shows the current time there.

Press **Save changes** after editing.

## Team & access

**Settings → Team & access** lists everyone in the organization with their role and what they can open.

Owners and admins can:

- Change a person's **Role**.
- Change what they **Can open**: press **Desk** or **Studio** to grant or remove it. Everyone needs at least one.
- Use **Remove from team** in a person's menu. They lose access to Desk and Studio at once. You cannot remove yourself.

Other members see the list but cannot change it.

> [!SOON]
> Inviting people is coming soon. The **Invite** button and **Pending invitations** are shown but not active yet. Extensions (the **Extension** column) are also coming soon, together with phone calls.

## Ticket types

**Settings → Ticket types** controls how tickets are sorted and who gets them. The agent uses them too: a ticket it raises with a type goes to that type's people without anyone sorting it first.

To add a type, press **New type** and fill in:

- **Name**, for example "Billing".
- **Colour**: marks the type everywhere a ticket appears in Desk.
- **Description**: one line saying what belongs here, for example "Invoices, refunds and payment questions". The agent reads the names and descriptions of your enabled types when it raises a ticket, so make them clear.
- **Default assignees**: new tickets of this type, including ones the agent raises, go to these people.

Use the switch on a type to turn it off. A type that is off is hidden when creating tickets and is not offered to the agent; existing tickets keep it. Every new organization starts with a type called **General**. See [Tickets](/docs/desk/tickets).

## Lead pipelines

**Settings → Lead pipelines** sets the stages a lead moves through on the Desk board, left to right.

- **New pipeline** creates a pipeline with the stages New, Contacted, Won and Lost.
- Rename, recolour, reorder or remove stages, up to 12 per pipeline, then press **Save pipeline**. Leads in a removed stage move to the first stage, so none disappear from the board.
- A new organization starts with a **Sales** pipeline, marked **Default**. Pipelines you add later are not the default.

See [Leads and pipelines](/docs/desk/leads).

## Profile

**Settings → Profile** is your own account:

- **Name**: shown to teammates on conversations you handle and notes you leave.
- **Email**: you sign in with it.
- **Password**: enter your **Current password**, a **New password** (at least 8 characters) and **Confirm new password**, then press **Change password**.

Press **Save changes** after editing your name or email.

## Sessions

**Settings → Sessions** lists every browser where you are signed in, most recently active first, with **This device** marked. If you do not recognise one, go to **Sign out everywhere else**, enter **Your password** and press the sign-out button (for example **Sign out 2 others**). This device stays signed in. Then change your password.
