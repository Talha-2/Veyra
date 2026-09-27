"""The Ask stream: tokens and tool steps arrive as server-sent events, in order."""

from __future__ import annotations

import json

import pytest
from httpx import ASGITransport, AsyncClient

from veyra_gateway.app import create_app
from veyra_gateway.runner import TextRunner
from veyra_harness.llm import Completion, ToolCall
from veyra_harness.tests.fakes import ScriptedModel, call, say

from .test_gateway import SECRET, GatewayFakeSdk


class StreamingModel(ScriptedModel):
    """A scripted model that streams its text a word at a time."""

    async def complete_stream(self, messages, tools, on_delta) -> Completion:
        completion = await self.complete(messages, tools)
        for word in completion.text.split():
            await on_delta(word + " ")
        return completion


def parse(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]


async def post_stream(app, payload: dict) -> list[dict]:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://gw", headers={"Authorization": f"Bearer {SECRET}"}) as client:
            response = await client.post("/v1/threads/stream", json=payload)
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            return parse(response.text)


async def test_a_turn_streams_status_then_tool_steps_then_tokens_then_done(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGENT_SHARED_SECRET", SECRET)
    sdk = GatewayFakeSdk()
    model = StreamingModel(call(("search_knowledge", {"query": "evanston"})), say("Yes, Evanston is inside the service area."))
    app = create_app(sdk=sdk, runner=TextRunner(sdk, model_factory=lambda r, ref=None: model), claim_interval=0)

    events = await post_stream(app, {"organization_id": 7, "thread_id": 5, "message": "Do we serve Evanston?"})
    kinds = [e["type"] for e in events]

    assert kinds[0] == "status"
    tool_events = [e for e in events if e["type"] == "tool"]
    assert [e["status"] for e in tool_events] == ["running", "done"]
    assert tool_events[0]["label"] == "Searching knowledge" and tool_events[0]["detail"] == "evanston"
    assert tool_events[1]["label"] == "Searched knowledge" and "Evanston" in tool_events[1]["summary"]
    assert kinds.index("tool") < kinds.index("delta"), "the step shows before the answer streams"
    assert "".join(e["text"] for e in events if e["type"] == "delta").strip() == "Yes, Evanston is inside the service area."
    assert events[-1] == {"type": "done", "content": "Yes, Evanston is inside the service area.", "tokens": 30, "model": "scripted"}


async def test_history_seeds_a_fresh_worker_so_a_restarted_gateway_continues_the_thread(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGENT_SHARED_SECRET", SECRET)
    sdk = GatewayFakeSdk()
    model = StreamingModel(say("It was $89."))
    app = create_app(sdk=sdk, runner=TextRunner(sdk, model_factory=lambda r, ref=None: model), claim_interval=0)

    await post_stream(app, {"organization_id": 7, "thread_id": 9, "message": "And the fee?", "history": [
        {"role": "user", "content": "What is the diagnostic visit?"},
        {"role": "assistant", "content": "A technician inspects the system."},
    ]})
    sent = model.requests[0][0]
    assert [m["role"] for m in sent] == ["system", "user", "assistant", "user"]
    assert sent[-1]["content"] == "And the fee?"


async def test_a_model_failure_ends_the_stream_with_an_error_event(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGENT_SHARED_SECRET", SECRET)

    class Broken:
        name = "broken"

        async def complete(self, messages, tools):
            raise RuntimeError("provider 500")

    sdk = GatewayFakeSdk()
    app = create_app(sdk=sdk, runner=TextRunner(sdk, model_factory=lambda r, ref=None: Broken()), claim_interval=0)
    events = await post_stream(app, {"organization_id": 7, "thread_id": 1, "message": "hi"})
    assert events[-1]["type"] == "error" and "provider 500" in events[-1]["message"]


async def test_the_openai_client_assembles_streamed_tool_call_fragments():
    from types import SimpleNamespace as NS

    from veyra_harness.llm import OpenAIChatModel

    def chunk(content=None, tool=None, usage=None):
        delta = NS(content=content, tool_calls=[tool] if tool else None)
        return NS(choices=[NS(delta=delta)] if (content or tool) else [], usage=usage)

    chunks = [
        chunk(content="Let me "), chunk(content="check."),
        chunk(tool=NS(index=0, id="c1", function=NS(name="search_", arguments='{"que'))),
        chunk(tool=NS(index=0, id=None, function=NS(name="knowledge", arguments='ry": "fees"}'))),
        chunk(usage=NS(prompt_tokens=12, completion_tokens=7)),
    ]

    async def fake_stream():
        for c in chunks:
            yield c

    model = OpenAIChatModel("gpt-test", base_url="http://x", api_key="k")

    async def fake_create(kwargs):
        assert kwargs["stream"] is True
        return fake_stream()

    model._create = fake_create  # type: ignore[method-assign]
    deltas: list[str] = []

    async def on_delta(t):
        deltas.append(t)

    completion = await model.complete_stream([{"role": "user", "content": "x"}], [], on_delta)
    assert deltas == ["Let me ", "check."]
    assert completion.text == "Let me check."
    assert completion.tool_calls == [ToolCall(id="c1", name="search_knowledge", arguments={"query": "fees"})]
    assert completion.tokens == 19
