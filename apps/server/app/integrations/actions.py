"""Custom HTTP actions: turn a user-defined endpoint into one LLM tool.

Pure stdlib/httpx — no external service. Used by the backend (test run) and by
the voice worker (which fetches action specs and registers them as tools).
"""

from __future__ import annotations

import json
import re

import httpx

from .models import CustomAction


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", name.lower()).strip("_")[:48] or "action"


def action_tool_schema(a: CustomAction) -> dict:
    """OpenAI function-tool schema for a custom action."""
    props: dict = {}
    required: list[str] = []
    for arg in a.args:
        props[arg["name"]] = {"type": "string", "description": arg.get("description", "")}
        if arg.get("required", True):
            required.append(arg["name"])
    return {
        "name": f"custom_{_slug(a.name)}",
        "description": (a.description or a.name)[:1000],
        "parameters": {"type": "object", "properties": props, "required": required},
    }


def _auth_headers(a: CustomAction) -> dict:
    if a.auth_type == "bearer" and a.auth_value:
        return {"Authorization": f"Bearer {a.auth_value}"}
    if a.auth_type == "header" and a.auth_value and ":" in a.auth_value:
        k, v = a.auth_value.split(":", 1)
        return {k.strip(): v.strip()}
    if a.auth_type == "basic" and a.auth_value:
        import base64

        return {"Authorization": "Basic " + base64.b64encode(a.auth_value.encode()).decode()}
    return {}


async def execute_action(a: CustomAction, arguments: dict) -> dict:
    """Run the HTTP call. Splits args into query vs body by their declared
    location; returns a compact result for the LLM."""
    query: dict = {}
    body: dict = {}
    by_name = {arg["name"]: arg for arg in a.args}
    for name, value in (arguments or {}).items():
        loc = by_name.get(name, {}).get("location", "body")
        (query if loc == "query" else body)[name] = value

    headers = {**a.headers, **_auth_headers(a)}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if a.method.upper() == "GET":
                resp = await client.get(a.url, params={**query, **body}, headers=headers)
            else:
                headers.setdefault("Content-Type", "application/json")
                resp = await client.post(a.url, params=query, json=body, headers=headers)
        text = resp.text[:4000]
        try:
            payload = json.loads(text)
        except Exception:
            payload = text
        return {"status": resp.status_code, "ok": resp.is_success, "response": payload}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:500]}
