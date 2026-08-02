"""Compile a pathway into the instructions the voice worker runs.

The model is a pathway, not a state machine. The agent is always in exactly one
node. Each node says what to do, what to extract, and when it is allowed to move
on. Every way out of a node is a *pathway* carrying a short natural language
label ("caller wants to change details"), and the agent picks the one that
matches what actually happened on the call.

That is the difference that matters: real callers do not branch on
`variable == value`, they branch on intent. Labels let the model route on
meaning, which is the one thing it is genuinely good at.

Compiled shape:

    <global prompt>
    NODE 2 — Collect Information
      Say: ...
      Extract: caller_name (string) — the caller's full name
      Stay here until: ...
      Then take one pathway:
        - "All information collected" -> NODE 3
        - "Caller wants to change details" -> NODE 2
"""

from __future__ import annotations

from .models import Ability

# nodes that mark structure rather than something the agent says
_STRUCTURAL = {"start", "trigger", "return"}


def _pathways_of(node: dict) -> list[dict]:
    """Every way out of a node, normalised.

    New flows store `pathways`. Older ones store a bare `next`, and condition
    nodes store `branches`; both are read here so existing flows keep working.
    """
    if node.get("pathways"):
        return [p for p in node["pathways"] if p.get("next")]

    out: list[dict] = []
    for b in node.get("branches") or []:  # legacy condition node
        if not b.get("next"):
            continue
        var, op, val = b.get("variable"), b.get("operator"), b.get("value")
        label = b.get("label") or "branch"
        desc = f"{var} {op} {val}".strip() if var else "none of the other paths apply"
        out.append({"label": label, "description": desc, "next": b["next"]})
    if out:
        return out

    if node.get("next"):  # legacy linear step
        out.append({"label": "", "description": "", "next": node["next"], "always": True})
    return out


def _describe_extraction(node: dict) -> list[str]:
    """The variable this node saves from the caller's answer, if any."""
    if node.get("save_as"):
        return [f"`{node['save_as']}`"]
    return []


def _node_body(node: dict, tools: list[dict]) -> list[str]:
    """What the agent does inside this node."""
    t = node.get("type")
    body: list[str] = []

    prompt = (node.get("prompt_md") or "").strip()
    if prompt:
        body.append("  Do this: " + prompt.replace("\n", "\n    "))
    elif t == "speak" and node.get("text"):
        body.append(f'  Say (adapt naturally, do not read word for word): "{node["text"]}"')
    elif t == "ask" and node.get("prompt"):
        body.append(f'  Ask: "{node["prompt"]}" — one question at a time, then wait.')
    elif t == "act":
        tool = node.get("tool") or {}
        if tool.get("ref"):
            tools.append(tool)
            name = tool.get("label") or tool["ref"]
            body.append(f'  {node.get("instruction") or f"Use {name}"} (use the {name} tool).')
        else:
            # No tool is bound to this action. Telling the model to "use the
            # tool" anyway is what makes it invent one and read the call out
            # loud as XML. Degrade to something it can actually do: take the
            # details and promise a follow up.
            body.append(
                f'  {node.get("instruction") or "Handle this step"} — you have NO tool for this. '
                "Do not call a function. Take down whatever detail you need and tell the caller "
                "a colleague will confirm shortly."
            )
    elif t == "agent":
        body.append(f'  Work autonomously toward: {node.get("goal") or "the task"}. Use your tools.')
    elif t == "webhook":
        wh = node.get("webhook") or {}
        method = (wh.get("method") or "POST").upper()
        url = wh.get("url") or "the configured endpoint"
        body.append(f"  Call {method} {url} and wait for the response.")
        if node.get("say_while_waiting"):
            body.append(f'  While it runs, say something like: "{node["say_while_waiting"]}"')
        got = [f"`{v.get('name')}`" for v in (wh.get("response_vars") or []) if v.get("name")]
        if got:
            body.append("  From the response you will have: " + ", ".join(got))
    elif t == "subflow":
        body.append(f'  Run the "{node.get("subflow_name") or "subflow"}" steps, then come back.')
    elif t == "end":
        body.append("  Wrap up politely and end the call.")

    for tool in node.get("tools") or []:  # extra tools attached to this node
        if tool.get("ref"):
            tools.append(tool)
    if node.get("tools"):
        names = ", ".join(t.get("label") or t.get("ref") for t in node["tools"])
        body.append(f"  Tools you may call here: {names}.")

    saved = _describe_extraction(node)
    if saved:
        body.append("  Remember the caller's answer as: " + "; ".join(saved))

    loop = (node.get("loop_condition") or "").strip()
    if loop:
        body.append(f"  Stay in this node until: {loop}")

    s = node.get("settings") or {}
    if s.get("block_interruptions"):
        body.append("  Do not stop for interruptions here; this must be heard in full.")
    if s.get("skip_response"):
        body.append("  Do not wait for a reply; continue straight on.")
    return body


def compile_ability(ability: Ability) -> dict:
    nodes = ability.nodes
    order = {n.get("id"): i + 1 for i, n in enumerate(nodes)}

    lines: list[str] = []
    tools: list[dict] = []

    # trigger: a trigger node wins, else the flat field on the ability
    trigger_node = next((n for n in nodes if n.get("type") == "trigger"), None)
    triggers = (trigger_node or {}).get("phrases") or ability.triggers
    if triggers:
        quoted = "; ".join(f'"{t}"' for t in triggers)
        lines.append(f"Follow this pathway when the caller: {quoted}.")
        lines.append("")

    global_prompt = (getattr(ability, "global_prompt", "") or "").strip()
    if global_prompt:
        lines.append(global_prompt)
        lines.append("")

    lines.append(
        "You are following a conversation pathway. You are always in exactly one node. "
        "Do what the node says, extract what it asks for, then take the one pathway out "
        "that matches what actually happened. If none of them fit, stay where you are."
    )
    lines.append("")

    for n in nodes:
        t = n.get("type")
        if t in _STRUCTURAL:
            continue
        num = order.get(n.get("id"), 0)
        label = n.get("label") or t or "Step"
        head = f"NODE {num} — {label}"
        if trigger_node and (trigger_node.get("next") == n.get("id")):
            head += "  [entry]"
        lines.append(head)

        s = n.get("settings") or {}
        if global_prompt and s.get("include_global_prompt") is False:
            lines.append("  (the global instructions above do not apply in this node)")

        lines.extend(_node_body(n, tools))

        paths = _pathways_of(n)
        if paths:
            if len(paths) == 1 and (paths[0].get("always") or not paths[0].get("label")):
                lines.append(f"  Then go to NODE {order.get(paths[0]['next'], '?')}.")
            else:
                lines.append("  Then take one pathway:")
                for p in paths:
                    tgt = order.get(p["next"], "?")
                    desc = (p.get("description") or "").strip()
                    suffix = f" ({desc})" if desc else ""
                    mark = " [take this by default]" if p.get("always") else ""
                    lines.append(f'    - "{p.get("label") or "continue"}"{suffix} -> NODE {tgt}{mark}')
                lines.append("    If none of these fit, stay in this node.")
        elif t != "end":
            lines.append("  This node has no pathway out yet.")
        lines.append("")

    # de-duplicate tools while keeping order
    seen, uniq = set(), []
    for tool in tools:
        key = (tool.get("kind"), tool.get("ref"))
        if key not in seen:
            seen.add(key)
            uniq.append(tool)

    # Structural problems the author cannot see on the canvas. An unbound
    # action is the worst of these: the pathway looks complete, deploys
    # cleanly, and then the agent improvises a tool call on a live call.
    warnings: list[dict] = []
    for n in nodes:
        if n.get("type") == "act" and not (n.get("tool") or {}).get("ref"):
            # A template placeholder is intentional scaffolding — it deploys with
            # graceful degradation (take details, promise follow up) so the
            # template works out of the box, and stays flagged for the user to
            # wire a real tool. A user-built unbound action is a mistake worth blocking.
            placeholder = bool(n.get("placeholder"))
            warnings.append({
                "node_id": n.get("id"),
                "level": "warning" if placeholder else "error",
                "message": f'Action "{n.get("label") or n.get("id")}" has no tool connected. '
                           + ("Connect your tool here when ready; until then the agent takes "
                              "the details and promises a follow up."
                              if placeholder else
                              "The agent cannot perform it and will tell the caller someone "
                              "will follow up. Connect a tool, or change it to a Speak step."),
            })
        if n.get("type") == "webhook" and not (n.get("webhook") or {}).get("url"):
            warnings.append({
                "node_id": n.get("id"),
                "level": "error",
                "message": f'Webhook "{n.get("label") or n.get("id")}" has no URL set.',
            })

    return {"script": "\n".join(lines).rstrip(), "tools": uniq,
            "name": ability.name, "triggers": triggers, "warnings": warnings}
