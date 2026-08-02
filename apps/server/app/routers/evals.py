import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import EvalRun, engine, get_session, new_id
from ..evals.personas import DEFAULT_SCENARIOS, PERSONAS
from ..evals.simulator import run_simulation

router = APIRouter(prefix="/api/evals", tags=["evals"])


class RunRequest(BaseModel):
    persona: str
    scenario_name: str | None = None
    goal: str | None = None


def _out(r: EvalRun) -> dict:
    return {
        "id": r.id,
        "status": r.status,
        "scenario": r.scenario,
        "persona": r.persona,
        "turns": json.loads(r.turns_json),
        "scores": json.loads(r.scores_json),
        "latency": json.loads(r.latency_json),
        "error": r.error,
        "created_at": r.created_at.isoformat(),
    }


@router.get("/catalog")
def catalog():
    return {
        "personas": [{"key": k, **{kk: vv for kk, vv in v.items() if kk != "prompt"}} for k, v in PERSONAS.items()],
        "scenarios": DEFAULT_SCENARIOS,
    }


async def _run_and_store(run_id: str, persona: str, scenario: dict) -> None:
    try:
        result = await run_simulation(persona, scenario)
        with Session(engine) as s:
            row = s.get(EvalRun, run_id)
            if row:
                row.status = "done"
                row.turns_json = json.dumps(result["turns"])
                row.scores_json = json.dumps(result["scores"])
                row.latency_json = json.dumps(result["latency"])
                s.add(row)
                s.commit()
    except Exception as exc:
        with Session(engine) as s:
            row = s.get(EvalRun, run_id)
            if row:
                row.status = "error"
                row.error = str(exc)[:2000]
                s.add(row)
                s.commit()


@router.post("/run")
async def run_eval(req: RunRequest, session: Session = Depends(get_session)):
    if req.persona not in PERSONAS:
        raise HTTPException(422, f"Unknown persona. Options: {list(PERSONAS)}")
    scenario = None
    if req.goal:
        scenario = {"name": req.scenario_name or "Custom", "goal": req.goal}
    else:
        scenario = next((s for s in DEFAULT_SCENARIOS if s["name"] == req.scenario_name), None)
    if scenario is None:
        raise HTTPException(422, "Provide a known scenario_name or a custom goal")

    run = EvalRun(id=new_id("eval"), persona=req.persona, scenario=scenario["name"])
    session.add(run)
    session.commit()
    asyncio.create_task(_run_and_store(run.id, req.persona, scenario))
    return {"id": run.id, "status": "running"}


@router.get("")
def list_runs(session: Session = Depends(get_session)):
    rows = session.exec(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(50)).all()
    return [_out(r) for r in rows]


@router.get("/{run_id}")
def get_run(run_id: str, session: Session = Depends(get_session)):
    row = session.get(EvalRun, run_id)
    if row is None:
        raise HTTPException(404, "Run not found")
    return _out(row)
