"""Public REST API (/v1) — the programmatic surface developers build against.

Auth: `Authorization: Bearer z360_sk_live_...` on every route.

Resources mirror the product's mental model, and the shapes follow the
conventions AI APIs have converged on (an `object` discriminator, `list`
envelopes, type prefixed ids) so a generated SDK feels familiar on day one:

  agents      a prompt + goal + tools, executed as `runs`
  runs        one execution of an agent (async by default, ?wait=true blocks)
  workflows   the node graph a voice agent follows on a call
  calls       a live voice session; POST mints a browser token so a developer
              can start a call from inside their own app
  tools       everything the agent can call (apps, HTTP actions, MCP)

The OpenAPI 3.1 spec for exactly these routes is served at /v1/openapi.json and
is the single source of truth behind the SDKs, the reference docs, and the
in studio API playground.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..abilities.compiler import compile_ability
from ..abilities.models import Ability
from ..config import settings
from ..db import CallTranscript, get_session, new_id, now
from ..experts.models import Expert, ExpertRun
from ..experts.runtime import create_run, execute_run
from ..publicapi import webhooks
from ..publicapi.keys import ApiKey, require_api_key

router = APIRouter(prefix="/v1", tags=["public-api"])


# ── serializers ───────────────────────────────────────────────────────────


def _agent_out(e: Expert) -> dict:
    return {
        "id": e.id, "object": "agent", "name": e.name, "description": e.description,
        "kind": e.kind, "goal": e.goal, "triggers": e.triggers, "reasoning": e.reasoning,
        "status": e.status,
        "trigger_url": (
            f"{settings.public_base_url}/api/experts/trigger/{e.external_secret}"
            if e.external_secret else None
        ),
        "created_at": e.created_at.isoformat(), "updated_at": e.updated_at.isoformat(),
    }


def _run_out(r: ExpertRun) -> dict:
    status = {"running": "running", "done": "success", "error": "error"}.get(r.status, r.status)
    return {
        "id": r.id, "object": "run", "agent_id": r.expert_id, "status": status,
        "trigger": r.trigger, "input": r.input,
        "output": {"result": r.result} if r.result else None,
        "error": r.error, "usage": {"tokens": r.tokens},
        "created_at": r.started_at.isoformat(),
        "completed_at": r.ended_at.isoformat() if r.ended_at else None,
    }


def _workflow_out(a: Ability) -> dict:
    return {
        "id": a.id, "object": "workflow", "name": a.name, "description": a.description,
        "triggers": a.triggers, "enabled": a.enabled,
        "nodes": a.nodes, "start_node": a.start_node,
        "created_at": a.created_at.isoformat(), "updated_at": a.updated_at.isoformat(),
    }


def _call_out(t: CallTranscript) -> dict:
    return {
        "id": t.id, "object": "call", "room": t.room,
        "transcript": json.loads(t.items_json or "[]"),
        "metrics": json.loads(t.metrics_json or "{}"),
        "created_at": t.created_at.isoformat(),
    }


# ── key introspection: the first call a developer makes ───────────────────


@router.get("/me", summary="Verify an API key")
def me(key: ApiKey = Depends(require_api_key)):
    """Return the key this request authenticated with. Use it to check wiring."""
    return {"object": "api_key", "id": key.id, "name": key.name,
            "prefix": key.prefix, "workspace": key.workspace}


# ── agents ────────────────────────────────────────────────────────────────


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: str = ""
    goal: str = ""
    reasoning: str = "balanced"
    triggers: list[str] = ["external"]
    status: str = "active"


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    goal: str | None = None
    reasoning: str | None = None
    status: str | None = None


@router.get("/agents", summary="List agents")
def list_agents(key: ApiKey = Depends(require_api_key), session: Session = Depends(get_session)):
    rows = session.exec(select(Expert).order_by(Expert.updated_at.desc())).all()
    return {"object": "list", "data": [_agent_out(e) for e in rows]}


@router.post("/agents", status_code=201, summary="Create an agent")
def create_agent(body: AgentCreate, key: ApiKey = Depends(require_api_key),
                 session: Session = Depends(get_session)):
    e = Expert(
        id=new_id("exp"), name=body.name, description=body.description,
        system_prompt=body.system_prompt, goal=body.goal, reasoning=body.reasoning,
        status=body.status, triggers_json=json.dumps(body.triggers),
    )
    session.add(e)
    session.commit()
    return _agent_out(e)


@router.get("/agents/{agent_id}", summary="Get an agent")
def get_agent(agent_id: str, key: ApiKey = Depends(require_api_key),
              session: Session = Depends(get_session)):
    e = session.get(Expert, agent_id)
    if e is None:
        raise HTTPException(404, "agent not found")
    return _agent_out(e)


@router.patch("/agents/{agent_id}", summary="Update an agent")
def update_agent(agent_id: str, body: AgentUpdate, key: ApiKey = Depends(require_api_key),
                 session: Session = Depends(get_session)):
    e = session.get(Expert, agent_id)
    if e is None:
        raise HTTPException(404, "agent not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(e, field, value)
    e.updated_at = now()
    session.add(e)
    session.commit()
    return _agent_out(e)


@router.delete("/agents/{agent_id}", summary="Delete an agent")
def delete_agent(agent_id: str, key: ApiKey = Depends(require_api_key),
                 session: Session = Depends(get_session)):
    e = session.get(Expert, agent_id)
    if e is None:
        raise HTTPException(404, "agent not found")
    session.delete(e)
    session.commit()
    return {"id": agent_id, "object": "agent", "deleted": True}


# ── runs ──────────────────────────────────────────────────────────────────


class RunBody(BaseModel):
    input: dict | str = ""


@router.post("/agents/{agent_id}/runs", status_code=202, summary="Run an agent")
async def create_run_api(
    agent_id: str,
    body: RunBody,
    wait: bool = Query(default=False, description="Block until the run finishes"),
    key: ApiKey = Depends(require_api_key),
    session: Session = Depends(get_session),
):
    """Execute an agent. Returns a run id immediately; pass `?wait=true` to block
    until it finishes. A `run.completed` webhook fires either way."""
    e = session.get(Expert, agent_id)
    if e is None:
        raise HTTPException(404, "agent not found")
    input_text = body.input if isinstance(body.input, str) else json.dumps(body.input)
    run = create_run(session, e, "external", input_text)
    webhooks.emit("run.started", {"object": "run", "id": run.id, "agent_id": e.id})
    if wait:
        await execute_run(run.id)
        session.refresh(run)
        return _run_out(run)
    asyncio.create_task(execute_run(run.id))
    return _run_out(run)


@router.get("/runs", summary="List runs")
def list_runs(agent_id: str = "", limit: int = 20, key: ApiKey = Depends(require_api_key),
              session: Session = Depends(get_session)):
    q = select(ExpertRun).order_by(ExpertRun.started_at.desc())
    if agent_id:
        q = q.where(ExpertRun.expert_id == agent_id)
    rows = session.exec(q).all()[: min(limit, 100)]
    return {"object": "list", "data": [_run_out(r) for r in rows]}


@router.get("/runs/{run_id}", summary="Get a run")
def get_run_api(run_id: str, key: ApiKey = Depends(require_api_key),
                session: Session = Depends(get_session)):
    r = session.get(ExpertRun, run_id)
    if r is None:
        raise HTTPException(404, "run not found")
    return _run_out(r)


# ── workflows ─────────────────────────────────────────────────────────────


@router.get("/workflows", summary="List workflows")
def list_workflows(key: ApiKey = Depends(require_api_key), session: Session = Depends(get_session)):
    rows = session.exec(select(Ability).order_by(Ability.updated_at.desc())).all()
    return {"object": "list", "data": [_workflow_out(a) for a in rows]}


@router.get("/workflows/{workflow_id}", summary="Get a workflow")
def get_workflow(workflow_id: str, key: ApiKey = Depends(require_api_key),
                 session: Session = Depends(get_session)):
    a = session.get(Ability, workflow_id)
    if a is None:
        raise HTTPException(404, "workflow not found")
    return _workflow_out(a)


@router.get("/workflows/{workflow_id}/compiled", summary="Get the compiled agent script")
def get_workflow_compiled(workflow_id: str, key: ApiKey = Depends(require_api_key),
                          session: Session = Depends(get_session)):
    """The exact instruction script and tool set the voice agent runs at call time."""
    a = session.get(Ability, workflow_id)
    if a is None:
        raise HTTPException(404, "workflow not found")
    return {"object": "compiled_workflow", "id": a.id, **compile_ability(a)}


# ── calls: start a voice session from your own app ────────────────────────


class CallCreate(BaseModel):
    identity: str | None = Field(default=None, description="Your end user's id")
    name: str | None = Field(default=None, description="Display name for the caller")
    room: str | None = Field(default=None, description="Join an existing room instead of creating one")


@router.post("/calls", status_code=201, summary="Start a voice call")
def create_call(body: CallCreate, key: ApiKey = Depends(require_api_key)):
    """Mint a short lived browser token for a live voice session.

    Hand the returned `token` and `url` to the LiveKit client SDK in your own
    frontend; the voice agent joins the room automatically. Your LiveKit secrets
    never leave the server, and the token expires in 30 minutes.
    """
    if not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(503, "LiveKit is not configured on this deployment")
    from livekit import api as lk

    room = body.room or f"call-{uuid.uuid4().hex[:10]}"
    identity = body.identity or f"user-{uuid.uuid4().hex[:6]}"
    token = (
        lk.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name(body.name or "Caller")
        .with_ttl(timedelta(minutes=30))
        .with_grants(lk.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        .to_jwt()
    )
    webhooks.emit("call.started", {"object": "call", "room": room, "identity": identity})
    return {"object": "call", "room": room, "identity": identity,
            "token": token, "url": settings.livekit_url, "expires_in": 1800}


@router.get("/calls", summary="List calls")
def list_calls(limit: int = 20, key: ApiKey = Depends(require_api_key),
               session: Session = Depends(get_session)):
    rows = session.exec(select(CallTranscript).order_by(CallTranscript.created_at.desc())).all()
    return {"object": "list", "data": [_call_out(t) for t in rows[: min(limit, 100)]]}


@router.get("/calls/{call_id}", summary="Get a call transcript")
def get_call(call_id: str, key: ApiKey = Depends(require_api_key),
             session: Session = Depends(get_session)):
    t = session.get(CallTranscript, call_id)
    if t is None:
        raise HTTPException(404, "call not found")
    return _call_out(t)


# ── tools ─────────────────────────────────────────────────────────────────


@router.get("/tools", summary="List tools")
def list_tools(key: ApiKey = Depends(require_api_key), session: Session = Depends(get_session)):
    """Everything the agent can call: connected apps, custom HTTP actions, MCP servers."""
    from ..integrations.models import Connection, CustomAction, McpServer

    conns = session.exec(select(Connection).where(Connection.status == "active")).all()
    actions = session.exec(select(CustomAction)).all()
    mcps = session.exec(select(McpServer)).all()
    return {
        "object": "list",
        "data": [{"type": "app", "id": c.toolkit, "name": c.app_name} for c in conns]
        + [{"type": "action", "id": a.id, "name": a.name} for a in actions]
        + [{"type": "mcp", "id": m.id, "name": m.name} for m in mcps if m.enabled],
    }


# ── the spec behind the SDKs, the docs, and the playground ────────────────


@router.get("/openapi.json", include_in_schema=False)
def public_openapi(request: Request):
    """OpenAPI 3.1 for the public surface only, so a generated SDK never leaks
    internal studio routes."""
    full = request.app.openapi()
    paths = {p: v for p, v in full.get("paths", {}).items() if p.startswith("/v1")}
    components = dict(full.get("components", {}))
    components.setdefault("securitySchemes", {})["bearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "description": "Your secret key: Authorization: Bearer z360_sk_live_...",
    }
    return {
        "openapi": full.get("openapi", "3.1.0"),
        "info": {
            "title": "RelayVoice API",
            "version": "1.0.0",
            "description": (
                "Build, run and embed voice agents.\n\n"
                "Authenticate every request with `Authorization: Bearer z360_sk_live_...`."
            ),
        },
        "servers": [{"url": settings.public_base_url}],
        "security": [{"bearerAuth": []}],
        "paths": paths,
        "components": components,
    }
