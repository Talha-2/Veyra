---
title: "Talk: test your agent"
description: Chat or speak with your agent in the browser, exactly as a customer would, and see the result in Desk.
---

**Studio → Talk** lets you try the agent your customers reach. It is one chat with a voice button: type to the agent as a customer, or press the voice button and speak to it out loud. Both are real sessions with the real agent, using its skills, knowledge, memory, experts and actions, and both are saved in Desk.

Talk is not the same as [Ask](/docs/studio/ask). Ask is an assistant for you and your team. Talk is the agent your customers talk to.

## Chat with the agent

1. Open **Studio → Talk**.
2. Type in the message box (**Write a message as a customer**) and send, or press one of the sample questions.
3. The reply streams in. While the agent works, you see the steps it takes, such as searching knowledge or raising a ticket.

The bar above the conversation shows **Web chat as a customer**, with two buttons:

- **Open in Desk** opens this conversation in the Desk inbox, as your team would see it.
- **New chat** starts a fresh conversation.

In chat, one agent both answers and acts: it starts as the first enabled worker expert, with its skills, tools, model and reasoning effort, and a prompt written for a customer chat. With several workers, it hands each task to the one whose description fits, and the steps show which expert ran them. It writes in the agent's primary language and switches when the customer writes in another language you turned on. See [Experts](/docs/studio/experts#which-experts-are-used).

The same agent answers the [chat API](/docs/api/chat) and [chat on your website](/docs/api/website-chat).

## Talk by voice

1. In the message box, press the voice button (**Talk with voice**). Voice mode opens over the page and the session starts.
2. Your browser asks for permission to use the microphone; allow it.
3. The agent says its greeting. Speak naturally, as a customer calling.

While the session runs:

- The status under the orb shows **Connecting**, **Listening**, **Thinking** or **Speaking**, with a timer.
- Captions show the last lines of the conversation. Press the captions button to hide or show them.
- On wide screens, a panel on the right shows what the agent is doing, such as "Searching knowledge", as it happens.
- Press the microphone button, or the Space key, to mute and unmute.
- Press **End session** (the red button) to finish. Escape or **Back to chat** ends the session and returns to the chat.

After **End session**, the page shows **Session ended** with three options: **View call in Desk**, **Back to chat** and **Talk again**.

### What runs in voice mode

Voice mode is not a demo. It runs the real voice agent through LiveKit, in a private room created for your session: the talker holds the conversation and the worker runs skills, lookups and actions behind it. It uses your [voice](/docs/studio/voice), [timing settings](/docs/studio/identity#conversation-timing) and [models](/docs/studio/identity#models).

A voice session in Talk always runs in the agent's primary language. If you switch to another language you turned on, the agent is told to switch with you.

Each session becomes a call in **Desk → Calls**, with its transcript and summary. See [Calls and recordings](/docs/desk/calls).

## Answers are grounded

The agent only states facts it has. A price, fee, service area, time, availability or policy must come from your business profile, your memory, or a search or tool result in the same conversation. If a knowledge search finds nothing, the agent searches again with other words. If there is still nothing, it says it will have the answer confirmed, instead of guessing.

This makes Talk a good way to find gaps. If the agent says it will check on something it should know, add it to [Knowledge](/docs/studio/knowledge), then use **Test retrieval** on the Knowledge page to see what the agent finds.

In the same way, the agent says a ticket was raised or a booking was made only when the action confirms it.

## Test sessions are real

Actions in Talk really run. If the agent raises a ticket, it is a real ticket in Desk. If you connected an app and granted a write action, the write happens in that app. After a voice session, the agent may also raise a follow-up ticket for anything left unfinished.

> [!WARNING]
> Test against real systems with care. Use test data, or turn off write actions in [Integrations](/docs/studio/integrations) while you experiment. To try a single skill without any writes, use **Try it** on the skill's page, where writes are simulated. See [Skills](/docs/studio/skills#try-a-skill).

Your test sessions are kept apart from real customers. Each team member talks to the agent as their own test visitor, named "Studio test" with their name, so their test chats and calls are grouped together in Desk and never mixed with a customer's history.

## Recent sessions

Press **Recent** at the top right to see your last test calls and chats. A voice call opens in Desk; a chat opens again in Talk so you can continue it.

## If something does not work

| You see | What it means |
| --- | --- |
| No voice button in the message box | Voice is not set up on this deployment. Chat still works. |
| **The agent layer is not answering right now.** | The agent service is not reachable. Try again later. |
| **Could not start** | The session did not start. Press **Try again**. |

If the voice agent never joins a session, the call in Desk is marked as failed after 15 minutes with the reason "Not answered: the voice agent did not join this browser session."

> [!SOON]
> Phone calls are coming soon. Today, voice mode in Talk is how you speak with the agent. See [What's live and coming soon](/docs/getting-started/availability).
