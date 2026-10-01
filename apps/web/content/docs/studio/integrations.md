---
title: Integrations and actions
description: Connect apps, call your own endpoints, and decide how each action the agent can take is allowed to fail.
---

An action is something the agent can do outside the conversation: look up a customer, raise a ticket, create an event in a calendar, call your own API. **Studio → Integrations** lists every action, where it comes from, and how it behaves when something goes wrong.

The page has two parts:

- **Connections**: the apps and servers the agent acts through. Connections belong to the organization, not to one person.
- **Actions**: everything the agent can do, with a switch to turn each one on or off.

Across the top, four numbers cover the last 7 days: **Apps connected**, **Actions on**, **Calls, last 7 days** and **Success rate**.

## Where actions come from

| Kind | Label | Where it comes from |
| --- | --- | --- |
| Built-in | **Built-in** | Part of Veyra. Works without a connection. For example **Find contact**, **Create ticket**, **Recent calls**, **Recent tickets**. |
| App | **Composio** | An app you connect from the catalog. |
| Your endpoint | **HTTP request** | A custom HTTP action you define. |
| MCP | **MCP server** | A tool on an MCP server you add. See [MCP servers](#mcp-servers). |

An app, HTTP or MCP action does nothing until two things are true: it is **On** on this page, and it is granted to an expert on the expert's page (or allowed in an automation). See [Experts](/docs/studio/experts#tools) and [Automations](/docs/studio/automations).

Built-in actions are different: every worker can use them in calls and chats unless you turn them **Off** on this page. Granting one to an expert lets you see it on the expert's page; an automation still gets only the actions you allow it.

## Built-in actions

These work on your own records in Desk, with no connection. The agent picks one by its description, which you can edit. Each use is a tool call, and each change shows in Desk as an activity by the agent.

| Action | What the agent does with it |
| --- | --- |
| **Find contact** | Looks a customer up by phone, email or name. With no details, it looks up who the conversation is with. |
| **Create contact** | Saves the customer as a contact and links the conversation to them. If their phone or email is already on file, it uses that contact instead of making a duplicate. |
| **Update contact** | Corrects the customer's name, phone, email or company. |
| **Link contact** | Links the conversation to an existing contact when the customer writes or calls from somewhere new. It needs the phone number or email on that contact. |
| **Add note** | Leaves an internal note on the contact or on the conversation. |
| **Contact history** | Reads the customer's earlier conversations, call summaries and tickets. |
| **Create ticket** | Raises a ticket under one of your ticket types, assigned to that type's default people and linked to the customer and the conversation. |
| **Recent tickets** | Lists tickets. |
| **Ticket status** | Reads one ticket by its number, for example #12. |
| **Update ticket** | Adds a note to a ticket, reopens it, marks it **Pending** (waiting on the customer) or raises its priority. |
| **Summarize conversation** | Leaves a summary note on the conversation and adds tags. |
| **Set reminder** | Sets a reminder for the team on the conversation, for a named teammate if one matches. |
| **Hand off to a person** | Assigns the conversation to a teammate (or a ticket type's people), tags it **Needs attention**, marks it unread and notifies them. |
| **Save lead** | Adds the customer to your default pipeline, or moves their lead forward. |
| **Recent calls** | Lists recent calls with their summaries. |

### What the agent cannot do

In a call or chat, the agent acts only for the customer in that conversation:

- It cannot read or change another customer's contact, tickets or calls. If a customer gives someone else's name, the agent sees only a masked record. To link a conversation to an existing contact, the customer must give the phone number or email on that contact.
- It cannot close a ticket, mark one **In progress**, reopen a **Closed** ticket, or lower a priority your team set. It can mark a ticket **Resolved** only to withdraw one it raised in the same conversation.
- It cannot re-type a ticket your team raised, or move a lead to the last stage of a pipeline (for example **Won**), or move a lead back.
- A hand-off is not a live transfer. The agent tells the customer the team will follow up.
- It does not send texts or emails. It does not save memories from a customer conversation.

In **Ask** and in automations, the person on the other end works for your business, so the agent can read any record. The ticket and lead rules above still apply.

> [!SOON]
> Sending a text or an email to the customer. Until SMS and email are live, the agent is not offered a way to send them.

## Connect an app

Veyra connects to third-party apps, such as calendars and CRMs, through Composio.

1. Open **Studio → Integrations** and press **Connect an app**.
2. Search the catalog or pick a category. Press **Connect** on the app.
3. If the app uses an API key, paste it into **API key**.
4. Under **Tools the agent may be granted**, choose the tools you want. They are grouped as **Reads** (look things up, change nothing) and **Writes** (change something in the app). **Reads only** and **None** are shortcuts.
5. Press **Connect** (for an API-key app) or **Continue to** the app's name (for an app with a sign-in). With a sign-in, your browser goes to the provider, then comes back to Integrations.

Each tool you chose becomes an action. The actions stay off until the connection is live, so nothing is offered to the agent that cannot run.

If a sign-in was not finished, the app shows its status on the Integrations page. Use the app's menu:

- **Check again** asks Composio for the connection's current status.
- **Connect again** restarts the sign-in (in the catalog).
- **Disconnect** removes the connection and its actions from every expert.

> [!NOTE]
> If the catalog page shows **Curated mode**, this deployment has no Composio key. Connections are recorded without a real sign-in, and the agent cannot act through them.

## Custom HTTP actions

Use a custom HTTP action to call any endpoint of your own, such as a booking system.

1. Press **Add → Custom HTTP action**.
2. Fill in:
   - **Name**, for example "Book a job".
   - **Method**: **POST** or **GET**.
   - **Description**: the agent decides when to call the action from this alone. Say what it does and when to use it.
   - **URL**.
   - **Authentication**: **None**, **Bearer**, **Basic (user:pass)** or **Header (Name: value)**, with its **Secret**. The secret is never sent back to the browser; re-enter it when you save changes.
   - **Parameters**: press **Add parameter** for each value the agent must supply. Give each a lowercase name, a description written for the agent, and tick **Required** if needed.
3. Set the switches (see below) and press **Create action**.

The agent fills in the parameters. With POST they are sent as a JSON body; with GET, as query parameters. A response with status 400 or higher counts as a failure.

To test it, open the action again with the pencil button, enter sample arguments as JSON under **Send a test request**, and press **Send test request**. The response appears at the top of the page under **Test request**, exactly as the agent would receive it.

## How an action is allowed to fail

Each action has three switches in the table. Open **How each action is allowed to fail** on the page for a summary.

| Switch | Meaning |
| --- | --- |
| **Repeatable** | Calling it twice with the same input is harmless, so a dropped connection is retried automatically. Built-in actions are always repeatable. |
| **Writes** | It changes something outside. The agent will not hang up while one is in flight. |
| **Approval** | The agent does not run it. It asks, and a person approves or rejects the request. See [Approve actions](#approve-actions). |

A write that is not repeatable is never retried. If it times out, nobody knows whether it happened, so Veyra records it as unconfirmed and the agent does not tell the customer that it worked, or that it failed. These actions appear under **Needs a human to check** on the [Overview](/docs/studio/overview) page, with a link to the conversation in Desk. Check the other system by hand.

By default, built-in actions time out after 5 seconds, and app and HTTP actions after 15 seconds.

## Approve actions

Turn on **Approval** for an action that should never run without a person's yes, such as a refund.

When the agent wants to run such an action, it does not run it. It records a request with the arguments it would use, and tells the customer that a member of the team will review it. It never says the action was done.

Requests appear on the [Overview](/docs/studio/overview#waiting-for-approval) page under **Waiting for approval**, oldest first, with the action, who it is for, the expert that asked, and the arguments.

- **Approve** runs the action once, now, exactly as the agent asked, and shows the result. If the action writes, you are asked to confirm first.
- **Reject** records that it never ran.

Each request can be decided once. If two people press **Approve** at the same time, it runs once. If the agent layer cannot be reached, nothing runs and the request keeps waiting.

> [!NOTE]
> Nobody tells the customer the result of an approved action automatically. If they need to know, follow up from the conversation in Desk. In **Try it** on a skill, an action that needs approval is simulated and no request is created.

## Watch how actions perform

The **Last 7 days** column shows each action's success rate and number of calls, and either its timeouts or its p95 duration. Use the filters above the table: **All**, **On**, **Off** and **Needs attention**. An action needs attention when its success rate is under 90% or when a write that is not repeatable has timed out.

## MCP servers

An MCP server offers its own tools. Each tool becomes an action you can grant to an expert, like any other action.

1. Press **Add → Add MCP server**.
2. Fill in:
   - **Name**, for example "Booking system".
   - **URL** of the server.
   - **Transport**: **Streamable HTTP** (most current servers) or **SSE** (the older transport).
   - **Authentication**: **None**, **Bearer token**, or **Custom header** (as `Name: value`). The secret is stored encrypted and never shown again.
3. Press **Add server**.
4. Press **Test** on the server's row. Veyra connects to the server, reads its list of tools, and adds each one as an action.
5. Grant the actions you want to an expert on the expert's page.

New MCP actions start **On**. A tool the server marks as read-only is set as **Reads** and **Repeatable**; every other tool is set as **Writes**. Check the switches before you grant a tool that changes something.

Press **Test** again whenever the server's tools change. Tools are refreshed, the switches you set are kept, and tools the server no longer offers are removed from every expert.

If the server cannot be reached or refuses the connection, the server's row shows the reason. When the agent calls a tool, a server error or a tool error is reported to the agent as a failure, never as a success.

> [!NOTE]
> The connection to the server is made by the agent layer. If the agent layer is not connected, **Test** shows an error and no tools are loaded.

> [!SOON]
> In [automations](/docs/studio/automations), MCP actions work only from servers with no authentication for now. Experts can use MCP actions from any server.

## Related

- [Experts](/docs/studio/experts)
- [Automations](/docs/studio/automations)
- [Overview](/docs/studio/overview)
