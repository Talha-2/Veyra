"""The webhook node: call a real API in the middle of a call.

Two things make this usable rather than a form that shrugs at you.

First, you can run the request from the builder and see the actual response, so
the JSON paths you map are ones you have watched come back, not ones you guessed
at from documentation.

Second, response mapping is explicit: each variable names a path into the
response, so the agent gets `available_slots` rather than a wall of JSON it has
to reason about mid sentence.

JSONPath here is the small, predictable subset people actually use for this:
`$.data.slots[0].start`. No filters, no recursive descent, no new dependency.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx

_TOKEN = re.compile(r"\{\{?\s*([a-zA-Z_][\w]*)\s*\}?\}")


def fill(template: str, variables: dict) -> str:
    """Substitute {var} / {{var}} with collected values."""
    if not template:
        return ""
    return _TOKEN.sub(lambda m: str(variables.get(m.group(1), m.group(0))), template)


def json_path(data: Any, path: str) -> Any:
    """Read `$.a.b[0].c` out of a decoded response. Returns None if it misses."""
    if not path:
        return None
    p = path.strip().lstrip("$").lstrip(".")
    cur = data
    for part in filter(None, re.split(r"\.", p)):
        # split trailing [n] indexes off the key: slots[0][1]
        key, *idxs = re.split(r"\[(\d+)\]", part)
        if key:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
        for idx in filter(lambda s: s.isdigit(), idxs):
            if not isinstance(cur, list) or int(idx) >= len(cur):
                return None
            cur = cur[int(idx)]
        if cur is None:
            return None
    return cur


def suggest_paths(data: Any, prefix: str = "$", depth: int = 0, out: list | None = None) -> list[str]:
    """Every leaf path in a response, so the builder can offer them as options."""
    out = out if out is not None else []
    if depth > 4 or len(out) > 60:
        return out
    if isinstance(data, dict):
        for k, v in data.items():
            path = f"{prefix}.{k}"
            if isinstance(v, (dict, list)):
                suggest_paths(v, path, depth + 1, out)
            else:
                out.append(path)
    elif isinstance(data, list):
        if data:
            suggest_paths(data[0], f"{prefix}[0]", depth + 1, out)
            out.append(prefix)  # the array itself is often what you want
    return out


async def run_webhook(cfg: dict, variables: dict | None = None) -> dict:
    """Execute a webhook config and report exactly what came back."""
    variables = variables or {}
    method = (cfg.get("method") or "POST").upper()
    url = fill(cfg.get("url") or "", variables).strip()
    if not url:
        return {"ok": False, "error": "No URL set."}

    headers = {}
    for h in cfg.get("headers") or []:
        name, value = (h.get("name") or "").strip(), fill(h.get("value") or "", variables)
        if name:
            headers[name] = value
    if cfg.get("auth_value"):
        headers["Authorization"] = fill(cfg["auth_value"], variables)

    body = None
    raw_body = fill(cfg.get("body") or "", variables).strip()
    if raw_body and method not in ("GET", "HEAD"):
        try:
            body = json.loads(raw_body)
        except Exception as exc:
            return {"ok": False, "error": f"Request body is not valid JSON: {exc}"}
        headers.setdefault("Content-Type", "application/json")

    timeout = float(cfg.get("timeout") or 10)
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=min(timeout, 30)) as client:
            resp = await client.request(method, url, headers=headers, json=body)
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}",
                "ms": round((time.perf_counter() - t0) * 1000, 1)}

    ms = round((time.perf_counter() - t0) * 1000, 1)
    try:
        decoded = resp.json()
        text = None
    except Exception:
        decoded, text = None, resp.text[:2000]

    extracted: dict = {}
    for v in cfg.get("response_vars") or []:
        name = (v.get("name") or "").strip()
        if name:
            extracted[name] = json_path(decoded, v.get("path") or "")

    return {
        "ok": 200 <= resp.status_code < 300,
        "status": resp.status_code,
        "ms": ms,
        "json": decoded,
        "text": text,
        "suggestions": suggest_paths(decoded)[:60] if decoded is not None else [],
        "extracted": extracted,
    }
