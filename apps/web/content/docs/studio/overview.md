---
title: Studio overview
description: What Veyra Studio is, how it is organised, and what the Overview page tells you about your agent.
---

Veyra Studio is where you build, configure and test your AI agent. You set who the agent is, what it knows, what it can do and how it sounds, and you try it out before customers reach it. Developers also use Studio to create API keys and webhooks, so they can run the same agent inside their own products.

Studio and Veyra Desk share one agent engine and one database, but they are separate products. Desk is where your team works the conversations the agent handles. Studio is where you change how the agent behaves. See [Desk overview](/docs/desk/overview) for the team side, and [Core concepts](/docs/getting-started/concepts) for how the pieces fit.

## Who can open Studio

Access to Studio and Desk is granted per person. By default, owners and admins can open both, and members can open only Desk. An owner or admin can change this for anyone in **Studio → Settings → Team & access**. See [Organization and team](/docs/studio/settings).

## How Studio is organised

The sidebar has three groups.

| Group | Page | What you do there |
| --- | --- | --- |
| Agent | **Overview** | Check the agent's health and what is left to set up. |
| Agent | **Ask** | Chat with an assistant about your agent and your workspace. See [Ask](/docs/studio/ask). |
| Agent | **Talk** | Talk or chat with your agent as a customer would. See [Talk](/docs/studio/talk). |
| Agent | **Identity** | Name, greeting, persona, languages, models, timing and business profile. See [Identity and greeting](/docs/studio/identity). |
| Agent | **Voice** | Choose and preview the voice. See [Voice and languages](/docs/studio/voice). |
| Agent | **Experts** | The talker and worker behind every conversation. See [Experts](/docs/studio/experts). |
| Capability | **Skills** | Written procedures the agent follows. See [Skills](/docs/studio/skills). |
| Capability | **Automations** | Jobs the agent runs on a schedule or on demand. See [Automations](/docs/studio/automations). |
| Capability | **Knowledge** | Documents the agent searches for answers. See [Knowledge](/docs/studio/knowledge). |
| Capability | **Memory** | Short facts the agent carries into every conversation. See [Memory](/docs/studio/memory). |
| Capability | **Integrations** | Connected apps, custom HTTP actions and action settings. See [Integrations and actions](/docs/studio/integrations). |
| Operations | **Developer** | API keys, webhooks and the API reference. See [API keys and webhooks](/docs/studio/developer). |
| Operations | **Settings** | Organization, team, ticket types, lead pipelines and your own profile. |

> [!SOON]
> **Telephony** (phone numbers) and **Evaluations** appear in the sidebar marked "Coming soon". Real phone calls cannot reach the agent yet. Today you talk to the agent by voice in the browser through **Talk**, and by chat through **Talk** or the [chat API](/docs/api/chat).

## The Overview page

**Studio → Overview** is the first page you see. It answers one question: is the agent behaving? All figures cover the last 7 days.

### Is the agent behaving?

Four numbers, each linking to the page where you fix it:

- **Response time, p95**: how long callers wait for the agent to start answering, measured across voice sessions (the 95th percentile). The budget is 1.2 seconds. Above it, the tile shows **Over budget**. Timing settings live on [Identity](/docs/studio/identity#conversation-timing).
- **Unconfirmed actions**: writes to another system that timed out, so nobody knows if they happened. Opens **Integrations**.
- **Agent tickets open**: tickets the agent raised that the team has not resolved yet. Opens the agent's ticket view in Desk.
- **Failed handoffs**: tasks the talker handed to the worker that failed, timed out or were stopped. Opens **Experts**.

### Waiting for approval

Shown only when the agent has asked to run an action that is set to need approval. Each request shows the action, whether it **Writes** or **Reads**, who it is for, the expert that asked, and the arguments the agent would use. Nothing has happened yet.

- **Approve** runs it once, now, and shows the result.
- **Reject** records that it never ran.

A waiting request also counts as one thing that needs your attention at the top of the page. See [Approve actions](/docs/studio/integrations#approve-actions).

### Needs a human to check

If an action timed out in the middle of a write, it is listed here with the customer's name and a link to the conversation in Desk (**Open in Desk**). Check the other system by hand before anyone tells the customer the action did or did not happen. When nothing is waiting, the page shows **Nothing needs a human**.

### Finish setting up

A checklist of what a working agent needs, with a progress bar:

1. **Name and greeting**: the name callers hear and the first line they hear.
2. **Voice**: a voice chosen on the Voice page.
3. **Talker and worker**: at least two experts enabled. Every conversation needs one talker and one worker.
4. **First skill**: at least one enabled skill.
5. **Languages**: always shown as done, with the languages the agent speaks.

**Phone number** also appears, marked "Coming soon". It does not count toward your progress. The **Continue setup** button at the top opens the next unfinished step.

## A new organization starts with a working agent

You do not start from an empty agent. A new organization gets:

- An agent named Ava, with a short persona and a greeting that uses your organization's name.
- Two built-in experts: **Front desk** (the talker) and **Operations** (the worker).
- Built-in actions: **Find contact**, **Create ticket**, **Recent calls** and **Recent tickets**. Find contact and Create ticket are granted to Operations.
- A ticket type called **General**, and a **Sales** lead pipeline.

You can change or replace all of it. A good first hour is: set the name and greeting, add a few knowledge documents, then open **Talk** and try it.

## Next steps

- [Quickstart](/docs/getting-started/quickstart)
- [Identity and greeting](/docs/studio/identity)
- [Talk: test your agent](/docs/studio/talk)
