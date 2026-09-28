"""Prompt assembly from the contract's tenant bundle.

Two documents, one rule: **the caller is talking to one agent.** The
talker/worker split is an implementation detail and must never surface in
wording, which is why every string the talker reads — the persona, the
templates around tool events, the fallback line — lives here where it can be
reviewed as a set.

The prompt bodies are ``.txt`` files next to this module, with ``{{slot}}``
placeholders filled from the bundle. Studio's expert ``system_prompt`` is the
persona slot; Studio's ``persona`` and ``greeting`` on the agent config feed
the talker; the worker gets the skill catalog and the ticket types.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from app_sdk.models import CallContext, CallerInfo, ExpertRecord, TenantContext

_PROMPTS = Path(__file__).parent / "prompts"

# ── templates around tool events ─────────────────────────────────────────
# Facts that stop. A tool result is recent and answers the thing the model
# just did, so it beats the system prompt; an instruction here becomes the
# behaviour.

ACK_TEMPLATE = (
    "Sent. Say one short line: that you are on it, and that they should hang on a moment. "
    'Your own words and different from last time — "let me get that started for you, one second", '
    '"bear with me a moment while I look". Nothing they have to answer.'
)
REPLY_TEMPLATE = "That came back. Tell the caller what it means for them, in your own words and briefly."
REPLY_COVERED_TEMPLATE = "That came back, and you may have said some of it already.\nGive them the part they have not heard yet, in fresh words."
SUPERSEDE_TEMPLATE = "Not sent — the request is working on what you gave it last."
SUPERSEDE_CONFIRM_TEMPLATE = "Not sent — the same thing is already with the request."
FALLBACK_LINE = "The request failed. Nothing was booked, recorded or sent. There is no detail on why beyond that."
UNCONFIRMED_LINE = "The request finished but nothing durable was confirmed. Do not say anything was booked, recorded or sent."
STILL_WRITING = "Not ended — something is still being written."
NOTHING_NEW = "Not sent — there is no new caller conversation."


def async_options() -> dict[str, Any]:
    """``tool_handling`` for the talker's AgentSession: LiveKit's five templates, our vocabulary."""
    return {
        "async_options": {
            "reply_at_tail_template": REPLY_TEMPLATE,
            "reply_maybe_covered_template": REPLY_COVERED_TEMPLATE,
            "duplicate_reject_template": SUPERSEDE_TEMPLATE,
            "duplicate_confirm_template": SUPERSEDE_CONFIRM_TEMPLATE,
        }
    }


# ── assembly ─────────────────────────────────────────────────────────────


def load(name: str) -> str:
    return (_PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


def fill(template: str, **slots: str) -> str:
    text = template
    for key, value in slots.items():
        text = text.replace("{{" + key + "}}", value or "")
    text = re.sub(r"\{\{[a-zA-Z_]+\}\}", "", text)
    return _squeeze(text)


def _squeeze(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def now_block(context: TenantContext) -> str:
    tz = context.business.timezone or context.organization.timezone or "UTC"
    try:
        now = datetime.now(ZoneInfo(tz))
    except Exception:  # noqa: BLE001
        now = datetime.now()
        tz = "UTC"
    return f"The current date and time is {now.strftime('%A %d %B %Y, %H:%M')} ({tz})."


def business_block(context: TenantContext) -> str:
    b = context.business
    lines = [f"- Business: {b.name or context.organization.name}"]
    if b.description:
        lines.append(f"- About: {b.description}")
    if b.industry:
        lines.append(f"- Industry: {b.industry}")
    if b.address:
        lines.append(f"- Address: {b.address}")
    if b.website:
        lines.append(f"- Website: {b.website}")
    if b.hours:
        lines.append(f"- Hours: {_render_hours(b.hours)}")
    if b.holidays:
        lines.append(f"- Closed on: {_render_hours(b.holidays)}")
    if context.memory:
        lines.append("- Things to remember:")
        lines += [f"  - {m.name}: {(m.content or '').strip()}" for m in context.memory]
    return "\n".join(lines)


def _render_hours(value: Any) -> str:
    if isinstance(value, dict):
        return "; ".join(f"{k}: {v}" for k, v in value.items())
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value)


def language_block(context: TenantContext, call: CallContext | None) -> str:
    """What language to speak, and what to do when the caller switches.

    Per line: an Urdu line runs monolingual STT, so code-switching is not
    supported there and the talker is told to stay in Urdu rather than
    guess at a half-recognised English phrase.
    """
    code = call.call.language if call else context.agent.primary_language
    caps = call.call.capabilities if call and call.call.capabilities else next((l for l in context.agent.languages if l.code == code), None)
    label = caps.label if caps else code
    others = [l for l in context.agent.languages if l.code != code]
    lines = [f"Speak {label}."]
    if caps and not caps.stt_multi:
        lines.append(f"This line understands {label} only. If the caller uses another language, ask them politely, in {label}, to continue in {label}.")
    elif others:
        lines.append("If the caller switches to " + ", ".join(l.label for l in others) + ", switch with them and stay there.")
    if caps and not caps.semantic_turns:
        lines.append("Pause a beat before answering: this line waits for silence rather than for the end of a thought, so let the caller finish.")
    return "\n".join(lines)


def caller_block(call: CallContext) -> str:
    """The projection of caller identity the talker may see: what they would recognise as their own. No internal ids."""
    c = call.caller
    lines: list[str] = []
    if c.contact:
        lines.append("- Status: known customer")
        for label, value in (("Name", c.contact.name), ("Email", c.contact.email), ("Company", c.contact.company)):
            if value:
                lines.append(f"- {label}: {value}")
    else:
        lines.append("- Status: not on file yet")
    if c.identifier.value:
        lines.append(f"- Calling from: {c.identifier.value}")
    if c.open_tickets:
        lines.append("- Open with the team: " + "; ".join(f"{t.reference} {t.subject} ({t.status})" for t in c.open_tickets))
    if c.recent_calls:
        lines.append("- Recent calls: " + "; ".join(f"{r.at or '?'}: {r.summary or 'no summary'}" for r in c.recent_calls))
    if c.identifier.blocked:
        lines.append("- This number is blocked. Be brief and polite and end the call.")
    return "\n".join(lines)


def skill_catalog(expert: ExpertRecord) -> str:
    """Name + description + read hint, one per line. Never the body."""
    if not expert.skills:
        return "(No skills are configured. Work from the business information and the tools you have.)"
    return "\n".join(f"- **{s.name}** — {s.description} (read with read_skill: {s.slug})" for s in expert.skills)


def ticket_types_block(context: TenantContext) -> str:
    if not context.ticket_types:
        return "(No ticket types configured; leave the type blank.)"
    return "\n".join(f"- {t.name}" + (f": {t.description}" if t.description else "") for t in context.ticket_types)


def peers_block(expert: ExpertRecord) -> str:
    return "\n".join(f"- {p}" for p in expert.peers) if expert.peers else ""


def talker_instructions(context: TenantContext, call: CallContext | None = None) -> str:
    talker = context.talker
    agent = context.agent
    persona = "\n\n".join(p for p in ((talker.system_prompt or "").strip() if talker else "", (agent.persona or "").strip()) if p)
    return fill(
        load("talker"),
        agent_name=agent.display_name or "the assistant",
        business_name=context.business.name or context.organization.name,
        persona=persona or "Warm, direct, brief. You sound like the best receptionist this business ever had.",
        greeting=agent.greeting or "",
        language=language_block(context, call),
        business=business_block(context),
        caller=caller_block(call) if call else "- Status: unknown (text conversation)",
        now=now_block(context),
    )


def worker_instructions(context: TenantContext, expert: ExpertRecord, call: CallContext | None = None) -> str:
    return fill(
        load("worker"),
        business_name=context.business.name or context.organization.name,
        persona=(expert.system_prompt or "").strip(),
        business=business_block(context),
        ticket_types=ticket_types_block(context),
        caller=caller_block(call) if call else "(Text conversation; no caller line.)",
        skills=skill_catalog(expert),
        peers=peers_block(expert),
        now=now_block(context),
    )


def post_call_instructions() -> str:
    return load("post-call").strip()


def text_instructions(context: TenantContext, expert: ExpertRecord | None) -> str:
    """The Ask / automation runner: one agent, no caller, may speak to the person directly."""
    persona = (expert.system_prompt if expert else "") or ""
    return fill(
        load("text"),
        business_name=context.business.name or context.organization.name,
        persona=persona.strip(),
        business=business_block(context),
        skills=skill_catalog(expert) if expert else "(none)",
        ticket_types=ticket_types_block(context),
        now=now_block(context),
    )


def chat_caller_block(caller: CallerInfo | None) -> str:
    """Who the live-chat customer is, as far as the business knows. No internal ids."""
    if caller is None:
        return "- Status: an anonymous visitor"
    lines: list[str] = []
    if caller.contact:
        lines.append("- Status: known customer")
        for label, value in (("Name", caller.contact.name), ("Email", caller.contact.email), ("Phone", caller.contact.phone), ("Company", caller.contact.company)):
            if value:
                lines.append(f"- {label}: {value}")
    else:
        lines.append("- Status: not on file yet")
    if caller.open_tickets:
        lines.append("- Open with the team: " + "; ".join(f"{t.reference} {t.subject} ({t.status})" for t in caller.open_tickets))
    if caller.recent_calls:
        lines.append("- Recent calls: " + "; ".join(f"{r.at or '?'}: {r.summary or 'no summary'}" for r in caller.recent_calls))
    return "\n".join(lines)


def chat_instructions(context: TenantContext, expert: ExpertRecord | None, caller: CallerInfo | None) -> str:
    """The live-chat agent: the phone agent's front-desk voice and the worker's
    tools and rules, in one text agent, talking to a customer."""
    talker = context.talker
    agent = context.agent
    persona = "\n\n".join(p for p in (
        (talker.system_prompt or "").strip() if talker else "",
        (agent.persona or "").strip(),
        (expert.system_prompt or "").strip() if expert else "",
    ) if p)
    return fill(
        load("chat"),
        agent_name=agent.display_name or "the assistant",
        business_name=context.business.name or context.organization.name,
        persona=persona or "Warm, direct, brief. You sound like the best receptionist this business ever had.",
        language=language_block(context, None).replace("Speak ", "Write in ", 1),
        business=business_block(context),
        caller=chat_caller_block(caller),
        ticket_types=ticket_types_block(context),
        skills=skill_catalog(expert) if expert else "(none)",
        now=now_block(context),
    )

