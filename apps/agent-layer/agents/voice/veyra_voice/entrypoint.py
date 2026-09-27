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

from livekit.agents import AgentSession, JobContext, JobProcess, MetricsCollectedEvent, RoomInputOptions, WorkerOptions, cli, metrics
from livekit.plugins import silero

from app_sdk import AppSdk, AppSdkError, NotFound
from veyra_harness.actions import tools_for_expert
from veyra_harness.executor import ActionExecutor, ExecutionScope
from veyra_harness.llm import OpenAIChatModel
from veyra_harness.models import DEFAULT_WORKER
from veyra_harness.tracing import setup_tracing
from veyra_harness.prompt import async_options, post_call_instructions, talker_instructions, worker_instructions
from veyra_harness.state import CallState
from veyra_harness.transcript import transcript_items
from veyra_harness.worker import Worker

from .front_desk import FrontAgent
from .pipeline import build_session_kwargs, select_pipeline

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
    proc.userdata["vad"] = silero.VAD.load(min_silence_duration=float(os.getenv("VAD_MIN_SILENCE", "0.40")), activation_threshold=float(os.getenv("VAD_ACTIVATION_THRESHOLD", "0.55")))


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


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    started = time.monotonic()
    from_number, to_number, sid = await _numbers_for(ctx)

    sdk = AppSdk(timeout=8.0)
    try:
        call_ctx = await sdk.inbound_call(to=to_number, from_=from_number, provider="livekit", provider_sid=sid, room=ctx.room.name)
    except NotFound:
        logger.error("voice.unknown_line to=%s — no organization owns this number; hanging up", to_number)
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

    # The worker: one expert for now, the first worker-runtime one. Peer
    # routing between several workers is the next slice.
    expert = call_ctx.workers[0] if call_ctx.workers else None
    if expert is None:
        logger.warning("voice.no_worker_expert: delegation will fail honestly")
    tools = tools_for_expert(expert, call_ctx) if expert else []
    executor = ActionExecutor(app, scope=ExecutionScope(call_id=call_ctx.call.id, expert_slug=expert.slug if expert else None))
    worker = Worker(
        model=OpenAIChatModel.from_ref(spec.worker_model, default=DEFAULT_WORKER, temperature=0.2, max_tokens=2000, reasoning_effort=expert.reasoning_effort if expert else None),
        instructions=worker_instructions(call_ctx, expert, call_ctx) if expert else "There is no expert configured. Reply that the request cannot be handled.",
        tools=tools, executor=executor, state=state,
    )
    agent = FrontAgent(instructions=talker_instructions(call_ctx, call_ctx), worker=worker, state=state, finalization_instructions=post_call_instructions())

    session_kwargs = build_session_kwargs(spec, vad=ctx.proc.userdata["vad"])
    try:
        session = AgentSession(**session_kwargs, resume_false_interruption=True, false_interruption_timeout=1.0, tool_handling=async_options())  # type: ignore[arg-type]
    except TypeError:
        session_kwargs.pop("preemptive_generation", None)
        session = AgentSession(**session_kwargs)

    # ── observability: per-turn latency to the room, usage for the summary ──
    usage = metrics.UsageCollector()
    turn: dict[str, float] = {}
    latencies: list[float] = []

    def publish(payload: dict[str, Any]) -> None:
        async def send() -> None:
            with_room = ctx.room.local_participant
            try:
                await with_room.publish_data(json.dumps(payload).encode(), reliable=True, topic="agent_metrics")
            except Exception:  # noqa: BLE001
                pass

        asyncio.create_task(send())

    @session.on("metrics_collected")
    def on_metrics(ev: MetricsCollectedEvent) -> None:
        usage.collect(ev.metrics)
        m = ev.metrics
        kind = type(m).__name__
        if kind == "EOUMetrics":
            turn["eou_ms"] = round(m.end_of_utterance_delay * 1000, 1)
        elif kind == "LLMMetrics":
            turn["llm_ttft_ms"] = round(m.ttft * 1000, 1)
        elif kind == "TTSMetrics":
            turn["tts_ttfb_ms"] = round(m.ttfb * 1000, 1)
            total = turn.get("eou_ms", 0) + turn.get("llm_ttft_ms", 0) + turn.get("tts_ttfb_ms", 0)
            latencies.append(total)
            publish({"type": "turn_latency", **turn, "total_ms": round(total, 1)})
            turn.clear()

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
        p50 = sorted(latencies)[len(latencies) // 2] if latencies else None
        p95 = sorted(latencies)[int(len(latencies) * 0.95)] if latencies else None
        try:
            await app.call_event(call_ctx.call.id, "ended", duration_sec=duration, summary=summary, metrics={"voice_to_voice": {"p50": p50, "p95": p95, "turns": len(latencies)}, "worker_tokens": worker.tokens})
        except AppSdkError as e:
            logger.warning("voice.call_end_report_failed %s", e)
        finally:
            await sdk.aclose()

    ctx.add_shutdown_callback(on_shutdown)

    room_input = RoomInputOptions()
    try:
        from livekit.plugins import noise_cancellation

        room_input = RoomInputOptions(noise_cancellation=noise_cancellation.BVC())
    except Exception:  # noqa: BLE001
        pass

    await session.start(room=ctx.room, agent=agent, room_input_options=room_input)
    try:
        await app.call_event(call_ctx.call.id, "answered")
    except AppSdkError:
        pass


REQUIRED = {
    "LIVEKIT_URL": "LiveKit", "LIVEKIT_API_KEY": "LiveKit", "LIVEKIT_API_SECRET": "LiveKit",
    "DEEPGRAM_API_KEY": "Deepgram STT", "ELEVEN_API_KEY": "ElevenLabs TTS",
    "APP_LAYER_URL": "the Laravel app", "AGENT_SHARED_SECRET": "the contract secret",
}


def preflight() -> None:
    import sys

    if not ({"start", "dev", "connect"} & set(sys.argv[1:])):
        return
    missing = [k for k in REQUIRED if not os.getenv(k)]
    if not (os.getenv("LLM_API_KEY") or os.getenv("XAI_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("GROQ_API_KEY")):
        missing.append("LLM_API_KEY (or XAI_API_KEY / OPENAI_API_KEY / GROQ_API_KEY)")
    if missing:
        logging.getLogger("veyra.voice").error("Missing credentials, the voice worker cannot serve calls: %s. Idling.", ", ".join(f"{k} ({REQUIRED.get(k, 'LLM')})" for k in missing))
        while True:
            time.sleep(3600)


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    preflight()
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
