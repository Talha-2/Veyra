"""The Veyra harness: the worker's brain, shared by the voice agent and the gateway.

Nothing in here imports LiveKit. The worker is a plain tool loop over a chat
model (ARCHITECTURE.md §5: "a plain LLM tool loop, deliberately not a LiveKit
Agent"), which is what lets the same loop serve a live call, an Ask thread and
an automation run — and be tested with a scripted model and a fake app.

Modules:

- ``llm``       one ``ChatModel`` protocol and an OpenAI-compatible implementation
- ``tools``     ``Tool``: schema + handler + the three reliability flags
- ``executor``  record-before-dispatch, idempotency, timeouts, reconciliation
- ``actions``   the tools an expert gets: internal ones, HTTP ones, skill reads
- ``worker``    the delegation loop, its private history, progress digest
- ``prompt``    prompt assembly from the contract's ``TenantContext``
"""

from .llm import ChatModel, Completion, OpenAIChatModel, ToolCall
from .tools import Tool, ToolResult
from .worker import DelegationOutcome, FinalizationResult, Worker

__all__ = [
    "ChatModel",
    "Completion",
    "DelegationOutcome",
    "FinalizationResult",
    "OpenAIChatModel",
    "Tool",
    "ToolCall",
    "ToolResult",
    "Worker",
]
