"""MCP server for the voice-agent platform.

Exposes the entire product surface — knowledge base, workflows, voice tuning,
evals, transcripts — as MCP tools, so any MCP client (Claude Code, Claude
Desktop, custom deep agents) can build and operate the voice agent end to end.

Runs over stdio and talks HTTP to the platform backend (apps/server), which
must be running.

Register in Claude Code:
  claude mcp add voice-agent -- python "d:/personal projects/Voice Agent/apps/mcp/server.py"

Or in claude_desktop_config.json / .mcp.json:
  {"mcpServers": {"voice-agent": {"command": "python",
    "args": ["d:/personal projects/Voice Agent/apps/mcp/server.py"],
    "env": {"BACKEND_URL": "http://127.0.0.1:8000"}}}}
"""

import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")

mcp = FastMCP(
    "voice-agent-platform",
    instructions=(
        "Build and operate a business voice agent: manage its RAG knowledge base, "
        "create JSON workflows it executes on calls, tune its voice pipeline "
        "(STT/TTS/VAD/endpointing), run pre-production eval simulations, and read "
        "call transcripts. Typical build loop: add knowledge → create workflows → "
        "tune config → run evals → inspect transcripts."
    ),
)


async def _req(method: str, path: str, **kwargs) -> Any:
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.request(method, f"{BACKEND_URL}{path}", **kwargs)
        if resp.status_code >= 400:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:1000]}
        return resp.json()


# ── knowledge base ───────────────────────────────────────────────────────

@mcp.tool()
async def kb_list() -> Any:
    """List all knowledge base documents (id, name, status, chunk count)."""
    return await _req("GET", "/api/knowledge")


@mcp.tool()
async def kb_read(doc_id: str) -> Any:
    """Read a document's full extracted text content."""
    return await _req("GET", f"/api/knowledge/{doc_id}")


@mcp.tool()
async def kb_create(name: str, content: str) -> Any:
    """Create a knowledge base document from markdown/plain text. It is chunked,
    embedded, and indexed for the voice agent's RAG retrieval. Use markdown
    headings — chunking is heading-aware and retrieval quality improves."""
    return await _req("POST", "/api/knowledge", json={"name": name, "content": content, "source_type": "agent"})


@mcp.tool()
async def kb_update(doc_id: str, name: str, content: str) -> Any:
    """Replace a document's name and content; the document is re-indexed."""
    return await _req("PUT", f"/api/knowledge/{doc_id}", json={"name": name, "content": content})


@mcp.tool()
async def kb_upload_file(path: str) -> Any:
    """Upload a local file (txt, md, pdf, docx) into the knowledge base."""
    if not os.path.isfile(path):
        return {"error": f"file not found: {path}"}
    with open(path, "rb") as f:
        data = f.read()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/knowledge/upload",
            files={"file": (os.path.basename(path), data)},
        )
        return resp.json() if resp.status_code < 400 else {"error": resp.text[:1000]}


@mcp.tool()
async def kb_delete(doc_id: str) -> Any:
    """Delete a knowledge base document and its vector index entries."""
    return await _req("DELETE", f"/api/knowledge/{doc_id}")


@mcp.tool()
async def kb_search(query: str, top_k: int = 6) -> Any:
    """Hybrid (vector + BM25) search — exactly what the voice agent retrieves at
    call time. Use to verify coverage: 'what would the agent find for X?'"""
    return await _req("POST", "/api/knowledge/search", json={"query": query, "top_k": top_k})


# ── workflows ────────────────────────────────────────────────────────────

@mcp.tool()
async def workflow_schema() -> Any:
    """Get the workflow JSON Schema plus a complete example spec. Read this before
    creating workflows."""
    return await _req("GET", "/api/workflows/schema")


@mcp.tool()
async def workflow_list() -> Any:
    """List all workflows with full specs and enabled state."""
    return await _req("GET", "/api/workflows")


@mcp.tool()
async def workflow_validate(spec: dict) -> Any:
    """Validate a workflow spec without saving it; returns errors if invalid."""
    return await _req("POST", "/api/workflows/validate", json={"spec": spec})


@mcp.tool()
async def workflow_create(spec: dict, enabled: bool = True) -> Any:
    """Create a voice-agent workflow (trigger + system prompt + variables + steps).
    The live agent picks it up on the next call session."""
    return await _req("POST", "/api/workflows", json={"spec": spec, "enabled": enabled})


@mcp.tool()
async def workflow_update(wf_id: str, spec: dict, enabled: bool = True) -> Any:
    """Update an existing workflow's spec / enabled flag."""
    return await _req("PUT", f"/api/workflows/{wf_id}", json={"spec": spec, "enabled": enabled})


@mcp.tool()
async def workflow_delete(wf_id: str) -> Any:
    """Delete a workflow."""
    return await _req("DELETE", f"/api/workflows/{wf_id}")


# ── voice tuning ─────────────────────────────────────────────────────────

@mcp.tool()
async def voice_config_get() -> Any:
    """Get live voice tuning: system prompt, greeting, STT model/language/keyterms,
    TTS voice, VAD thresholds, endpointing delays, interruption settings."""
    return await _req("GET", "/api/agent/config")


@mcp.tool()
async def voice_config_update(config: dict) -> Any:
    """Partial-update voice tuning config. Keys: system_prompt, greeting, stt_model,
    stt_language, stt_keyterms, tts_provider, tts_voice_id, tts_model,
    vad_min_silence, vad_activation_threshold, min_endpointing_delay,
    max_endpointing_delay, allow_interruptions, min_interruption_duration, llm_model.
    Applies to the next call session."""
    return await _req("PUT", "/api/agent/config", json=config)


# ── evals & transcripts ──────────────────────────────────────────────────

@mcp.tool()
async def eval_catalog() -> Any:
    """List available simulated-caller personas (rambler, interrupter, accent-heavy,
    code-switcher, adversarial...) and default scenarios."""
    return await _req("GET", "/api/evals/catalog")


@mcp.tool()
async def eval_run(persona: str, scenario_name: str = "", goal: str = "") -> Any:
    """Start a simulated call against the current agent config + KB + workflows.
    Returns a run id; poll eval_get until status is 'done' for scores
    (task_completion, groundedness, conversation_quality, safety) and latency."""
    body: dict = {"persona": persona}
    if scenario_name:
        body["scenario_name"] = scenario_name
    if goal:
        body["goal"] = goal
    return await _req("POST", "/api/evals/run", json=body)


@mcp.tool()
async def eval_get(run_id: str) -> Any:
    """Get an eval run's status, simulated transcript, judge scores, and latency."""
    return await _req("GET", f"/api/evals/{run_id}")


@mcp.tool()
async def eval_list() -> Any:
    """List recent eval runs."""
    return await _req("GET", "/api/evals")


@mcp.tool()
async def transcripts_list() -> Any:
    """List recent real call transcripts with latency metrics."""
    return await _req("GET", "/api/transcripts")


# ── abilities: the node-based voice workflows (compile → deploy → live) ─────

@mcp.tool()
async def ability_templates() -> Any:
    """List node-workflow starting points (appointment, support, lead, order,
    callback, blank). Each has a key you pass to ability_from_template."""
    return await _req("GET", "/api/abilities/templates")


@mcp.tool()
async def ability_from_template(key: str, name: str) -> Any:
    """Create a new node-based ability (voice workflow) from a template key. Returns
    the new ability with its node graph — the fastest way to start a real flow."""
    return await _req("POST", "/api/abilities/from-template", json={"key": key, "name": name})


@mcp.tool()
async def ability_list() -> Any:
    """List all node-based abilities (voice workflows) with status and live version."""
    return await _req("GET", "/api/abilities")


@mcp.tool()
async def ability_get(ability_id: str) -> Any:
    """Get an ability's full node graph, triggers, and global prompt. Read a template's
    output first to learn the node shape (trigger/ask/act/speak/condition/webhook/end)."""
    return await _req("GET", f"/api/abilities/{ability_id}")


@mcp.tool()
async def ability_create(body: dict) -> Any:
    """Create a node-based ability. body: {name, description, nodes:[...], start_node,
    triggers:[...], global_prompt}. Each node: {id, type, label, next, ...type-specific}.
    An 'act' node calls a tool: {type:'act', tool:{kind, ref, label}, instruction, save_as}.
    Copy the shape from ability_get on a template."""
    return await _req("POST", "/api/abilities", json=body)


@mcp.tool()
async def ability_update(ability_id: str, body: dict) -> Any:
    """Update an ability's graph/prompt/triggers. body takes the same shape as
    ability_create (name, description, nodes, start_node, triggers, global_prompt, enabled)."""
    return await _req("PUT", f"/api/abilities/{ability_id}", json=body)


@mcp.tool()
async def ability_compiled(ability_id: str, stage: str = "draft") -> Any:
    """Get the compiled agent script, declared tools, and WARNINGS for an ability
    (stage: draft|live). Always check warnings before deploying — an Act node with no
    tool connected is a blocking error."""
    return await _req("GET", f"/api/abilities/{ability_id}/compiled", params={"stage": stage})


@mcp.tool()
async def ability_deploy(ability_id: str, note: str = "", force: bool = False) -> Any:
    """Freeze the ability draft as a new live version so calls follow it. Blocks on
    compile errors (e.g. an unbound Act node) unless force=true."""
    return await _req("POST", f"/api/abilities/{ability_id}/deploy", json={"note": note, "force": force})


@mcp.tool()
async def ability_versions(ability_id: str) -> Any:
    """List an ability's version history and which one is live."""
    return await _req("GET", f"/api/abilities/{ability_id}/versions")


# ── experts: the general reasoning agents (chat / schedule / triggers) ──────

@mcp.tool()
async def expert_list() -> Any:
    """List all experts (reasoning agents) with their config."""
    return await _req("GET", "/api/experts")


@mcp.tool()
async def expert_get(expert_id: str) -> Any:
    """Get an expert's full definition: system prompt, goal, tools, triggers, reasoning."""
    return await _req("GET", f"/api/experts/{expert_id}")


@mcp.tool()
async def expert_create(body: dict) -> Any:
    """Create an expert. body typically: {name, description, system_prompt, goal,
    reasoning:'fast|balanced|deep', tools:[...]}. Read expert_get on an existing one
    to learn the exact shape before creating."""
    return await _req("POST", "/api/experts", json=body)


@mcp.tool()
async def expert_update(expert_id: str, body: dict) -> Any:
    """Update an expert's prompt/goal/tools/triggers (same shape as expert_create)."""
    return await _req("PUT", f"/api/experts/{expert_id}", json=body)


@mcp.tool()
async def expert_run(expert_id: str, message: str) -> Any:
    """Run an expert once with a message (background task). Returns a run id; read it
    back with expert_run_get for the step-by-step trace and final answer."""
    return await _req("POST", f"/api/experts/{expert_id}/run", json={"message": message})


@mcp.tool()
async def expert_run_get(run_id: str) -> Any:
    """Get an expert run's step trace (thought / tool_call / tool_result / final)."""
    return await _req("GET", f"/api/experts/runs/{run_id}")


# ── integrations: discover tools, read their parameters, connect, execute ──

@mcp.tool()
async def integration_apps(search: str = "", category: str = "") -> Any:
    """Browse the Composio app catalog (1000+ apps: Gmail, Google Calendar, Slack,
    HubSpot, ...). Use to find an app before selecting one of its tools."""
    params = {k: v for k, v in {"search": search, "category": category}.items() if v}
    return await _req("GET", "/api/integrations/apps", params=params)


@mcp.tool()
async def integration_app_tools(slug: str) -> Any:
    """List a Composio app's tools WITH their input parameter JSON Schemas. This is how
    you select a tool and know exactly which parameters to fill in an Act node."""
    return await _req("GET", f"/api/integrations/apps/{slug}/tools")


@mcp.tool()
async def integration_connections() -> Any:
    """List connected integration accounts — the tools the agent can ACTUALLY call
    right now (an Act node should reference a connected toolkit)."""
    return await _req("GET", "/api/integrations/connections")


@mcp.tool()
async def integration_actions() -> Any:
    """List custom HTTP actions (user-defined webhooks usable as tools)."""
    return await _req("GET", "/api/integrations/actions")


@mcp.tool()
async def integration_execute(kind: str, ref: str, params: dict) -> Any:
    """Execute a tool to test it. kind: composio|action|mcp. ref: the tool/action id.
    params: the filled parameters. Use to verify a tool works before wiring it into a flow."""
    return await _req("POST", "/api/integrations/execute", json={"kind": kind, "ref": ref, "params": params})


@mcp.tool()
async def integration_agent_tools() -> Any:
    """List everything the live voice worker currently loads as callable tools
    (connected Composio toolkits + custom actions + MCP servers)."""
    return await _req("GET", "/api/integrations/agent-tools")


# ── voice lab: voices and language models ──────────────────────────────────

@mcp.tool()
async def voices_list() -> Any:
    """List the voice library across providers (ElevenLabs, Cartesia, OpenAI, Orpheus)
    with ids, gender, accent, and best-for labels — to pick tts_voice_id."""
    return await _req("GET", "/api/voice/voices")


@mcp.tool()
async def llm_providers() -> Any:
    """List the language-model provider catalog (OpenAI, Groq, Cerebras, Gemini, ...)
    with their models and which one is active for calls."""
    return await _req("GET", "/api/voice/llm/providers")


# ── business profile: who the agent works for ──────────────────────────────

@mcp.tool()
async def business_get() -> Any:
    """Get the business profile the agent states on every call (name, hours, services,
    policies, escalation) plus a readiness status."""
    return await _req("GET", "/api/business")


@mcp.tool()
async def business_update(profile: dict) -> Any:
    """Update the business profile. Keys: name, what_we_do, timezone, hours, address,
    phone, website, services, pricing, policies, escalation, notes, pronunciation."""
    return await _req("PUT", "/api/business", json=profile)


if __name__ == "__main__":
    mcp.run()
