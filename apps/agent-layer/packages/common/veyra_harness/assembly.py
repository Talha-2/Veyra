"""One way to assemble a worker, for every surface.

Voice calls, live chat (Studio Talk and the public chat API), Ask, automations
and the Studio skill test all run the same ``Worker``. Before this module each
built it differently — a different expert picked, reasoning effort dropped on
some, the step gate on none — so the same organization behaved differently
depending on where the customer reached it. ``build_worker`` is now the only
place a worker is put together:

- **Experts.** Every enabled expert of the surface's runtime becomes a
  persona of the one loop (``roster``). The first is the primary and the
  default; the others are listed in the prompt with their descriptions, and
  ``switch_expert`` hands the task to one of them. Ask uses the Text experts
  (the workers when there are none); every other conversation uses the
  workers.
- **Tools.** The expert's granted actions plus the built-ins
  (``actions.tools_for_expert``); an automation gets exactly what Studio
  allowed it. HTTP, Composio and MCP actions all run.
- **Skills.** ``read_skill`` and ``skill_step`` come from one ``SkillGate``
  per worker, so a step-gated skill is held to its steps everywhere.
- **Model.** The expert's model, else the organization's worker model, with
  the expert's reasoning effort normalised (``llm.reasoning_effort``). An
  automation uses its own Fast / Balanced / Deep setting.

What differs per surface is only the prompt (a call's worker writes private
guidance; chat writes to the customer; Ask to a teammate) and the run state
the host passes in.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, Literal

from app_sdk.models import AutomationSpec, CallContext, CallerInfo, ExpertRecord, TenantContext, ToolSpec

from .actions import BUILTINS, INTERNAL_SLUGS, composio_handler, http_handler, mcp_handler, tools_for_expert, unconnected_handler
from .executor import ActionExecutor, ExecutionScope
from .gating import SkillGate
from .llm import ChatModel, reasoning_effort
from .prompt import chat_instructions, fill, load, text_instructions, worker_instructions
from .tools import Tool
from .worker import Persona, Worker

logger = logging.getLogger("veyra.harness.assembly")

Surface = Literal["voice", "chat", "ask", "automation", "skill_test"]

# (reasoning effort, model reference) → a model. The effort arrives already
# normalised to low / medium / high, or None for the model's default.
ModelFactory = Callable[[str | None, str | None], ChatModel]


# ── experts ──────────────────────────────────────────────────────────────


def roster(context: TenantContext, surface: Surface) -> list[ExpertRecord]:
    """The experts a surface's worker can act as, primary first. Order is Studio's list order."""
    if surface == "automation":
        return []
    if surface == "ask":
        return context.experts_for("text") or context.workers
    return context.workers


def peers_block(expert: ExpertRecord | None, experts: list[ExpertRecord]) -> str:
    others = [e for e in experts if expert is None or e.slug != expert.slug]
    if not others:
        return ""
    lines = [f"- {e.slug}: {e.name}. {e.description}".rstrip() for e in others]
    return "\n".join(lines) + (
        "\n\nWhen the task in front of you belongs to one of these specialists, call `switch_expert` with "
        "their slug before working on it: you continue as them, with their skills and tools. Stay as you are "
        "for anything your own skills and tools cover."
    )


# ── tools ────────────────────────────────────────────────────────────────


def tool_from_spec(spec: ToolSpec) -> Tool | None:
    """One Studio action as a callable tool, whatever its kind. None for an internal slug this layer does not know."""
    if spec.kind == "internal":
        builtin = BUILTINS.get(INTERNAL_SLUGS.get(spec.name, spec.name))
        if builtin is None:
            return None
        tool = Tool.from_spec(spec, builtin.handler)
        tool.plumbing = builtin.plumbing
        return tool
    if spec.kind == "http":
        return Tool.from_spec(spec, http_handler(spec))
    if spec.kind == "composio":
        return Tool.from_spec(spec, composio_handler(spec))
    if spec.kind == "mcp":
        return Tool.from_spec(spec, mcp_handler(spec))
    return Tool.from_spec(spec, unconnected_handler(spec))


def tools_from_specs(specs: list[ToolSpec], *, can_search_knowledge: bool) -> list[Tool]:
    """An automation's tools: exactly what Studio allowed, plus reading skills (and knowledge, when allowed)."""
    tools = [t for t in (tool_from_spec(s) for s in specs) if t is not None]
    names = {t.name for t in tools}
    if "read_skill" not in names:
        tools.append(BUILTINS["read_skill"])
    if can_search_knowledge and "search_knowledge" not in names:
        tools.append(BUILTINS["search_knowledge"])
    return tools


def with_gate(tools: list[Tool], gate: SkillGate) -> list[Tool]:
    """Swap in the gate's ``read_skill`` and add ``skill_step``: every worker reads skills the same way."""
    return gate.wrap(tools)


# ── prompts ──────────────────────────────────────────────────────────────


def instructions_for(
    surface: Surface, context: TenantContext, expert: ExpertRecord | None, experts: list[ExpertRecord], *,
    call: CallContext | None = None, caller: CallerInfo | None = None, skill_slug: str | None = None,
) -> str:
    peers = peers_block(expert, experts)
    if surface == "voice":
        if expert is None:
            return "There is no expert configured. Reply that the request cannot be handled."
        return worker_instructions(context, expert, call, peers=peers)
    if surface == "chat":
        return chat_instructions(context, expert, caller, peers=peers)
    if surface == "skill_test":
        # The *worker* prompt, not the text one: the author is testing what
        # the front desk would be handed on a call, which is private guidance
        # — not a line spoken to the caller.
        base = worker_instructions(context, expert, None, peers=peers) if expert else text_instructions(context, None)
        return base + f"\n\nThis is a dry run of the skill '{skill_slug}'. Read it first. Writes are simulated."
    return text_instructions(context, expert, peers=peers)


# ── the builder ──────────────────────────────────────────────────────────


def build_worker(
    *,
    surface: Surface,
    context: TenantContext,
    sdk: Any,
    state: Any,
    model_factory: ModelFactory,
    call: CallContext | None = None,
    caller: CallerInfo | None = None,
    automation: AutomationSpec | None = None,
    skill_slug: str | None = None,
    model_override: str | None = None,
    dry_run: bool = False,
) -> Worker:
    """The worker for one conversation or run, assembled the same way on every surface.

    ``model_override`` forces one model reference for every expert (the voice
    host's ``WORKER_MODEL`` environment override). Synchronous: building the
    model clients loads TLS state, so a host with a latency-critical loop
    (voice) runs this in a thread.
    """
    gate = SkillGate()
    models: dict[tuple[str | None, str | None], ChatModel] = {}
    default_ref = context.agent.advanced.get("worker_model") or None

    def model_for(ref: str | None, effort: str | None) -> ChatModel:
        key = (model_override or ref or default_ref, reasoning_effort(effort))
        if key not in models:
            models[key] = model_factory(key[1], key[0])
        return models[key]

    if surface == "automation":
        if automation is None:
            raise ValueError("An automation worker needs its automation spec.")
        instructions = fill(load("automation"), base=text_instructions(context, None), name=automation.name, system_prompt=automation.system_prompt or "", goal=automation.goal or "")
        tools = with_gate(tools_from_specs(automation.tools, can_search_knowledge=automation.can_search_knowledge), gate)
        persona = Persona(slug=f"automation:{automation.id}", name=automation.name, instructions=instructions, tools=tools, model=model_for(None, automation.reasoning))
        executor = ActionExecutor(sdk, scope=ExecutionScope(expert_slug=persona.slug, dry_run=dry_run))
        return Worker(personas=[persona], executor=executor, state=state, gate=gate)

    experts = roster(context, surface)
    if surface == "skill_test" and skill_slug:
        # Start as the expert that holds the skill; the others stay reachable.
        holder = next((e for e in experts if any(s.slug == skill_slug for s in e.skills)), None)
        if holder is not None:
            experts = [holder, *[e for e in experts if e.slug != holder.slug]]

    personas: list[Persona] = []
    for expert in experts:
        personas.append(Persona(
            slug=expert.slug, name=expert.name, description=expert.description,
            instructions=instructions_for(surface, context, expert, experts, call=call, caller=caller, skill_slug=skill_slug),
            tools=with_gate(tools_for_expert(expert, context), gate),
            model=model_for(expert.model, expert.reasoning_effort),
        ))
    if not personas:
        # No expert of this runtime is enabled. A conversation still answers
        # from the built-ins; a call's worker says honestly it cannot act.
        tools = [] if surface == "voice" else with_gate(list(BUILTINS.values()), gate)
        personas.append(Persona(slug=None, name="worker", instructions=instructions_for(surface, context, None, [], call=call, caller=caller, skill_slug=skill_slug), tools=tools, model=model_for(None, None)))

    executor = ActionExecutor(sdk, scope=ExecutionScope(call_id=call.call.id if call is not None else None, expert_slug=personas[0].slug, dry_run=dry_run))
    if len(personas) > 1:
        logger.info("assembly.roster surface=%s experts=%s", surface, [p.slug for p in personas])
    return Worker(personas=personas, executor=executor, state=state, gate=gate)


def talker_model_ref(context: TenantContext) -> str | None:
    """The talker's model for voice: the talker expert's own model, else Identity → Models, else None (the layer default)."""
    talker = context.talker
    return (talker.model if talker and talker.model else None) or context.agent.advanced.get("talker_model") or None
