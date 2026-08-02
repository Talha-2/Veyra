"""Experts API — CRUD, triggers (manual/external), and run history.

Manual/external runs execute in the background (return a run id immediately);
scheduled runs are driven by experts.scheduler. External trigger uses an
unguessable per-expert secret in the path.
"""

from __future__ import annotations

import asyncio
import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session, new_id, now
from ..experts.models import Expert, ExpertRun
from ..experts.runtime import create_run, execute_run
from ..experts.schedule import compute_next_run, describe

router = APIRouter(prefix="/api/experts", tags=["experts"])


class ExpertRequest(BaseModel):
    name: str
    description: str = ""
    kind: str = "expert"
    system_prompt: str = ""
    goal: str = ""
    triggers: list[str] = ["chat"]
    schedule: dict = {}
    trigger_meta: dict = {}
    app_trigger: dict = {}
    reasoning: str = "balanced"
    allowed_tools: list[dict] = []
    status: str = "inactive"


def _out(e: Expert) -> dict:
    return {
        "id": e.id, "name": e.name, "description": e.description, "kind": e.kind,
        "system_prompt": e.system_prompt, "goal": e.goal,
        "triggers": e.triggers, "schedule": e.schedule, "trigger_meta": e.trigger_meta, "app_trigger": e.app_trigger,
        "app_trigger_subscribed": bool(e.app_trigger_instance), "schedule_label": describe(e.schedule),
        "reasoning": e.reasoning, "allowed_tools": e.allowed_tools, "status": e.status,
        "external_url": f"/api/experts/trigger/{e.external_secret}" if e.external_secret else None,
        "next_run_at": e.next_run_at.isoformat() if e.next_run_at else None,
        "last_run_at": e.last_run_at.isoformat() if e.last_run_at else None,
        "created_at": e.created_at.isoformat(), "updated_at": e.updated_at.isoformat(),
    }


def _apply(e: Expert, req: ExpertRequest) -> None:
    e.name, e.description, e.kind = req.name, req.description, req.kind
    e.system_prompt, e.goal, e.reasoning = req.system_prompt, req.goal, req.reasoning
    e.triggers_json = json.dumps(req.triggers)
    e.schedule_json = json.dumps(req.schedule)
    e.trigger_meta_json = json.dumps(req.trigger_meta)
    e.app_trigger_json = json.dumps(req.app_trigger)
    e.allowed_tools_json = json.dumps(req.allowed_tools)
    e.status = req.status
    # (re)compute next run when active + scheduled
    if req.status == "active" and "schedule" in req.triggers and req.schedule:
        e.next_run_at = compute_next_run(req.schedule, now())
    else:
        e.next_run_at = None



def _reconcile_app_trigger(e: Expert) -> dict | None:
    """Make Composio match what the expert says it wants.

    Called on every save so the subscription follows the expert: it appears when
    an app event is chosen and the expert is active, and goes away when either
    stops being true. Returns a note for the UI when something could not be done.
    """
    from ..integrations import trigger_instances as ti

    want = e.app_trigger or {}
    wants_sub = bool(
        want.get("slug") and want.get("toolkit")
        and "external" in e.triggers and e.status == "active"
    )

    if not wants_sub:
        if e.app_trigger_instance:
            ti.unsubscribe(e.app_trigger_instance)
            e.app_trigger_instance = ""
        return None

    if e.app_trigger_instance:
        return None  # already subscribed; config edits re-upsert below on change

    res = ti.subscribe(want["toolkit"], want["slug"], want.get("config"))
    if res.get("ok"):
        e.app_trigger_instance = res.get("id") or ""
        return None
    return {"trigger_warning": res.get("error")}


@router.get("")
def list_experts(session: Session = Depends(get_session)):
    rows = session.exec(select(Expert).order_by(Expert.updated_at.desc())).all()
    return [_out(e) for e in rows]


@router.post("")
def create_expert(req: ExpertRequest, session: Session = Depends(get_session)):
    e = Expert(id=new_id("exp"), external_secret=secrets.token_urlsafe(24))
    _apply(e, req)
    warn = _reconcile_app_trigger(e)
    session.add(e)
    session.commit()
    return {**_out(e), **(warn or {})}


@router.get("/{expert_id}")
def get_expert(expert_id: str, session: Session = Depends(get_session)):
    e = session.get(Expert, expert_id)
    if e is None:
        raise HTTPException(404, "Expert not found")
    return _out(e)


@router.put("/{expert_id}")
def update_expert(expert_id: str, req: ExpertRequest, session: Session = Depends(get_session)):
    e = session.get(Expert, expert_id)
    if e is None:
        raise HTTPException(404, "Expert not found")
    _apply(e, req)
    warn = _reconcile_app_trigger(e)
    e.updated_at = now()
    session.add(e)
    session.commit()
    return {**_out(e), **(warn or {})}


@router.delete("/{expert_id}")
def delete_expert(expert_id: str, session: Session = Depends(get_session)):
    e = session.get(Expert, expert_id)
    if e is None:
        raise HTTPException(404, "Expert not found")
    if e.app_trigger_instance:
        from ..integrations import trigger_instances as ti

        ti.unsubscribe(e.app_trigger_instance)
    session.delete(e)
    session.commit()
    return {"ok": True}


# ── runs ──────────────────────────────────────────────────────────────────


class RunRequest(BaseModel):
    input: str = ""


def _run_out(r: ExpertRun, full: bool = False) -> dict:
    d = {
        "id": r.id, "expert_id": r.expert_id, "trigger": r.trigger, "status": r.status,
        "result": r.result, "error": r.error, "tokens": r.tokens,
        "started_at": r.started_at.isoformat(),
        "ended_at": r.ended_at.isoformat() if r.ended_at else None,
    }
    if full:
        d["input"] = r.input
        d["steps"] = r.steps
    return d


@router.post("/{expert_id}/run")
async def run_expert_manual(expert_id: str, req: RunRequest, session: Session = Depends(get_session)):
    e = session.get(Expert, expert_id)
    if e is None:
        raise HTTPException(404, "Expert not found")
    run = create_run(session, e, "manual", req.input)
    asyncio.create_task(execute_run(run.id))
    return {"run_id": run.id, "status": "running"}


@router.post("/trigger/{secret}")
async def external_trigger(secret: str, payload: dict | None = None, session: Session = Depends(get_session)):
    """External webhook trigger: POST to the expert's unguessable URL to run it."""
    e = session.exec(select(Expert).where(Expert.external_secret == secret)).first()
    if e is None or "external" not in e.triggers:
        raise HTTPException(404, "No external-triggered expert at this URL")
    if e.status != "active":
        raise HTTPException(409, "Expert is inactive")
    run = create_run(session, e, "external", json.dumps(payload or {}))
    asyncio.create_task(execute_run(run.id))
    return {"run_id": run.id, "status": "running"}



@router.post("/app-event")
async def app_event(payload: dict, session: Session = Depends(get_session)):
    """Composio delivers an app event here; the matching experts run on it.

    The body carries the trigger slug and the event data, so every expert
    subscribed to that slug gets a run whose input is the payload. Runs show up
    in Executions like any other.
    """
    slug = (payload.get("triggerSlug") or payload.get("trigger_slug")
            or payload.get("type") or "")
    data = payload.get("data") or payload.get("payload") or payload

    if not slug:
        raise HTTPException(400, "No trigger slug on the event")

    started = []
    for e in session.exec(select(Expert)).all():
        at = e.app_trigger or {}
        if at.get("slug") != slug or e.status != "active":
            continue
        run = create_run(session, e, "app_event", json.dumps(data)[:4000])
        asyncio.create_task(execute_run(run.id))
        started.append({"expert_id": e.id, "run_id": run.id})

    return {"received": slug, "started": started}


@router.get("/executions/all")
def list_executions(
    limit: int = 50,
    status: str = "",
    expert_id: str = "",
    session: Session = Depends(get_session),
):
    """Every run across every expert, newest first: the Executions feed.

    Each row already carries a node by node trace (thought / tool_call /
    tool_result / final), so the UI can replay exactly what happened.
    """
    q = select(ExpertRun).order_by(ExpertRun.started_at.desc())
    if expert_id:
        q = q.where(ExpertRun.expert_id == expert_id)
    if status:
        q = q.where(ExpertRun.status == status)
    rows = session.exec(q).all()[: min(limit, 200)]

    names = {e.id: e.name for e in session.exec(select(Expert)).all()}
    out = []
    for r in rows:
        d = _run_out(r)
        d["expert_name"] = names.get(r.expert_id, "Deleted expert")
        d["steps_count"] = len(r.steps)
        dur = (r.ended_at - r.started_at).total_seconds() if r.ended_at else None
        d["duration_ms"] = round(dur * 1000) if dur is not None else None
        out.append(d)
    return out


@router.get("/{expert_id}/runs")
def list_runs(expert_id: str, session: Session = Depends(get_session)):
    rows = session.exec(
        select(ExpertRun).where(ExpertRun.expert_id == expert_id).order_by(ExpertRun.started_at.desc()).limit(50)
    ).all()
    return [_run_out(r) for r in rows]


@router.get("/runs/{run_id}")
def get_run(run_id: str, session: Session = Depends(get_session)):
    r = session.get(ExpertRun, run_id)
    if r is None:
        raise HTTPException(404, "Run not found")
    return _run_out(r, full=True)
