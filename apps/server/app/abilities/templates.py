"""Starting points for a workflow.

A blank canvas is the worst part of any builder: you know what you want the
agent to do, not which nodes express it. These are complete, runnable flows
built around the things that actually make voice agents work:

  - collect one thing per turn, and save it under a name you can reuse
  - look the answer up before speaking, never improvise business facts
  - always have a path for "we could not help", because it happens on real calls
  - end the call explicitly, so the agent does not trail off

Each template is a real graph (trigger, wired nodes, positions) so it opens on
the canvas laid out and ready to edit.
"""

from __future__ import annotations

import uuid


def _id(p: str) -> str:
    return f"{p}_{uuid.uuid4().hex[:8]}"


def _appointment() -> list[dict]:
    t, greet, name, contact, when, look, confirm, end = (
        _id("trg"), _id("n"), _id("n"), _id("n"), _id("n"), _id("n"), _id("n"), _id("end"))
    return [
        {"id": t, "type": "trigger", "label": "Caller wants to book", "trigger_kind": "phrase",
         "phrases": ["When someone wants to book an appointment",
                     "When someone asks about availability",
                     "When someone wants to schedule a visit"],
         "next": greet, "position": {"x": 320, "y": 0}},
        {"id": greet, "type": "speak", "label": "Greeting",
         "text": "Happy to get that booked for you. It will only take a moment.",
         "next": name, "position": {"x": 320, "y": 130}},
        {"id": name, "type": "ask", "label": "Full name",
         "prompt": "Can I take your full name?", "save_as": "caller_name",
         "next": contact, "position": {"x": 320, "y": 270}},
        {"id": contact, "type": "ask", "label": "Contact",
         "prompt": "What is the best number or email to send the confirmation to?",
         "save_as": "caller_contact", "next": when, "position": {"x": 320, "y": 410}},
        {"id": when, "type": "ask", "label": "Preferred time",
         "prompt": "What day and rough time suits you best?", "save_as": "preferred_time",
         "next": look, "position": {"x": 320, "y": 550}},
        {"id": look, "type": "act", "label": "Check availability", "placeholder": True,
         "instruction": "Check availability for {preferred_time} and hold the closest slot for {caller_name}.",
         "save_as": "booked_slot", "next": confirm, "position": {"x": 320, "y": 690}},
        {"id": confirm, "type": "speak", "label": "Confirm back",
         "text": "You are booked for {booked_slot}, {caller_name}. Confirmation goes to {caller_contact}.",
         "next": end, "position": {"x": 320, "y": 830}},
        {"id": end, "type": "end", "label": "End", "position": {"x": 360, "y": 970}},
    ]


def _lead() -> list[dict]:
    t, intro, need, size, cond, demo, info, end = (
        _id("trg"), _id("n"), _id("n"), _id("n"), _id("cond"), _id("n"), _id("n"), _id("end"))
    b_hot, b_cold = _id("b"), _id("b")
    return [
        {"id": t, "type": "trigger", "label": "Inbound enquiry", "trigger_kind": "phrase",
         "phrases": ["When someone asks about pricing",
                     "When someone wants to know if you can help their business",
                     "When someone asks for a demo"],
         "next": intro, "position": {"x": 320, "y": 0}},
        {"id": intro, "type": "speak", "label": "Open",
         "text": "Glad you called. Let me ask two quick things so I point you the right way.",
         "next": need, "position": {"x": 320, "y": 130}},
        {"id": need, "type": "ask", "label": "What they need",
         "prompt": "What are you hoping to solve?", "save_as": "need",
         "next": size, "position": {"x": 320, "y": 270}},
        {"id": size, "type": "ask", "label": "Team size",
         "prompt": "Roughly how many people would be using it?", "save_as": "team_size",
         "next": cond, "position": {"x": 320, "y": 410}},
        {"id": cond, "type": "speak", "label": "Decide the next step",
         "text": "Thanks, that helps.",
         "pathways": [
             {"id": b_hot, "label": "Worth a live demo",
              "description": "A team of roughly six or more, or a need our product clearly fits",
              "next": demo},
             {"id": b_cold, "label": "Send details instead",
              "description": "A very small team, just browsing, or a need we do not serve",
              "next": info},
         ],
         "position": {"x": 320, "y": 550}},
        {"id": demo, "type": "act", "label": "Book a demo", "placeholder": True,
         "instruction": "Create a qualified lead for {need}, team size {team_size}, and book a demo.",
         "save_as": "demo_slot", "next": end, "position": {"x": 620, "y": 700}},
        {"id": info, "type": "speak", "label": "Send details",
         "text": "I will send over details you can read at your own pace, and we are here when you need us.",
         "next": end, "position": {"x": 60, "y": 700}},
        {"id": end, "type": "end", "label": "End", "position": {"x": 360, "y": 850}},
    ]


def _support() -> list[dict]:
    t, ask, look, cond, answer, transfer, end = (
        _id("trg"), _id("n"), _id("n"), _id("cond"), _id("n"), _id("n"), _id("end"))
    b_found, b_missing = _id("b"), _id("b")
    return [
        {"id": t, "type": "trigger", "label": "Support question", "trigger_kind": "phrase",
         "phrases": ["When someone has a problem with their order",
                     "When someone asks how something works",
                     "When someone needs help with their account"],
         "next": ask, "position": {"x": 320, "y": 0}},
        {"id": ask, "type": "ask", "label": "What is wrong",
         "prompt": "Tell me what is going on and I will look it up.", "save_as": "issue",
         "next": look, "position": {"x": 320, "y": 140}},
        {"id": look, "type": "act", "label": "Search knowledge base",
         "tool": {"kind": "kb", "ref": "knowledge_base", "label": "Knowledge Base"},
         "instruction": "Search the knowledge base for an answer to {issue}.",
         "save_as": "kb_answer",
         "loop_condition": "the lookup has come back, either with an answer or with nothing",
         "pathways": [
             {"id": b_found, "label": "Found an answer",
              "description": "The knowledge base returned something that actually answers the question",
              "next": answer},
             {"id": b_missing, "label": "Nothing useful came back",
              "description": "The lookup was empty, or what came back does not answer what they asked",
              "next": transfer},
         ],
         "position": {"x": 320, "y": 300}},
        {"id": answer, "type": "speak", "label": "Answer",
         "text": "Here is what I found: {kb_answer}. Does that sort it out?",
         "next": end, "position": {"x": 620, "y": 580}},
        {"id": transfer, "type": "speak", "label": "Hand off honestly",
         "text": "I do not want to guess at this one. Let me get you to a colleague who can help properly.",
         "next": end, "position": {"x": 40, "y": 580}},
        {"id": end, "type": "end", "label": "End", "position": {"x": 360, "y": 730}},
    ]


def _order() -> list[dict]:
    t, ask, look, say, end = _id("trg"), _id("n"), _id("n"), _id("n"), _id("end")
    return [
        {"id": t, "type": "trigger", "label": "Order status", "trigger_kind": "phrase",
         "phrases": ["When someone asks where their order is",
                     "When someone asks about delivery",
                     "When someone wants to track a package"],
         "next": ask, "position": {"x": 320, "y": 0}},
        {"id": ask, "type": "ask", "label": "Order number",
         "prompt": "What is your order number? Take your time, I will read it back.",
         "save_as": "order_number", "next": look, "position": {"x": 320, "y": 140}},
        {"id": look, "type": "act", "label": "Look up order", "placeholder": True,
         "instruction": "Look up order {order_number} and return its status and expected date.",
         "save_as": "order_status", "next": say, "position": {"x": 320, "y": 280}},
        {"id": say, "type": "speak", "label": "Read status back",
         "text": "Order {order_number} is {order_status}. Anything else I can check?",
         "next": end, "position": {"x": 320, "y": 420}},
        {"id": end, "type": "end", "label": "End", "position": {"x": 360, "y": 560}},
    ]


def _callback() -> list[dict]:
    t, apolog, name, number, when, task, confirm, end = (
        _id("trg"), _id("n"), _id("n"), _id("n"), _id("n"), _id("n"), _id("n"), _id("end"))
    return [
        {"id": t, "type": "trigger", "label": "Wants a human", "trigger_kind": "phrase",
         "phrases": ["When someone asks to speak to a person",
                     "When someone wants a callback",
                     "When the caller is frustrated with the agent"],
         "next": apolog, "position": {"x": 320, "y": 0}},
        {"id": apolog, "type": "speak", "label": "Acknowledge",
         "text": "Of course. Everyone is with another caller right now, so let me take your details and have someone call you back.",
         "next": name, "position": {"x": 320, "y": 130}},
        {"id": name, "type": "ask", "label": "Name",
         "prompt": "Who should they ask for?", "save_as": "caller_name",
         "next": number, "position": {"x": 320, "y": 280}},
        {"id": number, "type": "ask", "label": "Number",
         "prompt": "And the best number to reach you on?", "save_as": "callback_number",
         "next": when, "position": {"x": 320, "y": 420}},
        {"id": when, "type": "ask", "label": "Best time",
         "prompt": "When is a good time to call?", "save_as": "callback_window",
         "next": task, "position": {"x": 320, "y": 560}},
        {"id": task, "type": "act", "label": "Create callback task", "placeholder": True,
         "instruction": "Create a callback task for {caller_name} on {callback_number} during {callback_window}.",
         "next": confirm, "position": {"x": 320, "y": 700}},
        {"id": confirm, "type": "speak", "label": "Confirm",
         "text": "Done. Someone will call you on {callback_number} during {callback_window}.",
         "next": end, "position": {"x": 320, "y": 840}},
        {"id": end, "type": "end", "label": "End", "position": {"x": 360, "y": 980}},
    ]


def _blank() -> list[dict]:
    t, greet, end = _id("trg"), _id("n"), _id("end")
    return [
        {"id": t, "type": "trigger", "label": "Trigger", "trigger_kind": "phrase",
         "phrases": [], "next": greet, "position": {"x": 320, "y": 40}},
        {"id": greet, "type": "speak", "label": "Greeting",
         "text": "Hi, how can I help you today?", "next": end, "position": {"x": 320, "y": 180}},
        {"id": end, "type": "end", "label": "End", "position": {"x": 360, "y": 320}},
    ]


TEMPLATES: list[dict] = [
    {"key": "blank", "name": "Blank flow", "icon": "Plus", "category": "Start here",
     "description": "A trigger, one line, and an end. Build it your way.",
     "build": _blank},
    {"key": "appointment", "name": "Book an appointment", "icon": "CalendarCheck", "category": "Booking",
     "description": "Collects name, contact and preferred time, checks availability, then reads the booking back.",
     "build": _appointment},
    {"key": "support", "name": "Answer and escalate", "icon": "LifeBuoy", "category": "Support",
     "description": "Searches your knowledge base first and hands off to a human rather than guessing.",
     "build": _support},
    {"key": "lead", "name": "Qualify a lead", "icon": "Target", "category": "Sales",
     "description": "Asks what they need and how big the team is, then books a demo or sends details.",
     "build": _lead},
    {"key": "order", "name": "Order status", "icon": "Package", "category": "Support",
     "description": "Takes an order number, looks it up, and reads the status back clearly.",
     "build": _order},
    {"key": "callback", "name": "Take a callback", "icon": "PhoneCall", "category": "Support",
     "description": "For when the caller wants a human: takes details and logs a callback task.",
     "build": _callback},
]


def list_templates() -> list[dict]:
    """Catalog for the gallery, with a step count so the card is honest."""
    out = []
    for t in TEMPLATES:
        nodes = t["build"]()
        steps = [n for n in nodes if n["type"] not in ("trigger", "end")]
        out.append({
            "key": t["key"], "name": t["name"], "description": t["description"],
            "icon": t["icon"], "category": t["category"], "steps": len(steps),
            "phrases": next((n.get("phrases") or [] for n in nodes if n["type"] == "trigger"), []),
        })
    return out


def build(key: str) -> tuple[list[dict], list[str]] | None:
    """(nodes, trigger phrases) for a template key."""
    t = next((x for x in TEMPLATES if x["key"] == key), None)
    if t is None:
        return None
    nodes = t["build"]()
    phrases = next((n.get("phrases") or [] for n in nodes if n["type"] == "trigger"), [])
    return nodes, phrases
