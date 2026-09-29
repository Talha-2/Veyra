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
| MCP | **MCP server** | A server you add. See the note below. |

An action does nothing until two things are true: it is **On** on this page, and it is granted to an expert on the expert's page (or allowed in an automation). See [Experts](/docs/studio/experts#tools) and [Automations](/docs/studio/automations).

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
| **Approval** | A person must confirm it before it runs. |

A write that is not repeatable is never retried. If it times out, nobody knows whether it happened, so Veyra records it as unconfirmed and the agent does not tell the customer that it worked, or that it failed. These actions appear under **Needs a human to check** on the [Overview](/docs/studio/overview) page, with a link to the conversation in Desk. Check the other system by hand.

By default, built-in actions time out after 5 seconds, and app and HTTP actions after 15 seconds.

> [!SOON]
> Approving actions is coming soon. Today, an action with **Approval** on is not run during the conversation: it is recorded for review, and the agent tells the customer it needs a person. There is no screen to approve it yet.

## Watch how actions perform

The **Last 7 days** column shows each action's success rate and number of calls, and either its timeouts or its p95 duration. Use the filters above the table: **All**, **On**, **Off** and **Needs attention**. An action needs attention when its success rate is under 90% or when a write that is not repeatable has timed out.

## MCP servers

> [!SOON]
> MCP tools are coming soon. You can add an MCP server (**Add → Add MCP server**, with its URL, transport and authentication) and press **Test** to check that it is reachable, but the agent cannot call MCP tools yet. Use a custom HTTP action or a connected app instead.

## Related

- [Experts](/docs/studio/experts)
- [Automations](/docs/studio/automations)
- [Overview](/docs/studio/overview)
