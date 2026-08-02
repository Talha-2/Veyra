"""Tool belt for the deep agent (and, via apps/mcp, for any MCP client).

Every capability of the product is expressed here once: knowledge base CRUD +
search, workflow CRUD + validation, voice tuning config, and eval runs. The
deep agent chat loop and the MCP server both call these functions, so
"everything can be created through the agent" holds by construction.
"""

from __future__ import annotations

import json

from sqlmodel import Session, select

from ..db import Document, Workflow, engine, new_id, now
from ..rag import store
from ..workflows.schema import EXAMPLE_WORKFLOW, validate_workflow

# ── knowledge base ───────────────────────────────────────────────────────


def kb_list() -> list[dict]:
    with Session(engine) as s:
        docs = s.exec(select(Document).order_by(Document.created_at.desc())).all()
        return [
            {"id": d.id, "name": d.name, "status": d.status, "n_chunks": d.n_chunks,
             "source_type": d.source_type, "size_bytes": d.size_bytes}
            for d in docs
        ]


def kb_read(doc_id: str) -> dict:
    with Session(engine) as s:
        d = s.get(Document, doc_id)
        if d is None:
            return {"error": f"document {doc_id} not found"}
        return {"id": d.id, "name": d.name, "status": d.status, "content": d.content}


def kb_create(name: str, content: str) -> dict:
    from ..rag import ingest as ingest_mod

    with Session(engine) as s:
        doc = Document(
            id=new_id("doc"), name=name, source_type="agent",
            mime="text/markdown", size_bytes=len(content.encode()), content=content,
        )
        s.add(doc)
        s.commit()
        chunks = ingest_mod.chunk_text(content)
        n = store.index_chunks(doc.id, doc.name, chunks)
        doc.n_chunks = n
        doc.status = "ready"
        doc.updated_at = now()
        s.add(doc)
        s.commit()
        return {"id": doc.id, "name": doc.name, "n_chunks": n, "status": "ready"}


def kb_update(doc_id: str, content: str, name: str | None = None) -> dict:
    from ..rag import ingest as ingest_mod

    with Session(engine) as s:
        doc = s.get(Document, doc_id)
        if doc is None:
            return {"error": f"document {doc_id} not found"}
        doc.content = content
        if name:
            doc.name = name
        chunks = ingest_mod.chunk_text(content)
        doc.n_chunks = store.index_chunks(doc.id, doc.name, chunks)
        doc.status = "ready"
        doc.size_bytes = len(content.encode())
        doc.updated_at = now()
        s.add(doc)
        s.commit()
        return {"id": doc.id, "name": doc.name, "n_chunks": doc.n_chunks}


def kb_delete(doc_id: str) -> dict:
    with Session(engine) as s:
        doc = s.get(Document, doc_id)
        if doc is None:
            return {"error": f"document {doc_id} not found"}
        store.delete_document(doc_id)
        s.delete(doc)
        s.commit()
        return {"ok": True, "deleted": doc_id}


def kb_search(query: str, top_k: int = 6) -> list[dict]:
    return store.search(query, top_k=top_k)


# ── workflows ────────────────────────────────────────────────────────────


def workflow_list() -> list[dict]:
    with Session(engine) as s:
        rows = s.exec(select(Workflow)).all()
        return [{"id": w.id, "name": w.name, "enabled": w.enabled, "spec": w.spec} for w in rows]


def workflow_get_example() -> dict:
    return EXAMPLE_WORKFLOW


def workflow_create(spec: dict, enabled: bool = True) -> dict:
    errors = validate_workflow(spec)
    if errors:
        return {"error": "validation failed", "errors": errors}
    with Session(engine) as s:
        wf = Workflow(
            id=new_id("wf"), name=spec["name"],
            description=spec.get("description", ""),
            enabled=enabled, spec_json=json.dumps(spec),
        )
        s.add(wf)
        s.commit()
        return {"id": wf.id, "name": wf.name, "enabled": wf.enabled}


def workflow_update(wf_id: str, spec: dict, enabled: bool | None = None) -> dict:
    errors = validate_workflow(spec)
    if errors:
        return {"error": "validation failed", "errors": errors}
    with Session(engine) as s:
        wf = s.get(Workflow, wf_id)
        if wf is None:
            return {"error": f"workflow {wf_id} not found"}
        wf.name = spec["name"]
        wf.description = spec.get("description", "")
        wf.spec_json = json.dumps(spec)
        if enabled is not None:
            wf.enabled = enabled
        wf.updated_at = now()
        s.add(wf)
        s.commit()
        return {"id": wf.id, "name": wf.name, "enabled": wf.enabled}


def workflow_delete(wf_id: str) -> dict:
    with Session(engine) as s:
        wf = s.get(Workflow, wf_id)
        if wf is None:
            return {"error": f"workflow {wf_id} not found"}
        s.delete(wf)
        s.commit()
        return {"ok": True, "deleted": wf_id}


# ── voice tuning config ──────────────────────────────────────────────────


def voice_config_get() -> dict:
    from ..routers.livekit_routes import DEFAULT_AGENT_CONFIG
    from ..db import AgentConfig

    with Session(engine) as s:
        row = s.get(AgentConfig, 1)
        stored = json.loads(row.config_json) if row else {}
        return {**DEFAULT_AGENT_CONFIG, **stored}


def voice_config_update(config: dict) -> dict:
    from ..routers.livekit_routes import DEFAULT_AGENT_CONFIG
    from ..db import AgentConfig

    unknown = set(config) - set(DEFAULT_AGENT_CONFIG)
    if unknown:
        return {"error": f"unknown config keys: {sorted(unknown)}",
                "allowed": sorted(DEFAULT_AGENT_CONFIG)}
    with Session(engine) as s:
        row = s.get(AgentConfig, 1) or AgentConfig(id=1)
        merged = {**json.loads(row.config_json or "{}"), **config}
        row.config_json = json.dumps(merged)
        row.updated_at = now()
        s.add(row)
        s.commit()
        return {**DEFAULT_AGENT_CONFIG, **merged}


# ── OpenAI-style tool schemas ────────────────────────────────────────────

TOOL_DEFS: list[dict] = [
    {"name": "kb_list", "description": "List all knowledge base documents with status and chunk counts.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "kb_read", "description": "Read the full text content of a knowledge base document.",
     "parameters": {"type": "object", "properties": {"doc_id": {"type": "string"}}, "required": ["doc_id"]}},
    {"name": "kb_create", "description": "Create a new knowledge base document (markdown/plain text). It is chunked, embedded, and indexed immediately so the voice agent can use it.",
     "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "content": {"type": "string"}}, "required": ["name", "content"]}},
    {"name": "kb_update", "description": "Replace the content (and optionally the name) of a document; re-indexes it.",
     "parameters": {"type": "object", "properties": {"doc_id": {"type": "string"}, "content": {"type": "string"}, "name": {"type": "string"}}, "required": ["doc_id", "content"]}},
    {"name": "kb_delete", "description": "Delete a knowledge base document and its index entries.",
     "parameters": {"type": "object", "properties": {"doc_id": {"type": "string"}}, "required": ["doc_id"]}},
    {"name": "kb_search", "description": "Hybrid (vector + BM25) search over the knowledge base. Use to check what the voice agent would retrieve for a given caller question.",
     "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}}, "required": ["query"]}},
    {"name": "workflow_list", "description": "List all voice-agent workflows with their full JSON specs.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "workflow_get_example", "description": "Get a complete example workflow spec showing every field (use as a template).",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "workflow_create", "description": "Create a voice-agent workflow from a JSON spec (validated against the workflow schema; returns errors if invalid).",
     "parameters": {"type": "object", "properties": {"spec": {"type": "object"}, "enabled": {"type": "boolean"}}, "required": ["spec"]}},
    {"name": "workflow_update", "description": "Update an existing workflow's spec and/or enabled state.",
     "parameters": {"type": "object", "properties": {"wf_id": {"type": "string"}, "spec": {"type": "object"}, "enabled": {"type": "boolean"}}, "required": ["wf_id", "spec"]}},
    {"name": "workflow_delete", "description": "Delete a workflow.",
     "parameters": {"type": "object", "properties": {"wf_id": {"type": "string"}}, "required": ["wf_id"]}},
    {"name": "voice_config_get", "description": "Get the live voice-agent tuning config (system prompt, STT/TTS models, VAD/endpointing/interruption settings).",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "voice_config_update", "description": "Update voice-agent tuning config keys (partial update). Applies to the next call session.",
     "parameters": {"type": "object", "properties": {"config": {"type": "object"}}, "required": ["config"]}},
]

TOOL_IMPLS = {
    "kb_list": kb_list,
    "kb_read": kb_read,
    "kb_create": kb_create,
    "kb_update": kb_update,
    "kb_delete": kb_delete,
    "kb_search": kb_search,
    "workflow_list": workflow_list,
    "workflow_get_example": workflow_get_example,
    "workflow_create": workflow_create,
    "workflow_update": workflow_update,
    "workflow_delete": workflow_delete,
    "voice_config_get": voice_config_get,
    "voice_config_update": voice_config_update,
}
