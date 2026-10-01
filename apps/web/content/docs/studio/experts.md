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

## Which experts are used

- **Voice sessions**: the first enabled talker speaks. The first enabled worker does the work.
- **Chat** with customers (in [Talk](/docs/studio/talk), through the [chat API](/docs/api/chat) and on your website): one agent both answers and acts, with a chat prompt in place of the talker. It starts as the first enabled worker. In text there is no latency budget, so no separate talker is needed.
- **Ask**: starts as the first enabled Text expert. If there is none, it starts as the first enabled worker.
- **Try it** on a skill: starts as the worker that has the skill.

"First" means first in the list on **Studio → Experts**. The list marks it **Starts here** (for a worker) or **Speaks** (for a talker) when there is more than one. A second enabled talker is marked **Not used**: only one talker speaks.

### How the agent chooses an expert

When you have more than one worker expert, the agent starts each conversation as the first one. It sees the name and **One-line description** of the others. When a task belongs to another expert, it hands the task over and continues as that expert, with its prompt, skills, tools, model and reasoning effort. It can hand back later in the same conversation.

So the description decides the routing. Say what the expert handles, for example "Invoices, refunds and failed payments." Give each skill to the expert that should use it.

In **Talk**, **Ask** and **Try it**, a handover shows as a step, **Handed to** and the expert's name, and every later step is labelled with the expert that ran it. The tool calls recorded for the conversation name the expert too.

Ask routes between your Text experts in the same way, or between your workers if you have no Text expert.

> [!SOON]
> In voice sessions, the first enabled worker still handles every task: handing over to another worker is coming soon to voice. Chat, Ask and **Try it** route today, so test a new worker there.

## Create an expert

1. Open **Studio → Experts** and press **New expert**, or press **Add** next to a runtime group.
2. Choose the **Runtime**.
3. Enter a **Name** and a **One-line description** (up to 160 characters), for example "Refunds, invoices and failed payments."
4. Press **Create expert**. Its page opens, where you set the prompt, skills and tools.

## Configure an expert

Open an expert from the list. Press **Save changes** after editing.

### Identity

**Name**, **One-line description** and **Enabled**. The description is shown to other experts of the same runtime, and it is how the agent decides to hand a task to this expert. Keep it short and specific: its length is paid on every turn. A disabled expert is never used; its settings are kept.

The side panel's **Role** says how the expert is used right now, for example "Starts each conversation, hands off to others" or "Gets tasks that fit its description".

### Prompt

The expert's **System prompt**. The page estimates how many tokens it adds to every turn.

- For the talker, keep it to what it needs to hold a conversation. Shorter prompts mean faster first words. It is used together with the **Persona** on [Identity](/docs/studio/identity).
- For the worker, keep it to principles. Procedures belong in [skills](/docs/studio/skills).

### Skills

Tick the skills this expert may use. Only each skill's name and description go into the prompt; the full instructions are read when the expert decides a skill is relevant. **Select all** and **Clear** change them all at once. Skills marked **Step-gated** show a badge; the agent works through their steps in order (see [Skills](/docs/studio/skills#how-a-step-gated-skill-runs)).

### Tools

Tick the actions this expert may call. Each shows **Reads** or **Writes**. The talker waits for a write to finish before it hangs up. Actions come from [Integrations](/docs/studio/integrations).

Every worker also has a set of built-in tools, whether or not you tick anything: read a skill, search knowledge, look up a contact, list recent calls and tickets, create or correct a contact, raise a ticket, and save a memory. If you grant a built-in action such as **Create ticket**, the settings you give it on the Integrations page apply.

### Talker settings

A talker's tools are fixed: it searches knowledge and hands tasks to the worker. So a talker's page has no **Skills**, **Tools** or **Reasoning effort**. Grant skills and actions to a worker. What a talker's page controls:

- **System prompt**: used in voice sessions together with the **Persona** on [Identity](/docs/studio/identity), and in chat as part of the agent's voice.
- **Model** (under **Advanced**): the talker's model in voice sessions. It replaces the talker model set on **Identity → Models**. Leave it empty (**Identity default**) to use that one.

### Advanced

- **Model**: a model reference for this expert, written as `provider:model` (for example `openai:gpt-4.1-mini`). Leave it empty (**Runtime default**) to use the worker model set on [Identity](/docs/studio/identity#models).
- **Reasoning effort**: **Default**, **Low**, **Medium** or **High**. Higher thinks longer before acting: better on hard tasks, slower on every one.

A worker's or Text expert's **Model** and **Reasoning effort** apply everywhere that expert works: voice sessions, chat, Ask and **Try it**. When the agent hands a task to another expert, it switches to that expert's model and reasoning effort.

> [!NOTE]
> Reasoning effort only changes models that have a reasoning setting, such as GPT-OSS on Groq. Other models, such as GPT-4.1 mini, ignore it.

## Delete an expert

On a custom expert's page, press **Delete expert**. It stops handling conversations at once. The skills and actions it used are kept.

## Watch handoffs

**Failed handoffs** on the [Overview](/docs/studio/overview#the-overview-page) page counts tasks the talker handed to the worker that failed, timed out or were stopped in the last 7 days.

## After a voice session

When a voice session ends, the worker makes one silent last pass over the conversation. If the customer asked for something that is not finished, it raises one ticket that says what was needed, what was done, what is blocked and what the team should do next. It does not complete anything that still needed the customer's answer or consent. A call where the customer asked for nothing creates nothing. See [Tickets](/docs/desk/tickets).
