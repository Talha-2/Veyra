---
title: Core concepts
description: The words used across Studio, Desk and the API, and how the pieces fit together.
---

This page explains the building blocks of Veyra. Each section links to the guide that covers it in depth.

## Agent

The agent is the AI that your customers talk to. Each organization has one agent, with one name, greeting, voice, set of languages and business profile. You configure it in Studio.

The same agent answers on every channel. A voice session and a chat use the same knowledge, skills, memory and actions. See [Identity and greeting](/docs/studio/identity) and [Voice and languages](/docs/studio/voice).

## Talker and worker

On a voice call, the agent is two parts working together.

**The talker** owns every word the caller hears. It runs on a small, fast model so it can answer without long pauses. It answers questions from the business profile and the knowledge base by itself.

**The worker** does the tasks: looking up records, following skills, raising tickets and calling actions. It never speaks to the caller. What it returns is private guidance for the talker, which then says the result in its own words.

The talker hands work to the worker with a tool called **delegate**. Delegating does not block the call: the talker keeps the conversation going while the worker works. The worker receives only the new part of the conversation since the last handoff, and keeps its own history for the call, so it can continue a task across several handoffs.

This split has one important rule: the talker never promises a ticket, booking or callback unless the worker has confirmed that the action completed.

In chat there is no speaking clock, so one agent both writes and acts: the worker answers the customer directly, with the same tools.

In Desk, each handoff on a call is listed under **Handoffs**, with what was sent to the worker, what came back and every tool call in between. See [Calls and recordings](/docs/desk/calls).

## Experts

An expert is a configuration for one part of the agent: a system prompt, a model, the skills it can use and the actions it may call. Each expert has a runtime: **Talker (speaks)** or **Worker (acts)**.

A new organization starts with two experts: **Front desk** (talker) and **Operations** (worker). A conversation starts with the first enabled worker in your list. If you add more workers, the agent hands each task to the one whose description fits it (in chat and Ask; voice sessions use the first worker for now). See [Experts](/docs/studio/experts).

## Skills

A skill is a written procedure the worker follows, such as "how to book a repair" or "how to handle a refund request". The worker sees each skill's name and description, and reads the full text only when it becomes relevant.

A skill runs in one of two modes. **Prose**: the model reads the instructions and uses its judgement. **Step-gated**: the agent gets one step at a time, must mark each step done before the next, and cannot give its final answer while a step is open. See [Skills](/docs/studio/skills).

## Knowledge

Knowledge is your library of documents: prices, policies, service areas, FAQs. You add documents by writing them, uploading files or importing a web page. The agent searches knowledge when a question needs it and answers from the matching passages. See [Knowledge](/docs/studio/knowledge).

The **business profile** (name, address, description and similar) is different: it is short and always in the agent's instructions.

## Memory

Memory holds facts about how your business works that no document states, such as "We never book installs on Fridays". The agent reads memory on every conversation. You can add memories in Studio, and the agent can save new ones itself. See [Memory](/docs/studio/memory).

## Actions and tools

An action is something the agent can do. When the agent uses an action during a conversation, that use is a **tool call**. Action kinds:

| Kind | What it is |
|---|---|
| **Built-in** | Actions that run inside Veyra on your Desk records: find, create and update contacts, add notes, raise, check and update tickets, summarize and hand off a conversation, set reminders, and save leads. See [Built-in actions](/docs/studio/integrations#built-in-actions). |
| **HTTP request** | A call to your own API, configured in Studio. |
| **Composio** | A tool from an app connected through an integration. |

Every tool call is recorded with its status: **Succeeded**, **Failed**, **Timed out**, **Rejected** and others. A timed-out action that changes another system may or may not have happened, so Desk marks it for review instead of calling it a success or a failure.

In a call or chat, built-in actions work only on the customer in that conversation. The agent cannot read out or change another customer's records, and it cannot close your team's tickets.

## Integrations

An integration connects an outside app, such as a calendar or a CRM, through Composio. Once connected, that app's tools become actions you can give to the worker. See [Integrations and actions](/docs/studio/integrations).

## Automations

An automation runs the worker on a task without a customer, for example a daily summary of calls. Automations run on a schedule or when someone selects **Run now**. See [Automations](/docs/studio/automations).

## Organizations

An organization is one business in Veyra. All data (the agent, contacts, conversations, tickets, API keys) belongs to one organization and is never shared with another. A person can belong to several organizations and switch between them from the menu at the top of the sidebar.

## Conversations

A conversation is one thread with a customer on one channel: a chat, or the calls from one caller. Each conversation has a status: **Open**, **Snoozed** or **Closed**. Conversations are never deleted; closing one is the archive.

Channels in Veyra are **Call**, **Chat**, **SMS**, **Email** and **Fax**. Today only calls (voice in the browser) and chat are live. See [Inbox and conversations](/docs/desk/inbox).

## Calls

A call is one voice session with the agent. It has a transcript, a summary written when the call ends, the handoffs between talker and worker, and every tool call. Calls are listed in **Desk → Calls** and also appear in the caller's conversation. See [Calls and recordings](/docs/desk/calls).

## Contacts

A contact is a person the business deals with. A contact can have several ways to reach them (phone numbers, email addresses), and all their conversations, calls, tickets and leads link to them. Each contact has a stage: **New**, **Open**, **Qualified**, **Won** or **Lost**. See [Contacts](/docs/desk/contacts).

## Tickets

A ticket is a follow-up for a person on the team. The agent raises one when an issue needs a person; your team can raise them too. Tickets have a status (**Open**, **In progress**, **Pending**, **Resolved**, **Closed**), a priority (**Low**, **Normal**, **High**, **Urgent**) and an optional type. See [Tickets](/docs/desk/tickets).

## Leads

A lead is a contact moving through a sales pipeline. A pipeline is a set of stages, for example New, Contacted, Quoted, Won. Each lead has a stage, a value and a source. See [Leads and pipelines](/docs/desk/leads).

## Studio and Desk access

Studio and Desk are granted separately for each member of an organization. Each member has a role:

| Role | Opens by default | Can manage the organization |
|---|---|---|
| **Owner** | Desk and Studio | Yes |
| **Admin** | Desk and Studio | Yes |
| **Member** | Desk only | No |

The role only sets the default. An owner or admin can give a member Studio, or take Studio away from an admin, in **Studio → Settings → Team & access**. Studio is separate because it changes how the agent behaves with customers. See [Organization and team](/docs/studio/settings).
