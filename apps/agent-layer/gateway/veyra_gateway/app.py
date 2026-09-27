"""The gateway's HTTP surface. See docs/agent-contract.md, "App → agent".

Authenticated with the same shared secret the app expects from us. Runs are
accepted and executed in the background: the app already wrote the row it
needs (the thread message, the queued run) and gets the result through the
contract, so an HTTP request that waited for the model would only add a
timeout to worry about.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Literal

import json

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app_sdk import AppSdk, AppSdkError

from .runner import TextRunner

logger = logging.getLogger("veyra.gateway")

CONTRACT = "v1"


class RunRequest(BaseModel):
    kind: Literal["thread", "automation"]
    organization_id: int
    thread_id: int | None = None
    external_id: str | None = None
    message: str | None = None
    run_id: int | None = None
    automation_id: int | None = None


class ThreadStreamRequest(BaseModel):
    organization_id: int
    thread_id: int
    message: str = Field(min_length=1, max_length=20000)
    # The readable history, so a gateway that restarted can continue the thread.
    history: list[dict[str, Any]] = Field(default_factory=list)


class SkillTestRequest(BaseModel):
    organization_id: int
    skill: str
    version: int | None = None
    scenario: str = Field(min_length=1, max_length=20000)


class OutboundCallRequest(BaseModel):
    organization_id: int
    to: str
    from_: str = Field(alias="from")
    goal: str
    context: dict[str, Any] = Field(default_factory=dict)


def create_app(*, sdk: AppSdk | None = None, runner: TextRunner | None = None, claim_interval: float | None = None) -> FastAPI:
    secret = os.getenv("AGENT_SHARED_SECRET", "")
    interval = float(os.getenv("GATEWAY_CLAIM_INTERVAL", "30")) if claim_interval is None else claim_interval

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        from veyra_harness.tracing import setup_tracing

        setup_tracing(service="veyra-gateway")
        app.state.sdk = sdk or AppSdk(timeout=15.0)
        app.state.runner = runner or TextRunner(app.state.sdk)
        app.state.tasks = set()
        app.state.claimer = asyncio.create_task(claim_loop(app, interval)) if interval > 0 else None
        try:
            yield
        finally:
            if app.state.claimer:
                app.state.claimer.cancel()
            for task in list(app.state.tasks):
                task.cancel()
            if sdk is None:
                await app.state.sdk.aclose()

    app = FastAPI(title="Veyra agent gateway", lifespan=lifespan)

    async def authenticated(request: Request) -> None:
        if not secret:
            raise HTTPException(401, "AGENT_SHARED_SECRET is not set on the agent layer.")
        given = request.headers.get("authorization", "")
        if not given.startswith("Bearer ") or not hmac.compare_digest(given[7:], secret):
            raise HTTPException(401, "Bearer token does not match AGENT_SHARED_SECRET.")

    def background(app_: FastAPI, coro) -> None:
        task = asyncio.create_task(coro)
        app_.state.tasks.add(task)
        task.add_done_callback(app_.state.tasks.discard)

    @app.get("/healthz")
    async def liveness() -> dict[str, bool]:
        """Unauthenticated liveness for a host's health check. Says nothing
        but "the process is up"; /v1/health is the authenticated detail."""
        return {"ok": True}

    @app.get("/v1/health")
    async def health(_: None = Depends(authenticated)) -> dict[str, Any]:
        app_ok: bool | None = None
        try:
            app_ok = (await app.state.sdk.health()).ok
        except AppSdkError:
            app_ok = False
        return {"ok": True, "contract": CONTRACT, "app_layer": app_ok, "claim_loop": bool(app.state.claimer)}

    @app.get("/v1/capabilities")
    async def capabilities_(_: None = Depends(authenticated)) -> dict[str, Any]:
        """Which model providers have keys, their curated models, the defaults, and which voice vendors are configured."""
        from veyra_harness.models import capabilities

        return await capabilities()

    @app.post("/v1/threads/stream")
    async def thread_stream(body: ThreadStreamRequest, _: None = Depends(authenticated)) -> StreamingResponse:
        """One Ask turn, streamed as server-sent events: status, delta, tool, done | error."""
        runner_: TextRunner = app.state.runner

        async def events():
            async for event in runner_.stream_thread(body.organization_id, body.thread_id, body.message, body.history):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/v1/runs", status_code=202)
    async def runs(body: RunRequest, _: None = Depends(authenticated)) -> dict[str, Any]:
        runner_: TextRunner = app.state.runner
        if body.kind == "thread":
            if body.thread_id is None or not body.message:
                raise HTTPException(422, "thread runs need thread_id and message")
            external_id = body.external_id or f"thr_{body.organization_id}_{body.thread_id}"
            background(app, runner_.run_thread(body.organization_id, body.thread_id, body.message, external_id))
            return {"accepted": True, "kind": "thread", "external_id": external_id}
        if body.run_id is None:
            raise HTTPException(422, "automation runs need run_id")

        async def run_one() -> None:
            try:
                job = await app.state.sdk.for_organization(body.organization_id).automation_run(body.run_id)
            except AppSdkError as e:
                logger.error("gateway.run_fetch_failed run=%s error=%s", body.run_id, e)
                return
            if job is not None:
                await runner_.run_automation(body.organization_id, job)

        background(app, run_one())
        return {"accepted": True, "kind": "automation", "run_id": body.run_id}

    @app.post("/v1/skills/test")
    async def skills_test(body: SkillTestRequest, _: None = Depends(authenticated)) -> dict[str, Any]:
        try:
            return await asyncio.wait_for(app.state.runner.test_skill(body.organization_id, body.skill, body.scenario), timeout=120)
        except asyncio.TimeoutError:
            raise HTTPException(504, "The skill test did not finish within 120s.")

    @app.post("/v1/calls/outbound", status_code=501)
    async def outbound(body: OutboundCallRequest, _: None = Depends(authenticated)) -> dict[str, Any]:
        # Honest 501: the outbound protocol (recipient confirmation, voicemail,
        # IVR) is the next slice. The app shows this message rather than a
        # spinner that never ends.
        return {"accepted": False, "error": "outbound_not_implemented", "message": "Outbound calling is not implemented in this agent layer yet."}

    return app


async def claim_loop(app: FastAPI, interval: float) -> None:
    """Pull queued and due automation runs across every tenant, forever."""
    await asyncio.sleep(min(interval, 5))
    while True:
        try:
            jobs = await app.state.sdk.claim_all_automations(limit=5)
            for job in jobs:
                if job.organization_id is None:
                    continue
                task = asyncio.create_task(app.state.runner.run_automation(job.organization_id, job))
                app.state.tasks.add(task)
                task.add_done_callback(app.state.tasks.discard)
        except asyncio.CancelledError:
            raise
        except AppSdkError as e:
            logger.warning("gateway.claim_failed %s", e)
        except Exception:  # noqa: BLE001
            logger.exception("gateway.claim_loop_error")
        await asyncio.sleep(interval)


def main() -> None:
    import uvicorn

    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    uvicorn.run(create_app(), host=os.getenv("GATEWAY_HOST", "0.0.0.0"), port=int(os.getenv("GATEWAY_PORT") or os.getenv("PORT") or "8100"))
