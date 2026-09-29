---
title: Experts
description: Understand the talker and the worker behind every conversation, and configure their prompts, skills, tools and models.
---

An expert is a bundle of four things: a prompt, a set of skills, a set of actions (tools) and, optionally, a model. There is one agent loop; the expert decides what it is told and what it can reach. You manage experts in **Studio → Experts**.

## Talker and worker

A voice conversation always has two halves:

- **Talker (speaks)**: holds the conversation. It answers what it can and hands off what needs doing. It never blocks. It runs on a small, fast model, because a caller should hear an answer in about a second.
- **Worker (acts)**: runs skills, lookups and actions. It never speaks; its replies are private guidance that the talker puts into its own words. Because it works behind the talker, it can use a slower, stronger model.

The customer only ever talks to one agent. The split is never mentioned to them.

When the customer needs something done, such as a booking, a ticket or a record change, the talker hands the task to the worker at once, keeps the conversation going, and tells the customer the result when the worker replies. The talker may say something happened only when the worker's result confirms it.

A third runtime, **Text**, is for text work where there is no speaking clock.

## The built-in experts

Every organization starts with two built-in experts:

| Expert | Runtime | Does |
| --- | --- | --- |
| **Front desk** | Talker | Holds the conversation and answers what it can. |
| **Operations** | Worker | Runs lookups, bookings and tickets. |

Built-in experts cannot be deleted. You can edit them, or switch off **Enabled** to take one out of conversations.

## Which experts are used today

- **Voice sessions** use the first enabled talker and the first enabled worker in the list.
- **Chat** with customers (in [Talk](/docs/studio/talk) and through the [chat API](/docs/api/chat)) uses the first enabled worker, with a chat prompt in place of the talker. In text there is no latency budget, so one agent both answers and acts.
- **Ask** uses the first enabled Text expert. If there is none, it uses the first enabled worker.

> [!SOON]
> Routing between several worker experts in one conversation is coming soon. Today, an extra worker you add is not used while an earlier worker is enabled. To try a replacement worker, give it the skills and tools it needs, then switch off **Enabled** on the old one and test in **Talk**.

## Create an expert

1. Open **Studio → Experts** and press **New expert**, or press **Add** next to a runtime group.
2. Choose the **Runtime**.
3. Enter a **Name** and a **One-line description** (up to 160 characters), for example "Refunds, invoices and failed payments."
4. Press **Create expert**. Its page opens, where you set the prompt, skills and tools.

## Configure an expert

Open an expert from the list. Press **Save changes** after editing.

### Identity

**Name**, **One-line description** and **Enabled**. The description is shown to other experts of the same runtime, so keep it short: its length is paid on every turn. A disabled expert is never used; its settings are kept.

### Prompt

The expert's **System prompt**. The page estimates how many tokens it adds to every turn.

- For the talker, keep it to what it needs to hold a conversation. Shorter prompts mean faster first words. It is used together with the **Persona** on [Identity](/docs/studio/identity).
- For the worker, keep it to principles. Procedures belong in [skills](/docs/studio/skills).

### Skills

Tick the skills this expert may use. Only each skill's name and description go into the prompt; the full instructions are read when the expert decides a skill is relevant. **Select all** and **Clear** change them all at once. Skills marked **Step-gated** show a badge.

### Tools

Tick the actions this expert may call. Each shows **Reads** or **Writes**. The talker waits for a write to finish before it hangs up. Actions come from [Integrations](/docs/studio/integrations).

Every worker also has a set of built-in tools, whether or not you tick anything: read a skill, search knowledge, look up a contact, list recent calls and tickets, create or correct a contact, raise a ticket, and save a memory. If you grant a built-in action such as **Create ticket**, the settings you give it on the Integrations page apply.

> [!NOTE]
> The talker's own tools are fixed: it can search knowledge and hand tasks to the worker. Grant skills and actions to the worker, not the talker.

### Advanced

- **Model**: a model reference for this expert, written as `provider:model` (for example `openai:gpt-4.1-mini`). Leave it empty (**Runtime default**) to use the worker model set on [Identity](/docs/studio/identity#models).
- **Reasoning effort**: **Default**, **Low**, **Medium** or **High**. Higher thinks longer before acting: better on hard tasks, slower on every one.

The **Model** override applies to worker and Text experts. **Reasoning effort** is applied to the worker in voice sessions. The talker's model is set on **Identity → Models**, not here.

## Delete an expert

On a custom expert's page, press **Delete expert**. It stops handling conversations at once. The skills and actions it used are kept.

## Watch handoffs

**Failed handoffs** on the [Overview](/docs/studio/overview#the-overview-page) page counts tasks the talker handed to the worker that failed, timed out or were stopped in the last 7 days.

## After a voice session

When a voice session ends, the worker makes one silent last pass over the conversation. If the customer asked for something that is not finished, it raises one ticket that says what was needed, what was done, what is blocked and what the team should do next. It does not complete anything that still needed the customer's answer or consent. A call where the customer asked for nothing creates nothing. See [Tickets](/docs/desk/tickets).
