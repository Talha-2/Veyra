---
title: Skills
description: Write the procedures your agent follows, grant them to an expert, and try them before customers do.
---

A skill is a page of instructions the agent opens when a conversation calls for it: how to reschedule a visit, how to handle a complaint, what to confirm before booking. You write skills in **Studio → Skills**.

Skills keep the agent fast. The agent does not read every skill on every turn. It sees only each skill's name and its **When to use it** line, and opens the full instructions only when a conversation needs them.

## Create a skill

1. Open **Studio → Skills** and press **New skill**.
2. Enter a **Name** (up to 80 characters), for example "Reschedule a visit".
3. Fill in **When to use it** (up to 200 characters), for example "When a caller wants to move or cancel a booked visit."
4. Choose **How it runs**: **Prose** or **Step-gated**. See below.
5. Press **Create skill**. The skill's own page opens.
6. Write the **Instructions** and press **Save new version**.

### Write a good "When to use it" line

The agent reads only this line to decide whether to open the skill. Say when, not how. It is in the agent's instructions for every skill, on every turn, so keep it short.

### Write the instructions

Use short paragraphs and plain commands. Say what to check before asking the customer, and what to confirm before writing anything down. For example:

```
Find the booking first: ask for the reference, or the name and date.
Confirm the new time back to the caller before changing anything.
If no slot suits them, raise a ticket so the team can call back.
```

Instructions can be up to 30,000 characters, but shorter is better.

## Grant the skill to an expert

A new skill is not used until an expert has it. The skill's page says "Not granted to any expert yet" until you grant it. If you have several worker experts, grant the skill to the one whose description covers it: the agent hands a task to that expert and then sees its skills. See [Experts](/docs/studio/experts#how-the-agent-chooses-an-expert).

1. Open **Studio → Experts** and choose the worker expert (for a new organization, **Operations**).
2. Under **Skills**, tick the skill.
3. Press **Save changes**.

The skills list shows **No expert yet** on any skill that is not granted. See [Experts](/docs/studio/experts).

## How it runs

| Mode | What it does | Watch out for |
| --- | --- | --- |
| **Prose** | The model reads the instructions and uses its judgement. It handles cases you did not write down. | On a fast voice model, long prose skills can drift. Keep them short and concrete. |
| **Step-gated** | For procedures that must not be improvised, such as a payment or an identity check. You write a **Framing** section and a list of **Steps**, and the agent works through them in order. | The agent cannot adapt to anything the steps do not cover. |

For a step-gated skill, the **Framing** text holds rules that apply to every step. Each step has a name and an instruction (up to 1,000 characters), and you can have up to 30 steps. Use **Add step**, drag the handle, or the arrows to reorder. A step-gated skill needs at least one step before it can be saved.

### How a step-gated skill runs

The same rules apply in voice sessions, chat, Ask, automations and **Try it**:

1. When the agent opens the skill, it gets the **Framing**, the names of all the steps, and the full instruction for the first step only.
2. When a step is done, the agent marks it done. Only then does it get the next step's instruction. It cannot mark a later step done while an earlier one is open.
3. While a step is open, the agent cannot give its final answer. If it tries, it is sent back to the open step.

There are two ways to answer before the last step:

- **Waiting**: the step needs something only the customer can give, such as an invoice number. The agent asks for it, and the same step continues when the customer answers.
- **Abandon**: the skill does not fit the situation after all. The agent closes it, says why, and nothing in the remaining steps is done.

In the agent's steps (in **Talk**, **Ask** and **Try it**), each step shows as **Checked off a step**, with the skill and the step number.

> [!NOTE]
> If the agent ignores an open step three times in one turn, its answer is let through so the conversation does not stall. Keep each step's instruction short and concrete so this does not happen.

## Versions

Every saved change to the instructions, steps or mode creates a new version. The version number shows at the top of the skill page and in the list. Changes take effect from the next conversation.

**What the agent reads** on the skill page shows the saved version exactly as the model receives it: a short header with the name and description, then the instructions. Unsaved edits are not shown there. Use the copy button to copy it.

## Try a skill

The **Try it** panel runs the saved version of a skill against a situation you describe, without a real customer.

1. Save the skill first. **Try it** always runs the saved version.
2. Type something a customer might say, for example: "Hi, I need to move my Thursday visit to next week. My reference is 4471."
3. Press **Run the saved version** (or Ctrl+Enter).

The result shows whether it **Replied** or **Failed**, the tools the agent used, the tokens used, and the reply. Reads are real: the agent really searches your knowledge and records. Writes are simulated, so no ticket or contact is created, and an action that needs approval is not sent for approval.

**Try it** starts as the worker expert that has the skill, with that expert's model and reasoning effort.

The reply is the worker's private guidance to the talker, not the words a caller would hear. To hear the full conversation, use [Talk](/docs/studio/talk).

If the agent layer is not connected, the panel shows **Agent offline** and cannot run.

## Turn a skill off or delete it

- On the skill page, switch off **Enabled** and save. The skill stays granted to its experts, but they are not offered it.
- **Delete skill** removes it for good. Experts that had it stop being offered it on their next turn.

## Related

- [Experts](/docs/studio/experts)
- [Knowledge](/docs/studio/knowledge)
- [Ask](/docs/studio/ask) can draft a skill for you to paste in.
