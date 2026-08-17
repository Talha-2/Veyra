<div align="center">

# Veyra Studio

**AI voice and chat agents that answer, call, and close — plus the CRM to run them.**

Veyra is an all in one platform for building production grade AI agents that talk to your
customers over the phone and chat, run real workflows across a thousand tools, and hand off
to a human when it matters. It ships with **Veyra Desk**, a clean client CRM whose inbox is
powered by the same live calls and texts.

</div>

---

## What it does

- **Voice agents** — sub second, grounded phone conversations on LiveKit, with barge in,
  multilingual turn taking, and warm human handoffs. Built for the callers that break demos.
- **Deep agent** — describe your business in plain English and an autonomous builder (LangChain
  `deepagents`) plans the work, delegates to system experts, and ships your workflows, knowledge,
  and voice. You approve before anything goes live.
- **Workflows** — a visual pathway builder (ask, act, branch) wired to a thousand tools through
  Composio, with parameters filled in. Compile, test, deploy, and version.
- **Telephony** — provision real numbers, place and receive calls to any country, run an IVR,
  transfer to a teammate / extension / external number, and send or auto answer SMS. Bridged into
  the agent over LiveKit SIP behind a provider adapter (Twilio to start).
- **Veyra Desk (CRM)** — a unified inbox (calls, texts, email), tickets linked to conversations,
  contacts, an AI first dashboard, click to assign, and a team workload view.
- **Knowledge base** — upload or author documents; a full RAG pipeline (heading aware chunking →
  local embeddings via fastembed → LanceDB + BM25 fused with RRF) grounds every factual answer.
- **Evals** — simulated caller personas (ramblers, interrupters, accents) hammer the agent before
  launch, scored by an LLM judge.
- **Public REST API + signed webhooks** — drive the whole platform from your own code.

## Architecture

A small monorepo, orchestrated with Docker Compose:

```
apps/
  web/      Next.js 15 (App Router, React 19) — marketing site, Studio, and Veyra Desk
  server/   FastAPI + SQLModel — REST API, RAG, integrations, telephony, CRM, auth
  agent/    LiveKit Agents worker — the real time voice pipeline (STT then LLM then TTS)
  mcp/      FastMCP server — the platform exposed as tools for the deep agent
```

**Stack:** LiveKit · Deepgram / Cartesia (STT) · Cartesia / ElevenLabs (TTS) · OpenAI / xAI
(LLM) · Composio (tools) · LanceDB (vectors) · SQLite (app data) · Twilio (telephony) ·
Langfuse (tracing).

## Quickstart

Requirements: Docker Desktop, and provider API keys (see `.env.example`).

```bash
# 1. configure — copy the template and fill in your keys
cp .env.example .env

# 2. build and run the full stack (web, api, voice worker)
docker compose up -d --build

# 3. open the app
#    web / studio / desk : http://localhost:4100
#    api                 : http://localhost:8000
```

Minimum keys to see a live call: `LIVEKIT_*`, `DEEPGRAM_API_KEY`, an LLM key
(`OPENAI_API_KEY` or `XAI_API_KEY`), and a TTS key (`CARTESIA_API_KEY` or `ELEVEN_API_KEY`).
Everything else (Composio, Twilio, Langfuse) is optional and unlocks its feature when set.

## Configuration

All secrets live in `.env` (git ignored). `.env.example` documents every variable and which
feature it powers. Telephony credentials can also be pasted directly in the Studio, so a phone
line is turned on as a product action rather than an env edit.

## Project status

An actively evolving reference platform. The voice, deep agent, workflows, knowledge base, CRM,
and public API are functional; telephony executes live once a Twilio account is connected. Sample
data is seeded on first run so the CRM is demoable without a phone line.

## License

MIT — see [LICENSE](LICENSE).
