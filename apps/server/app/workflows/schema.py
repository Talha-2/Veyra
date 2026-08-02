"""The workflow spec — one JSON document per workflow.

A workflow is: a trigger (when the voice agent should enter it), a system
prompt overlay (how it behaves once inside), variables to collect, and an
ordered list of steps. The voice worker compiles enabled workflows into
LLM function tools; when the LLM fires one, the session hands off to a
sub-agent built from this spec (see apps/agent/workflow_engine.py).

Kept deliberately flat: triggers are declarative, steps are a small closed
vocabulary. Anything fancier belongs in the system prompt, not the schema —
schemas that try to encode conversation trees break the moment a real caller
goes off-script.
"""

import jsonschema

WORKFLOW_SCHEMA: dict = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["name", "trigger", "system_prompt"],
    "additionalProperties": False,
    "properties": {
        "name": {"type": "string", "minLength": 1, "maxLength": 80},
        "description": {"type": "string", "maxLength": 500},
        "trigger": {
            "type": "object",
            "required": ["type"],
            "additionalProperties": False,
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["intent", "keyword", "call_start"],
                },
                # intent: natural-language description matched by the LLM
                "intent": {"type": "string", "maxLength": 300},
                # keyword: any literal match in the user's transcript
                "keywords": {
                    "type": "array",
                    "items": {"type": "string", "minLength": 1},
                    "maxItems": 30,
                },
                # examples improve tool-selection accuracy dramatically
                "examples": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 10,
                },
            },
        },
        "system_prompt": {"type": "string", "minLength": 1, "maxLength": 8000},
        "first_message": {"type": "string", "maxLength": 1000},
        "variables": {
            "type": "array",
            "maxItems": 20,
            "items": {
                "type": "object",
                "required": ["name", "description"],
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"},
                    "description": {"type": "string"},
                    "required": {"type": "boolean", "default": True},
                },
            },
        },
        "steps": {
            "type": "array",
            "maxItems": 30,
            "items": {
                "type": "object",
                "required": ["type"],
                "additionalProperties": False,
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "say",          # speak a (templated) line
                            "collect",      # gather a variable from the caller
                            "kb_lookup",    # force a RAG query before answering
                            "api_call",     # webhook out to a business system
                            "transfer",     # hand the call to a human
                            "end_call",     # polite wrap-up + hangup
                        ],
                    },
                    "text": {"type": "string"},          # say
                    "variable": {"type": "string"},      # collect
                    "query_hint": {"type": "string"},    # kb_lookup
                    "url": {"type": "string"},           # api_call
                    "method": {"type": "string", "enum": ["GET", "POST"]},
                    "payload_template": {"type": "string"},
                    "mode": {"type": "string", "enum": ["cold", "warm"]},  # transfer
                    "target": {"type": "string"},        # transfer override
                },
            },
        },
        "settings": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                # workflows can override voice tuning, e.g. a payment-collection
                # flow that must never interrupt the caller mid-card-number
                "allow_interruptions": {"type": "boolean"},
                "language": {"type": "string"},
                "voice_id": {"type": "string"},
            },
        },
    },
}


def validate_workflow(spec: dict) -> list[str]:
    """Return a list of human-readable validation errors (empty = valid)."""
    validator = jsonschema.Draft202012Validator(WORKFLOW_SCHEMA)
    errors = [
        f"{'/'.join(str(p) for p in e.path) or '<root>'}: {e.message}"
        for e in validator.iter_errors(spec)
    ]
    trigger = spec.get("trigger", {})
    if trigger.get("type") == "intent" and not trigger.get("intent"):
        errors.append("trigger: type 'intent' requires an 'intent' description")
    if trigger.get("type") == "keyword" and not trigger.get("keywords"):
        errors.append("trigger: type 'keyword' requires a non-empty 'keywords' list")
    # steps that reference variables must declare them
    declared = {v["name"] for v in spec.get("variables", [])}
    for i, step in enumerate(spec.get("steps", [])):
        if step.get("type") == "collect" and step.get("variable") not in declared:
            errors.append(f"steps/{i}: collect references undeclared variable '{step.get('variable')}'")
        if step.get("type") == "api_call" and not step.get("url"):
            errors.append(f"steps/{i}: api_call requires 'url'")
    return errors


EXAMPLE_WORKFLOW: dict = {
    "name": "Book an appointment",
    "description": "Collects caller details and books a service appointment.",
    "trigger": {
        "type": "intent",
        "intent": "Caller wants to schedule, reschedule, or ask about booking an appointment",
        "examples": [
            "I'd like to book an appointment",
            "can I come in on Friday",
            "necesito una cita",
        ],
    },
    "system_prompt": (
        "You are now handling an appointment booking. Be brisk and warm. "
        "Collect the caller's name, preferred date/time, and service needed — "
        "one question at a time, never two. Confirm the details back once, "
        "in one short sentence, before finalizing."
    ),
    "first_message": "Happy to get that booked for you. What's your name?",
    "variables": [
        {"name": "caller_name", "description": "Caller's full name", "required": True},
        {"name": "datetime_pref", "description": "Preferred date and time", "required": True},
        {"name": "service", "description": "Requested service", "required": True},
    ],
    "steps": [
        {"type": "collect", "variable": "caller_name"},
        {"type": "collect", "variable": "service"},
        {"type": "collect", "variable": "datetime_pref"},
        {"type": "kb_lookup", "query_hint": "business hours and availability"},
        {"type": "say", "text": "You're all set, {caller_name} — {service} at {datetime_pref}."},
    ],
}
