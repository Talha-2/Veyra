"""Separate child executions, with bounded tasks and parent-owned supervision."""

from __future__ import annotations

import copy
import hashlib
import asyncio
from typing import Any

from app_sdk.errors import AppSdkError

from .desk_tools import acting_for
from .executor import ExecutionScope
from .state import RunState
from .tools import Tool, ToolResult


class ChildExecutions:
    def __init__(self, *, state: Any, context: Any, core_factory: Any = None, expert_factory: Any = None):
        self.state, self.context, self.core_factory = state, context, core_factory
        self.parent = None
        self.workers: dict[str, Any] = {}
        self.results: dict[tuple[int, str, str], ToolResult] = {}
        self.expert_factory = expert_factory
        self.experts = {expert.slug: expert for expert in context.experts if expert.runtime in {"worker", "text"} and not getattr(expert, "is_builtin", False)}
        self.fingerprints: dict[str, str] = {}
        self.result_turn: int | None = None

    def bind(self, parent):
        self.parent = parent

    def core_tool(self) -> Tool:
        async def delegate(args, state):
            task = str(args.get("task") or "").strip()
            if not task or len(task) > 8000:
                return ToolResult.failure("Give an operational task between 1 and 8000 characters.")
            return await self.run_core(task)

        return Tool(name="delegate_work", handler=delegate, audited=False, is_durable_write=True,
                    description="Delegate operational work to the core worker. Supply the task and necessary facts, not conversation or tool history. Returns confirmed results or the missing information/approval.",
                    input_schema={"type": "object", "properties": {"task": {"type": "string", "maxLength": 8000}}, "required": ["task"]})

    def expert_tool(self) -> Tool:
        async def delegate(args, state):
            actor = str(args.get("expert") or "").strip()
            task = str(args.get("task") or "").strip()
            if actor not in self.experts or not task or len(task) > 8000:
                return ToolResult.failure("Choose an available specialist and give a task between 1 and 8000 characters.")
            return await self.run_expert(actor, task)

        return Tool(name="delegate_expert", handler=delegate, audited=False, is_durable_write=True,
                    description="Delegate a specialist task to an optional company Expert. They execute separately with their own private skills and permitted actions. Return their outcome without changing your role.",
                    input_schema={"type": "object", "properties": {"expert": {"type": "string", "enum": list(self.experts)}, "task": {"type": "string", "maxLength": 8000}}, "required": ["expert", "task"]})

    def cache_key(self, actor, task):
        if self.result_turn != self.parent.turn_sequence:
            self.results.clear()
            self.result_turn = self.parent.turn_sequence
        return self.parent.turn_sequence, actor, task

    def child_state(self, sdk):
        extra = copy.deepcopy(getattr(self.state, "extra", {}) or {})
        customer = acting_for(self.state)
        if customer:
            extra["conversation_id"] = customer
        return RunState(sdk=sdk, context=self.context, contact=copy.deepcopy(getattr(self.state, "contact", None)), dry_run=self.parent._executor.scope.dry_run, extra=extra)

    def scope(self, actor: str, *, expert: bool = False) -> ExecutionScope:
        parent = self.parent._executor
        return ExecutionScope(call_id=parent.scope.call_id, delegation_id=parent.scope.delegation_id,
                              expert_slug=actor if expert else None, dry_run=parent.scope.dry_run,
                              key_namespace=f"{parent.execution_namespace}:{self.parent.turn_sequence}:{actor}")

    async def run_core(self, task: str) -> ToolResult:
        actor = "core-worker"
        key = self.cache_key(actor, task)
        if key in self.results:
            return self.results[key]
        child = self.workers.get(actor)
        if child is None:
            child = await asyncio.to_thread(self.core_factory, self.child_state(self.state.sdk), self.scope(actor))
            self.workers[actor] = child
            self.parent.attach_child(actor, child)
        child._executor.scope = self.scope(actor)
        child._state.contact = copy.deepcopy(getattr(self.state, "contact", None))
        return await self.execute(child, task, key)

    async def run_expert(self, actor, task):
        key = self.cache_key(actor, task)
        if key in self.results:
            return self.results[key]
        try:
            sdk = self.state.sdk.for_expert(actor)
            definition = await sdk.expert_definition()
        except AppSdkError:
            return ToolResult.failure("The selected Expert is unavailable or no longer enabled. No new specialist work was started.")
        fingerprint = hashlib.sha256(definition.model_dump_json().encode()).hexdigest()
        child = self.workers.get(actor)
        if child is None or self.fingerprints.get(actor) != fingerprint:
            child = await asyncio.to_thread(self.expert_factory, definition, sdk, self.child_state(sdk), self.scope(actor, expert=True))
            self.workers[actor] = child
            self.fingerprints[actor] = fingerprint
            self.parent.attach_child(actor, child)
        child._executor.scope = self.scope(actor, expert=True)
        child._state.contact = copy.deepcopy(getattr(self.state, "contact", None))
        return await self.execute(child, task, key)

    async def execute(self, child, task: str, key) -> ToolResult:
        history_start = len(child.history)

        async def emit(event):
            if event.get("type") != "delta":
                await self.parent._say(event)

        outcome = await child.delegate(task, emit=emit)
        if child._state.contact is not None:
            self.state.contact = copy.deepcopy(child._state.contact)
        existing_tickets = {ticket.id for ticket in getattr(self.state, "tickets", [])}
        for ticket in child._state.tickets:
            if ticket.id not in existing_tickets:
                self.state.tickets.append(ticket)
                existing_tickets.add(ticket.id)
        actions, classification = child._finalization_outcome(history_start)
        confirmed = classification in {"action_completed", "ticket_created_or_updated"} and not child._executor.scope.dry_run
        data = {"reply": outcome.reply, "failed": outcome.failed, "completed_durable_write": confirmed,
                "actions": list(actions), "runtime": child.runtime_role,
                "status": "failed" if outcome.failed else "waiting_for_approval" if child.awaiting_approval else "waiting_for_information" if child._gate and any(skill.waiting for skill in child._gate.open.values()) else "completed"}
        result = ToolResult.failure(child.last_error or "Delegated work failed or timed out. Any completed writes remain recorded.", data=data) if outcome.failed else ToolResult.success(data)
        self.results[key] = result
        return result
