"""Built-in execution roles; no Expert record is required or selected."""

from __future__ import annotations

from typing import Any

from app_sdk.models import RuntimeDefinition

from .actions import BUILTINS, INTERNAL_SLUGS, tools_for_definition
from .executor import ActionExecutor, ExecutionScope
from .gating import SkillGate
from .prompt import chat_caller_block, chat_instructions, worker_instructions, text_instructions
from .worker import Persona, Worker
from .models import DEFAULT_TALKER


def permitted_tools(definition: RuntimeDefinition, context: Any):
    """Only the profile's action grants, plus read-only skill/knowledge plumbing."""
    disabled = {INTERNAL_SLUGS.get(name, name) for name in context.disabled_actions}
    grants = [spec for spec in definition.tools if spec.kind != "internal" or INTERNAL_SLUGS.get(spec.name, spec.name) not in disabled]
    tools = tools_for_definition(definition.model_copy(update={"tools": grants}), context, include_builtins=False)
    if "search_knowledge" not in disabled and not any(tool.name == "search_knowledge" for tool in tools):
        tools.append(BUILTINS["search_knowledge"])
    return tools


def build_role(*, definition: RuntimeDefinition, context: Any, sdk: Any, state: Any, model_for: Any,
               surface: str = "ask", call: Any = None, caller: Any = None, dry_run: bool = False,
               skill_slug: str | None = None, scope: ExecutionScope | None = None, extra_tools=None) -> Worker:
    gate = SkillGate()
    if surface in {"voice", "skill_test", "operations", "expert"}:
        instructions = worker_instructions(context, definition, call, peers="")
        if caller is not None:
            instructions += "\n\n# Customer context\n" + chat_caller_block(caller)
    else:
        instructions = text_instructions(context, definition)
    if skill_slug:
        instructions += f"\n\nDry run of '{skill_slug}': read this skill first. Writes are simulated."
    tools = gate.wrap(permitted_tools(definition, context))
    tools.extend(extra_tools or [])
    persona = Persona(slug=definition.slug, name=definition.name, description=definition.description,
                      instructions=instructions, tools=tools, model=model_for(definition.model, definition.reasoning_effort))
    executor = ActionExecutor(sdk, scope=scope or ExecutionScope(call_id=call.call.id if call else None, expert_slug=definition.slug, dry_run=dry_run))
    return Worker(personas=[persona], executor=executor, state=state, gate=gate,
                  runtime_role="expert" if surface == "expert" else "worker")


def build_core_runtime(*, surface: str, context: Any, sdk: Any, state: Any, model_for: Any, expert_model_for: Any = None,
                       call: Any = None, caller: Any = None, skill_slug: str | None = None, dry_run: bool = False) -> Worker:
    from .delegation import ChildExecutions

    core = context.core
    if core is None:
        raise ValueError("Core runtime configuration is required.")
    expert_model_for = expert_model_for or model_for
    if surface != "chat":
        def create_expert(definition, expert_sdk, child_state, scope):
            return build_role(definition=definition, context=context, sdk=expert_sdk, state=child_state, model_for=expert_model_for,
                              surface="expert", caller=caller or (call.caller if call else None), dry_run=dry_run, scope=scope)

        executions = ChildExecutions(state=state, context=context, expert_factory=create_expert)
        extra_tools = [executions.expert_tool()] if executions.experts else []
        worker = build_role(definition=core.worker, context=context, sdk=sdk, state=state, model_for=model_for,
                            surface=surface, call=call, caller=caller, dry_run=dry_run, skill_slug=skill_slug, extra_tools=extra_tools)
        executions.bind(worker)
        if executions.experts:
            worker.history[0]["content"] += "\n\n# Optional specialists\n" + "\n".join(f"- {expert.slug}: {expert.name}. {expert.description}" for expert in executions.experts.values())
            worker.history[0]["content"] += "\nUse delegate_expert only for a task needing one of these specialists. Provide the specific task and necessary facts; never send your whole conversation or tool history. You remain the core worker and receive their result."
        return worker

    def create_child(child_state, scope):
        child = build_core_runtime(surface="operations", context=context, sdk=sdk, state=child_state, model_for=model_for,
                                   expert_model_for=expert_model_for, caller=caller, dry_run=dry_run)
        child._executor.scope = scope
        return child

    executions = ChildExecutions(state=state, context=context, core_factory=create_child)
    tools = [executions.core_tool()]
    if "search_knowledge" not in context.disabled_actions:
        tools.append(BUILTINS["search_knowledge"])
    instructions = chat_instructions(context, core.taker, caller)
    instructions += "\n\n# Conversation role\nYou own the conversation. Delegate all operational tasks through delegate_work. It runs shared skills with permitted actions and returns verified results or the information/approval it needs. Never perform writes yourself or claim success without a confirmed result."
    persona = Persona(slug=core.taker.slug, name=core.taker.name, instructions=instructions, tools=tools,
                      model=model_for(core.taker.model or context.agent.advanced.get("talker_model") or DEFAULT_TALKER, core.taker.reasoning_effort))
    worker = Worker(personas=[persona], executor=ActionExecutor(sdk, scope=ExecutionScope(expert_slug=core.taker.slug, dry_run=dry_run)), state=state, runtime_role="taker")
    executions.bind(worker)
    return worker


async def build_expert_runtime(*, context, sdk, expert_slug, model_factory, skill_slug=None, dry_run=False):
    """An explicit specialist run, including Studio's owner-bound private skill test."""
    from .state import RunState
    from .llm import reasoning_effort

    expert_sdk = sdk.for_expert(expert_slug)
    definition = await expert_sdk.expert_definition()
    if skill_slug and not any(skill.slug == skill_slug for skill in definition.skills):
        raise ValueError("The skill is not available to this Expert.")
    if skill_slug:
        await expert_sdk.skill(skill_slug)
    state = RunState(sdk=expert_sdk, context=context, dry_run=dry_run)
    return build_role(definition=definition, context=context, sdk=expert_sdk, state=state, surface="expert",
                      model_for=lambda ref, effort: model_factory(reasoning_effort(effort), ref or (context.core.worker.model if context.core else None)),
                      dry_run=dry_run, skill_slug=skill_slug)
