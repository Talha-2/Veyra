"""Model references: which provider, which model, which key.

A reference is ``provider:model`` — ``openai:gpt-4.1-mini``,
``groq:openai/gpt-oss-120b``. Studio stores references; this module turns one
into a base URL and a key from the environment. The catalog below is what
Studio offers; it is curated (each provider lists hundreds), and a provider
is "configured" when its key is present.

The defaults are what runs when Studio says nothing. They moved off xAI:
its key answered 403 on 2026-09-27, and a default that cannot answer is a
call that cannot start.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Provider:
    id: str
    label: str
    base_url: str
    key_env: tuple[str, ...]
    models: tuple[tuple[str, str, str], ...]  # (model, label, role: talker|worker|both)

    @property
    def key(self) -> str | None:
        for var in self.key_env:
            if os.getenv(var):
                return os.getenv(var)
        # The generic LLM_API_KEY belongs to whichever provider LLM_BASE_URL
        # points at, and to no other: handing Groq an OpenAI key produces a
        # "rejected" that is nobody's fault but ours.
        base = os.getenv("LLM_BASE_URL") or ""
        if os.getenv("LLM_API_KEY") and self.base_url.split("//")[-1].split("/")[0] in base:
            return os.getenv("LLM_API_KEY")
        return None

    @property
    def configured(self) -> bool:
        return self.key is not None


PROVIDERS: dict[str, Provider] = {
    "openai": Provider("openai", "OpenAI", "https://api.openai.com/v1", ("OPENAI_API_KEY",), (
        ("gpt-4o-mini", "GPT-4o mini — fast, cheap", "talker"),
        ("gpt-4.1-mini", "GPT-4.1 mini — good tool use", "both"),
        ("gpt-4.1", "GPT-4.1 — strongest tool use", "worker"),
        ("gpt-4.1-nano", "GPT-4.1 nano — fastest", "talker"),
    )),
    "groq": Provider("groq", "Groq", "https://api.groq.com/openai/v1", ("GROQ_API_KEY",), (
        ("openai/gpt-oss-20b", "GPT-OSS 20B on Groq — very fast", "talker"),
        ("openai/gpt-oss-120b", "GPT-OSS 120B on Groq — fast, capable", "both"),
        ("qwen/qwen3-32b", "Qwen3 32B on Groq", "worker"),
    )),
    "xai": Provider("xai", "xAI", "https://api.x.ai/v1", ("XAI_API_KEY",), (
        ("grok-3-mini", "Grok 3 mini", "talker"),
        ("grok-4", "Grok 4", "worker"),
    )),
    "gemini": Provider("gemini", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", ("GEMINI_API_KEY", "GOOGLE_API_KEY"), (
        ("gemini-2.5-flash", "Gemini 2.5 Flash", "both"),
        ("gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite — fastest", "talker"),
    )),
}

DEFAULT_TALKER = "openai:gpt-4o-mini"
DEFAULT_WORKER = "openai:gpt-4.1-mini"


@dataclass(frozen=True, slots=True)
class ResolvedModel:
    ref: str
    provider: str
    model: str
    base_url: str
    api_key: str


def resolve(ref: str | None, *, default: str) -> ResolvedModel:
    """A reference into what a client needs. Falls back to the default, then to LLM_* for a custom endpoint.

    A reference whose provider has no key is not silently swapped: the
    talker would run on a model nobody chose. It raises, and the caller
    decides. ``custom:<model>`` means LLM_BASE_URL / LLM_API_KEY.
    """
    ref = (ref or "").strip() or default
    provider_id, _, model = ref.partition(":")
    if not model:
        provider_id, model = "custom", ref
    if provider_id == "custom":
        base = os.getenv("LLM_BASE_URL")
        key = os.getenv("LLM_API_KEY")
        if not base or not key:
            raise LookupError(f"{ref!r} needs LLM_BASE_URL and LLM_API_KEY.")
        return ResolvedModel(ref=ref, provider="custom", model=model, base_url=base.rstrip("/"), api_key=key)
    provider = PROVIDERS.get(provider_id)
    if provider is None:
        raise LookupError(f"Unknown model provider {provider_id!r} in {ref!r}.")
    key = provider.key
    if not key:
        raise LookupError(f"{provider.label} has no API key configured ({' or '.join(provider.key_env)}), so {ref!r} cannot run.")
    return ResolvedModel(ref=ref, provider=provider_id, model=model, base_url=provider.base_url, api_key=key)


def resolve_or_default(ref: str | None, *, default: str) -> ResolvedModel:
    """Like ``resolve`` but degrades to the default when the chosen provider has no key, and says so."""
    try:
        return resolve(ref, default=default)
    except LookupError:
        if not ref:
            raise
        return resolve(None, default=default)


_verified: dict[str, tuple[float, bool, str | None]] = {}


async def verify(provider: Provider) -> tuple[bool, str | None]:
    """Whether the provider's key actually works, by listing models. Cached 10 minutes.

    Key presence is not enough: the xAI key in this repo's env answered 403.
    A Studio picker that offered it would produce calls that cannot start.
    """
    import time

    import httpx

    cached = _verified.get(provider.id)
    if cached and time.monotonic() - cached[0] < 600:
        return cached[1], cached[2]
    key = provider.key
    if not key:
        return False, None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(f"{provider.base_url}/models", headers={"Authorization": f"Bearer {key}"})
        ok = response.status_code < 400
        error = None if ok else f"HTTP {response.status_code}: the key was rejected." if response.status_code in (401, 403) else f"HTTP {response.status_code}"
    except httpx.TransportError as e:
        ok, error = False, f"unreachable: {type(e).__name__}"
    _verified[provider.id] = (time.monotonic(), ok, error)
    return ok, error


async def capabilities(*, check: bool = True) -> dict:
    """What Studio shows in its Models section. With ``check``, each configured key is verified live."""
    import asyncio

    # Verify every provider at once: one at a time, a cold gateway took longer
    # than Studio waits, and Studio then showed "no agent layer".
    listed = list(PROVIDERS.values())

    async def status(p: Provider) -> tuple[bool, str | None]:
        return (await verify(p)) if (check and p.configured) else (p.configured, None)

    results = await asyncio.gather(*(status(p) for p in listed))
    providers = []
    for p, (ok, error) in zip(listed, results):
        providers.append({
            "id": p.id, "label": p.label, "configured": p.configured and ok, "key_present": p.configured, "error": error,
            "models": [{"ref": f"{p.id}:{m}", "label": label, "role": role} for m, label, role in p.models],
        })
    return {
        "providers": providers,
        "defaults": {"talker": DEFAULT_TALKER, "worker": DEFAULT_WORKER},
        "voice": {
            "cartesia": bool(os.getenv("CARTESIA_API_KEY")),
            "elevenlabs": bool(os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")),
            "deepgram": bool(os.getenv("DEEPGRAM_API_KEY")),
            "azure": bool(os.getenv("AZURE_SPEECH_KEY")),
            "livekit": bool(os.getenv("LIVEKIT_URL")),
        },
    }
