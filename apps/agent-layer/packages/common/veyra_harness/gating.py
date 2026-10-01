"""Step-gated skills: a checklist the worker must work through in order.

A prose skill is a page the model reads and uses its judgement on. A
step-gated skill is for procedures that must not be improvised — taking a
payment, checking identity — and Studio stores it as a framing text plus an
ordered list of steps. Until this module, the worker read the framing and
never saw the steps.

How a gated skill runs now, the same on every surface:

1. ``read_skill`` opens it as a checklist: the framing, the step names, and
   the full instruction for **the current step only**.
2. The worker calls ``skill_step`` to mark the current step ``done``; the
   result hands it the next step's instruction. Marking a later step done
   while an earlier one is open is refused, so the order holds.
3. A final reply is refused while a gated skill is open, with a nudge back to
   the open step. Two ways to reply before the end, both explicit:
   ``waiting`` (the step needs something only the customer can give — the
   reply asks for it, and the step stays open for the next turn) and
   ``abandon`` (the skill does not fit after all, with the reason).

Prose skills are untouched: ``read_skill`` returns their text exactly as
before.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app_sdk.errors import NotFound

from .tools import Tool, ToolResult

logger = logging.getLogger("veyra.harness.gating")

# How many times one turn's reply may be refused before it is let through.
# The gate steers; it must not trap a call in a loop when a model will not
# use the tool. A let-through is logged and reported as an event.
MAX_REFUSALS = 3


@dataclass(slots=True)
class Step:
    name: str
    instruction: str


@dataclass(slots=True)
class OpenSkill:
    slug: str
    name: str
    steps: list[Step]
    current: int = 0  # index into steps
    waiting: str | None = None  # what the open step is waiting for, this turn
    notes: list[str] = field(default_factory=list)

    @property
    def finished(self) -> bool:
        return self.current >= len(self.steps)

    @property
    def step(self) -> Step:
        return self.steps[self.current]


def _steps(raw: Any) -> list[Step]:
    """Studio stores ``[{name, instruction}]``; tolerate bare strings and missing names."""
    steps: list[Step] = []
    for i, item in enumerate(raw or []):
        if isinstance(item, dict):
            name = str(item.get("name") or f"Step {i + 1}").strip()
            instruction = str(item.get("instruction") or item.get("body") or "").strip()
        else:
            name, instruction = f"Step {i + 1}", str(item).strip()
        steps.append(Step(name=name, instruction=instruction))
    return steps


class SkillGate:
    """The open step-gated skills of one worker, and the two tools that drive them."""

    def __init__(self) -> None:
        self.open: dict[str, OpenSkill] = {}
        self.completed: list[str] = []
        self._refusals = 0

    # ── the worker's hooks ───────────────────────────────────────────────

    def begin_turn(self) -> None:
        """A new user message: "waiting" covered the last reply only."""
        self._refusals = 0
        for skill in self.open.values():
            skill.waiting = None

    @property
    def engaged(self) -> bool:
        """Whether a reply right now would be checked (so a host should not stream it yet)."""
        return any(not s.waiting for s in self.open.values())

    def refusal(self) -> str | None:
        """Why the reply the model just gave is refused, or None to accept it."""
        blocking = [s for s in self.open.values() if not s.waiting]
        if not blocking:
            return None
        if self._refusals >= MAX_REFUSALS:
            logger.warning("gating.let_through skills=%s refusals=%s", [s.slug for s in blocking], self._refusals)
            return None
        self._refusals += 1
        s = blocking[0]
        return (
            f"Not yet. The step-gated skill '{s.name}' ({s.slug}) is open at step {s.current + 1} of {len(s.steps)}: "
            f"{s.step.name}. Work this step now, then call skill_step with skill=\"{s.slug}\", step={s.current + 1}, "
            "status=\"done\". If this step needs something only the customer can give, call skill_step with "
            "status=\"waiting\" and a note saying what is needed, then reply asking for it. If the skill does not fit "
            "the situation, call skill_step with status=\"abandon\" and the reason."
        )

    # ── tools ────────────────────────────────────────────────────────────

    def tools(self) -> list[Tool]:
        return [self.read_skill_tool(), self.step_tool()]

    def wrap(self, tools: list[Tool]) -> list[Tool]:
        """Swap in this gate's ``read_skill`` and add ``skill_step``: every worker reads skills the same way."""
        out = [self.read_skill_tool() if t.name == "read_skill" else t for t in tools if t.name != "skill_step"]
        if not any(t.name == "read_skill" for t in out):
            out.append(self.read_skill_tool())
        out.append(self.step_tool())
        return out

    def read_skill_tool(self) -> Tool:
        return Tool(
            name="read_skill", handler=self._read_skill, plumbing=True, timeout_ms=8000,
            description=(
                "Read a skill's full instructions by slug. Read the one that matches the need before acting on it. "
                "A step-gated skill opens as a checklist: follow its steps in order with skill_step."
            ),
            input_schema={"type": "object", "properties": {"slug": {"type": "string"}}, "required": ["slug"]},
        )

    def step_tool(self) -> Tool:
        return Tool(
            # Audited like any tool: the trail of which steps were marked done
            # is the answer to "did the agent check their identity?".
            name="skill_step", handler=self._skill_step, plumbing=True, timeout_ms=2000,
            description=(
                "Report progress on an open step-gated skill. status=done when the current step is finished "
                "(returns the next step); waiting when the step needs something only the customer can give "
                "(say what in note); abandon when the skill does not fit (say why in note)."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "skill": {"type": "string", "description": "The skill's slug."},
                    "step": {"type": "integer", "description": "The step number, starting at 1."},
                    "status": {"type": "string", "enum": ["done", "waiting", "abandon"]},
                    "note": {"type": "string", "description": "What was done, what is needed, or why it is abandoned."},
                },
                "required": ["skill", "step", "status"],
            },
        )

    async def _read_skill(self, args: dict[str, Any], state: Any) -> ToolResult:
        slug = str(args.get("slug") or "").strip().strip("/")
        if slug.startswith("skills/org/"):
            slug = slug.split("/")[2]
        if not slug:
            return ToolResult.failure("Give the skill slug from the catalog.")
        try:
            doc = await state.sdk.skill(slug)
        except NotFound:
            return ToolResult.failure(f"No skill named {slug!r}. The catalog lists the ones that exist.")
        steps = _steps(doc.steps) if getattr(doc, "execution_mode", "prose") == "gated" else []
        if not steps:
            return ToolResult.success(doc.markdown, text=doc.markdown)

        existing = self.open.get(doc.slug)
        if existing is None:
            existing = OpenSkill(slug=doc.slug, name=doc.name, steps=steps)
            self.open[doc.slug] = existing
        return ToolResult.success({"slug": doc.slug, "gated": True, "step": existing.current + 1, "of": len(existing.steps)}, text=self._render(doc.markdown, existing))

    async def _skill_step(self, args: dict[str, Any], state: Any) -> ToolResult:
        slug = str(args.get("skill") or args.get("slug") or "").strip()
        status = str(args.get("status") or "done").strip().lower()
        note = str(args.get("note") or "").strip()
        skill = self.open.get(slug)
        if skill is None:
            if slug in self.completed:
                return ToolResult.failure(f"'{slug}' is already finished. Read it again with read_skill to start it over.")
            return ToolResult.failure(f"No step-gated skill '{slug}' is open. Open it with read_skill first.")
        try:
            number = int(args.get("step") or 0)
        except (TypeError, ValueError):
            number = 0
        expected = skill.current + 1

        if status == "abandon":
            self.open.pop(slug, None)
            logger.info("gating.abandoned skill=%s at_step=%s reason=%s", slug, expected, note[:120])
            return ToolResult.success({"skill": slug, "status": "abandoned", "at_step": expected},
                                      text=f"'{skill.name}' closed at step {expected} without finishing{': ' + note if note else ''}. Nothing in its remaining steps was done; say so if it matters.")

        if number != expected:
            if number < expected:
                return ToolResult.failure(f"Step {number} is already done. The open step is {expected}: {skill.step.name}.")
            return ToolResult.failure(f"Step {expected} ({skill.step.name}) is not done yet. Finish it before step {number}; steps run in order.")

        if status == "waiting":
            skill.waiting = note or "the customer's answer"
            return ToolResult.success({"skill": slug, "status": "waiting", "step": expected},
                                      text=f"Step {expected} ({skill.step.name}) is paused, waiting for: {skill.waiting}. Reply now asking only for that. Continue this step when the answer arrives.")

        if status != "done":
            return ToolResult.failure("status must be done, waiting or abandon.")

        if note:
            skill.notes.append(f"{expected}. {note}")
        skill.current += 1
        skill.waiting = None
        if skill.finished:
            self.open.pop(slug, None)
            self.completed.append(slug)
            return ToolResult.success({"skill": slug, "status": "finished", "steps": len(skill.steps)},
                                      text=f"All {len(skill.steps)} steps of '{skill.name}' are done. You may give your reply.")
        nxt = skill.step
        return ToolResult.success({"skill": slug, "status": "done", "next_step": skill.current + 1, "of": len(skill.steps)},
                                  text=f"Step {expected} done. Now step {skill.current + 1} of {len(skill.steps)}: {nxt.name}\n\n{nxt.instruction}\n\n"
                                       f"When it is done, call skill_step with skill=\"{slug}\", step={skill.current + 1}, status=\"done\".")

    def _render(self, markdown: str, skill: OpenSkill) -> str:
        lines = [markdown.rstrip(), "", "## Steps (step-gated)", "",
                 "This skill is step-gated. Work the steps in order, one at a time. Do not skip ahead or do a later step's work early."]
        for i, step in enumerate(skill.steps):
            mark = "done" if i < skill.current else ("current" if i == skill.current else "")
            lines.append(f"{i + 1}. {step.name}" + (f" ({mark})" if mark else ""))
        current = skill.step
        lines += [
            "", f"### Step {skill.current + 1} of {len(skill.steps)}: {current.name}", "", current.instruction or "(No instruction written for this step.)", "",
            f"When this step is done, call skill_step with skill=\"{skill.slug}\", step={skill.current + 1}, status=\"done\"; the next step comes back then. "
            "If the step needs something only the customer can give, call skill_step with status=\"waiting\" and say what in note, then reply asking for it. "
            "If the skill does not fit after all, call skill_step with status=\"abandon\" and the reason. You cannot give a final reply while a step is open.",
        ]
        return "\n".join(lines)
