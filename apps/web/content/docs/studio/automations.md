---
title: Automations
description: Jobs the agent runs without a conversation, on a schedule or when you press Run now.
---

An automation is a job the agent does on its own, without a customer on the line: a morning summary of yesterday's calls, a weekly report of open tickets, a check that nothing was missed. Each automation has a goal, the actions it may use, and what starts it. You manage them in **Studio → Automations**.

Automations are different from [experts](/docs/studio/experts). Experts are the two halves of a live conversation; an automation is a separate job with its own brief.

## Create an automation

1. Open **Studio → Automations** and press **New automation**.
2. Enter a **Name** and, if you like, **What it does** (one line, for the list). Press **Create automation**.
3. On the automation's page, write the brief, choose triggers and allowed actions (see below).
4. Switch on **Enabled** in the **Status** panel.
5. Press **Save changes**.

A new automation starts paused, with the **By hand** trigger and **Balanced** reasoning.

## The brief

Brief it the way you would brief a new colleague.

- **Goal**: the task itself, up to 5,000 characters. Every run starts from this. For example: "Summarise yesterday's missed calls and open tickets for the front desk, most urgent first."
- **Standing instructions**: tone, audience, what to lead with. They apply to every run. For example: "Write for the owner. Plain sentences, no headings. Lead with anything that needs a reply today."

The agent also has your business profile and [memory](/docs/studio/memory) on every run.

## Triggers

A run starts from one of the triggers you choose. You can choose more than one; an automation needs at least one.

### By hand

Press **Run now** at the top of the automation's page. It runs the saved version with the saved goal, not your unsaved edits. The button is off unless **By hand** is chosen.

If the agent layer cannot be reached at that moment, the run is queued and starts when the agent layer next checks for work. The message after you press the button says which happened.

### On a schedule

Choose **On a schedule**, then set **Repeats**:

| Option | Runs |
| --- | --- |
| **Hourly** | At the top of every hour. |
| **Daily** | Every day at the time in **At**. |
| **Weekly** | Every week on the day in **On**, at the time in **At**. |
| **Every N minutes** | Every 5 to 1,440 minutes, set in **Every**. |

Set the **Timezone** for the schedule, for example `Europe/London`. It starts as UTC; a button offers your browser's timezone. The page shows a summary such as "Runs every day at 09:00, Europe/London time."

Scheduled runs happen only while the automation is **Enabled**. The next run time shows in the page header and in the **Status** panel. Pausing clears it.

> [!SOON]
> The **From a webhook** and **On an app event** triggers are coming soon. They are shown on the page but cannot be turned on yet, and they do not start runs. Use **On a schedule** or **By hand** today.

## What it may use

Under **What it may use**, tick the actions a run may call. Only these are offered to a run, so a digest that can only read cannot accidentally send or change anything. Each action shows **Reads** or **Writes**. Only actions that are turned on in [Integrations](/docs/studio/integrations) are listed.

If you allow any action that writes, the page warns: **This automation can change things**. Runs act on their own; nobody reviews them first.

A run can always read your skills. Under **Advanced**, **May search the knowledge base** (on by default) lets it search your [knowledge](/docs/studio/knowledge) too.

## Reasoning

Under **Advanced**, **Reasoning** sets how hard the agent thinks on each run:

- **Fast**: quickest and cheapest. For jobs that mostly copy data from one place to another.
- **Balanced**: the default. Right for summaries, follow-ups and most reports.
- **Deep**: slower and costs more per run. For jobs that weigh several sources before acting.

## Run history

The **Run history** panel shows the last 30 runs: the trigger, the status (**Queued**, **Running**, **Done** or **Failed**), when it started, how long it took, the tokens used, the tools it called, and the result or the error. The agent writes the result for your team: what it found, what it did, and anything that needs a person, with that first. The history shows the first 300 characters of each result.

The Automations list shows each automation's triggers, schedule and last result, and three totals: **Active**, **Runs, last 7 days** and **Failed, last 7 days**. Use the switch on a row to pause or enable an automation without opening it.

## Delete an automation

Press **Delete automation** in the automation's side panel. This stops every trigger and deletes its run history. It cannot be undone.

## Ideas to start with

- A daily summary of yesterday's calls and open tickets, with the **Recent calls** and **Recent tickets** actions allowed.
- A weekly list of tickets the agent raised that are still open.

> [!TIP]
> [Ask](/docs/studio/ask) can draft the goal and standing instructions for an automation. Paste them into the automation's page.
