---
title: Introduction
description: What Veyra is, the two products built on one agent, and how these docs are organised.
---

Veyra is an AI front desk for a business. One agent answers customers, looks things up, raises tickets for the team and remembers what it learns. Your team then works everything the agent handled in one workspace.

Two products share that one agent engine. You build and test the agent in **Veyra Studio**. Your team works the conversations in **Veyra Desk**. Both open from the same sign-in, and a person can have access to one, the other or both.

## Veyra Studio

Studio is where you build, configure and supervise the agent. It is for owners, admins and developers.

In Studio you:

- give the agent a name, a greeting, a voice and its languages;
- add business information and knowledge documents the agent answers from;
- write skills (procedures the agent follows) and set up experts;
- connect apps and actions so the agent can do work in other systems;
- try the agent yourself, by voice or chat, in **Studio → Talk**;
- create API keys and webhooks, so your own product can use the agent and its data.

Developers use Studio together with the REST API. With an API key you can read and write contacts, conversations, tickets, leads and knowledge, receive webhooks, and chat with the agent from your own website or app.

Start at [Studio overview](/docs/studio/overview).

## Veyra Desk

Desk is the team's workspace. It is for the people who handle customers every day: support staff, front-desk teams, sales and operations.

In Desk you:

- read every conversation the agent had, with what it did on each one, in the **Inbox**;
- review **Calls**: the transcript, a summary, and every action the agent took;
- keep **Contacts** up to date, with notes and history;
- move **Leads** through a pipeline;
- follow up on **Tickets**, including the ones the agent raised;
- see who on the **Team** is carrying what.

Start at [Desk overview](/docs/desk/overview).

## One agent, every channel

The agent your customers reach is the same agent everywhere. A voice session and a chat use the same knowledge, skills, memory, experts and actions. What you test in **Studio → Talk** is what customers get, and those test sessions appear in Desk like any customer's would.

Today customers can reach the agent by voice in the browser and by chat (in Studio, and through the chat API on your own website). Phone numbers, SMS, WhatsApp and email are not live yet. See [What's live and coming soon](/docs/getting-started/availability) for the full list.

## How the docs are organised

The docs have two kinds of pages.

**Guides** explain how to do things, step by step:

| Section | What it covers |
|---|---|
| Getting started | This introduction, the [Quickstart](/docs/getting-started/quickstart), [Core concepts](/docs/getting-started/concepts) and [what is live](/docs/getting-started/availability). |
| Veyra Studio | Building the agent: identity, voice, knowledge, skills, experts, integrations, memory, automations, Talk, Ask, and API keys. |
| Veyra Desk | Working conversations: inbox, calls, contacts, leads, tickets and team. |
| API guides | Using the REST API: [authentication and scopes](/docs/api/authentication), [lists and errors](/docs/api/pagination-errors), [webhooks](/docs/api/webhooks), and [chatting with your agent](/docs/api/chat). |

The **API reference** lists every endpoint with its parameters, scopes and example responses. It is generated from the API itself. Start at [Authentication](/docs/api-reference/authentication).

## Where to go next

1. Follow the [Quickstart](/docs/getting-started/quickstart) to get from sign-up to a working agent and your first API request.
2. Read [Core concepts](/docs/getting-started/concepts) to learn the words used across Studio, Desk and the API.
3. Check [What's live and coming soon](/docs/getting-started/availability) before you plan anything that depends on phone, SMS or email.
