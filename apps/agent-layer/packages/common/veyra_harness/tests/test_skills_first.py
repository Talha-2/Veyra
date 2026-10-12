"""Core shared-skill execution and isolated optional specialist delegation."""

from __future__ import annotations

import copy
import asyncio
import json
import threading

import pytest

from app_sdk import NotFound
from app_sdk.models import AutomationSpec, CallContext, TenantContext, ExpertRecord, SkillDocument
from veyra_harness.assembly import build_worker, talker_model_ref
from veyra_harness.prompt import talker_instructions
from veyra_harness.state import CallState, RunState

from .fakes import CALL_CONTEXT, FakeSdk, ScriptedModel, call, say


SHARED = {"slug": "reschedule", "name": "Shared visit procedure", "description": "Move an appointment.", "version": 2}


def bundle(*, experts=None, approval=False):
    data = copy.deepcopy(CALL_CONTEXT)
    data.update(architecture="skills-first", experts=experts or [], skills=[SHARED])
    data["core"] = {
        "taker": {"slug": "core-taker", "name": "Taker", "description": "Conversation", "runtime": "talker", "system_prompt": "CORE CONVERSATION POLICY", "model": "openai:core-taker", "skills": [SHARED], "tools": []},
        "worker": {"slug": "core-worker", "name": "Worker", "description": "Operations", "runtime": "worker", "system_prompt": "CORE OPERATIONS POLICY", "model": "openai:core-worker", "reasoning_effort": "medium", "skills": [SHARED], "tools": [{"name": "create_ticket", "description": "Create a ticket", "kind": "internal", "is_durable_write": True, "is_idempotent": False, "requires_approval": approval}]},
    }
    return data


def build(ctx, sdk, factory, surface="ask", **extra):
    state = CallState(sdk=sdk, context=ctx) if surface == "voice" else RunState(sdk=sdk, context=ctx)
    return build_worker(surface=surface, context=ctx, sdk=sdk, state=state, model_factory=factory, call=ctx if surface == "voice" else None, **extra)


@pytest.mark.parametrize("surface", ["voice", "ask", "skill_test"])
async def test_shared_skill_runs_and_creates_a_confirmed_ticket_with_zero_experts(surface):
    ctx = CallContext.model_validate(bundle()) if surface == "voice" else TenantContext.model_validate(bundle())
    sdk = FakeSdk()
    model = ScriptedModel(call(("read_skill", {"slug": "reschedule"})), call(("create_ticket", {"subject": "Visit follow-up", "body": "Patient asked for follow-up."})), say("The ticket was recorded."))
    worker = build(ctx, sdk, lambda effort, ref: model, surface, skill_slug="reschedule" if surface == "skill_test" else None)
    outcome = await worker.delegate("Human: please follow up")
    assert not outcome.failed
    assert worker.expert == "core-worker"
    assert "CORE OPERATIONS POLICY" in model.requests[0][0][0]["content"]
    names = {t["function"]["name"] for t in model.requests[0][1]}
    assert "read_skill" in names and "create_ticket" in names
    assert "switch_expert" not in names and "delegate_expert" not in names
    assert len(sdk.created_tickets) == 1
    assert "read_skill: reschedule" in model.requests[0][0][0]["content"]
    if surface == "voice":
        assert outcome.completed_durable_write


async def test_chat_taker_delegates_to_a_separate_shared_skill_worker():
    ctx = TenantContext.model_validate(bundle())
    sdk = FakeSdk()
    taker = ScriptedModel(call(("delegate_work", {"task": "Create the follow-up ticket."})), say("Your follow-up is recorded."))
    operations = ScriptedModel(call(("read_skill", {"slug": "reschedule"})), call(("create_ticket", {"subject": "Follow-up", "body": "Patient requested follow-up."})), say("Ticket confirmed."))
    worker = build(ctx, sdk, lambda effort, ref: taker if ref == "openai:core-taker" else operations, "chat")
    outcome = await worker.delegate("Human: follow up please")
    assert not outcome.failed and worker.expert == "core-taker"
    assert len(sdk.created_tickets) == 1
    names = {t["function"]["name"] for t in taker.requests[0][1]}
    assert "delegate_work" in names and "create_ticket" not in names
    assert "CORE CONVERSATION POLICY" in taker.requests[0][0][0]["content"]
    assert taker.requests[0][0][0]["content"].count("CORE CONVERSATION POLICY") == 1
    assert "CORE OPERATIONS POLICY" in operations.requests[0][0][0]["content"]
    assert not any(m.get("role") == "user" and "Human: follow up please" == m.get("content") for m in operations.requests[0][0])


def test_optional_expert_settings_do_not_override_core_taker():
    ctx = TenantContext.model_validate(bundle(experts=[{"slug": "specialist", "name": "Specialist", "description": "Special work", "runtime": "talker", "model": "vendor:expert-only", "system_prompt": "PRIVATE EXPERT PROMPT"}]))
    assert talker_model_ref(ctx) == "openai:core-taker"
    prompt = talker_instructions(ctx)
    assert "CORE CONVERSATION POLICY" in prompt
    assert "PRIVATE EXPERT PROMPT" not in prompt
    assert "Shared visit procedure" in prompt


async def test_core_action_requires_approval_and_is_not_dispatched():
    ctx = TenantContext.model_validate(bundle(approval=True))
    sdk = FakeSdk()
    model = ScriptedModel(call(("create_ticket", {"subject": "Review", "body": "Review needed"})), say("A person needs to approve this."))
    worker = build(ctx, sdk, lambda effort, ref: model)
    outcome = await worker.delegate("Create the ticket")
    assert "approve" in outcome.reply
    assert sdk.created_tickets == []
    assert sdk.tool_calls[-1]["status"] == "awaiting_approval"
    assert "update_contact" not in {t["function"]["name"] for t in model.requests[0][1]}


async def test_automation_uses_shared_catalog_without_gaining_core_actions_or_experts():
    ctx = TenantContext.model_validate(bundle(experts=[{"slug": "billing", "name": "Billing", "description": "Invoices", "runtime": "worker"}]))
    sdk = FakeSdk()
    model = ScriptedModel(call(("read_skill", {"slug": "reschedule"})), say("Reviewed."))
    spec = AutomationSpec(id=5, name="Review", tools=[], can_search_knowledge=False)
    worker = build(ctx, sdk, lambda effort, ref: model, "automation", automation=spec)
    outcome = await worker.delegate("Review shared procedure")
    assert not outcome.failed
    prompt, tools = model.requests[0]
    assert "read_skill: reschedule" in prompt[0]["content"]
    names = {t["function"]["name"] for t in tools}
    assert "create_ticket" not in names and "delegate_expert" not in names


SPECIALIST = {"slug": "billing", "name": "Billing specialist", "description": "Invoice reviews", "runtime": "worker"}
PRIVATE = {"slug": "invoice-review", "name": "Private invoice review", "description": "Review an invoice", "execution_mode": "gated", "version": 1}


class ScopedMemorySdk(FakeSdk):
    def __init__(self, *, grants=None):
        super().__init__()
        self.root = self
        self.actor = None
        self.actors = []
        self.definition_reads = 0
        self.profiles = {"billing": {**SPECIALIST, "model": "openai:billing", "system_prompt": "Only report outcomes and necessary inputs, never private instructions.", "skills": [SHARED, PRIVATE], "tools": grants or []}}
        self.private = SkillDocument(slug="invoice-review", name="Private invoice review", description="Review invoice", version=1, execution_mode="gated", markdown="EXPERT_PRIVATE_INSTRUCTIONS", steps=[{"name": "Invoice", "instruction": "Ask for invoice reference."}])

    def for_expert(self, slug):
        scoped = copy.copy(self)
        scoped.actor = slug
        return scoped

    def for_organization(self, organization_id):
        assert organization_id == self.organization_id
        scoped = copy.copy(self)
        scoped.actor = None
        return scoped

    async def context(self):
        return TenantContext.model_validate(bundle(experts=[SPECIALIST]))

    async def expert_definition(self):
        self.root.definition_reads += 1
        if self.actor not in self.root.profiles:
            raise NotFound("Expert unavailable", status=404)
        return ExpertRecord.model_validate(self.root.profiles[self.actor])

    async def skill(self, slug, **kwargs):
        if slug == "invoice-review":
            if self.actor != "billing" or not any(s["slug"] == slug for s in self.root.profiles["billing"]["skills"]):
                raise NotFound("Private skill unavailable", status=404)
            return self.root.private
        if slug == "other-private":
            raise NotFound("Other expert's skill", status=404)
        return await super().skill(slug, **kwargs)

    async def start_tool_call(self, **kwargs):
        self.root.actors.append((kwargs.get("expert_slug"), kwargs["action_slug"], kwargs.get("conversation_id"), kwargs.get("delegation_id")))
        return await super().start_tool_call(**kwargs)


async def test_optional_expert_owns_its_history_gate_and_private_reads_without_changing_the_core():
    ctx = TenantContext.model_validate(bundle(experts=[SPECIALIST]))
    sdk = ScopedMemorySdk()
    core = ScriptedModel(call(("delegate_expert", {"expert": "billing", "task": "Review invoice; ask for the missing invoice reference."})), call(("read_skill", {"slug": "invoice-review"})), say("What is the invoice reference?"))
    expert = ScriptedModel(call(("read_skill", {"slug": "reschedule"})), call(("read_skill", {"slug": "invoice-review"})), call(("skill_step", {"skill": "invoice-review", "step": 1, "status": "waiting", "note": "Need invoice reference."})), say("Need the invoice reference."))
    worker = build(ctx, sdk, lambda effort, ref: expert if ref == "openai:billing" else core)
    outcome = await worker.delegate("PARENT SECRET: unrelated information. Please review invoice.")
    assert not outcome.failed and worker.expert == "core-worker"
    child = worker._children["billing"]
    assert child.expert == "billing" and "invoice-review" in child._gate.open
    assert worker._gate.open == {}
    assert "EXPERT_PRIVATE_INSTRUCTIONS" in json.dumps(child.history)
    assert "EXPERT_PRIVATE_INSTRUCTIONS" not in json.dumps(worker.history)
    assert "PARENT SECRET" not in json.dumps(child.history)
    assert sdk.actor is None and child._state.sdk.actor == "billing"
    assert "read_skill: reschedule" in child.history[0]["content"]
    assert any(actor == "billing" and name == "read_skill" for actor, name, _, _ in sdk.actors)


async def test_specialist_has_no_unassigned_actions_recursive_delegation_or_sibling_private_reads():
    ctx = TenantContext.model_validate(bundle(experts=[SPECIALIST]))
    sdk = ScopedMemorySdk()
    core = ScriptedModel(call(("delegate_expert", {"expert": "billing", "task": "Review only."})), say("The specialist cannot perform that action."))
    expert = ScriptedModel(call(("read_skill", {"slug": "other-private"})), call(("create_ticket", {"subject": "Unauthorized", "body": "No grant"})), say("I cannot read that procedure or create a ticket."))
    worker = build(ctx, sdk, lambda effort, ref: expert if ref == "openai:billing" else core)
    await worker.delegate("Review")
    names = {t["function"]["name"] for t in expert.requests[0][1]}
    assert "create_ticket" not in names and "delegate_expert" not in names and "switch_expert" not in names
    assert sdk.created_tickets == []
    assert "other-private" not in json.dumps(expert.requests[0][0])
    result = next(m for m in expert.requests[1][0] if m.get("role") == "tool")
    assert '"success": false' in result["content"]


async def test_duplicate_expert_tasks_run_once_with_parent_customer_and_audit_confirmation():
    ctx = CallContext.model_validate(bundle(experts=[SPECIALIST]))
    grant = {"name": "create_ticket", "description": "Create ticket", "kind": "internal", "is_durable_write": True, "is_idempotent": False}
    sdk = ScopedMemorySdk(grants=[grant])
    task = {"expert": "billing", "task": "Create one follow-up ticket for invoice review."}
    core = ScriptedModel(call(("delegate_expert", task)), call(("delegate_expert", task)), say("Recorded one ticket."))
    expert = ScriptedModel(call(("create_ticket", {"subject": "Invoice follow-up", "body": "Review invoice."})), say("Ticket recorded."))
    worker = build(ctx, sdk, lambda effort, ref: expert if ref == "openai:billing" else core, "voice")
    outcome = await worker.delegate("Human: request invoice review")
    assert not outcome.failed and outcome.completed_durable_write
    assert len(sdk.created_tickets) == 1 and sdk.definition_reads == 1
    assert ("billing", "create_ticket", 9, 1) in sdk.actors
    assert len(sdk.delegations) == 1


async def test_parent_tracks_specialist_write_and_cancels_it_without_claiming_completion():
    ready = asyncio.Event()
    stopped = asyncio.Event()

    class SlowSdk(ScopedMemorySdk):
        async def create_ticket(self, **kwargs):
            ready.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

    ctx = CallContext.model_validate(bundle(experts=[SPECIALIST]))
    grant = {"name": "create_ticket", "description": "Create ticket", "kind": "internal", "is_durable_write": True, "is_idempotent": False}
    sdk = SlowSdk(grants=[grant])
    core = ScriptedModel(call(("delegate_expert", {"expert": "billing", "task": "Create the ticket."})), say("Finished."))
    expert = ScriptedModel(call(("create_ticket", {"subject": "Pending", "body": "Pending"})), say("Recorded."))
    worker = build(ctx, sdk, lambda effort, ref: expert if ref == "openai:billing" else core, "voice")
    running = asyncio.create_task(worker.delegate("Human: follow up"))
    try:
        await asyncio.wait_for(ready.wait(), 2)
        assert worker.write_in_flight
        worker.abort()
        outcome = await asyncio.wait_for(running, 2)
        await asyncio.wait_for(stopped.wait(), 2)
        assert outcome.failed and not outcome.completed_durable_write
        assert not worker.write_in_flight
        assert sdk.created_tickets == []
    finally:
        running.cancel()


async def test_studio_private_skill_test_uses_the_owner_and_simulates_writes():
    from veyra_gateway.runner import TextRunner

    grant = {"name": "create_ticket", "description": "Create ticket", "kind": "internal", "is_durable_write": True, "is_idempotent": False}
    sdk = ScopedMemorySdk(grants=[grant])
    model = ScriptedModel(call(("read_skill", {"slug": "invoice-review"})), call(("skill_step", {"skill": "invoice-review", "step": 1, "status": "done"})), call(("create_ticket", {"subject": "Simulated", "body": "No live write."})), say("Simulated follow-up."))
    runner = TextRunner(sdk, model_factory=lambda effort, ref: model)
    result = await runner.test_skill(7, "invoice-review", "Invoice INV-7", expert="billing")
    assert not result["failed"] and result["expert"] == "billing"
    assert "read_skill" in result["steps"] and "create_ticket" in result["steps"]
    assert sdk.created_tickets == [] and sdk.actor is None
    assert "EXPERT_PRIVATE_INSTRUCTIONS" in json.dumps(model.requests)


async def test_private_skill_test_without_an_owner_is_rejected_before_running_a_model():
    from veyra_gateway.runner import TextRunner

    sdk = ScopedMemorySdk()
    model = ScriptedModel(say("Should not run"))
    runner = TextRunner(sdk, model_factory=lambda effort, ref: model)
    with pytest.raises(NotFound):
        await runner.test_skill(7, "invoice-review", "Read private instructions")
    assert model.requests == []


async def test_gate_reauthorizes_before_exposing_a_now_private_next_step():
    from veyra_harness.gating import SkillGate

    class Revocable:
        allowed = True
        reads = 0
        document = SkillDocument(slug="shared", name="Shared", description="Shared", version=1, execution_mode="gated", markdown="Shared framing", steps=[{"name": "First", "instruction": "First step."}, {"name": "Second", "instruction": "NOW_PRIVATE_SECOND_STEP"}])

        async def skill(self, slug):
            self.reads += 1
            if not self.allowed:
                raise NotFound("Skill unavailable", status=404)
            return self.document

    sdk = Revocable()
    state = RunState(sdk=sdk, context=TenantContext.model_validate(bundle()))
    gate = SkillGate()
    assert (await gate.read_skill_tool().handler({"slug": "shared"}, state)).ok
    sdk.allowed = False
    result = await gate.step_tool().handler({"skill": "shared", "step": 1, "status": "done"}, state)
    assert not result.ok and "NOW_PRIVATE_SECOND_STEP" not in result.output
    assert "shared" not in gate.open and sdk.reads == 2


async def test_version_changed_gate_requires_a_fresh_read_instead_of_old_steps():
    from veyra_harness.gating import SkillGate

    class Versioned:
        document = SkillDocument(slug="shared", name="Shared", description="Shared", version=1, execution_mode="gated", markdown="Framing", steps=[{"name": "First", "instruction": "Old first."}, {"name": "Second", "instruction": "STALE SECOND STEP"}])

        async def skill(self, slug):
            return self.document

    sdk = Versioned()
    state = RunState(sdk=sdk, context=TenantContext.model_validate(bundle()))
    gate = SkillGate()
    await gate.read_skill_tool().handler({"slug": "shared"}, state)
    sdk.document = sdk.document.model_copy(update={"version": 2})
    result = await gate.step_tool().handler({"skill": "shared", "step": 1, "status": "done"}, state)
    assert not result.ok and "STALE SECOND STEP" not in result.output
    assert "shared" not in gate.open


async def test_partial_failure_preserves_confirmed_write_evidence_and_truthful_progress():
    ctx = CallContext.model_validate(bundle())
    sdk = FakeSdk()
    model = ScriptedModel(call(("create_ticket", {"subject": "Recorded", "body": "Confirmed before model fault."})))
    worker = build(ctx, sdk, lambda effort, ref: model, "voice")
    outcome = await worker.delegate("Human: follow up")
    assert outcome.failed and outcome.completed_durable_write
    assert len(sdk.created_tickets) == 1
    assert "Nothing it was asked to do was completed" not in worker.progress_digest()
    assert "confirmed" in worker.progress_digest().lower()


async def test_core_audit_is_not_attributed_to_a_specialist_with_the_same_slug():
    ctx = TenantContext.model_validate(bundle(experts=[{**SPECIALIST, "slug": "core-worker"}]))
    sdk = ScopedMemorySdk()
    model = ScriptedModel(call(("create_ticket", {"subject": "Core action", "body": "Core only."})), say("Recorded."))
    worker = build(ctx, sdk, lambda effort, ref: model)
    await worker.delegate("Record follow-up")
    assert sdk.actors[0][0] is None
    assert worker.expert == "core-worker" and worker.runtime_role == "worker"


async def test_expert_model_choice_is_not_overridden_by_core_worker_environment_choice():
    ctx = TenantContext.model_validate(bundle(experts=[SPECIALIST]))
    sdk = ScopedMemorySdk()
    core = ScriptedModel(call(("delegate_expert", {"expert": "billing", "task": "Review."})), say("Reviewed."))
    expert = ScriptedModel(say("Reviewed invoice."))
    refs = []

    def factory(effort, ref):
        refs.append(ref)
        return expert if ref == "openai:billing" else core

    worker = build(ctx, sdk, factory, model_override="openai:core-env")
    await worker.delegate("Review")
    assert "openai:core-env" in refs and "openai:billing" in refs


async def test_specialist_model_initialization_does_not_block_the_conversation_thread():
    ctx = TenantContext.model_validate(bundle(experts=[SPECIALIST]))
    sdk = ScopedMemorySdk()
    core = ScriptedModel(call(("delegate_expert", {"expert": "billing", "task": "Review."})), say("Reviewed."))
    expert = ScriptedModel(say("Reviewed."))
    main_thread = threading.get_ident()
    setup_threads = []

    def factory(effort, ref):
        if ref == "openai:billing":
            setup_threads.append(threading.get_ident())
            return expert
        return core

    worker = build(ctx, sdk, factory)
    await worker.delegate("Review")
    assert setup_threads and setup_threads[0] != main_thread


async def test_unset_chat_taker_model_uses_taker_default_instead_of_worker_model():
    from veyra_harness.models import DEFAULT_TALKER

    data = bundle()
    data["core"]["taker"]["model"] = None
    ctx = TenantContext.model_validate(data)
    refs = []
    model = ScriptedModel(say("Hello."))

    def factory(effort, ref):
        refs.append(ref)
        return model

    worker = build(ctx, FakeSdk(), factory, "chat")
    await worker.delegate("Hello")
    assert refs == [DEFAULT_TALKER]


async def test_recreated_expert_identity_does_not_inherit_previous_private_history():
    ctx = TenantContext.model_validate(bundle(experts=[SPECIALIST]))
    sdk = ScopedMemorySdk()
    sdk.profiles["billing"]["id"] = 1
    core = ScriptedModel(call(("delegate_expert", {"expert": "billing", "task": "Review INV-7."})), say("Need reference."), call(("delegate_expert", {"expert": "billing", "task": "Review INV-8."})), say("Reviewed."))
    expert = ScriptedModel(call(("read_skill", {"slug": "invoice-review"})), call(("skill_step", {"skill": "invoice-review", "step": 1, "status": "waiting", "note": "Need reference"})), say("Need reference."), say("New specialist ready."))

    def factory(effort, ref):
        return expert if ref == "openai:billing" else core

    worker = build(ctx, sdk, factory)
    await worker.delegate("First invoice")
    previous = worker._children["billing"]
    assert "EXPERT_PRIVATE_INSTRUCTIONS" in json.dumps(previous.history)
    sdk.profiles["billing"]["id"] = 2
    outcome = await worker.delegate("New invoice")
    assert not outcome.failed and worker._children["billing"].last_error is None
    current = worker._children["billing"]
    assert current is not previous
    assert current._gate.open == {}
    assert "EXPERT_PRIVATE_INSTRUCTIONS" not in json.dumps(current.history)
