# syntax=docker/dockerfile:1.7
#
# The agent-layer gateway, attached to the app layer's compose stack.
#
# The pip cache is a BuildKit cache mount, and transfers are retried with a
# long timeout: PyPI downloads truncate on the network this repo is developed
# on, and a persistent cache means a retry resumes rather than restarts.
#
# Only the gateway's dependencies are installed. The LiveKit voice worker is a
# separate, much heavier image (onnxruntime, turn-detector weights) and runs
# only once a SIP trunk exists; see apps/agent-layer/README.md.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120

WORKDIR /srv

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 15 \
        "fastapi>=0.115" \
        "uvicorn>=0.30" \
        "httpx>=0.27" \
        "pydantic>=2.6" \
        "openai>=1.40" \
        "opentelemetry-sdk>=1.20" \
        "opentelemetry-exporter-otlp-proto-http>=1.20"

COPY packages/common /srv/packages/common
COPY gateway /srv/gateway

ENV PYTHONPATH=/srv/packages/common:/srv/gateway \
    GATEWAY_HOST=0.0.0.0 \
    GATEWAY_PORT=8100

EXPOSE 8100

CMD ["python", "-m", "veyra_gateway"]
