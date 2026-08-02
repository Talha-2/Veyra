"""LiveKit Agents voice worker.

Pipeline: Deepgram nova-3 (STT, multilingual code-switching) → xAI Grok (LLM)
→ ElevenLabs Flash (TTS) with Inworld as an automatic fallback, Silero VAD +
LiveKit's semantic turn detector for endpointing, barge-in enabled.

Latency budget we design to (user stops speaking → first agent audio):
  VAD/endpointing wait   ~400-700 ms   (the knob that trades snappiness vs cutoffs)
  STT final              ~100-200 ms   (Deepgram streams; final arrives with EOU)
  LLM TTFT               ~250-500 ms   (grok-3-mini; preemptive_generation hides some)
  TTS TTFB               ~100-200 ms   (eleven_flash_v2_5)
  ─────────────────────────────────────
  target                 < 1.2 s p50, < 1.8 s p95
Every turn's actual numbers are published to the room (topic `agent_metrics`)
so the web HUD shows them live.

Run:  python agent.py download-files   (once — pulls VAD + turn-detector weights)
      python agent.py dev
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re

from dotenv import load_dotenv

# repo-root .env, then local overrides
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv()

from livekit import api  # noqa: E402
from livekit.agents import (  # noqa: E402
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    get_job_context,
    metrics,
)
from livekit.agents import tts as agents_tts  # noqa: E402
from livekit.plugins import deepgram, elevenlabs, openai, silero  # noqa: E402
from livekit.plugins.turn_detector.multilingual import MultilingualModel  # noqa: E402

import backend  # noqa: E402
import transfers  # noqa: E402
from workflow_engine import build_workflow_tools, call_start_workflow, WorkflowAgent  # noqa: E402
from integration_tools import build_integration_tools, build_mcp_servers, fetch_agent_tools  # noqa: E402

logger = logging.getLogger("voice-agent")

try:
    from livekit.plugins import noise_cancellation
except ImportError:
    noise_cancellation = None

try:
    from livekit.plugins import inworld
except ImportError:
    inworld = None

try:
    from livekit.plugins import cartesia
except ImportError:
    cartesia = None


# Smaller models sometimes emit a tool call as literal text instead of using the
# structured tool_calls field, and the caller then hears "<function=search…>"
# read aloud. Nothing we say to the model reliably prevents it, so strip it on
# the way to the speaker: markup must never reach a phone line.
_TOOL_LEAK = re.compile(
    r"<\s*function[^>]*>.*?</\s*function\s*>"      # <function=name>{...}</function>
    r"|<\s*/?\s*(?:function|tool_call|invoke)[^>]*>"  # stray opening/closing tags
    # greedy to the final brace on purpose: nested argument objects mean a lazy
    # match stops at the inner "}" and leaves the outer one to be read aloud
    r"|\{\s*\"(?:name|function)\"\s*:\s*\"[^\"]+\"\s*,\s*\"(?:arguments|parameters)\".*\}",
    re.S | re.I,
)

# whatever survives the pass above: orphaned braces and angle brackets left by
# a partially streamed call. None of these belong in speech.
_ORPHAN = re.compile(r"(?:^|\s)[{}<>\[\]]+(?=\s|$)")


def _strip_tool_syntax(text: str) -> str:
    cleaned = _TOOL_LEAK.sub(" ", text)
    cleaned = _ORPHAN.sub(" ", cleaned)
    cleaned = re.sub(r"\s+([.,!?])", r"\1", cleaned)  # don't leave " ." behind
    return re.sub(r"\s{2,}", " ", cleaned).strip()


class BusinessAgent(Agent):
    async def tts_node(self, text, model_settings):
        """Last gate before audio. Drops any tool-call syntax that leaked into
        the spoken stream, so a malformed call becomes silence rather than a
        robot reading XML at the caller."""

        async def scrubbed():
            async for chunk in text:
                out = _strip_tool_syntax(chunk) if "<" in chunk or "{" in chunk else chunk
                if out:
                    yield out

        async for frame in super().tts_node(scrubbed(), model_settings):
            yield frame

    def __init__(self, config: dict, workflow_tools: list) -> None:
        wf_note = (
            "\n\n# Starting a flow\n"
            "When the caller's need matches one of your flows, call its start_workflow tool "
            "RIGHT AWAY and say NOTHING before it or with it — no 'sure', no 'I can help with "
            "that', no questions, not a single word. The flow greets the caller and asks the "
            "first question itself, so anything you say here gets said twice and sounds broken. "
            "Decide, call the tool, stay silent."
            if workflow_tools else ""
        )
        super().__init__(
            instructions=config["system_prompt"] + wf_note,
            tools=workflow_tools,
        )
        self._config = config

    async def on_enter(self) -> None:
        greeting = self._config.get("greeting")
        if greeting:
            await self.session.say(greeting, allow_interruptions=True)

    @function_tool
    async def search_knowledge_base(self, context: RunContext, query: str) -> str:
        """Look up facts about the business — pricing, hours, policies, products,
        services, anything specific. Call this AUTOMATICALLY whenever the caller
        asks something you are not certain of, BEFORE you answer and before you
        ever say you don't know. Guessing is worse than a one second lookup."""
        results = await backend.search_knowledge_base(query)
        if not results:
            return ("Nothing in the knowledge base matched that. Tell the caller honestly "
                    "that you don't have that detail to hand, and offer to take a message "
                    "or find out and follow up — do not make anything up.")
        return "\n---\n".join(f"[{r['doc_name']}] {r['text']}" for r in results[:4])

    @function_tool
    async def transfer_to_human(self, context: RunContext, reason: str) -> str:
        """Cold-transfer the caller to a human agent. Use when the caller asks for a
        person or you cannot help. Announce the transfer BEFORE calling this."""
        return await transfers.cold_transfer()

    @function_tool
    async def warm_transfer_to_human(self, context: RunContext, briefing_summary: str) -> str:
        """Warm-transfer: brings a human onto the line and you introduce them with the
        briefing summary (caller's name, need, and anything already collected).
        Prefer this over cold transfer for upset callers or complex issues."""
        return await transfers.warm_transfer(briefing_summary)

    @function_tool
    async def transfer_to_number(self, context: RunContext, number: str, reason: str) -> str:
        """Transfer the caller to a specific external phone number (any full number
        in international format). Use to hand a caller to an outside line or a
        partner. Announce the transfer BEFORE calling this."""
        return await transfers.cold_transfer(target=number)

    @function_tool
    async def transfer_to_teammate(self, context: RunContext, who: str) -> str:
        """Transfer the caller to a named teammate or an internal extension. `who`
        can be a person's name (for example 'Sara') or an extension (for example
        '101'). Announce the transfer BEFORE calling this."""
        targets = (self._config.get("_transfer_targets") or {}).get("agents", [])
        w = (who or "").strip().lower()
        match = next(
            (a for a in targets
             if w and (w in (a.get("name") or "").lower() or w == (a.get("extension") or "").lower())),
            None,
        )
        if not match:
            return f"I could not find {who} in the directory. Offer to take a message or a callback."
        dest = match.get("phone") or match.get("extension")
        if not dest:
            return f"{match.get('name')} does not have a line set up yet. Offer a callback."
        return await transfers.cold_transfer(target=dest)

    @function_tool
    async def end_call(self, context: RunContext) -> str:
        """End the call. Only after the caller confirms they're done. Say goodbye first."""
        ctx = get_job_context()

        async def _hangup():
            await asyncio.sleep(2.0)  # let the goodbye finish playing out
            try:
                await ctx.api.room.delete_room(api.DeleteRoomRequest(room=ctx.room.name))
            except Exception as exc:
                logger.warning("hangup failed: %s", exc)

        asyncio.create_task(_hangup())
        return "Call ending. Say a brief goodbye now."


import contextvars

# The room name of the call currently being handled, read by the span processor
# below so every span of one call carries the same Langfuse session id.
_LF_SESSION: contextvars.ContextVar[str] = contextvars.ContextVar("lf_session_id", default="")
_LF_PROVIDER = None  # kept module-level so shutdown can flush pending spans


def _setup_langfuse() -> bool:
    """Send LiveKit's OpenTelemetry traces to Langfuse.

    LiveKit Agents already emits spans for the whole turn — LLM generations, tool
    calls (so every start_workflow and search_knowledge_base shows up), TTS and
    STT. We export those to Langfuse's OTLP endpoint, and tag each span with the
    room name as the session id so all turns of one call group into a single
    Langfuse session. No keys, no tracing — the agent runs exactly as before.
    """
    global _LF_PROVIDER
    public = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret = os.getenv("LANGFUSE_SECRET_KEY")
    if not (public and secret):
        return False
    try:
        import base64
        from opentelemetry.sdk.trace import TracerProvider, SpanProcessor
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from livekit.agents.telemetry import set_tracer_provider

        host = (os.getenv("LANGFUSE_HOST") or os.getenv("LANGFUSE_BASE_URL")
                or "https://cloud.langfuse.com").rstrip("/")
        auth = base64.b64encode(f"{public}:{secret}".encode()).decode()

        class _SessionProcessor(SpanProcessor):
            """Stamp each span with the current call's room name as the session id."""
            def on_start(self, span, parent_context=None):
                sid = _LF_SESSION.get()
                if sid:
                    span.set_attribute("langfuse.session.id", sid)
            def on_end(self, span): pass
            def shutdown(self): pass
            def force_flush(self, timeout_millis=30000): return True

        provider = TracerProvider()
        provider.add_span_processor(_SessionProcessor())
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
            endpoint=f"{host}/api/public/otel/v1/traces",
            headers={"Authorization": f"Basic {auth}"},
        )))
        _LF_PROVIDER = provider
        # Descriptive trace name + tags so the trace list reads like a call log
        # instead of a wall of "job_entrypoint"; session id is set per call above.
        set_tracer_provider(provider, metadata={
            "service.name": "voice-agent",
            "langfuse.trace.name": "Voice Call",
            "langfuse.trace.tags": ["voice", "cascade"],
        })
        logger.info("Langfuse tracing enabled -> %s", host)
        return True
    except Exception as exc:
        logger.warning("Langfuse setup failed (%s); continuing without tracing", exc)
        return False


def prewarm(proc: JobProcess) -> None:
    """Load VAD once per worker process, using the studio's tuning values.

    These were previously read only from env, so the sliders on the Voice Tuning
    page silently did nothing. VAD load is expensive, which is why it lives here
    rather than per call; the config fetch is a single blocking request per
    process and falls back to env then to sane defaults.
    """
    _setup_langfuse()
    cfg: dict = {}
    try:
        import httpx as _httpx

        base = os.getenv("BACKEND_URL", "http://server:8000").rstrip("/")
        cfg = _httpx.get(f"{base}/api/agent/config", timeout=8).json()
    except Exception as exc:  # a slow backend must not stop the worker booting
        logger.warning("prewarm could not read tuning config (%s); using env defaults", exc)

    min_silence = float(cfg.get("vad_min_silence") or os.getenv("VAD_MIN_SILENCE", "0.40"))
    threshold = float(cfg.get("vad_activation_threshold") or os.getenv("VAD_ACTIVATION_THRESHOLD", "0.55"))
    logger.info("VAD: min_silence=%.2fs activation_threshold=%.2f", min_silence, threshold)
    proc.userdata["vad"] = silero.VAD.load(
        min_silence_duration=min_silence,
        activation_threshold=threshold,
    )


def _cartesia_stt(config: dict):
    """Cartesia Ink STT — same provider as the voice, tuned for noisy phone audio.
    Returns None when the plugin or key is absent so the caller falls back to Deepgram."""
    if cartesia is None or not os.getenv("CARTESIA_API_KEY"):
        return None
    try:
        model = config.get("cartesia_stt_model") or "ink-whisper"
        lang = config.get("stt_language") or "en"
        # Ink takes a specific language code, not Deepgram's "multi" sentinel
        lang = None if lang in ("multi", "") else lang
        logger.info("STT: cartesia %s (lang=%s)", model, lang or "auto")
        return cartesia.STT(model=model, language=lang)
    except Exception as exc:
        logger.warning("cartesia STT unavailable (%s); falling back to Deepgram", exc)
        return None


def _build_stt(config: dict):
    """STT, provider-selectable from the studio. Deepgram nova-3 is the default;
    Cartesia Ink is the same-provider alternative."""
    provider = (config.get("stt_provider") or "deepgram").lower()
    if provider == "cartesia":
        stt = _cartesia_stt(config)
        if stt is not None:
            return stt
        logger.warning("stt_provider=cartesia unavailable; using Deepgram")

    kwargs: dict = {
        "model": config.get("stt_model", "nova-3"),
        "language": config.get("stt_language", "multi"),
        "interim_results": True,
        "smart_format": True,
        "filler_words": True,  # "um, wait—" matters for interruption semantics
    }
    logger.info("STT: deepgram %s/%s", kwargs["model"], kwargs["language"])
    keyterms = config.get("stt_keyterms") or []
    if keyterms:
        try:
            return deepgram.STT(**kwargs, keyterms=keyterms)
        except TypeError:
            logger.warning("installed deepgram plugin lacks keyterms support; ignoring")
    return deepgram.STT(**kwargs)


def _cartesia_tts(config: dict):
    """Cartesia Sonic — the expressive, low-latency engine. Returns None when the
    plugin or key is absent so the caller can fall back to ElevenLabs."""
    if cartesia is None or not os.getenv("CARTESIA_API_KEY"):
        return None
    try:
        kwargs: dict = {"model": config.get("cartesia_model") or "sonic-3"}
        vid = (config.get("cartesia_voice_id") or "").strip()
        if vid:
            kwargs["voice"] = vid
        return cartesia.TTS(**kwargs)
    except Exception as exc:
        logger.warning("cartesia TTS unavailable: %s", exc)
        return None


def _elevenlabs_tts(config: dict):
    if not os.getenv("ELEVEN_API_KEY"):
        return None
    return elevenlabs.TTS(
        voice_id=config.get("tts_voice_id", "EXAVITQu4vr4xnSDxMaL"),
        model=config.get("tts_model", "eleven_flash_v2_5"),
    )


def _build_tts(config: dict):
    """Cascade TTS. Uses EXACTLY the provider selected in the studio.

    A FallbackAdapter across providers means the voice can change mid-call — the
    caller hears one person become another the instant the primary hiccups, which
    is worse than a rare stumble. So the selected provider is the only voice, and
    cross-provider failover is opt-in (tts_failover) for those who accept the
    voice change as the price of resilience.
    """
    provider = (config.get("tts_provider") or "elevenlabs").lower()
    builders = {"cartesia": _cartesia_tts, "elevenlabs": _elevenlabs_tts}

    lead = builders.get(provider, _elevenlabs_tts)(config)
    if lead is None:
        # the selected provider has no key/plugin: use the first that does, so a
        # misconfiguration degrades to a working voice instead of a dead call
        logger.warning("tts_provider=%s unavailable (missing key or plugin); using first available", provider)
        for name, build in builders.items():
            if name != provider:
                lead = build(config)
                if lead is not None:
                    break
        if lead is None and inworld is not None and os.getenv("INWORLD_API_KEY"):
            try:
                lead = inworld.TTS()
            except Exception as exc:
                logger.warning("inworld TTS unavailable: %s", exc)
    if lead is None:
        raise RuntimeError("No TTS configured — set ELEVEN_API_KEY, CARTESIA_API_KEY, or INWORLD_API_KEY")

    if not config.get("tts_failover"):
        logger.info("cascade TTS: provider=%s (single voice, no mid-call switching)", provider)
        return lead

    # opt-in failover: build the rest of the chain behind the selected lead
    chain = [lead]
    for name, build in builders.items():
        if name != provider:
            v = build(config)
            if v is not None:
                chain.append(v)
    logger.info("cascade TTS: provider=%s (%d engines, failover on)", provider, len(chain))
    return chain[0] if len(chain) == 1 else agents_tts.FallbackAdapter(chain)


# A voice turn resends every tool schema, so the whole workspace does not fit in
# a small model's per minute budget. Cap it when no pathway narrows the set.
MAX_UNSCOPED_TOOLS = 6


def _build_llm(config: dict):
    """Any OpenAI-compatible LLM powers the realtime loop.

    Defaults to xAI Grok. Override with LLM_BASE_URL / LLM_API_KEY / LLM_MODEL to
    use OpenAI, Groq, Together, a local vLLM/Ollama, etc. — the escape hatch when
    an xAI team has no credits (403 permission-denied) or you want your own model.
    """
    # Studio settings win over .env. Switching provider should be something you
    # do in the product and have take effect on the next call, not an edit to a
    # file followed by a container recreate.
    base_url = config.get("llm_base_url") or os.getenv("LLM_BASE_URL") or "https://api.x.ai/v1"
    # Pick the key that matches the host, so switching provider in the studio does
    # not also require pasting a key that already lives in the environment. An
    # explicit key in the config always wins.
    explicit = (config.get("llm_api_key") or "").strip()
    if explicit:
        api_key = explicit
    elif "openai.com" in base_url and os.getenv("OPENAI_API_KEY"):
        api_key = os.getenv("OPENAI_API_KEY")
    elif "groq.com" in base_url and os.getenv("GROQ_API_KEY"):
        api_key = os.getenv("GROQ_API_KEY")
    else:
        api_key = os.getenv("LLM_API_KEY") or os.getenv("XAI_API_KEY", "")
    model = config.get("llm_model") or os.getenv("LLM_MODEL") or os.getenv("XAI_REALTIME_MODEL", "grok-3-mini")
    logger.info("LLM: model=%s base_url=%s", model, base_url)
    return openai.LLM(model=model, base_url=base_url, api_key=api_key, temperature=0.4)


def _build_realtime(config: dict):
    """OpenAI Realtime (speech-to-speech): one audio-in/audio-out model instead of
    the STT→LLM→TTS cascade. More expressive because speech never flattens to text,
    but scripted lines are not guaranteed verbatim (see the hybrid `say` note below).
    Requires an OpenAI key; the studio picks the model and voice.
    """
    api_key = config.get("realtime_api_key") or os.getenv("OPENAI_API_KEY") or ""
    if not api_key:
        raise RuntimeError("Realtime engine selected but no OpenAI key (set OPENAI_API_KEY)")
    model = config.get("realtime_model") or "gpt-realtime"
    voice = config.get("realtime_voice") or "marin"
    logger.info("Realtime engine: model=%s voice=%s", model, voice)
    return openai.realtime.RealtimeModel(model=model, voice=voice, api_key=api_key)


def _abilities_overview(workflows: list) -> str:
    """List the flows the agent can start, with the intent that should trigger each,
    so the model routes to the right one the moment a caller's need is clear."""
    lines = []
    for wf in workflows:
        spec = wf.get("spec", {}) if isinstance(wf, dict) else {}
        name = spec.get("name")
        if not name:
            continue
        trig = spec.get("trigger", {}) or {}
        bit = f"- {name}"
        if spec.get("description"):
            bit += f": {spec['description']}"
        intent = trig.get("intent")
        kw = trig.get("keywords") or []
        if intent:
            bit += f" — start this when {intent}"
        elif kw:
            bit += f" — start this when the caller mentions {', '.join(kw[:4])}"
        lines.append(bit)
    if not lines:
        return ""
    return ("WHAT YOU CAN DO — the flows you can start for the caller. The moment one "
            "matches, call its start_workflow tool and say nothing else; the flow speaks "
            "for itself:\n"
            + "\n".join(lines))


def _sip_numbers(participant) -> tuple[str, str] | None:
    """If a participant is a phone caller (joined over SIP), return (caller, called)
    numbers from its attributes; else None. Works across SDK attribute spellings."""
    attrs = dict(getattr(participant, "attributes", {}) or {})
    caller = attrs.get("sip.phoneNumber") or attrs.get("sip.from") or ""
    called = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to") or ""
    ident = getattr(participant, "identity", "") or ""
    if caller or called or ident.startswith("sip_"):
        return caller, called
    return None


async def _register_phone_call(ctx: JobContext) -> None:
    """When this room is a phone call, log it so it shows in the telephony call
    list. Outbound calls are placed into rooms named `call-…` we already logged;
    inbound calls arrive with a SIP participant carrying the numbers."""
    room = ctx.room
    for p in list(getattr(room, "remote_participants", {}).values()):
        nums = _sip_numbers(p)
        if nums is not None:
            caller, called = nums
            direction = "outbound" if room.name.startswith("call-") else "inbound"
            await backend.register_call(room.name, caller, called, direction)
            return

    # the SIP participant can join a beat after us: catch it once
    @room.on("participant_connected")
    def _on_join(p) -> None:
        nums = _sip_numbers(p)
        if nums is not None:
            caller, called = nums
            direction = "outbound" if room.name.startswith("call-") else "inbound"
            asyncio.create_task(backend.register_call(room.name, caller, called, direction))


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    # Group every span of this call under one Langfuse session (the room name),
    # and flush pending spans when the call ends so the trace lands promptly.
    _LF_SESSION.set(ctx.room.name)

    # If this is a real phone call (SIP), log it to the telephony call list.
    try:
        await _register_phone_call(ctx)
    except Exception as exc:
        logger.warning("could not register phone call: %s", exc)
    if _LF_PROVIDER is not None:
        async def _flush_traces() -> None:
            try:
                _LF_PROVIDER.force_flush()
            except Exception:
                pass
        ctx.add_shutdown_callback(_flush_traces)

    config = await backend.fetch_agent_config()
    workflows = await backend.fetch_active_workflows()

    # optional structured conversation flow (Ability): prepend its compiled
    # step-script to the agent's instructions so the model follows it.
    ability = await backend.fetch_compiled_ability(config.get("ability_id", ""))
    if ability and ability.get("script"):
        config["system_prompt"] = (
            config.get("system_prompt", "")
            + f"\n\n=== CONVERSATION FLOW: {ability.get('name', '')} ===\n"
            "The MOMENT the caller's intent matches this flow, enter it in the SAME reply. "
            "Do not stall with a generic acknowledgement like 'sure, I can help with that' "
            "and then wait for another turn — recognise the intent and begin the first step "
            "right away. Follow the steps in order, adapting naturally — never read verbatim:\n"
            + ability["script"]
        )

    # Give the agent its employer up front. Without this it answers "who are
    # you" by announcing a knowledge base lookup, which is both slow and sounds
    # like software. Identity facts belong in the prompt; the knowledge base is
    # for reference material the agent looks up on demand.
    try:
        business = await backend.business_prompt()
    except Exception as exc:
        business, _ = "", logger.warning("could not load business profile: %s", exc)
    if business:
        config["system_prompt"] = (
            config.get("system_prompt", "")
            + "\n\n=== " + business
            + "\n\nNever announce a lookup. Do not say 'let me check' or 'searching the "
              "knowledge base' — the caller does not care how you know. Answer, or say "
              "you will find out and follow up."
        )
        logger.info("business profile loaded (%d chars)", len(business))
    else:
        logger.warning("no business profile set: agent does not know who it works for")

    # Tell the agent what flows it can run, so it can route a caller to the right
    # one instead of improvising. This is separate from the single attached
    # ability above: those flows are dispatched as tools mid-conversation.
    abilities_ctx = _abilities_overview(workflows)
    if abilities_ctx:
        config["system_prompt"] = config.get("system_prompt", "") + "\n\n=== " + abilities_ctx
        logger.info("abilities context: %d flow(s)", len(workflows))

    # ── telephony routing: transfer directory + this line's owner and IVR menu ──
    # Loaded so transfer_to_teammate can resolve names/extensions, and so an
    # IVR configured on the dialed number is presented and routed by the agent.
    config["_transfer_targets"] = await backend.fetch_transfer_targets()
    dialed = ""
    for p in list(ctx.room.remote_participants.values()):
        attrs = dict(getattr(p, "attributes", {}) or {})
        dialed = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to") or ""
        if dialed:
            break
    routing = await backend.fetch_routing(dialed) if dialed else {"found": False}
    if routing.get("found"):
        ivr = routing.get("ivr") or {}
        if ivr.get("enabled") and ivr.get("options"):
            lines = []
            for o in ivr["options"]:
                action = o.get("action", "")
                if action in ("agent", "extension"):
                    tgt = "transfer_to_teammate with '" + (o.get("resolved", {}).get("name") or o.get("target", "")) + "'"
                elif action == "external":
                    tgt = "transfer_to_number to " + o.get("target", "")
                elif action == "voicemail":
                    tgt = "offer to take a message"
                else:
                    tgt = "handle it yourself"
                lines.append(f"  - {o.get('key')}. {o.get('label')} → {tgt}")
            greeting = ivr.get("greeting") or "How can I help you today?"
            config["system_prompt"] += (
                "\n\n=== CALL MENU ===\nThis line has a menu. Open with a short version of: "
                f"'{greeting}' Then, based on what the caller says (they may say the option name "
                "or its number), route them:\n" + "\n".join(lines)
                + "\nRoute as soon as their intent is clear. Do not read the menu like a robot; "
                "offer it naturally."
            )
        am = routing.get("assigned_member")
        if am and am.get("name"):
            config["system_prompt"] += (
                f"\n\nThis line belongs to {am['name']}. If the caller asks for a person, or you "
                f"cannot help, offer to put them through to {am['name']} using transfer_to_teammate."
            )

    # studio-configured integrations → callable tools (Composio apps, custom HTTP
    # actions, MCP servers). Empty/none if not configured — never blocks a call.
    integ_data = await fetch_agent_tools()
    integration_tools = build_integration_tools(integ_data)
    mcp_servers = build_mcp_servers(integ_data)

    # Scope tools to what this call can actually use.
    #
    # Every tool schema is sent on every turn, so loading the whole workspace is
    # what pushes the request over the model's token budget: 20 connected tools
    # was ~10k tokens per turn against a 6k limit, and every LLM call 413'd. A
    # pathway already declares the tools its Act nodes need, so honour that and
    # leave the rest out. It also sharpens tool choice: fewer, relevant options.
    if ability and ability.get("script"):
        # A pathway states exactly which tools its Act nodes call, so it is the
        # authority: if it names none, the call needs none. Loading "a few just
        # in case" is what blew the budget — a pure ask/speak booking flow was
        # carrying thousands of tokens of tool schema it could never use.
        wanted = {(t.get("ref") or "").lower() for t in ability.get("tools", []) if t.get("ref")}
        before = len(integration_tools)
        integration_tools = [
            fn for fn in integration_tools
            if any(w in getattr(fn, "__name__", "").lower() for w in wanted)
        ] if wanted else []
        logger.info("pathway declares %d tool(s): loading %d of %d integrations",
                    len(wanted), len(integration_tools), before)
    elif len(integration_tools) > MAX_UNSCOPED_TOOLS:
        # free form call with no pathway: keep a working set, not the whole workspace
        logger.warning("no pathway; capping %d tools to %d to stay within the token budget",
                       len(integration_tools), MAX_UNSCOPED_TOOLS)
        integration_tools = integration_tools[:MAX_UNSCOPED_TOOLS]

    logger.info("session config: llm=%s stt=%s/%s workflows=%d integrations=%d mcp=%d",
                config["llm_model"], config["stt_model"], config["stt_language"],
                len(workflows), len(integration_tools), len(mcp_servers))

    engine = (config.get("voice_engine") or "cascade").lower()
    if engine == "realtime":
        # Speech-to-speech: the RealtimeModel does STT+LLM+TTS itself and runs its
        # own server-side turn detection, so no vad/stt/tts/turn_detection here.
        # A TTS engine is still attached so session.say() can speak exact scripted
        # pathway lines verbatim — the documented hybrid that keeps the pathway's
        # wording deterministic while the model handles open conversation.
        session_kwargs = dict(
            llm=_build_realtime(config),
            allow_interruptions=bool(config.get("allow_interruptions", True)),
        )
        try:
            session_kwargs["tts"] = _build_tts(config)
        except Exception as exc:
            logger.warning("realtime: no TTS for say() fallback: %s", exc)
    else:
        session_kwargs = dict(
            vad=ctx.proc.userdata["vad"],
            stt=_build_stt(config),
            llm=_build_llm(config),
            tts=_build_tts(config),
            turn_detection=MultilingualModel(),
            allow_interruptions=bool(config.get("allow_interruptions", True)),
            min_interruption_duration=float(config.get("min_interruption_duration", 0.55)),
            min_endpointing_delay=float(config.get("min_endpointing_delay", 0.40)),
            max_endpointing_delay=float(config.get("max_endpointing_delay", 6.0)),
            # start LLM+TTS on interim transcript; discard if the user keeps talking.
            # buys back 200-400ms without changing perceived turn-taking.
            preemptive_generation=True,
        )
    if mcp_servers:
        session_kwargs["mcp_servers"] = mcp_servers
    try:
        session = AgentSession(
            **session_kwargs,
            # a cough should not kill the agent's answer: if the "interruption"
            # produces no words, resume the interrupted speech.
            resume_false_interruption=True,
            false_interruption_timeout=1.0,
        )
    except TypeError:
        # drop optional kwargs this SDK version doesn't accept, newest first
        session_kwargs.pop("mcp_servers", None)
        session = AgentSession(**session_kwargs)

    # ── observability: per-turn latency → room data + shutdown transcript ──
    usage = metrics.UsageCollector()
    turn: dict = {}

    def _publish(payload: dict) -> None:
        async def _send():
            try:
                await ctx.room.local_participant.publish_data(
                    json.dumps(payload).encode(), reliable=True, topic="agent_metrics"
                )
            except Exception:
                pass
        asyncio.create_task(_send())

    @session.on("metrics_collected")
    def _on_metrics(ev: MetricsCollectedEvent) -> None:
        usage.collect(ev.metrics)
        m = ev.metrics
        kind = type(m).__name__
        if kind == "EOUMetrics":
            turn["eou_ms"] = round(m.end_of_utterance_delay * 1000, 1)
            turn["transcription_ms"] = round(m.transcription_delay * 1000, 1)
        elif kind == "LLMMetrics":
            turn["llm_ttft_ms"] = round(m.ttft * 1000, 1)
        elif kind == "TTSMetrics":
            turn["tts_ttfb_ms"] = round(m.ttfb * 1000, 1)
            total = turn.get("eou_ms", 0) + turn.get("llm_ttft_ms", 0) + turn.get("tts_ttfb_ms", 0)
            _publish({"type": "turn_latency", **turn, "total_ms": round(total, 1)})
            turn.clear()

    async def _save_transcript() -> None:
        items = []
        for item in session.history.items:
            if getattr(item, "type", "") == "message":
                items.append({"role": item.role, "text": item.text_content or ""})
        summary = {}
        try:
            s = usage.get_summary()
            summary = {k: getattr(s, k) for k in
                       ("llm_prompt_tokens", "llm_completion_tokens", "tts_characters_count",
                        "stt_audio_duration") if hasattr(s, k)}
        except Exception:
            pass
        await backend.save_transcript(ctx.room.name, items, summary)

    ctx.add_shutdown_callback(_save_transcript)

    # ── start ───────────────────────────────────────────────────────────
    workflow_tools = build_workflow_tools(workflows, config)

    entry_wf = call_start_workflow(workflows)
    if entry_wf is not None:
        agent: Agent = WorkflowAgent(entry_wf, config)
    else:
        agent = BusinessAgent(config, workflow_tools + integration_tools)

    room_input = RoomInputOptions()
    if noise_cancellation is not None:
        try:
            room_input = RoomInputOptions(noise_cancellation=noise_cancellation.BVC())
        except Exception:
            pass

    # Graceful degradation: if the LLM/STT/TTS provider errors mid-call (e.g. an
    # xAI 403 "no credits", a rate limit, an outage), speak an apology instead of
    # leaving the caller in dead air. Guarded so an unknown event name is a no-op.
    _spoke_error = {"at": 0.0}

    @session.on("error")
    def _on_error(ev) -> None:
        err = getattr(ev, "error", ev)
        logger.error("session error: %r", err)

        async def _apologize():
            try:
                await session.say(
                    "Sorry, I'm having trouble on my end right now. Please try again in a moment.",
                    allow_interruptions=True,
                )
            except Exception:
                pass

        # throttle so repeated per-turn failures don't stack apologies
        import time as _t
        if _t.monotonic() - _spoke_error["at"] > 8:
            _spoke_error["at"] = _t.monotonic()
            asyncio.create_task(_apologize())

    await session.start(room=ctx.room, agent=agent, room_input_options=room_input)


# Every var here is load-bearing for a call: without any one of them a job
# either can't dispatch (LiveKit) or crashes the moment the session is built
# (STT/LLM/TTS). Idling on a clear message beats accepting calls we'll crash
# on — the xAI LLM plugin, notably, validates its key eagerly and dies with a
# misleading "OPENAI_API_KEY" error, which is exactly the confusion to avoid.
REQUIRED_CREDS = {
    "LIVEKIT_URL": "LiveKit — https://cloud.livekit.io",
    "LIVEKIT_API_KEY": "LiveKit — https://cloud.livekit.io",
    "LIVEKIT_API_SECRET": "LiveKit — https://cloud.livekit.io",
    "DEEPGRAM_API_KEY": "Deepgram STT — https://console.deepgram.com",
    "XAI_API_KEY": "xAI Grok LLM — https://console.x.ai",
    "ELEVEN_API_KEY": "ElevenLabs TTS — https://elevenlabs.io",
}


def _preflight() -> None:
    """Fail loud but calm when required credentials are missing.

    Without these the worker either can't register/dispatch or crash-loops a
    raw traceback per call under `restart: unless-stopped`. For a one-command
    stack that reads as "broken" when it's really "unconfigured", so we print
    one clear instruction and idle instead — the container stays up, logs stay
    clean, and the moment the operator fills in .env and recreates the agent it
    connects. Only applies to the long-running commands (start/dev/connect),
    never to utility subcommands like `download-files`.
    """
    import sys
    import time

    runtime_cmds = {"start", "dev", "connect"}
    if not (runtime_cmds & set(sys.argv[1:])):
        return
    missing = [k for k in REQUIRED_CREDS if not os.getenv(k)]
    if not missing:
        return
    detail = "; ".join(f"{k} ({REQUIRED_CREDS[k]})" for k in missing)
    logging.getLogger("voice-agent").error(
        "Missing required credentials — the voice worker cannot serve calls. "
        "Set these in .env, then `docker compose up -d --force-recreate agent`:\n  %s\n"
        "Idling — the API, web, and studio run fine without me.",
        detail,
    )
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    _preflight()
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
