"""One place that decides which language model the platform talks to.

Every caller (voice worker, experts runtime, evals, workflow tester) must go
through here. Before this existed, some modules hardcoded x.ai while the rest
honoured the LLM_BASE_URL override, so switching provider silently broke them.

Any OpenAI compatible endpoint works: xAI, Groq, OpenAI, Together, a local
vLLM. Set LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in .env.
"""

from __future__ import annotations

import os

from openai import AsyncOpenAI

from .config import settings


def llm_conf() -> tuple[str, str, str]:
    """(base_url, api_key, model) for the configured provider."""
    base = (os.getenv("LLM_BASE_URL") or "https://api.x.ai/v1").rstrip("/")
    key = os.getenv("LLM_API_KEY") or settings.xai_api_key
    model = os.getenv("LLM_MODEL") or settings.xai_realtime_model
    return base, key, model


def client() -> AsyncOpenAI:
    base, key, _ = llm_conf()
    return AsyncOpenAI(base_url=base, api_key=key)


def model() -> str:
    return llm_conf()[2]


def is_configured() -> bool:
    return bool(llm_conf()[1])
