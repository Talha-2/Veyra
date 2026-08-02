"""Deep agent harness: a streaming tool-use loop against xAI (OpenAI-compatible
chat completions). Yields SSE-friendly events so the studio UI can render
tokens as they arrive and show tool calls as they execute.

Event shapes:
  {"type": "token", "text": "..."}
  {"type": "tool_call", "id": "...", "name": "...", "arguments": {...}}
  {"type": "tool_result", "id": "...", "name": "...", "result": ...}
  {"type": "done", "message": "<final assistant text>"}
  {"type": "error", "message": "..."}
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import anyio
from openai import AsyncOpenAI

from ..config import settings
from .tools import TOOL_DEFS, TOOL_IMPLS

MAX_TOOL_ROUNDS = 12

SYSTEM_PROMPT = """You are the build assistant for a business voice-agent platform. \
You manage the product on the user's behalf through tools: the knowledge base the \
voice agent retrieves from (RAG), the workflow specs it executes on calls, and its \
voice tuning configuration (STT/TTS/VAD/endpointing/interruptions).

Operating rules:
- When asked to add knowledge, write clean well-structured markdown with headings — \
chunking splits on headings, so structure directly improves retrieval quality.
- When asked to build a workflow, fetch the example spec first if unsure of the shape, \
then create it. If validation fails, fix the errors and retry — do not report failure \
until you have attempted a fix.
- After creating or changing something, verify it: search the KB for what you just \
added, or list workflows to confirm the save. Report what you verified, not what you intended.
- When changing voice tuning, explain the tradeoff in one sentence (e.g. lower \
endpointing delay = snappier turns but more mid-sentence cutoffs).
- Be concise. The user is a developer."""


def _openai_tools() -> list[dict]:
    return [{"type": "function", "function": d} for d in TOOL_DEFS]


async def _exec_tool(name: str, arguments: dict):
    fn = TOOL_IMPLS.get(name)
    if fn is None:
        return {"error": f"unknown tool {name}"}
    try:
        return await anyio.to_thread.run_sync(lambda: fn(**arguments))
    except TypeError as exc:
        return {"error": f"bad arguments: {exc}"}
    except Exception as exc:
        return {"error": str(exc)[:1000]}


async def run_agent(messages: list[dict]) -> AsyncIterator[dict]:
    if not settings.xai_api_key:
        yield {"type": "error", "message": "XAI_API_KEY not configured"}
        return

    client = AsyncOpenAI(api_key=settings.xai_api_key, base_url="https://api.x.ai/v1")
    convo: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            stream = await client.chat.completions.create(
                model=settings.xai_agent_model,
                messages=convo,
                tools=_openai_tools(),
                stream=True,
            )
        except Exception as exc:
            yield {"type": "error", "message": f"LLM request failed: {exc}"}
            return

        text_parts: list[str] = []
        tool_calls: dict[int, dict] = {}

        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                text_parts.append(delta.content)
                yield {"type": "token", "text": delta.content}
            for tc in delta.tool_calls or []:
                slot = tool_calls.setdefault(
                    tc.index, {"id": "", "name": "", "arguments": ""}
                )
                if tc.id:
                    slot["id"] = tc.id
                if tc.function and tc.function.name:
                    slot["name"] = tc.function.name
                if tc.function and tc.function.arguments:
                    slot["arguments"] += tc.function.arguments

        text = "".join(text_parts)

        if not tool_calls:
            yield {"type": "done", "message": text}
            return

        assistant_msg: dict = {"role": "assistant", "content": text or None, "tool_calls": []}
        for idx in sorted(tool_calls):
            slot = tool_calls[idx]
            assistant_msg["tool_calls"].append({
                "id": slot["id"],
                "type": "function",
                "function": {"name": slot["name"], "arguments": slot["arguments"]},
            })
        convo.append(assistant_msg)

        for idx in sorted(tool_calls):
            slot = tool_calls[idx]
            try:
                args = json.loads(slot["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            yield {"type": "tool_call", "id": slot["id"], "name": slot["name"], "arguments": args}
            result = await _exec_tool(slot["name"], args)
            yield {"type": "tool_result", "id": slot["id"], "name": slot["name"], "result": result}
            convo.append({
                "role": "tool",
                "tool_call_id": slot["id"],
                "content": json.dumps(result, default=str)[:20_000],
            })

    yield {"type": "error", "message": f"Stopped after {MAX_TOOL_ROUNDS} tool rounds."}
