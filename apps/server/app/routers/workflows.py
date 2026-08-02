import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import Workflow, get_session, new_id, now
from ..workflows.schema import EXAMPLE_WORKFLOW, WORKFLOW_SCHEMA, validate_workflow

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class WorkflowRequest(BaseModel):
    spec: dict
    enabled: bool = True


def _out(wf: Workflow) -> dict:
    return {
        "id": wf.id,
        "name": wf.name,
        "description": wf.description,
        "enabled": wf.enabled,
        "spec": wf.spec,
        "created_at": wf.created_at.isoformat(),
        "updated_at": wf.updated_at.isoformat(),
    }


@router.get("/schema")
def get_schema():
    return {"schema": WORKFLOW_SCHEMA, "example": EXAMPLE_WORKFLOW}


@router.post("/validate")
def validate(req: WorkflowRequest):
    errors = validate_workflow(req.spec)
    return {"valid": not errors, "errors": errors}


@router.get("")
def list_workflows(session: Session = Depends(get_session)):
    rows = session.exec(select(Workflow).order_by(Workflow.created_at.desc())).all()
    return [_out(w) for w in rows]


# consumed by the voice worker at session start
@router.get("/active")
def active_workflows(session: Session = Depends(get_session)):
    rows = session.exec(select(Workflow).where(Workflow.enabled == True)).all()  # noqa: E712
    return [_out(w) for w in rows]


@router.post("")
def create_workflow(req: WorkflowRequest, session: Session = Depends(get_session)):
    errors = validate_workflow(req.spec)
    if errors:
        raise HTTPException(422, detail={"errors": errors})
    wf = Workflow(
        id=new_id("wf"),
        name=req.spec["name"],
        description=req.spec.get("description", ""),
        enabled=req.enabled,
        spec_json=json.dumps(req.spec),
    )
    session.add(wf)
    session.commit()
    return _out(wf)


@router.get("/{wf_id}")
def get_workflow(wf_id: str, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if wf is None:
        raise HTTPException(404, "Workflow not found")
    return _out(wf)


@router.put("/{wf_id}")
def update_workflow(wf_id: str, req: WorkflowRequest, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if wf is None:
        raise HTTPException(404, "Workflow not found")
    errors = validate_workflow(req.spec)
    if errors:
        raise HTTPException(422, detail={"errors": errors})
    wf.name = req.spec["name"]
    wf.description = req.spec.get("description", "")
    wf.enabled = req.enabled
    wf.spec_json = json.dumps(req.spec)
    wf.updated_at = now()
    session.add(wf)
    session.commit()
    return _out(wf)


@router.delete("/{wf_id}")
def delete_workflow(wf_id: str, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if wf is None:
        raise HTTPException(404, "Workflow not found")
    session.delete(wf)
    session.commit()
    return {"ok": True}
