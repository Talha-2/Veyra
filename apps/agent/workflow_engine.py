"""Compiles workflow JSON specs (built in the studio / by the deep agent)
into LiveKit Agents constructs.

Each enabled workflow becomes one LLM function tool on the main agent
(`start_workflow_<slug>`); its description carries the trigger intent,
keywords, and examples — that's what makes the LLM fire it at the right
moment. Firing it hands the session off to a WorkflowAgent whose instructions
are the workflow's system prompt plus a compiled step script. Conversation
history rides along via chat_ctx, so the caller never repeats themselves —
the #1 complaint with IVR-style bots.
"""

from __future__ import annotations

import json
import logging
import re

import httpx
from livekit.agents import Agent, RunContext, function_tool

import backend
import transfers

logger = logging.getLogger("voice-agent.workflows")


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40] or "workflow"


def _steps_script(spec: dict) -> str:
    lines: list[str] = []
    for i, step in enumerate(spec.get("steps", []), 1):
        kind = step.get("type")
        if kind == "say":
            lines.append(f"{i}. Say (adapting naturally): \"{step.get('text', '')}\"")
        elif kind == "collect":
            lines.append(f"{i}. Collect the variable '{step.get('variable')}' from the caller, "
                         f"then store it with record_variable. One question, wait for the answer.")
        elif kind == "kb_lookup":
            lines.append(f"{i}. Search the knowledge base (hint: {step.get('query_hint', 'the caller topic')}) "
                         "before answering.")
        elif kind == "api_call":
            lines.append(f"{i}. Once all required variables are recorded, call finish_workflow — "
                         "it submits the collected data to the business system.")
        elif kind == "transfer":
            lines.append(f"{i}. Transfer the call ({step.get('mode', 'cold')}) using the transfer tool.")
        elif kind == "end_call":
            lines.append(f"{i}. Wrap up politely and end the conversation.")
    return "\n".join(lines)


class WorkflowAgent(Agent):
    def __init__(self, wf: dict, base_config: dict, chat_ctx=None) -> None:
        spec = wf["spec"]
        self._spec = spec
        self._wf_name = spec["name"]
        self._variables: dict[str, str] = {}
        self._required = {v["name"] for v in spec.get("variables", []) if v.get("required", True)}

        var_docs = "\n".join(
            f"- {v['name']}: {v['description']}" for v in spec.get("variables", [])
        ) or "(none)"
        steps = _steps_script(spec)

        instructions = (
            base_config["system_prompt"]
            + f"\n\n=== ACTIVE WORKFLOW: {self._wf_name} ===\n"
            + spec["system_prompt"]
            + f"\n\nVariables to collect:\n{var_docs}"
            + (f"\n\nStep script (follow the spirit, adapt to the caller):\n{steps}" if steps else "")
            + "\n\nStore every collected value immediately with record_variable. "
              "When the workflow's goal is met, call finish_workflow with a one-sentence "
              "summary. If the caller changes topic entirely, call exit_workflow."
        )
        # Whether we're taking over mid-call (handoff from the general agent) vs
        # being the entry agent. On a handoff the general agent has usually already
        # acknowledged the caller, so a second greeting here is the "it says
        # something, then re-introduces and asks the name again" double-open.
        self._handoff = chat_ctx is not None
        super().__init__(instructions=instructions, chat_ctx=chat_ctx)

    async def on_enter(self) -> None:
        if self._handoff:
            # If the general agent already asked the caller something on the way in,
            # stay silent and let them answer — speaking again doubles the greeting.
            last_assistant = ""
            try:
                for item in reversed(self.chat_ctx.items):
                    if getattr(item, "role", "") == "assistant" and getattr(item, "text_content", ""):
                        last_assistant = item.text_content
                        break
            except Exception:
                pass
            if last_assistant.rstrip().endswith("?"):
                return  # they were just asked something; wait for the answer
            # otherwise continue the flow with the first question, no greeting
            self.session.generate_reply(instructions=(
                "You just took over to run this flow. Do NOT greet or re-introduce yourself "
                "— the caller was already acknowledged. Ask only for the first detail the "
                "flow needs, in one short, natural line."))
            return

        first = self._spec.get("first_message")
        if first:
            await self.session.say(first, allow_interruptions=True)
        else:
            self.session.generate_reply()

    @function_tool
    async def search_knowledge_base(self, context: RunContext, query: str) -> str:
        """Search the business knowledge base. Use before answering factual questions."""
        results = await backend.search_knowledge_base(query)
        if not results:
            return "No relevant information found in the knowledge base."
        return "\n---\n".join(f"[{r['doc_name']}] {r['text']}" for r in results[:4])

    @function_tool
    async def record_variable(self, context: RunContext, name: str, value: str) -> str:
        """Store a collected workflow variable (call immediately after the caller provides it)."""
        self._variables[name] = value
        missing = self._required - set(self._variables)
        return f"Stored {name}. Still missing: {sorted(missing) if missing else 'nothing — all collected'}."

    @function_tool
    async def finish_workflow(self, context: RunContext, summary: str) -> str:
        """Complete the workflow: submits collected data to any configured business webhook
        and returns to the general assistant. Call when the workflow goal is achieved."""
        missing = self._required - set(self._variables)
        if missing:
            return f"Cannot finish yet — missing required variables: {sorted(missing)}. Collect them first."

        submitted = []
        for step in self._spec.get("steps", []):
            if step.get("type") == "api_call" and step.get("url"):
                try:
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        payload = {"workflow": self._wf_name, "summary": summary,
                                   "variables": self._variables}
                        if step.get("payload_template"):
                            try:
                                rendered = step["payload_template"].format(**self._variables)
                                payload = json.loads(rendered)
                            except Exception:
                                pass  # fall back to the default payload shape
                        if step.get("method", "POST") == "GET":
                            await client.get(step["url"], params=self._variables)
                        else:
                            await client.post(step["url"], json=payload)
                        submitted.append(step["url"])
                except Exception as exc:
                    logger.error("workflow api_call failed: %s", exc)
                    return ("The business system could not be reached. Apologize, tell the "
                            "caller their request was noted, and offer a callback.")
        logger.info("workflow '%s' finished: vars=%s submitted=%s",
                    self._wf_name, self._variables, submitted)
        return (f"Workflow complete (data: {json.dumps(self._variables)}). Confirm to the "
                "caller in one short sentence and ask if they need anything else.")

    @function_tool
    async def exit_workflow(self, context: RunContext) -> str:
        """Leave this workflow because the caller changed topic. Keep helping them normally."""
        return ("Workflow exited. Continue as the general assistant and address the "
                "caller's new topic.")

    @function_tool
    async def transfer_to_human(self, context: RunContext, reason: str) -> str:
        """Transfer the caller to a human (cold transfer)."""
        return await transfers.cold_transfer()


def build_workflow_tools(workflows: list[dict], base_config: dict):
    """One dispatch tool per enabled workflow, attached to the main agent."""
    tools = []
    for wf in workflows:
        spec = wf.get("spec", {})
        trigger = spec.get("trigger", {})
        desc_bits = [spec.get("description", "")]
        if trigger.get("intent"):
            desc_bits.append(f"Trigger when: {trigger['intent']}.")
        if trigger.get("keywords"):
            desc_bits.append("Trigger phrases: " + ", ".join(trigger["keywords"]) + ".")
        if trigger.get("examples"):
            desc_bits.append("Example utterances: " + " | ".join(trigger["examples"][:5]))
        desc_bits.append(
            "Call this the moment the caller's intent matches, with NO spoken preamble — "
            "do not acknowledge or ask anything first; the flow greets them itself."
        )
        description = " ".join(b for b in desc_bits if b) or f"Start the {spec.get('name')} workflow."

        def _make_handler(wf_inner: dict):
            async def handler(context: RunContext):
                logger.info("workflow triggered: %s", wf_inner["spec"]["name"])
                next_agent = WorkflowAgent(
                    wf_inner, base_config,
                    chat_ctx=context.session.current_agent.chat_ctx,
                )
                return next_agent, f"Entering the {wf_inner['spec']['name']} workflow."
            return handler

        tools.append(function_tool(
            _make_handler(wf),
            name=f"start_workflow_{_slug(spec.get('name', 'wf'))}",
            description=description[:1000],
        ))
    return tools


def call_start_workflow(workflows: list[dict]) -> dict | None:
    """A workflow with trigger.type == call_start takes over the whole call."""
    for wf in workflows:
        if wf.get("spec", {}).get("trigger", {}).get("type") == "call_start":
            return wf
    return None
