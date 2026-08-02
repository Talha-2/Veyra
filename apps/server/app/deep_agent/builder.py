"""The deep agent: an autonomous builder for the whole voice-agent platform.

Built on LangChain `deepagents` (planning via write_todos, a virtual filesystem,
sub-agents, and automatic context management). The orchestrator plans the work
and delegates to three SYSTEM EXPERTS, each a sub-agent with its own clean
context and a scoped slice of the product API:

  - Workflow Builder  — builds and deploys node-based voice workflows (abilities),
                        wiring Act nodes to real tools with filled parameters.
  - Business Manager  — the business profile, the knowledge base, and voice tuning.
  - Expert Builder    — creates and updates Experts (the reasoning agents).

Tools call the platform's own REST API over localhost, so this stays a thin layer
over the same endpoints the studio UI and the MCP server use — one source of truth.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

BACKEND = os.getenv("INTERNAL_BACKEND_URL", "http://127.0.0.1:8000")
BUILDER_MODEL = os.getenv("DEEP_AGENT_MODEL", "openai:gpt-4.1")
SUBAGENT_MODEL = os.getenv("DEEP_AGENT_SUBAGENT_MODEL", "openai:gpt-4.1-mini")


async def _req(method: str, path: str, **kwargs) -> Any:
    """Call the platform backend. Returns parsed JSON, or an {error} dict so a
    failed call becomes an observation the agent can react to, never a crash."""
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.request(method, f"{BACKEND}{path}", **kwargs)
            if resp.status_code >= 400:
                return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:800]}
            return resp.json()
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:300]}


# ── abilities: node-based voice workflows ──────────────────────────────────

async def ability_templates() -> Any:
    """List node-workflow starting points (appointment, support, lead, order, callback, blank)."""
    return await _req("GET", "/api/abilities/templates")

async def ability_from_template(key: str, name: str) -> Any:
    """Create a new ability (voice workflow) from a template key. Returns the new node graph."""
    return await _req("POST", "/api/abilities/from-template", json={"key": key, "name": name})

async def ability_list() -> Any:
    """List all abilities (voice workflows) with status and live version."""
    return await _req("GET", "/api/abilities")

async def ability_get(ability_id: str) -> Any:
    """Get an ability's full node graph, triggers, and global prompt. Read a template first to learn the node shape."""
    return await _req("GET", f"/api/abilities/{ability_id}")

async def ability_create(body: dict) -> Any:
    """Create an ability. body: {name, description, nodes:[...], start_node, triggers:[...], global_prompt}.
    An 'act' node calls a tool: {type:'act', tool:{kind,ref,label}, instruction, save_as}. Copy the shape from a template."""
    return await _req("POST", "/api/abilities", json=body)

async def ability_update(ability_id: str, body: dict) -> Any:
    """Update an ability's graph/prompt/triggers (same shape as ability_create; only provided fields change)."""
    return await _req("PUT", f"/api/abilities/{ability_id}", json=body)

async def ability_compiled(ability_id: str, stage: str = "draft") -> Any:
    """Get the compiled script, declared tools, and WARNINGS for an ability (stage: draft|live).
    Always check warnings before deploying — an Act node with no tool is a blocking error."""
    return await _req("GET", f"/api/abilities/{ability_id}/compiled", params={"stage": stage})

async def ability_deploy(ability_id: str, note: str = "", force: bool = False) -> Any:
    """Freeze the draft as a new live version so calls follow it. Blocks on compile errors unless force=true."""
    return await _req("POST", f"/api/abilities/{ability_id}/deploy", json={"note": note, "force": force})


# ── integrations: discover tools and their parameters, connect, execute ────

async def integration_apps(search: str = "", category: str = "") -> Any:
    """Browse the Composio app catalog (1000+ apps). Find an app before selecting one of its tools."""
    params = {k: v for k, v in {"search": search, "category": category}.items() if v}
    return await _req("GET", "/api/integrations/apps", params=params)

async def integration_app_tools(slug: str) -> Any:
    """List a Composio app's tools WITH their input parameter JSON Schemas — how you select a tool and know which parameters to fill."""
    return await _req("GET", f"/api/integrations/apps/{slug}/tools")

async def integration_connections() -> Any:
    """List connected integration accounts — the tools the agent can ACTUALLY call right now."""
    return await _req("GET", "/api/integrations/connections")

async def integration_execute(kind: str, ref: str, params: dict) -> Any:
    """Execute a tool to test it (kind: composio|action|mcp). Verify a tool works before wiring it into a flow."""
    return await _req("POST", "/api/integrations/execute", json={"kind": kind, "ref": ref, "params": params})


# ── business profile ───────────────────────────────────────────────────────

async def business_get() -> Any:
    """Get the business profile the agent states on every call, plus a readiness status."""
    return await _req("GET", "/api/business")

async def business_update(profile: dict) -> Any:
    """Update the business profile. Keys: name, what_we_do, timezone, hours, address, phone, website,
    services, pricing, policies, escalation, notes, pronunciation."""
    return await _req("PUT", "/api/business", json=profile)


# ── knowledge base ─────────────────────────────────────────────────────────

async def kb_list() -> Any:
    """List all knowledge base documents (id, name, status, chunk count)."""
    return await _req("GET", "/api/knowledge")

async def kb_read(doc_id: str) -> Any:
    """Read a document's full extracted text."""
    return await _req("GET", f"/api/knowledge/{doc_id}")

async def kb_create(name: str, content: str) -> Any:
    """Create a KB document from markdown/plain text; it is chunked, embedded, and indexed. Use markdown headings."""
    return await _req("POST", "/api/knowledge", json={"name": name, "content": content, "source_type": "agent"})

async def kb_update(doc_id: str, name: str, content: str) -> Any:
    """Replace a document's name and content; it is re-indexed."""
    return await _req("PUT", f"/api/knowledge/{doc_id}", json={"name": name, "content": content})

async def kb_search(query: str, top_k: int = 6) -> Any:
    """Hybrid (vector + BM25) search — exactly what the voice agent retrieves at call time. Verify coverage."""
    return await _req("POST", "/api/knowledge/search", json={"query": query, "top_k": top_k})


# ── voice tuning ───────────────────────────────────────────────────────────

async def voice_config_get() -> Any:
    """Get live voice tuning: system prompt, greeting, STT/TTS/engine, VAD, endpointing, LLM model."""
    return await _req("GET", "/api/agent/config")

async def voice_config_update(config: dict) -> Any:
    """Partial-update voice tuning. Keys include: greeting, stt_provider, stt_model, tts_provider, tts_voice_id,
    voice_engine, vad_min_silence, min_endpointing_delay, max_endpointing_delay, llm_model. Applies next call."""
    return await _req("PUT", "/api/agent/config", json=config)

async def voices_list() -> Any:
    """List the voice library across providers (ElevenLabs, Cartesia, OpenAI, Orpheus) to pick a tts_voice_id."""
    return await _req("GET", "/api/voice/voices")

async def llm_providers() -> Any:
    """List the language-model provider catalog with models and which is active for calls."""
    return await _req("GET", "/api/voice/llm/providers")


# ── experts ────────────────────────────────────────────────────────────────

async def expert_list() -> Any:
    """List all experts (reasoning agents) with their config."""
    return await _req("GET", "/api/experts")

async def expert_get(expert_id: str) -> Any:
    """Get an expert's full definition: system prompt, goal, tools, triggers, reasoning level."""
    return await _req("GET", f"/api/experts/{expert_id}")

async def expert_create(body: dict) -> Any:
    """Create an expert. Read expert_get on an existing one to learn the exact shape before creating."""
    return await _req("POST", "/api/experts", json=body)

async def expert_update(expert_id: str, body: dict) -> Any:
    """Update an expert's prompt/goal/tools/triggers (same shape as expert_create)."""
    return await _req("PUT", f"/api/experts/{expert_id}", json=body)

async def expert_run(expert_id: str, message: str) -> Any:
    """Run an expert once with a message. Returns a run id; read it back with expert_run_get for the trace."""
    return await _req("POST", f"/api/experts/{expert_id}/run", json={"message": message})

async def expert_run_get(run_id: str) -> Any:
    """Get an expert run's step trace (thought / tool_call / tool_result / final)."""
    return await _req("GET", f"/api/experts/runs/{run_id}")


# ── system experts (sub-agents) ────────────────────────────────────────────

WORKFLOW_BUILDER = {
    "name": "workflow-builder",
    "description": (
        "Builds, edits, and deploys node-based VOICE WORKFLOWS (abilities): the "
        "step-by-step flows the phone agent follows — greet, ask, act (call a tool), "
        "branch, end. Delegate here for anything about creating or changing a workflow, "
        "wiring an Act node to a real integration tool, or deploying a flow live."
    ),
    "system_prompt": (
        "You build node-based voice workflows (abilities) for a phone agent. Method:\n"
        "1. ALWAYS start by reading a template with ability_get (list them via ability_templates, then read one\n"
        "   with ability_from_template) to copy the EXACT node shape. For branching flows read the 'support' or\n"
        "   'lead' template — they show how conditions/branches are expressed.\n"
        "2. Node shapes: every node has {id, type, label}. Linear flow uses \"next\": \"<target-id>\". Types:\n"
        "   - trigger: {phrases:[...], next}  (the entry; give 2-3 natural phrases)\n"
        "   - ask: {prompt, save_as, next}    (asks one thing, saves the answer to a variable)\n"
        "   - speak: {text, next}             (says a line; reference saved vars with {var_name})\n"
        "   - act: {tool:{kind,ref,label}, instruction, save_as, next}  (calls a real tool)\n"
        "   - end: {}                          (terminates)\n"
        "3. BRANCHING (conditions): to branch, a node uses \"pathways\" instead of a single \"next\". Each pathway is\n"
        "   {id, label, description, next:\"<target-id>\"}. EVERY pathway MUST have a real \"next\" pointing at an\n"
        "   existing node id, and a clear \"description\" of when that branch is taken — otherwise the branch is\n"
        "   dangling and unpopulated. Give the deciding node a \"prompt\" or \"text\" that sets up the choice. Do NOT\n"
        "   leave a condition/branch node with empty pathways or missing next targets.\n"
        "4. Every non-end node must be reachable and must lead somewhere (next or pathways). Verify each id you\n"
        "   reference actually exists in your nodes list.\n"
        "5. For an Act node's tool: integration_connections to see connected apps, integration_app_tools to read the\n"
        "   tool's parameters, then fill them from saved variables. NEVER leave an Act node without a tool unless it\n"
        "   is intentionally a placeholder — it blocks deploy.\n"
        "6. Before deploying, call ability_compiled(stage='draft') and fix EVERY 'error' warning (unbound act,\n"
        "   dangling branch). Only then ability_deploy. Report the ability id, what it does, and its live version.\n"
        "Keep spoken lines short and natural. Return a concise summary of what you built, not the raw graph."
    ),
    "tools": [
        ability_templates, ability_from_template, ability_list, ability_get,
        ability_create, ability_update, ability_compiled, ability_deploy,
        integration_apps, integration_app_tools, integration_connections, integration_execute,
        business_get, kb_search,
    ],
    "model": SUBAGENT_MODEL,
    # pause for human approval before anything that goes live or runs in the world
    "interrupt_on": {"ability_deploy": True, "integration_execute": True},
}

BUSINESS_MANAGER = {
    "name": "business-manager",
    "description": (
        "Owns the BUSINESS PROFILE (who the agent works for — name, hours, services, "
        "policies), the KNOWLEDGE BASE (documents the agent searches on calls), and "
        "VOICE TUNING (greeting, STT/TTS provider and voice, turn-taking, the call LLM). "
        "Delegate here to set up or fix business facts, add/edit knowledge, or tune how "
        "the agent sounds and listens."
    ),
    "system_prompt": (
        "You manage the business profile, the knowledge base, and voice tuning.\n"
        "- Business profile: business_get to see readiness; business_update to fill name, what_we_do, timezone,\n"
        "  hours, services, policies, escalation. These are stated on every call, so keep them accurate and concise.\n"
        "- Knowledge base: kb_list/kb_read to review; kb_create/kb_update for reference material the agent looks up\n"
        "  on calls (pricing, policies, product detail). Write clean markdown with headings; verify with kb_search.\n"
        "- Voice tuning: voice_config_get, then voice_config_update. voices_list to pick a tts_voice_id; llm_providers\n"
        "  to choose the call model. Prefer natural voices and low-latency settings.\n"
        "Confirm what you changed and why. Do not invent business facts — if you don't know one, say so."
    ),
    "tools": [
        business_get, business_update,
        kb_list, kb_read, kb_create, kb_update, kb_search,
        voice_config_get, voice_config_update, voices_list, llm_providers,
    ],
    "model": SUBAGENT_MODEL,
}

EXPERT_BUILDER = {
    "name": "expert-builder",
    "description": (
        "Creates and edits EXPERTS: the general reasoning agents (not the phone flows) "
        "that run on chat, schedules, or external triggers and can call tools to get work "
        "done. Delegate here to build or change an expert's prompt, goal, tools, or triggers."
    ),
    "system_prompt": (
        "You build Experts — reasoning agents with a system prompt, a goal, a reasoning level "
        "(fast|balanced|deep), and a set of tools. Method:\n"
        "1. expert_list and expert_get an existing expert to learn the exact shape before creating.\n"
        "2. For tools the expert should use, integration_connections shows connected apps and integration_app_tools\n"
        "   shows each tool's parameters. Only give an expert tools that are actually connected.\n"
        "3. Write a focused system_prompt and a clear goal. Create with expert_create or change with expert_update.\n"
        "4. Optionally expert_run a quick test and read expert_run_get to confirm it behaves.\n"
        "Report the expert id, its purpose, and its tools."
    ),
    "tools": [
        expert_list, expert_get, expert_create, expert_update, expert_run, expert_run_get,
        integration_apps, integration_app_tools, integration_connections,
    ],
    "model": SUBAGENT_MODEL,
    "interrupt_on": {"integration_execute": True},
}


ORCHESTRATOR_PROMPT = (
    "You are the build assistant for a business voice-agent platform. You turn a person's "
    "request into working, deployed configuration by planning the work and delegating to "
    "three system experts.\n\n"
    "Your system experts (delegate with the task tool):\n"
    "- workflow-builder: node-based voice workflows (abilities) and wiring their tools.\n"
    "- business-manager: the business profile, the knowledge base, and voice tuning.\n"
    "- expert-builder: the reasoning agents (Experts).\n\n"
    "How you work:\n"
    "1. For anything beyond a one-step request, write a short todo list first, then work it.\n"
    "2. Delegate each piece to the right expert — they have the tools and a clean context. Give them a\n"
    "   specific, self-contained task and let them do the multi-step work; you keep the plan.\n"
    "3. Check the result of each delegation before moving on. If an expert reports a blocker (a missing\n"
    "   integration, an empty business profile), surface it plainly rather than papering over it.\n"
    "4. Read current state first (ability_list, expert_list, business_get) so you build on what exists.\n"
    "5. Be honest about what actually got built and deployed versus what still needs a human (connecting an\n"
    "   integration, providing real business facts). Never claim something is live if it is not.\n"
    "Keep your own messages concise; the experts do the heavy lifting."
)

# Read-only high-level tools the orchestrator uses to understand state before delegating.
ORCHESTRATOR_TOOLS = [ability_list, expert_list, business_get, integration_connections, voice_config_get]


_AGENT = None


def _resolve_model(spec: str):
    """A deepagents model. Default is the 'openai:model' string form. To use an
    open-source model through an OpenAI-compatible gateway (e.g. Morph:
    morph-qwen36-27b, morph-glm52-744b, deepseek-v4-flash), set DEEP_AGENT_BASE_URL
    + DEEP_AGENT_API_KEY and DEEP_AGENT_MODEL to the bare model id."""
    base = os.getenv("DEEP_AGENT_BASE_URL")
    key = os.getenv("DEEP_AGENT_API_KEY")
    if base and key:
        from langchain_openai import ChatOpenAI
        model_id = spec.split(":", 1)[-1] if spec.startswith("openai:") else spec
        return ChatOpenAI(model=model_id, base_url=base, api_key=key, temperature=0.3)
    return spec


def get_agent():
    """Build the deep agent once and reuse it. A MemorySaver checkpointer gives
    durable, resumable threads within the process (swap for a Postgres/SQLite saver
    for cross-restart durability)."""
    global _AGENT
    if _AGENT is not None:
        return _AGENT
    from deepagents import create_deep_agent
    from langgraph.checkpoint.memory import MemorySaver

    # keep the whole agent on one provider (all OpenAI, or all Morph/open-source)
    sub_model = _resolve_model(SUBAGENT_MODEL)
    for sa in (WORKFLOW_BUILDER, BUSINESS_MANAGER, EXPERT_BUILDER):
        sa["model"] = sub_model

    _AGENT = create_deep_agent(
        model=_resolve_model(BUILDER_MODEL),
        tools=ORCHESTRATOR_TOOLS,
        system_prompt=ORCHESTRATOR_PROMPT,
        subagents=[WORKFLOW_BUILDER, BUSINESS_MANAGER, EXPERT_BUILDER],
        checkpointer=MemorySaver(),
    )
    return _AGENT
