from __future__ import annotations

import json

import httpx
import pytest

from app_sdk.models import ToolSpec
from veyra_harness import actions
from veyra_harness.models import DEFAULT_TALKER, DEFAULT_WORKER, capabilities, resolve, resolve_or_default


def test_a_reference_resolves_to_its_providers_url_and_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_x")
    m = resolve("groq:openai/gpt-oss-120b", default=DEFAULT_WORKER)
    assert m.provider == "groq" and m.model == "openai/gpt-oss-120b" and m.base_url.startswith("https://api.groq.com") and m.api_key == "gsk_x"


def test_a_provider_without_a_key_is_refused_not_swapped(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-x")
    with pytest.raises(LookupError, match="xAI has no API key"):
        resolve("xai:grok-4", default=DEFAULT_WORKER)
    # The lenient variant degrades to the default, which does have a key.
    assert resolve_or_default("xai:grok-4", default=DEFAULT_WORKER).ref == DEFAULT_WORKER


def test_the_generic_llm_key_counts_only_for_the_provider_its_base_url_names(monkeypatch: pytest.MonkeyPatch):
    from veyra_harness.models import PROVIDERS

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("LLM_API_KEY", "gsk_generic")
    monkeypatch.setenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    assert PROVIDERS["groq"].key == "gsk_generic"
    monkeypatch.setenv("LLM_BASE_URL", "https://api.openai.com/v1")
    assert PROVIDERS["groq"].key is None, "an OpenAI-pointed generic key must not be offered to Groq"


def test_custom_uses_the_generic_llm_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://vllm:8000/v1")
    monkeypatch.setenv("LLM_API_KEY", "local")
    m = resolve("custom:my-model", default=DEFAULT_TALKER)
    assert m.base_url == "http://vllm:8000/v1" and m.model == "my-model"


async def test_capabilities_report_keys_not_values(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    caps = await capabilities(check=False)
    by_id = {p["id"]: p for p in caps["providers"]}
    assert by_id["openai"]["configured"] is True and by_id["groq"]["configured"] is False
    assert "sk-secret" not in json.dumps(caps)
    assert caps["defaults"] == {"talker": DEFAULT_TALKER, "worker": DEFAULT_WORKER}


async def test_a_rejected_key_is_reported_as_not_configured(monkeypatch: pytest.MonkeyPatch):
    import httpx

    from veyra_harness import models

    monkeypatch.setenv("XAI_API_KEY", "dead")
    monkeypatch.setattr(models, "_verified", {})

    class Fake(httpx.AsyncClient):
        def __init__(self, *a, **k):
            super().__init__(transport=httpx.MockTransport(lambda r: httpx.Response(403 if "x.ai" in str(r.url) else 200, json={"data": []})), timeout=1)

    monkeypatch.setattr(httpx, "AsyncClient", Fake)
    ok, error = await models.verify(models.PROVIDERS["xai"])
    assert ok is False and "rejected" in error
    caps = await models.capabilities()
    xai = next(p for p in caps["providers"] if p["id"] == "xai")
    assert xai["key_present"] is True and xai["configured"] is False and "rejected" in xai["error"]


async def test_a_composio_tool_posts_to_execute_with_the_connected_account(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("COMPOSIO_API_KEY", "ak_test")
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"successful": True, "data": {"id": "evt_1", "htmlLink": "https://cal"}})

    monkeypatch.setattr(actions, "_composio_transport", httpx.MockTransport(handler))
    spec = ToolSpec(name="googlecalendar_create_event", description="d", kind="composio", is_durable_write=True, config={"toolkit": "googlecalendar", "tool_slug": "GOOGLECALENDAR_CREATE_EVENT", "connected_account_id": "ca_1", "user_id": "org-7"})
    result = await actions.composio_handler(spec)({"summary": "Repair", "_idempotency_key": "k"}, state=None)

    assert result.ok and result.data["id"] == "evt_1"
    assert seen["url"].endswith("/tools/execute/GOOGLECALENDAR_CREATE_EVENT")
    assert seen["headers"]["x-api-key"] == "ak_test"
    assert seen["body"] == {"connected_account_id": "ca_1", "user_id": "org-7", "arguments": {"summary": "Repair"}}


async def test_a_composio_tool_without_an_account_or_key_fails_honestly(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("COMPOSIO_API_KEY", raising=False)
    spec = ToolSpec(name="x", description="d", kind="composio", config={"tool_slug": "X"})
    result = await actions.composio_handler(spec)({}, state=None)
    assert not result.ok and "COMPOSIO_API_KEY" in result.output

    monkeypatch.setenv("COMPOSIO_API_KEY", "ak")
    result = await actions.composio_handler(spec)({}, state=None)
    assert not result.ok and "connected account" in result.output


async def test_a_composio_failure_is_reported_with_its_reason(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("COMPOSIO_API_KEY", "ak")
    monkeypatch.setattr(actions, "_composio_transport", httpx.MockTransport(lambda r: httpx.Response(200, json={"successful": False, "error": "Calendar not found"})))
    spec = ToolSpec(name="x", description="d", kind="composio", config={"tool_slug": "X", "connected_account_id": "ca"})
    result = await actions.composio_handler(spec)({}, state=None)
    assert not result.ok and "Calendar not found" in result.output
