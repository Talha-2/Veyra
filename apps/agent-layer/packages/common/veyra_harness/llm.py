"""One chat-model seam.

The worker and the text runner talk to a model through ``ChatModel`` and
nothing else. The OpenAI-compatible implementation covers xAI, Groq, OpenAI,
Gemini's OpenAI endpoint and a local vLLM — every provider this product has
run on — and a scripted implementation covers the tests.

History is a plain list of OpenAI-shaped message dicts. Deliberately not a
framework's chat context: the worker's private history must survive a call
and be reasoned about in tests without a LiveKit session.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]

    @property
    def raw_arguments(self) -> str:
        return json.dumps(self.arguments, ensure_ascii=False)


@dataclass(slots=True)
class Completion:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    # Provider usage, when reported. Summed into the delegation's token count.
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class ChatModel(Protocol):
    """A model that can be asked for the next turn."""

    name: str

    async def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> Completion: ...


def tool_call_message(text: str, calls: list[ToolCall]) -> dict[str, Any]:
    """The assistant message that carries tool calls, in OpenAI shape."""
    message: dict[str, Any] = {"role": "assistant", "content": text or None}
    if calls:
        message["tool_calls"] = [
            {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.raw_arguments}}
            for c in calls
        ]
    return message


def tool_result_message(call: ToolCall, output: str) -> dict[str, Any]:
    return {"role": "tool", "tool_call_id": call.id, "name": call.name, "content": output}


class OpenAIChatModel:
    """Any OpenAI-compatible chat endpoint.

    Reads the same environment the retired ``apps/agent`` did, so a working
    ``.env`` keeps working: ``LLM_BASE_URL`` / ``LLM_API_KEY`` / ``LLM_MODEL``
    take precedence, else xAI via ``XAI_API_KEY``.
    """

    def __init__(
        self,
        model: str | None = None,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        temperature: float = 0.3,
        max_tokens: int | None = None,
        reasoning_effort: str | None = None,
        timeout: float = 60.0,
    ):
        from openai import AsyncOpenAI  # imported here so tests without the package still import the module

        if model and ":" in model and not base_url:
            # A Studio-style reference: provider decides URL and key.
            from .models import DEFAULT_WORKER, resolve_or_default

            resolved = resolve_or_default(model, default=DEFAULT_WORKER)
            model, base_url, api_key = resolved.model, resolved.base_url, resolved.api_key
        self.base_url = base_url or os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1"
        self.name = model or os.getenv("LLM_MODEL") or "gpt-4.1-mini"
        key = api_key or os.getenv("LLM_API_KEY") or _key_for(self.base_url) or ""
        self._client = AsyncOpenAI(base_url=self.base_url, api_key=key, timeout=timeout)
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._reasoning_effort = reasoning_effort

    @classmethod
    def from_ref(cls, ref: str | None, *, default: str, **kwargs) -> "OpenAIChatModel":
        from .models import resolve_or_default

        resolved = resolve_or_default(ref, default=default)
        return cls(resolved.model, base_url=resolved.base_url, api_key=resolved.api_key, **kwargs)

    def _kwargs(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": self.name, "messages": messages, "temperature": self._temperature}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if self._max_tokens:
            kwargs["max_tokens"] = self._max_tokens
        if self._reasoning_effort:
            kwargs["reasoning_effort"] = self._reasoning_effort
        return kwargs

    async def complete_stream(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], on_delta) -> Completion:
        """Stream a turn: text deltas go to ``on_delta`` as they arrive; tool calls are assembled from their fragments.

        Tool-call arguments arrive in pieces keyed by ``index``; the id and
        name come on the first piece. The assembled result is the same
        ``Completion`` ``complete`` returns, so the loop does not care which
        path produced it.
        """
        kwargs = self._kwargs(messages, tools)
        kwargs["stream"] = True
        kwargs["stream_options"] = {"include_usage": True}
        stream = await self._create(kwargs)

        text: list[str] = []
        pending: dict[int, dict[str, str]] = {}
        prompt_tokens = completion_tokens = 0
        async for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage is not None:
                prompt_tokens = getattr(usage, "prompt_tokens", 0) or prompt_tokens
                completion_tokens = getattr(usage, "completion_tokens", 0) or completion_tokens
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if getattr(delta, "content", None):
                text.append(delta.content)
                await on_delta(delta.content)
            for tc in getattr(delta, "tool_calls", None) or []:
                slot = pending.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                if tc.id:
                    slot["id"] = tc.id
                if tc.function and tc.function.name:
                    slot["name"] += tc.function.name
                if tc.function and tc.function.arguments:
                    slot["arguments"] += tc.function.arguments

        calls: list[ToolCall] = []
        for index in sorted(pending):
            slot = pending[index]
            try:
                args = json.loads(slot["arguments"] or "{}")
            except ValueError:
                args = {"_raw": slot["arguments"]}
            calls.append(ToolCall(id=slot["id"] or f"call_{index}", name=slot["name"], arguments=args if isinstance(args, dict) else {"_raw": args}))
        return Completion(text="".join(text).strip(), tool_calls=calls, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens)

    async def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> Completion:
        response = await self._create(self._kwargs(messages, tools))
        choice = response.choices[0]
        calls: list[ToolCall] = []
        for tc in choice.message.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except ValueError:
                args = {"_raw": tc.function.arguments}
            calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args if isinstance(args, dict) else {"_raw": args}))
        usage = response.usage
        return Completion(
            text=(choice.message.content or "").strip(),
            tool_calls=calls,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
        )


    # Parameters "OpenAI-compatible" providers disagree on. Each is dropped or
    # renamed once, on the 400 that names it, and remembered for the rest of
    # the process: an automation set to "balanced" reasoning must still run on
    # a model that has no reasoning knob (the first live run died on exactly
    # this — gpt-4o-mini refusing `reasoning_effort`).
    _unsupported: set[str] = set()

    async def _create(self, kwargs: dict[str, Any]) -> Any:
        from openai import BadRequestError

        for key in list(kwargs):
            if key in self._unsupported:
                kwargs.pop(key)
        for _ in range(4):
            try:
                return await self._client.chat.completions.create(**kwargs)
            except BadRequestError as e:
                message = str(e)
                if "max_tokens" in message and "max_completion_tokens" in message and "max_tokens" in kwargs:
                    kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
                    continue
                dropped = next((k for k in ("reasoning_effort", "stream_options", "temperature", "tool_choice", "max_tokens") if k in kwargs and k in message), None)
                if dropped is None:
                    raise
                self._unsupported.add(dropped)
                kwargs.pop(dropped)
        return await self._client.chat.completions.create(**kwargs)


def _key_for(base_url: str) -> str | None:
    """The key that matches the host, so switching provider is one variable."""
    host_keys = (
        ("openai.com", "OPENAI_API_KEY"),
        ("groq.com", "GROQ_API_KEY"),
        ("googleapis.com", "GEMINI_API_KEY"),
        ("cerebras.ai", "CEREBRAS_API_KEY"),
        ("x.ai", "XAI_API_KEY"),
    )
    for host, var in host_keys:
        if host in base_url and os.getenv(var):
            return os.getenv(var)
    return os.getenv("OPENAI_API_KEY") or os.getenv("XAI_API_KEY")


def openai_tool_schema(name: str, description: str, input_schema: dict[str, Any]) -> dict[str, Any]:
    return {"type": "function", "function": {"name": name, "description": description, "parameters": input_schema or {"type": "object", "properties": {}}}}
