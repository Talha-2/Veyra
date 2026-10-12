from app_sdk.models import ExpertRecord, TenantContext
from veyra_harness.actions import tools_for_expert
from .fakes import CALL_CONTEXT

def context(enabled):
    return TenantContext.model_validate({**CALL_CONTEXT, "healthcare_enabled": enabled})

def test_scheduling_builtins_are_only_automatically_added_for_healthcare_workspaces():
    expert = ExpertRecord(slug="worker", name="Worker", description="Operations", runtime="worker", tools=[])
    assert "book_appointment" not in {t.name for t in tools_for_expert(expert, context(False))}
    assert "book_appointment" in {t.name for t in tools_for_expert(expert, context(True))}

def test_scheduling_builtins_honor_explicitly_disabled_actions():
    ctx = context(True)
    ctx.disabled_actions = ["book_appointment"]
    assert "book_appointment" not in {t.name for t in tools_for_expert(ExpertRecord(slug="worker", name="Worker", description="Operations", runtime="worker", tools=[]), ctx)}


def test_auto_scheduling_tools_inherit_the_organizations_approval_policy():
    ctx = context(True)
    ctx.scheduling_actions = [{"name": "book_appointment", "id": 71, "requires_approval": True}]
    tool = next(t for t in tools_for_expert(ExpertRecord(slug="worker", name="Worker", description="Operations", runtime="worker", tools=[]), ctx) if t.name == "book_appointment")
    assert tool.requires_approval and tool.action_id == 71


async def test_no_expert_fallback_honors_disabled_scheduling_actions():
    from veyra_harness.assembly import build_worker
    from veyra_harness.state import RunState
    from .fakes import FakeSdk, ScriptedModel, say
    ctx = context(False)
    ctx.experts = []
    ctx.disabled_actions = ["book_appointment", "cancel_appointment"]
    sdk = FakeSdk()
    model = ScriptedModel(say("Hello"))
    worker = build_worker(surface="chat", context=ctx, sdk=sdk, state=RunState(sdk=sdk, context=ctx), model_factory=lambda *args: model)
    await worker.delegate("Hello")
    assert "book_appointment" not in {tool["function"]["name"] for tool in model.requests[0][1]}
