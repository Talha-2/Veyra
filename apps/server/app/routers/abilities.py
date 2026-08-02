"""Abilities API — CRUD + compiled output for the voice worker."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..abilities.compiler import compile_ability
from ..abilities.models import Ability, AbilityVersion
from ..db import get_session, new_id, now

router = APIRouter(prefix="/api/abilities", tags=["abilities"])


class AbilityRequest(BaseModel):
    name: str
    description: str = ""
    nodes: list[dict] = []
    start_node: str = ""
    triggers: list[str] = []
    global_prompt: str = ""
    enabled: bool = True


def _out(a: Ability) -> dict:
    return {
        "id": a.id, "name": a.name, "description": a.description,
        "nodes": a.nodes, "start_node": a.start_node, "triggers": a.triggers,
        "global_prompt": a.global_prompt, "enabled": a.enabled,
        "live_version": a.live_version,
        "created_at": a.created_at.isoformat(), "updated_at": a.updated_at.isoformat(),
    }


@router.get("/templates")
def templates():
    """Starting points for the new workflow gallery."""
    from ..abilities.templates import list_templates

    return {"templates": list_templates()}


class FromTemplateRequest(BaseModel):
    key: str
    name: str = ""


@router.post("/from-template")
def create_from_template(req: FromTemplateRequest, session: Session = Depends(get_session)):
    from ..abilities.templates import build

    built = build(req.key)
    if built is None:
        raise HTTPException(404, f"No template '{req.key}'")
    nodes, phrases = built
    a = Ability(
        id=new_id("abl"),
        name=req.name or "Untitled workflow",
        description="",
        nodes_json=json.dumps(nodes),
        start_node=next((n["id"] for n in nodes if n["type"] == "trigger"), ""),
        triggers_json=json.dumps(phrases),
        enabled=False,  # a new flow starts as a draft until you publish it
    )
    session.add(a)
    session.commit()
    return _out(a)


class WebhookTestRequest(BaseModel):
    method: str = "POST"
    url: str = ""
    headers: list[dict] = []
    body: str = ""
    auth_value: str = ""
    timeout: float = 10
    response_vars: list[dict] = []
    variables: dict = {}


@router.post("/webhook/test")
async def webhook_test(req: WebhookTestRequest):
    """Run a webhook config now and show what came back.

    This is what makes response mapping honest: you pick JSON paths off a real
    response instead of guessing them from an API doc.
    """
    from ..abilities.webhook import run_webhook

    return await run_webhook(req.model_dump(exclude={"variables"}), req.variables)


@router.get("")
def list_abilities(session: Session = Depends(get_session)):
    rows = session.exec(select(Ability).order_by(Ability.updated_at.desc())).all()
    return [_out(a) for a in rows]


@router.post("")
def create_ability(req: AbilityRequest, session: Session = Depends(get_session)):
    a = Ability(
        id=new_id("abl"), name=req.name, description=req.description,
        nodes_json=json.dumps(req.nodes), start_node=req.start_node,
        triggers_json=json.dumps(req.triggers), global_prompt=req.global_prompt, enabled=req.enabled,
    )
    session.add(a)
    session.commit()
    return _out(a)


@router.get("/{ability_id}")
def get_ability(ability_id: str, session: Session = Depends(get_session)):
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")
    return _out(a)


@router.put("/{ability_id}")
def update_ability(ability_id: str, req: AbilityRequest, session: Session = Depends(get_session)):
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")
    a.name, a.description = req.name, req.description
    a.nodes_json = json.dumps(req.nodes)
    a.start_node, a.enabled = req.start_node, req.enabled
    a.triggers_json = json.dumps(req.triggers)
    a.global_prompt = req.global_prompt
    a.updated_at = now()
    session.add(a)
    session.commit()
    return _out(a)


@router.delete("/{ability_id}")
def delete_ability(ability_id: str, session: Session = Depends(get_session)):
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")
    session.delete(a)
    session.commit()
    return {"ok": True}


class TestRequest(BaseModel):
    goal: str = "You want to get your question answered."
    style: str = "polite and clear"
    max_turns: int = 8


@router.post("/{ability_id}/test")
async def test_ability_route(ability_id: str, req: TestRequest,
                             session: Session = Depends(get_session)):
    """Run this workflow as a simulated call and report what actually happened."""
    from ..abilities.tester import test_ability

    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")
    return await test_ability(a, goal=req.goal, style=req.style,
                              max_turns=max(2, min(req.max_turns, 12)))


class DeployRequest(BaseModel):
    note: str = ""
    force: bool = False  # ship despite blocking warnings, deliberately


def _version_out(v: AbilityVersion, live: int) -> dict:
    return {"id": v.id, "version": v.version, "name": v.name, "note": v.note,
            "nodes": len(v.nodes), "is_live": v.version == live,
            "created_at": v.created_at.isoformat()}


@router.get("/{ability_id}/versions")
def list_versions(ability_id: str, session: Session = Depends(get_session)):
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")
    rows = session.exec(
        select(AbilityVersion).where(AbilityVersion.ability_id == ability_id)
        .order_by(AbilityVersion.version.desc())
    ).all()
    return {"live_version": a.live_version, "versions": [_version_out(v, a.live_version) for v in rows]}


@router.post("/{ability_id}/deploy")
def deploy(ability_id: str, req: DeployRequest, session: Session = Depends(get_session)):
    """Freeze the draft as a new version and point live calls at it."""
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")

    # Deploying is the last gate before a real caller hears this. A pathway
    # with an unbound action compiles and looks fine, so block it here rather
    # than discover it mid call. force=true is the deliberate override.
    blocking = [w for w in compile_ability(a).get("warnings", []) if w["level"] == "error"]
    if blocking and not req.force:
        raise HTTPException(422, {
            "message": "This pathway is not ready to go live.",
            "warnings": blocking,
        })

    latest = session.exec(
        select(AbilityVersion).where(AbilityVersion.ability_id == ability_id)
        .order_by(AbilityVersion.version.desc())
    ).first()
    nxt = (latest.version if latest else 0) + 1

    v = AbilityVersion(
        id=new_id("ver"), ability_id=ability_id, version=nxt, name=a.name,
        nodes_json=a.nodes_json, start_node=a.start_node,
        triggers_json=a.triggers_json, global_prompt=a.global_prompt,
        note=req.note.strip(),
    )
    session.add(v)
    a.live_version = nxt
    a.enabled = True  # deploying is what makes a pathway live
    a.updated_at = now()
    session.add(a)
    session.commit()
    return {"deployed": nxt, "version": _version_out(v, nxt)}


@router.post("/{ability_id}/restore/{version}")
def restore(ability_id: str, version: int, session: Session = Depends(get_session)):
    """Copy an old version back over the draft. Does not deploy it."""
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")
    v = session.exec(
        select(AbilityVersion).where(AbilityVersion.ability_id == ability_id)
        .where(AbilityVersion.version == version)
    ).first()
    if v is None:
        raise HTTPException(404, f"No version {version}")
    a.nodes_json, a.start_node = v.nodes_json, v.start_node
    a.triggers_json, a.global_prompt = v.triggers_json, v.global_prompt
    a.updated_at = now()
    session.add(a)
    session.commit()
    return {"restored": version, **_out(a)}


@router.get("/{ability_id}/compiled")
def compiled(ability_id: str, stage: str = "live", session: Session = Depends(get_session)):
    """The instructions the agent runs.

    Defaults to the deployed version: the worker must never pick up a half
    finished edit. Pass ?stage=draft to compile what is on the canvas.
    """
    a = session.get(Ability, ability_id)
    if a is None:
        raise HTTPException(404, "Ability not found")

    if stage != "draft" and a.live_version:
        v = session.exec(
            select(AbilityVersion).where(AbilityVersion.ability_id == ability_id)
            .where(AbilityVersion.version == a.live_version)
        ).first()
        if v is not None:
            frozen = Ability(
                id=a.id, name=v.name, description=a.description,
                nodes_json=v.nodes_json, start_node=v.start_node,
                triggers_json=v.triggers_json, global_prompt=v.global_prompt,
            )
            return {**compile_ability(frozen), "stage": "live", "version": v.version}

    return {**compile_ability(a), "stage": "draft", "version": a.live_version or None}
