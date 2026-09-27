"""Langfuse tracing over OpenTelemetry, for every host of the harness.

Configured from ``LANGFUSE_PUBLIC_KEY`` / ``LANGFUSE_SECRET_KEY`` /
``LANGFUSE_HOST``; with no keys, ``span`` is a no-op and nothing else
changes. Each delegation and each tool call becomes a span, tagged with the
call or thread so one conversation reads as one trace in Langfuse.
"""

from __future__ import annotations

import base64
import contextlib
import logging
import os
from collections.abc import Iterator
from typing import Any

logger = logging.getLogger("veyra.harness.tracing")

_provider: Any = None
_tracer: Any = None


def setup_tracing(*, service: str) -> Any:
    """Install an OTLP exporter to Langfuse once per process. Returns the provider, or None without keys."""
    global _provider, _tracer
    if _provider is not None:
        return _provider
    public, secret = os.getenv("LANGFUSE_PUBLIC_KEY"), os.getenv("LANGFUSE_SECRET_KEY")
    if not (public and secret):
        return None
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as e:
        logger.warning("tracing.unavailable %s", e)
        return None

    host = (os.getenv("LANGFUSE_HOST") or "https://cloud.langfuse.com").rstrip("/")
    auth = base64.b64encode(f"{public}:{secret}".encode()).decode()
    provider = TracerProvider(resource=Resource.create({"service.name": service}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{host}/api/public/otel/v1/traces", headers={"Authorization": f"Basic {auth}"})))
    trace.set_tracer_provider(provider)
    _provider, _tracer = provider, trace.get_tracer("veyra")
    logger.info("tracing.enabled host=%s service=%s", host, service)
    return provider


def flush() -> None:
    if _provider is not None:
        with contextlib.suppress(Exception):
            _provider.force_flush(timeout_millis=5000)


@contextlib.contextmanager
def span(name: str, **attributes: Any) -> Iterator[Any]:
    """A span when tracing is on; a no-op otherwise. Attribute values are stringified past 400 chars."""
    if _tracer is None:
        yield None
        return
    with _tracer.start_as_current_span(name) as s:
        for key, value in attributes.items():
            if value is None:
                continue
            if isinstance(value, (str, int, float, bool)):
                s.set_attribute(key, value if not isinstance(value, str) else value[:400])
            else:
                s.set_attribute(key, str(value)[:400])
        yield s
