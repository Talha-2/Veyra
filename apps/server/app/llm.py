"""One place that decides which language model the platform talks to.

Every caller (experts harness, evals, SMS auto-reply, workflow tester, deep
agent) must go through here. Before this existed, some modules hardcoded x.ai
while the rest honoured the LLM_BASE_URL override, so switching provider
silently broke them.

Resolution order, first hit wins:
  1. **Studio config** — the provider saved on the tuning page (`AgentConfig`
     row: llm_base_url / llm_api_key / llm_model). This is what makes the
     studio picker govern the whole platform, not just phone calls.
  2. **Environment** — LLM_BASE_URL / LLM_API_KEY / LLM_MODEL.
  3. **Default** — x.ai with the XAI_* settings.

Any OpenAI-compatible endpoint works: xAI, OpenAI, Groq, Gemini's OpenAI
surface, Together, a local vLLM. The DB read is cached briefly so per-token
hot paths don't hammer SQLite/Postgres.
"""

from __future__ import annotations

import json
import os
import time

from openai import AsyncOpenAI

from .config import settings

_CACHE_TTL_SEC = 15.0
_cache: tuple[float, dict] | None = None


def _studio_conf() -> dict:
    """The llm_* keys from the studio's AgentConfig row, briefly cached."""
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[0] < _CACHE_TTL_SEC:
        return _cache[1]
    conf: dict = {}
    try:
        from sqlmodel import Session

        from .db import AgentConfig, engine

        with Session(engine) as session:
            row = session.get(AgentConfig, 1)
            if row is not None:
                raw = json.loads(row.config_json or "{}")
                conf = {k: v for k, v in raw.items()
                        if k in ("llm_base_url", "llm_api_key", "llm_model") and v}
    except Exception:
        conf = {}
    _cache = (now, conf)
    return conf


def llm_conf() -> tuple[str, str, str]:
    """(base_url, api_key, model) for the configured provider — studio config
    first, then env, then the x.ai default.

    The studio layer only wins when it names a provider (llm_base_url). A
    stray llm_model without a base URL (the shipped default carries
    "grok-3-mini") must NOT be paired with another layer's endpoint — a model
    name only means something on the provider it belongs to."""
    c = _studio_conf()
    if c.get("llm_base_url"):
        base = c["llm_base_url"].rstrip("/")
        key = c.get("llm_api_key") or os.getenv("LLM_API_KEY") or settings.xai_api_key
        model = c.get("llm_model") or os.getenv("LLM_MODEL") or settings.xai_realtime_model
        return base, key, model
    base = (os.getenv("LLM_BASE_URL") or "https://api.x.ai/v1").rstrip("/")
    key = os.getenv("LLM_API_KEY") or settings.xai_api_key
    if os.getenv("LLM_BASE_URL"):
        # env named the provider: env supplies the model too
        model = os.getenv("LLM_MODEL") or settings.xai_realtime_model
    else:
        # default x.ai endpoint: a bare studio llm_model is an x.ai model name
        model = c.get("llm_model") or os.getenv("LLM_MODEL") or settings.xai_realtime_model
    return base, key, model


def client() -> AsyncOpenAI:
    base, key, _ = llm_conf()
    return AsyncOpenAI(base_url=base, api_key=key)


def model() -> str:
    return llm_conf()[2]


def is_configured() -> bool:
    return bool(llm_conf()[1])


def langchain_model(temperature: float = 0.4):
    """The same resolved provider as a LangChain chat model, for the LangGraph
    harness. Import is deferred so callers that never touch the harness don't
    pay for langchain at import time."""
    from langchain_openai import ChatOpenAI

    base, key, mdl = llm_conf()
    return ChatOpenAI(model=mdl, base_url=base, api_key=key or "unset", temperature=temperature)
