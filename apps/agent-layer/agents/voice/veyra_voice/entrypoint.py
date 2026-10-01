"""The LiveKit job: one call, from ring to the silent post-call pass.

Order matters on the greeting path and every step here is placed for it:

1. connect to the room and read the SIP numbers off the participant;
2. **one** app round trip — ``inbound_call`` — for everything the talker needs;
3. build the pipeline from that context and start the session; greet;
4. the worker's prompt and tools are built from the same context, so there is
   no second fetch before the first delegation.

On shutdown: push the final transcript, run the post-call pass, report the
call as ended with its duration and the worker's summary of what happened.

Run: ``python -m veyra_voice dev`` (needs LIVEKIT_*, DEEPGRAM_API_KEY,
ELEVEN_API_KEY, an LLM key, APP_LAYER_URL and AGENT_SHARED_SECRET).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

from livekit.agents import AgentSession, JobContext, JobExecutorType, JobProcess, WorkerOptions, cli
from livekit.agents.voice import room_io
from livekit.plugins import silero

# LiveKit plugins register themselves on import and refuse to do so off the
# main thread ("Plugins must be registered on the main thread"). The pipeline
# picks providers per call, so import every one it may use here, at worker
# start, not lazily inside the job.
from livekit.plugins import cartesia, deepgram, openai  # noqa: F401,E402

# The text turn-detector plugin registers an inference process that holds its
# model in memory (hundreds of MB), so it is imported only when chosen
# (VOICE_TURN_DETECTOR=text) and never on a low-memory host. The default audio
# detector is part of livekit-agents and runs in-process.
_LOW_MEMORY = os.getenv("VOICE_LOW_MEMORY", "").strip().lower() in {"1", "true", "yes"}
_TEXT_TURNS = (os.getenv("VOICE_TURN_DETECTOR") or "").strip().lower() == "text" and not _LOW_MEMORY
for _optional in ("livekit.plugins.elevenlabs", "livekit.plugins.azure", "livekit.plugins.noise_cancellation", *(("livekit.plugins.turn_detector.multilingual",) if _TEXT_TURNS else ())):
    try:
        __import__(_optional)
    except Exception:  # noqa: BLE001 — optional: the pipeline falls back when one is missing
        pass

from app_sdk import AppSdk, AppSdkError, NotFound
from veyra_harness.assembly import build_worker
from veyra_harness.llm import OpenAIChatModel
from veyra_harness.models import DEFAULT_WORKER
from veyra_harness.tracing import setup_tracing
from veyra_harness.prompt import async_options, post_call_instructions, talker_instructions
from veyra_harness.state import CallState
from veyra_harness.transcript import transcript_items

from .front_desk import FrontAgent
from .latency import TurnLatency, log_line
from .pipeline import build_session_kwargs, select_pipeline, warm_turn_detector

logger = logging.getLogger("veyra.voice")

TRANSCRIPT_PUSH_SECONDS = 15.0


def prewarm(proc: JobProcess) -> None:
    # Langfuse via OTLP, once per worker process. LiveKit's own spans (LLM,
    # TTS, STT, tool calls) join the harness's under one trace per call.
    provider = setup_tracing(service="veyra-voice")
    if provider is not None:
        try:
            from livekit.agents.telemetry import set_tracer_provider

            set_tracer_provider(provider, metadata={"langfuse.trace.name": "Voice call", "langfuse.trace.tags": ["voice"]})
        except Exception as e:  # noqa: BLE001
            logger.warning("voice.tracing_not_attached %s", e)
    # Everything a call would otherwise load on its own event loop happens
    # here, once per process, before the process is offered a job: the VAD
    # weights, and the turn detector's first huggingface_hub lookup (seen in
    # production as 150–620 ms loop stalls on every call).
    proc.userdata["vad"] = silero.VAD.load(min_silence_duration=float(os.getenv("VAD_MIN_SILENCE", "0.40")), activation_threshold=float(os.getenv("VAD_ACTIVATION_THRESHOLD", "0.55")))
    warm_turn_detector()
    share_tls_context()


def share_tls_context() -> None:
    """Build LiveKit's TLS context once per process instead of once per call.

    The plugins share one aiohttp session per job, created lazily by the
    first plugin that needs it — Deepgram, the moment the caller first
    speaks — and creating it loads the CA store on the event loop: 0.3–1.3 s
    measured, landing on the caller's first turn. An SSLContext is safe to
    reuse, so it is made here and handed to every session after.
    """
    try:
        from livekit.agents.utils import http_context

        build = getattr(http_context, "_create_ssl_context", None)
        if build is None or getattr(build, "_veyra_shared", False):
            return
        context = build()

        def shared() -> Any:
            return context

        shared._veyra_shared = True  # type: ignore[attr-defined]
        http_context._create_ssl_context = shared
    except Exception as e:  # noqa: BLE001 — an optimisation; the per-call path still works
        logger.warning("voice.tls_share_failed %s", e)


def sip_numbers(participant: Any) -> tuple[str, str] | None:
    attrs = dict(getattr(participant, "attributes", {}) or {})
    caller = attrs.get("sip.phoneNumber") or attrs.get("sip.from") or ""
    called = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to") or ""
    identity = getattr(participant, "identity", "") or ""
    if caller or called or identity.startswith("sip_"):
        return caller, called
    return None


async def _numbers_for(ctx: JobContext) -> tuple[str, str, str]:
    """(from, to, provider_sid). A web demo room has no SIP leg: use the default line and the participant identity."""
    for _ in range(20):
        for p in list(ctx.room.remote_participants.values()):
            nums = sip_numbers(p)
            if nums is not None:
                attrs = dict(getattr(p, "attributes", {}) or {})
                return nums[0], nums[1], attrs.get("sip.callID") or attrs.get("sip.callId") or f"{ctx.room.name}"
            identity = getattr(p, "identity", "")
            if identity:
                return f"+0{abs(hash(identity)) % 10**9:09d}", os.getenv("VEYRA_DEFAULT_LINE", ""), ctx.room.name
        await asyncio.sleep(0.1)
    return "", os.getenv("VEYRA_DEFAULT_LINE", ""), ctx.room.name


def _room_name(ctx: JobContext) -> str:
    """The room's name from the job, which is known before connecting."""
    job_room = getattr(getattr(ctx, "job", None), "room", None)
    return getattr(job_room, "name", "") or ctx.room.name


async def entrypoint(ctx: JobContext) -> None:
    started = time.monotonic()

    # Every HTTP client built here loads a CA bundle synchronously (0.3–1 s
    # measured, on the loop that will carry the call's audio), so clients are
    # built in a thread.
    sdk = await asyncio.to_thread(AppSdk, timeout=8.0)
    # A browser session (Studio Talk) runs in a room the app created and
    # named "web-…"; everything after this lookup is identical to a call.
    room_name = _room_name(ctx)
    web_session = room_name.startswith("web-")
    try:
        if web_session:
            # The room name is all the lookup needs, so the app round trip
            # (Mumbai → Ohio in production, ~0.7–1.1 s) overlaps the room
            # connection instead of following it.
            lookup = asyncio.ensure_future(sdk.web_call(room=room_name))
            try:
                await ctx.connect()
            except BaseException:
                lookup.cancel()
                raise
            call_ctx = await lookup
        else:
            await ctx.connect()
            from_number, to_number, sid = await _numbers_for(ctx)
            call_ctx = await sdk.inbound_call(to=to_number, from_=from_number, provider="livekit", provider_sid=sid, room=ctx.room.name)
    except NotFound:
        logger.error("voice.unknown_%s room=%s — no organization owns this %s; hanging up", "room" if web_session else "line", room_name, "session" if web_session else "number")
        await sdk.aclose()
        return
    except AppSdkError as e:
        logger.error("voice.app_unavailable %s — cannot answer without a tenant", e)
        await sdk.aclose()
        return

    app = sdk.for_organization(call_ctx.organization.id)
    state = CallState(sdk=app, context=call_ctx)
    spec = select_pipeline(call_ctx)
    logger.info("voice.call org=%s call=%s lang=%s stt=%s/%s tts=%s/%s turns=%s talker=%s worker=%s t+%.0fms",
                call_ctx.organization.slug, call_ctx.call.id, spec.language, spec.stt_model, spec.stt_language, spec.tts_provider, spec.tts_voice, spec.semantic_turns, spec.talker_model, spec.worker_model, (time.monotonic() - started) * 1000)
    for note in spec.notes:
        logger.info("voice.pipeline_note %s", note)

    # The worker, assembled the same way as on every other surface: every
    # enabled worker expert as a persona (switch_expert routes between them),
    # step-gated skills, each expert's own model and reasoning effort.
    if not call_ctx.workers:
        logger.warning("voice.no_worker_expert: delegation will fail honestly")
    # Building the model clients loads the CA bundle synchronously (seconds on
    # a busy host, measured 6.6 s), so it happens off the loop that carries audio.
    worker = await asyncio.to_thread(
        build_worker,
        surface="voice", context=call_ctx, sdk=app, state=state, call=call_ctx,
        model_factory=lambda effort, ref: OpenAIChatModel.from_ref(ref, default=DEFAULT_WORKER, temperature=0.2, max_tokens=2000, reasoning_effort=effort),
        model_override=os.getenv("WORKER_MODEL"),
    )
    agent = FrontAgent(instructions=talker_instructions(call_ctx, call_ctx), worker=worker, state=state, finalization_instructions=post_call_instructions())

    def publish(payload: dict[str, Any], topic: str = "agent_metrics") -> None:
        async def send() -> None:
            try:
                await ctx.room.local_participant.publish_data(json.dumps(payload).encode(), reliable=True, topic=topic)
            except Exception:  # noqa: BLE001 — a closed room must not kill the call
                pass

        asyncio.create_task(send())

    # The worker's tool steps, live, for a browser that shows them (Studio
    # Talk); a phone has nobody to show them to, and publishing is harmless.
    async def on_tool(event: dict[str, Any]) -> None:
        publish({k: event.get(k) for k in ("id", "name", "status", "label", "detail", "summary", "ms", "expert", "expert_name")}, topic="agent_activity")

    worker.observer = on_tool

    # Plugin clients (the talker LLM's above all) are built off the loop; turn
    # options go through 1.8's turn_handling, never the deprecated keywords.
    session_kwargs = await asyncio.to_thread(build_session_kwargs, spec, vad=ctx.proc.userdata["vad"])
    session = AgentSession(**session_kwargs, tool_handling=async_options())  # type: ignore[arg-type]

    # ── observability: one latency line per turn, to the log and the room ──
    # From ChatMessage.metrics (metrics_collected is deprecated in 1.8): the
    # user item carries end-of-turn and transcript delays, the reply carries
    # LLM TTFT, TTS TTFB and the measured voice-to-voice gap.
    latency = TurnLatency()

    @session.on("conversation_item_added")
    def on_item(ev: Any) -> None:
        logger.debug("voice.item role=%s interrupted=%s metrics=%s", getattr(ev.item, "role", None), getattr(ev.item, "interrupted", None), sorted(getattr(ev.item, "metrics", None) or {}))
        record = latency.on_item(ev.item)
        if record is not None:
            logger.info("voice.turn call=%s %s", call_ctx.call.id, log_line(record))
            publish({"type": "turn_latency", **record})

    # ── transcript pushes: replaced whole, so a retry never duplicates a turn ──
    async def push_transcript() -> None:
        items = transcript_items(session.history.items)
        if items:
            try:
                await app.push_transcript(call_ctx.call.id, items)
            except AppSdkError as e:
                logger.warning("voice.transcript_push_failed %s", e)

    async def periodic_push() -> None:
        while True:
            await asyncio.sleep(TRANSCRIPT_PUSH_SECONDS)
            await push_transcript()

    pusher = asyncio.create_task(periodic_push())

    async def on_shutdown() -> None:
        pusher.cancel()
        duration = int(time.monotonic() - started)
        try:
            await push_transcript()
            result = await asyncio.wait_for(agent.finalize_after_call(), timeout=90)
            summary = result.reply[:2000] if result.reply else None
            logger.info("voice.post_call outcome=%s actions=%s", result.outcome, result.action_names)
        except Exception as e:  # noqa: BLE001
            logger.exception("voice.post_call_failed %s", e)
            summary = None
        v2v = latency.summary()
        logger.info("voice.latency call=%s p50=%s p95=%s turns=%s", call_ctx.call.id, v2v["p50"], v2v["p95"], v2v["turns"])
        try:
            await app.call_event(call_ctx.call.id, "ended", duration_sec=duration, summary=summary, metrics={"voice_to_voice": v2v, "worker_tokens": worker.tokens})
        except AppSdkError as e:
            logger.warning("voice.call_end_report_failed %s", e)
        finally:
            await sdk.aclose()

    ctx.add_shutdown_callback(on_shutdown)

    audio_input = room_io.AudioInputOptions()
    # Noise cancellation earns its CPU on a phone line. A browser already runs
    # echo cancellation and noise suppression on the microphone, and running
    # BVC on top of it in-process blocked the event loop long enough to
    # break the agent's audio into gaps.
    if not web_session:
        try:
            from livekit.plugins import noise_cancellation

            audio_input = room_io.AudioInputOptions(noise_cancellation=noise_cancellation.BVC())
        except Exception:  # noqa: BLE001
            pass

    await session.start(room=ctx.room, agent=agent, room_options=room_io.RoomOptions(audio_input=audio_input))
    try:
        await app.call_event(call_ctx.call.id, "answered")
    except AppSdkError:
        pass


REQUIRED = {
    "LIVEKIT_URL": "LiveKit", "LIVEKIT_API_KEY": "LiveKit", "LIVEKIT_API_SECRET": "LiveKit",
    "DEEPGRAM_API_KEY": "Deepgram STT",
    "APP_LAYER_URL": "the Laravel app", "AGENT_SHARED_SECRET": "the contract secret",
}


def preflight() -> None:
    import sys

    if not ({"start", "dev", "connect"} & set(sys.argv[1:])):
        return
    missing = [k for k in REQUIRED if not os.getenv(k)]
    # Any one working voice engine is enough; the pipeline picks per language.
    if not (os.getenv("CARTESIA_API_KEY") or os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY") or os.getenv("AZURE_SPEECH_KEY")):
        missing.append("a TTS key (CARTESIA_API_KEY, ELEVEN_API_KEY or AZURE_SPEECH_KEY)")
    if not (os.getenv("LLM_API_KEY") or os.getenv("XAI_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("GROQ_API_KEY")):
        missing.append("LLM_API_KEY (or XAI_API_KEY / OPENAI_API_KEY / GROQ_API_KEY)")
    if missing:
        logging.getLogger("veyra.voice").error("Missing credentials, the voice worker cannot serve calls: %s. Idling.", ", ".join(f"{k} ({REQUIRED.get(k, 'LLM')})" for k in missing))
        while True:
            time.sleep(3600)


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    preflight()
    # Each call in its own process, one kept warm: a call must never share an
    # event loop with the worker's housekeeping or another call, or a blocked
    # loop turns into gaps in the agent's voice. (The Windows dev default ran
    # jobs as threads in one process.)
    # A low-memory host cannot afford a process per call (each loads the VAD
    # and every plugin again), so there calls share the worker's process.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm, job_executor_type=JobExecutorType.THREAD if _LOW_MEMORY else JobExecutorType.PROCESS,
                              num_idle_processes=int(os.getenv("VOICE_IDLE_PROCESSES", "1")),
                              # Loading the VAD and plugins in a fresh process took longer than
                              # LiveKit's 10 s default on a busy machine, and the process was killed.
                              initialize_process_timeout=float(os.getenv("VOICE_PROCESS_INIT_TIMEOUT", "90"))))
