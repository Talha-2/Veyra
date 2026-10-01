# syntax=docker/dockerfile:1.7
#
# The LiveKit voice worker: answers Studio Talk sessions (and, later, phone
# calls) on the same talker/worker harness as the gateway. Build context is
# apps/agent-layer:
#
#   docker build -f agents/voice/Dockerfile -t veyra-voice .
#
# It needs no inbound port: the worker dials out to LiveKit Cloud and waits for
# jobs, and reaches the app over APP_LAYER_URL. Every native dependency ships
# arm64 wheels, so it runs on an Oracle Always Free Ampere VM as well as x86.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120

WORKDIR /srv

# Pinned to the versions proven locally: unpinned, pip's resolver wandered
# through aiohttp releases and gave up.
COPY agents/voice/constraints.txt /srv/constraints.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 15 -c /srv/constraints.txt \
        "livekit-agents==1.8.3" \
        "livekit-plugins-silero==1.8.3" \
        "livekit-plugins-turn-detector==1.8.3" \
        "livekit-plugins-deepgram==1.8.3" \
        "livekit-plugins-openai==1.8.3" \
        "livekit-plugins-cartesia==1.8.3" \
        "livekit-plugins-elevenlabs==1.8.3" \
        "httpx>=0.27" \
        "pydantic>=2.6" \
        "openai>=1.40" \
        "opentelemetry-sdk>=1.20" \
        "opentelemetry-exporter-otlp-proto-http>=1.20"

COPY packages/common /srv/packages/common
COPY agents/voice /srv/agents/voice

ENV PYTHONPATH=/srv/packages/common:/srv/agents/voice

# The VAD and turn-detector weights, baked into the image so a call never
# waits on a download. Needs every plugin importable, hence after the install.
# The default (audio) turn detector ships inside livekit-local-inference; the
# text one's plugin is only imported when chosen, so it is selected here to
# keep its weights in the image for VOICE_TURN_DETECTOR=text.
RUN VOICE_TURN_DETECTOR=text python -m veyra_voice download-files

CMD ["python", "-m", "veyra_voice", "start"]
