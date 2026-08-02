"""Test a workflow without making a phone call.

The builder's blind spot: you wire up a flow and have no idea whether it holds
together until a real caller is on the line. This runs the flow the way the
voice worker will, minus the audio: the agent follows the compiled script while
a simulated caller pushes back, then a reviewer reports which steps actually
happened, which variables got collected, and what went wrong.

It is text mode on purpose. STT and TTS latency are provider fixed and already
measured on the Voice Tuning bench; what this checks is whether the *flow*
works, which is the part you authored.
"""

from __future__ import annotations

import json
import re
import time

from sqlmodel import Session

from ..db import AgentConfig, engine
from ..llm import client, is_configured, model
from .compiler import compile_ability
from .models import Ability

MAX_TURNS = 10

CALLER_PROMPT = """You are roleplaying a person phoning a business. Stay in character.

Your goal: {goal}
Your style: {style}

Rules:
- Speak like a real caller on the phone: short, natural, one thought at a time.
- Answer what the agent asks. Invent plausible details about yourself when asked
  (name, email, dates) rather than refusing.
- Do not narrate, do not use markdown, do not describe your own behaviour.
- When your goal is met or the agent has clearly wrapped up, reply exactly: [HANGUP]"""

REVIEW_PROMPT = """You review a test call against the script the agent was told to follow.

Return ONLY JSON:
{"steps_completed": [<step numbers the agent actually performed>],
 "variables": {"<name>": "<value the caller gave, or null>"},
 "issues": ["<specific problem, or omit if none>"],
 "verdict": "pass" | "fail",
 "summary": "<two sentences max>"}

Be strict and concrete. An issue is something a real caller would notice:
a step skipped, a question never asked, a variable never collected, the agent
inventing facts, or the agent talking like a document instead of a person."""


def _steps_in(script: str) -> list[str]:
    """The nodes in a compiled pathway, in order.

    Pathways compile to `NODE 3 — Search knowledge base`; the older linear
    format used `3. Ask the caller ...`, so both are recognised and existing
    flows keep reporting coverage.
    """
    steps = [ln.strip() for ln in script.splitlines() if re.match(r"^NODE \d+", ln)]
    if steps:
        return steps
    return [ln.strip() for ln in script.splitlines() if re.match(r"^\s*\d+\.\s", ln)]


def _voice_prompt() -> str:
    with Session(engine) as s:
        row = s.get(AgentConfig, 1)
    if row and row.config_json:
        try:
            return json.loads(row.config_json).get("system_prompt", "") or ""
        except Exception:
            pass
    return ""


async def test_ability(ability: Ability, goal: str, style: str = "polite and clear",
                       max_turns: int = MAX_TURNS) -> dict:
    if not is_configured():
        return {"ok": False, "error": "No language model configured. Set LLM_API_KEY in .env."}

    compiled = compile_ability(ability)
    script = compiled.get("script") or ""
    steps = _steps_in(script)
    if not steps:
        return {"ok": False, "error": "This workflow has no steps to run yet."}

    cli, mdl = client(), model()

    agent_system = (
        (_voice_prompt() or "You are the voice assistant for this business.")
        + "\n\nYou are on a phone call. Follow this workflow:\n\n" + script
        + "\n\nSpeak in one to three short sentences per turn. Ask one question at a "
          "time. Never use markdown, lists, or URLs. You are SPEAKING, not writing."
    )
    caller_system = CALLER_PROMPT.format(goal=goal, style=style)

    transcript: list[dict] = []
    agent_msgs: list[dict] = [{"role": "system", "content": agent_system}]
    caller_msgs: list[dict] = [{"role": "system", "content": caller_system}]
    latencies: list[float] = []

    # the agent speaks first, exactly as it does when a call connects
    for turn in range(max_turns):
        t0 = time.perf_counter()
        try:
            resp = await cli.chat.completions.create(
                model=mdl, messages=agent_msgs, max_tokens=180, temperature=0.4)
        except Exception as exc:
            return {"ok": False, "error": f"Agent turn failed: {exc}"[:300],
                    "transcript": transcript}
        agent_text = (resp.choices[0].message.content or "").strip()
        latencies.append(round((time.perf_counter() - t0) * 1000, 1))
        if not agent_text:
            break
        transcript.append({"role": "agent", "text": agent_text})
        agent_msgs.append({"role": "assistant", "content": agent_text})
        caller_msgs.append({"role": "user", "content": agent_text})

        try:
            cresp = await cli.chat.completions.create(
                model=mdl, messages=caller_msgs, max_tokens=120, temperature=0.8)
        except Exception as exc:
            return {"ok": False, "error": f"Caller turn failed: {exc}"[:300],
                    "transcript": transcript}
        caller_text = (cresp.choices[0].message.content or "").strip()
        if not caller_text or "[HANGUP]" in caller_text:
            break
        transcript.append({"role": "caller", "text": caller_text})
        caller_msgs.append({"role": "assistant", "content": caller_text})
        agent_msgs.append({"role": "user", "content": caller_text})

    # review the call against the script it was supposed to follow
    review: dict = {}
    try:
        rresp = await cli.chat.completions.create(
            model=mdl,
            messages=[
                {"role": "system", "content": REVIEW_PROMPT},
                {"role": "user", "content":
                    "SCRIPT:\n" + script + "\n\nCALLER GOAL:\n" + goal + "\n\nTRANSCRIPT:\n"
                    + "\n".join(f"{t['role']}: {t['text']}" for t in transcript)},
            ],
            max_tokens=500, temperature=0,
        )
        raw = (rresp.choices[0].message.content or "").strip()
        raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
        review = json.loads(raw)
    except Exception as exc:
        review = {"issues": [f"Could not review the call: {exc}"[:160]], "verdict": "unknown"}

    done = [n for n in (review.get("steps_completed") or []) if isinstance(n, int)]
    return {
        "ok": True,
        "transcript": transcript,
        "turns": len(transcript),
        "steps_total": len(steps),
        "steps_completed": sorted(set(done)),
        "coverage": round(100 * len(set(done)) / len(steps)) if steps else 0,
        "variables": review.get("variables") or {},
        "issues": review.get("issues") or [],
        "verdict": review.get("verdict", "unknown"),
        "summary": review.get("summary", ""),
        "avg_agent_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "script_steps": steps,
        "model": mdl,
    }
