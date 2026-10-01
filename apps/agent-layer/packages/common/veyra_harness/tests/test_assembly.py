"""One builder for every surface: expert routing, step-gated skills, reasoning effort."""

from __future__ import annotations

from typing import Any

import pytest

from app_sdk.models import AutomationSpec, SkillDocument, TenantContext
from veyra_harness.assembly import build_worker, roster, talker_model_ref
from veyra_harness.llm import reasoning_effort
from veyra_harness.state import RunState

from .fakes import CALL_CONTEXT, FakeSdk, ScriptedModel, call, call_context, say

BILLING = {
    "slug": "billing", "name": "Billing", "description": "Invoices, refunds and failed payments.", "runtime": "worker",
    "system_prompt": "You handle money.", "model": "groq:openai/gpt-oss-120b", "reasoning_effort": "high",
    "skills": [{"slug": "take-payment", "name": "Take a payment", "description": "Card payments over the phone.", "execution_mode": "gated"}],
    "tools": [{"id": 9, "name": "issue_refund", "description": "Refund an invoice.", "kind": "http", "is_durable_write": True, "config": {"url": "https://pay.example/refund"}}],
}

GATED = {
    "take-payment": {
        "markdown": "---\nname: Take a payment\nexecution: gated\n---\n\nNever read a card number back.",
        "steps": [
            {"name": "Verify identity", "instruction": "Confirm the name and the invoice number."},
            {"name": "Take the card", "instruction": "Ask for the card number, expiry and CVC."},
            {"name": "Confirm", "instruction": "Read back the amount and the last four digits."},
        ],
    },
}


class GatedSdk(FakeSdk):
    async def skill(self, slug: str, *, version: int | None = None) -> SkillDocument:
        self.calls.append(f"skill:{slug}")
        if slug in GATED:
            g = GATED[slug]
            return SkillDocument(slug=slug, name="Take a payment", description="d", version=1, execution_mode="gated", steps=g["steps"], markdown=g["markdown"])
        return await super().skill(slug, version=version)


def tenant(*experts: dict[str, Any], **agent: Any) -> TenantContext:
    data = {k: v for k, v in CALL_CONTEXT.items() if k not in ("call", "line", "caller")}
    data["experts"] = [CALL_CONTEXT["experts"][0], CALL_CONTEXT["experts"][1], *experts]
    if agent:
        data["agent"] = {**data["agent"], **agent}
    return TenantContext.model_validate(data)


class Factory:
    """Records what each model was built with; every model is the same script."""

    def __init__(self, model: ScriptedModel):
        self.model = model
        self.built: list[tuple[str | None, str | None]] = []

    def __call__(self, effort: str | None, ref: str | None) -> ScriptedModel:
        self.built.append((effort, ref))
        return self.model


def chat_worker(model: ScriptedModel, ctx: TenantContext, sdk: FakeSdk | None = None, surface: str = "chat"):
    sdk = sdk or GatedSdk()
    factory = Factory(model)
    worker = build_worker(surface=surface, context=ctx, sdk=sdk, state=RunState(sdk=sdk, context=ctx), model_factory=factory)  # type: ignore[arg-type]
    return worker, sdk, factory


# ── routing ──────────────────────────────────────────────────────────────


async def test_the_primary_worker_expert_starts_and_the_others_are_offered_with_their_descriptions():
    model = ScriptedModel(say("Hello."))
    worker, _, _ = chat_worker(model, tenant(BILLING))
    await worker.delegate("Hi")

    system, tools = model.requests[0][0][0]["content"], [t["function"]["name"] for t in model.requests[0][1]]
    assert worker.expert == "scheduling", "the first enabled worker is the default"
    assert "You schedule." in system and "You handle money." not in system
    assert "- billing: Billing. Invoices, refunds and failed payments." in system and "switch_expert" in system
    assert "switch_expert" in tools and "book_appointment" in tools and "issue_refund" not in tools


async def test_switching_expert_swaps_prompt_tools_model_and_audit_scope_and_events_name_the_expert():
    model = ScriptedModel(
        call(("switch_expert", {"expert": "billing", "reason": "refund"})),
        call(("issue_refund", {"invoice": "INV-7"})),
        say("Refund requested."),
    )
    events: list[dict[str, Any]] = []

    async def emit(e: dict[str, Any]) -> None:
        events.append(e)

    worker, sdk, factory = chat_worker(model, tenant(BILLING))

    async def fake_refund(args, state):  # no network in tests
        from veyra_harness.tools import ToolResult
        return ToolResult.success({"refunded": True})

    worker._personas["billing"].tools[[t.name for t in worker._personas["billing"].tools].index("issue_refund")].handler = fake_refund
    worker.claim()
    outcome = await worker.delegate("I was double charged, refund me", emit=emit)

    assert outcome.reply == "Refund requested." and worker.expert == "billing"
    after_switch = model.requests[1]
    assert "You handle money." in after_switch[0][0]["content"], "the system prompt is the new expert's"
    names = [t["function"]["name"] for t in after_switch[1]]
    assert "issue_refund" in names and "book_appointment" not in names
    assert ("high", "groq:openai/gpt-oss-120b") in factory.built, "the expert's own model and effort"
    refund_row = next(t for t in sdk.tool_calls if t["action_slug"] == "issue_refund")
    assert refund_row is not None
    tool_events = [e for e in events if e["type"] == "tool"]
    switch_done = next(e for e in tool_events if e["name"] == "switch_expert" and e["status"] == "done")
    assert switch_done["label"] == "Handed to Billing" and switch_done["expert"] == "billing"
    refund_done = next(e for e in tool_events if e["name"] == "issue_refund" and e["status"] == "done")
    assert refund_done["expert"] == "billing" and refund_done["expert_name"] == "Billing"


async def test_tool_rows_are_recorded_under_the_expert_that_ran_them():
    recorded: list[str | None] = []

    class Sdk(GatedSdk):
        async def start_tool_call(self, **kw: Any):
            recorded.append(kw.get("expert_slug"))
            return await super().start_tool_call(**kw)

    model = ScriptedModel(call(("search_knowledge", {"query": "x"})), call(("switch_expert", {"expert": "billing"})), call(("search_knowledge", {"query": "y"})), say("ok"))
    worker, _, _ = chat_worker(model, tenant(BILLING), sdk=Sdk())
    worker.claim()
    await worker.delegate("q")
    assert recorded == ["scheduling", "billing"]


async def test_one_expert_means_no_switch_tool_and_no_expert_fields():
    model = ScriptedModel(call(("search_knowledge", {"query": "evanston"})), say("Yes."))
    events: list[dict[str, Any]] = []

    async def emit(e: dict[str, Any]) -> None:
        events.append(e)

    worker, _, _ = chat_worker(model, tenant())
    worker.claim()
    await worker.delegate("Do you serve Evanston?", emit=emit)
    assert "switch_expert" not in [t["function"]["name"] for t in model.requests[0][1]]
    assert all("expert" not in e for e in events if e["type"] == "tool")
    assert "Other specialists" not in model.requests[0][0][0]["content"]


async def test_switching_to_an_unknown_expert_fails_without_changing_anything():
    model = ScriptedModel(call(("switch_expert", {"expert": "nobody"})), say("ok"))
    worker, _, _ = chat_worker(model, tenant(BILLING))
    worker.claim()
    await worker.delegate("q")
    assert worker.expert == "scheduling"
    assert "No specialist 'nobody'" in model.requests[1][0][-1]["content"]


def test_ask_routes_among_text_experts_when_there_are_any_and_the_workers_otherwise():
    assistant = {"slug": "assistant", "name": "Assistant", "description": "Answers the team.", "runtime": "text"}
    assert [e.slug for e in roster(tenant(assistant), "ask")] == ["assistant"]
    assert [e.slug for e in roster(tenant(BILLING), "ask")] == ["scheduling", "billing"]
    assert [e.slug for e in roster(tenant(assistant, BILLING), "chat")] == ["scheduling", "billing"]
    assert roster(tenant(), "automation") == []


async def test_a_skill_test_starts_as_the_expert_that_holds_the_skill():
    model = ScriptedModel(say("ok"))
    ctx = tenant(BILLING)
    sdk = GatedSdk()
    worker = build_worker(surface="skill_test", context=ctx, sdk=sdk, state=RunState(sdk=sdk, context=ctx, dry_run=True), model_factory=Factory(model), skill_slug="take-payment", dry_run=True)
    assert worker.expert == "billing"
    assert "dry run of the skill 'take-payment'" in worker.history[0]["content"]


def test_the_talker_experts_model_beats_identity_and_falls_back_to_it():
    data = {k: v for k, v in CALL_CONTEXT.items() if k not in ("call", "line", "caller")}
    data["agent"] = {**data["agent"], "advanced": {"talker_model": "openai:gpt-4.1-nano"}}
    ctx = TenantContext.model_validate(data)
    assert talker_model_ref(ctx) == "openai:gpt-4.1-nano"
    data["experts"] = [{**data["experts"][0], "model": "groq:openai/gpt-oss-20b"}, data["experts"][1]]
    assert talker_model_ref(TenantContext.model_validate(data)) == "groq:openai/gpt-oss-20b"


# ── step-gated skills ────────────────────────────────────────────────────


async def test_a_gated_skill_opens_as_a_checklist_with_only_the_current_step_spelled_out():
    model = ScriptedModel(call(("read_skill", {"slug": "take-payment"})), say("x"))
    worker, _, _ = chat_worker(model, tenant(BILLING))
    worker.claim()
    await worker.delegate("pay my invoice")
    opened = model.requests[1][0][-1]["content"]
    assert "Never read a card number back." in opened
    assert "1. Verify identity (current)" in opened and "2. Take the card" in opened
    assert "Confirm the name and the invoice number." in opened
    assert "Ask for the card number" not in opened, "later steps' instructions are not handed over early"


async def test_the_reply_is_refused_until_every_step_is_done_in_order():
    model = ScriptedModel(
        call(("read_skill", {"slug": "take-payment"})),
        say("Payment taken."),  # refused: step 1 open
        call(("skill_step", {"skill": "take-payment", "step": 2, "status": "done"})),  # refused: out of order
        call(("skill_step", {"skill": "take-payment", "step": 1, "status": "done", "note": "Name matches INV-7"})),
        call(("skill_step", {"skill": "take-payment", "step": 2, "status": "done"})),
        call(("skill_step", {"skill": "take-payment", "step": 3, "status": "done"})),
        say("Paid $120 on the card ending 4242."),
    )
    worker, _, _ = chat_worker(model, tenant(BILLING))
    worker.claim()
    outcome = await worker.delegate("pay my invoice")

    assert outcome.reply == "Paid $120 on the card ending 4242."
    msgs = [m.get("content") or "" for m in worker.history if m["role"] in ("user", "tool")]
    assert any(m.startswith("Not yet. The step-gated skill 'Take a payment'") for m in msgs)
    assert any("Step 1 (Verify identity) is not done yet" in m for m in msgs)
    assert any("Now step 2 of 3: Take the card" in m and "Ask for the card number" in m for m in msgs)
    assert any("All 3 steps of 'Take a payment' are done" in m for m in msgs)


async def test_waiting_on_the_customer_lets_the_reply_through_and_keeps_the_step_open_for_the_next_turn():
    model = ScriptedModel(
        call(("read_skill", {"slug": "take-payment"})),
        call(("skill_step", {"skill": "take-payment", "step": 1, "status": "waiting", "note": "the invoice number"})),
        say("What is your invoice number?"),
        say("Done!"),  # next turn, step still open: refused
        call(("skill_step", {"skill": "take-payment", "step": 1, "status": "done"})),
        call(("skill_step", {"skill": "take-payment", "step": 2, "status": "abandon", "note": "customer will pay online"})),
        say("You can pay online instead."),
    )
    worker, _, _ = chat_worker(model, tenant(BILLING))
    worker.claim()
    first = await worker.delegate("pay my invoice")
    assert first.reply == "What is your invoice number?"
    worker.claim()
    second = await worker.delegate("INV-7")
    assert second.reply == "You can pay online instead."
    assert any((m.get("content") or "").startswith("Not yet.") for m in worker.history if m["role"] == "user")


async def test_a_gate_that_is_ignored_lets_the_reply_through_after_three_refusals():
    model = ScriptedModel(call(("read_skill", {"slug": "take-payment"})), say("a"), say("b"), say("c"), say("d"))
    worker, _, _ = chat_worker(model, tenant(BILLING))
    worker.claim()
    outcome = await worker.delegate("pay")
    assert outcome.reply == "d"


async def test_a_held_reply_is_not_streamed_before_the_gate_accepts_it():
    class Streaming(ScriptedModel):
        async def complete_stream(self, messages, tools, on_delta):
            completion = await self.complete(messages, tools)
            if completion.text:
                await on_delta(completion.text)
            return completion

    model = Streaming(call(("read_skill", {"slug": "take-payment"})), say("Premature."), call(("skill_step", {"skill": "take-payment", "step": 1, "status": "abandon", "note": "n/a"})), say("Final."))
    deltas: list[str] = []

    async def emit(e: dict[str, Any]) -> None:
        if e["type"] == "delta":
            deltas.append(e["text"])

    worker, _, _ = chat_worker(model, tenant(BILLING))
    worker.claim()
    await worker.delegate("pay", emit=emit)
    assert deltas == ["Final."]


async def test_prose_skills_read_exactly_as_before():
    model = ScriptedModel(call(("read_skill", {"slug": "reschedule"})), say("Two windows offered."))
    worker, _, _ = chat_worker(model, tenant())
    worker.claim()
    outcome = await worker.delegate("move my visit")
    assert outcome.reply == "Two windows offered."
    assert model.requests[1][0][-1]["content"] == "---\nname: Reschedule\n---\n\nAsk for the booking reference, then offer two windows."


async def test_a_worker_built_by_hand_like_the_voice_host_still_holds_gated_skills_to_their_steps():
    from veyra_harness.actions import tools_for_expert
    from veyra_harness.executor import ActionExecutor, ExecutionScope
    from veyra_harness.state import CallState
    from veyra_harness.worker import Worker

    sdk = GatedSdk()
    ctx = call_context()
    model = ScriptedModel(call(("read_skill", {"slug": "take-payment"})), say("Paid."), call(("skill_step", {"skill": "take-payment", "step": 1, "status": "waiting", "note": "invoice number"})), say("Need the invoice number."))
    worker = Worker(model=model, instructions="w", tools=tools_for_expert(ctx.workers[0], ctx), executor=ActionExecutor(sdk, scope=ExecutionScope(call_id=42)), state=CallState(sdk=sdk, context=ctx))
    assert "skill_step" in [t["function"]["name"] for t in worker._schemas]
    worker.claim()
    outcome = await worker.delegate("Human: I want to pay")
    assert outcome.reply == "Need the invoice number."


async def test_the_post_call_pass_is_not_gated():
    from veyra_harness.executor import ActionExecutor, ExecutionScope
    from veyra_harness.gating import SkillGate
    from veyra_harness.state import CallState
    from veyra_harness.worker import Worker

    sdk = GatedSdk()
    ctx = call_context()
    gate = SkillGate()
    model = ScriptedModel(call(("read_skill", {"slug": "take-payment"})), say("Asked for the invoice."), say("a"), say("b"), say("c"), say("Nothing to record."))
    worker = Worker(model=model, instructions="w", tools=gate.tools(), executor=ActionExecutor(sdk, scope=ExecutionScope(call_id=42)), state=CallState(sdk=sdk, context=ctx), gate=gate)
    worker.claim()
    await worker.delegate("Human: pay")
    result = await worker.finalize("", "Record what is unfinished.")
    assert result.reply == "Nothing to record."


# ── reasoning effort ─────────────────────────────────────────────────────


def test_both_studio_vocabularies_map_to_the_providers_reasoning_effort():
    assert [reasoning_effort(v) for v in ("low", "medium", "high", "fast", "balanced", "deep", "High")] == ["low", "medium", "high", "low", "medium", "high", "high"]
    assert reasoning_effort(None) is None and reasoning_effort("") is None and reasoning_effort("default") is None


@pytest.mark.parametrize("surface", ["chat", "ask", "skill_test"])
async def test_every_text_surface_passes_the_experts_reasoning_effort_to_the_model(surface: str):
    worker_expert = {**CALL_CONTEXT["experts"][1], "reasoning_effort": "low"}
    data = {k: v for k, v in CALL_CONTEXT.items() if k not in ("call", "line", "caller")}
    data["experts"] = [CALL_CONTEXT["experts"][0], worker_expert]
    ctx = TenantContext.model_validate(data)
    factory = Factory(ScriptedModel())
    sdk = GatedSdk()
    build_worker(surface=surface, context=ctx, sdk=sdk, state=RunState(sdk=sdk, context=ctx), model_factory=factory, skill_slug="reschedule")  # type: ignore[arg-type]
    assert factory.built == [("low", None)]


async def test_an_automation_uses_its_own_reasoning_setting_and_allowed_tools_only():
    ctx = tenant()
    factory = Factory(ScriptedModel())
    sdk = GatedSdk()
    spec = AutomationSpec(id=5, name="Digest", goal="Summarise.", reasoning="deep", tools=[{"id": 2, "name": "find_contact", "description": "Find.", "kind": "internal"}])
    worker = build_worker(surface="automation", context=ctx, sdk=sdk, state=RunState(sdk=sdk, context=ctx), model_factory=factory, automation=spec)  # type: ignore[arg-type]
    assert factory.built == [("high", None)]
    assert sorted(worker._tools) == ["find_contact", "read_skill", "skill_step"]
    assert worker.expert == "automation:5"


def test_default_model_passes_an_experts_effort_through(monkeypatch: pytest.MonkeyPatch):
    from veyra_gateway.runner import default_model

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert default_model("high", "openai:gpt-4.1").reasoning_effort == "high"
    assert default_model("deep", None).reasoning_effort == "high"
    assert default_model(None, None).reasoning_effort is None


async def test_a_model_that_refuses_reasoning_effort_does_not_switch_it_off_for_other_models(monkeypatch: pytest.MonkeyPatch):
    import httpx
    from openai import BadRequestError

    from veyra_harness.llm import OpenAIChatModel

    monkeypatch.setattr(OpenAIChatModel, "_unsupported", {})
    sent: dict[str, list[dict[str, Any]]] = {"old": [], "new": []}

    class Completions:
        def __init__(self, label: str, refuses: bool):
            self.label, self.refuses = label, refuses

        async def create(self, **kwargs: Any):
            sent[self.label].append(kwargs)
            if self.refuses and "reasoning_effort" in kwargs:
                raise BadRequestError("Unsupported parameter: 'reasoning_effort'", response=httpx.Response(400, request=httpx.Request("POST", "http://x")), body=None)
            from types import SimpleNamespace as NS
            return NS(choices=[NS(message=NS(content="ok", tool_calls=None))], usage=None)

    def model(label: str, name: str, refuses: bool) -> OpenAIChatModel:
        m = OpenAIChatModel(name, base_url="https://api.openai.com/v1", api_key="k", reasoning_effort="high")
        from types import SimpleNamespace as NS
        m._client = NS(chat=NS(completions=Completions(label, refuses)))  # type: ignore[assignment]
        return m

    await model("old", "gpt-4o-mini", True).complete([{"role": "user", "content": "hi"}], [])
    await model("new", "gpt-oss-120b", False).complete([{"role": "user", "content": "hi"}], [])
    assert "reasoning_effort" not in sent["old"][-1]
    assert sent["new"][0]["reasoning_effort"] == "high"

