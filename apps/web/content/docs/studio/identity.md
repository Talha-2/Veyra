---
title: Identity and greeting
description: Set the agent's name, greeting, persona, models, conversation timing and business profile.
---

**Studio → Identity** decides who the agent is and how it behaves in every conversation, by voice or by chat. It is one long form with six sections: **Identity**, **Languages**, **Models**, **Conversation timing**, **Calls** and **Business profile**. Change what you need, then press **Save changes** at the bottom of the page. **Discard** undoes unsaved edits.

Changes apply from the next conversation. A conversation that is already running keeps the settings it started with.

Languages are covered in [Voice and languages](/docs/studio/voice#languages).

## Identity

| Field | Limit | What it does |
| --- | --- | --- |
| **Name** | 60 characters, required | How the agent introduces itself, and the name customers use back. |
| **Greeting** | 500 characters | The first thing a caller hears. |
| **Persona** | 2,000 characters | Tone, boundaries and what the agent never does. |

### Greeting

In a voice session the agent says the greeting word for word, before anything else. It is spoken before the agent has looked anything up, so do not write a greeting that depends on who is calling. A good greeting names the business and the agent and asks how to help, for example: "Thanks for calling Northwind, this is Ava. How can I help?"

If you leave the greeting empty, the agent makes up a short greeting of its own as the business's front desk.

### Persona

The persona is added to the agent's instructions on every turn, so every sentence in it costs a little time. Keep it to a few sentences about tone and limits, for example: "Warm, brief, and never oversells. Confirms details back before booking anything."

Put procedures (how to reschedule, how to take a complaint) in [skills](/docs/studio/skills), not in the persona.

The persona is used together with the prompt of the talker expert. See [Experts](/docs/studio/experts).

## Models

Every voice conversation uses two models:

- **Talker**: owns every word the caller hears. It must answer in under a second, so a small, fast model is best.
- **Worker**: runs skills and actions and never speaks, so it can use a larger model. An expert can override it on its own page.

Each picker lists the models the agent layer can run, grouped by provider. The first option, **Agent layer default**, uses whatever the platform has set as the default and shows its name in brackets. A provider shown as **no key** or **key rejected** cannot be used, and its models are greyed out.

Open **Providers** under the pickers to see which providers are working. A rejected key shows here, instead of as a model that fails silently.

If the agent layer is not reachable, the section says **The agent layer is not connected**. Choices you saved before still apply when it reconnects.

In a voice session, if the model you picked is not available (for example, its provider has no key), the agent uses the default model instead of failing.

## Conversation timing

These settings decide whether the agent cuts people off or feels slow.

| Setting | Range | Default | What it does |
| --- | --- | --- | --- |
| **Endpointing wait** | 200 to 1,500 ms | 400 ms | How long the agent waits after the caller stops before it speaks. |
| **Interruption threshold** | 200 to 2,000 ms | 550 ms | A barge-in shorter than this is treated as a cough or an "mm-hm", not an interruption. |

Two switches:

- **Semantic turn detection** (on by default): the agent waits longer only when the sentence sounds unfinished. Languages without this feature fall back to waiting for silence. When the agent waits for silence, it uses at least 700 ms, whatever the endpointing wait says.
- **Allow interruptions** (on by default): callers can talk over the agent to stop it, as they would with a person.

> [!WARNING]
> If you turn off semantic turn detection and set the endpointing wait to 400 ms or less, the page warns you: the agent will cut callers off mid-thought. Keep interruptions on unless you have a strong reason.

## Calls

> [!SOON]
> **Maximum length** and **Record calls** are coming soon. The fields are shown so you know they exist, but the voice agent does not use them yet: nothing limits call length and no audio is recorded. Transcripts of voice sessions are saved in Desk today. See [Calls and recordings](/docs/desk/calls).

## Business profile

Facts the agent must always have to hand. They are part of the agent's instructions in every conversation.

| Field | Notes |
| --- | --- |
| **Business name** | Used when the agent speaks as your business. If empty, the organization name is used. |
| **Industry** | |
| **Timezone** | Required. The agent uses it to know the current date and time. Use a region name such as `Asia/Karachi`. |
| **Website** | Must be a full URL. |
| **Address** | Read out when a caller asks where you are. |
| **Description** | One paragraph about the business, up to 2,000 characters. |

Keep this short. Anything longer, such as a price list or a policy, belongs in [Knowledge](/docs/studio/knowledge), which the agent searches only when it needs to.

## Related

- [Voice and languages](/docs/studio/voice)
- [Experts](/docs/studio/experts)
- [Talk: test your agent](/docs/studio/talk)
