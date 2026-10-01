---
title: Ask
description: A chat assistant inside Studio that answers questions about your agent and workspace and drafts what you want to build.
---

**Studio → Ask** is an assistant for you and your team. Ask it about your agent and your workspace, or ask it to draft something: a skill, an automation brief, a knowledge document. It works with the same engine as your agent, and it can look things up in your workspace while it answers.

Customers never reach Ask. To try the agent your customers talk to, use [Talk](/docs/studio/talk).

You can also open Ask from the **Ask Studio** button on the [Overview](/docs/studio/overview) page.

## Start a chat

1. Open **Studio → Ask**.
2. Type in the message box (**How can I help?**) and press **Send**, or pick a suggestion:
   - **Write a skill**: for example, a skill for rescheduling an appointment.
   - **Check the knowledge**: what your knowledge base says about service areas and fees, and what looks out of date.
   - **Draft an automation**: for example, a morning digest of calls and open tickets.
   - **Review recent calls**: where callers got stuck or asked for a human.
3. The reply streams in. While Ask works, you see its steps, such as searching knowledge or listing recent calls. Press **Stop** to end a reply early.

Ask keeps the conversation, so you can reply with follow-up questions.

## What Ask can do

Ask has your business profile and [memory](/docs/studio/memory), and it can use tools to look things up:

- Search your [knowledge](/docs/studio/knowledge) and read your [skills](/docs/studio/skills).
- Look up contacts, and list recent calls and tickets.
- Raise a ticket, create or correct a contact, and save a memory.
- Use the actions granted to its expert (see below).

Ask cannot change Studio settings for you. It does not create or edit skills, automations, experts or knowledge documents by itself. When you ask it to write a skill or an automation, it drafts the text; copy it into the right page in Studio and save it there.

> [!WARNING]
> Ask can act on your workspace. If it raises a ticket or saves a memory, that is real. Check what it changes. The page reminds you under the message box.

## Which expert Ask uses

Ask starts as the first enabled expert with the **Text** runtime. If you have none, it starts as the first enabled worker expert, with that expert's skills, tools, model and reasoning effort. When you have several, it hands a task to the one whose description fits, and the steps show which expert ran them. To give Ask its own prompt, tools or model, create a Text expert in **Studio → Experts**. See [Experts](/docs/studio/experts#how-the-agent-chooses-an-expert).

## Manage chats

Your chats are listed on the left. They are private to you; teammates have their own.

- **New chat** starts a fresh conversation.
- **Search chats** filters the list by title.
- Open a chat's menu (**Chat options**) to **Rename** or **Delete** it. Deleting removes the conversation for good.
- The panel button at the top hides or shows the list.

A new chat is named from your first message.

## If Ask is offline

If the agent service cannot be reached, the header shows **Agent layer offline**. Your messages are still saved on the chat, and you can continue when the service is back.

## Related

- [Talk: test your agent](/docs/studio/talk)
- [Skills](/docs/studio/skills)
- [Automations](/docs/studio/automations)
