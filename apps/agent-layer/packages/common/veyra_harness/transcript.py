"""Turning the talker's chat history into what the worker is allowed to see.

Pure functions, no LiveKit import: the items are duck-typed on ``type``,
``role`` and ``content``/``text_content`` so both LiveKit's ``ChatItem`` and a
plain dict from a test work.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any


def _get(item: Any, key: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return "\n".join(part.strip() for part in content if isinstance(part, str)).strip()
    return ""


def format_transcript_delta(items: Sequence[Any], start: int) -> tuple[str, int]:
    """Render unseen caller-facing turns for the worker, excluding tool plumbing.

    Returns the delta and the new cursor. The cursor advances past everything,
    including items that rendered nothing, so a tool result never gets a second
    look.
    """
    lines: list[str] = []
    for item in items[start:]:
        if _get(item, "type", "message") != "message":
            continue
        role = _get(item, "role", "")
        content = _message_text(_get(item, "text_content", None) or _get(item, "content", ""))
        if content and role in ("assistant", "user"):
            lines.append(f"{'AI' if role == 'assistant' else 'Human'}: {content}")
    return "\n".join(lines), len(items)


def transcript_items(items: Sequence[Any]) -> list[dict[str, str]]:
    """The caller-facing transcript in the contract's shape, for ``PUT /calls/{id}/transcript``."""
    out: list[dict[str, str]] = []
    for item in items:
        if _get(item, "type", "message") != "message":
            continue
        role = _get(item, "role", "")
        content = _message_text(_get(item, "text_content", None) or _get(item, "content", ""))
        if content and role in ("assistant", "user"):
            out.append({"role": "agent" if role == "assistant" else "caller", "text": content})
    return out
