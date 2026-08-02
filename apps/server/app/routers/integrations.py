"""Integrations API: Composio connected apps, custom HTTP actions, and MCP
servers — the tools the voice agent can call mid-conversation.

Composio calls are stub-safe (browsable catalog + working custom actions / MCP
even without a COMPOSIO_API_KEY). The voice worker pulls /agent-tools at session
start to load everything as function tools.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import engine, get_session, new_id, now
from ..integrations import composio_service as cs
from ..integrations import mcp_client
from ..integrations import toolkits as tk
from ..integrations.actions import action_tool_schema, execute_action
from ..integrations.models import Connection, CustomAction, McpServer

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# ── status + catalog ──────────────────────────────────────────────────────


@router.get("/status")
def status():
    return {
        "composio_configured": cs.is_configured(),
        # a read only key browses the catalog fine but cannot connect anything
        "composio_can_write": cs.can_write() if cs.is_configured() else False,
    }


@router.get("/apps")
def apps(
    q: str = "",
    category: str = "",
    popular: bool = False,
    offset: int = 0,
    limit: int = 60,
    session: Session = Depends(get_session),
):
    """The live Composio catalog (1000+ apps), filtered and paged server side."""
    connected = {
        c.toolkit for c in session.exec(select(Connection).where(Connection.status == "active")).all()
    }
    res = tk.search(q=q, category=category, popular_only=popular, offset=offset, limit=min(limit, 120))
    for app in res["apps"]:
        app["connected"] = app["slug"] in connected
    return {**res, "configured": cs.is_configured()}


@router.get("/categories")
def categories():
    return {"categories": tk.categories()}


@router.get("/apps/{slug}/auth")
def app_auth(slug: str):
    """What this app needs in order to connect: managed OAuth, or typed fields."""
    app = tk.get(slug)
    if app is None:
        raise HTTPException(404, "App not found")
    return {"app": app, "auth": tk.auth_spec(slug)}


@router.get("/apps/{slug}/tools")
def app_tools(slug: str, q: str = "", limit: int = 0):
    """Every action this app exposes, with its parameters.

    Powers both the "view tools" panel and the action picker inside an Act node,
    so a node can offer the real fields an action takes rather than a JSON box.
    """
    app = tk.get(slug)
    if app is None:
        raise HTTPException(404, "App not found")
    items = tk.tools(slug)
    ql = (q or "").strip().lower()
    if ql:
        items = [t for t in items
                 if ql in t["name"].lower() or ql in t["slug"].lower()
                 or ql in (t.get("description") or "").lower()]
    total = len(items)
    if limit:
        items = items[:limit]
    return {"tools": items, "total": total,
            "app": {"slug": app["slug"], "name": app["name"], "logo": app.get("logo")}}


@router.get("/triggers")
def app_triggers(toolkit: str = "", connected_only: bool = True,
                 session: Session = Depends(get_session)):
    """Events the connected apps can fire, to start an expert.

    Defaults to apps that are actually connected: offering a Gmail trigger on an
    account that was never authorised would just fail at subscribe time.
    """
    if toolkit:
        app = tk.get(toolkit)
        if app is None:
            raise HTTPException(404, "App not found")
        return {"app": {"slug": app["slug"], "name": app["name"], "logo": app.get("logo")},
                "triggers": tk.triggers(toolkit)}

    conns = session.exec(select(Connection).where(Connection.status == "active")).all()
    out = []
    for c in conns:
        app = tk.get(c.toolkit) or {}
        trg = tk.triggers(c.toolkit) if connected_only else []
        if trg:
            out.append({
                "slug": c.toolkit,
                "name": app.get("name") or c.app_name,
                "logo": app.get("logo"),
                "triggers": trg,
            })
    return {"apps": out}


@router.get("/logos")
def logos(slugs: str = ""):
    """Logo URLs for a set of toolkits, so nodes can brand themselves in one call."""
    want = [s.strip().lower() for s in slugs.split(",") if s.strip()]
    out = {}
    for s in want:
        app = tk.get(s)
        if app:
            out[s] = {"logo": app.get("logo"), "name": app["name"]}
    return {"logos": out}


@router.post("/catalog/refresh")
def refresh_catalog():
    items = tk.all_toolkits(refresh=True)
    return {"count": len(items)}


# ── Composio connections ────────────────────────────────────────────────


class ConnectRequest(BaseModel):
    toolkit: str
    scheme: str = ""
    credentials: dict = {}


def _conn_out(c: Connection) -> dict:
    app = tk.get(c.toolkit) or {}
    return {
        "id": c.id,
        "toolkit": c.toolkit,
        "app_name": c.app_name,
        "status": c.status,
        "connected_email": c.connected_email,
        "created_at": c.created_at.isoformat(),
        # catalog metadata so the connected card matches the library card
        "logo": app.get("logo"),
        "description": app.get("description"),
        "category": app.get("category"),
        "tools_count": app.get("tools_count") or 0,
    }


@router.post("/connect")
def connect(req: ConnectRequest, session: Session = Depends(get_session)):
    toolkit = req.toolkit.lower().strip()
    if not cs.is_configured():
        return {"configured": False}

    spec = tk.auth_spec(toolkit)
    # managed OAuth needs nothing from the user; everything else takes typed fields
    if spec.get("managed") or spec.get("mode") == "NO_AUTH":
        result = cs.authorize(toolkit)
    else:
        if not req.credentials:
            raise HTTPException(400, f"{toolkit} needs credentials to connect")
        result = cs.connect_with_credentials(toolkit, req.scheme or spec.get("mode") or "API_KEY", req.credentials)

    if not result.get("configured"):
        return {"configured": False}
    if result.get("error"):
        raise HTTPException(502, f"Composio: {result['error']}")

    app = tk.get(toolkit)
    redirect = result.get("redirect_url")
    conn = Connection(
        id=new_id("conn"),
        toolkit=toolkit,
        app_name=(app or {}).get("name") or toolkit,
        composio_connection_id=result.get("composio_connection_id"),
        # key based connects come back live immediately; OAuth waits on the redirect
        status="initiated" if redirect else (result.get("status") or "active"),
    )
    session.add(conn)
    session.commit()
    return {"configured": True, "redirect_url": redirect, "connection_id": conn.id, "status": conn.status}


@router.get("/connections")
def connections(session: Session = Depends(get_session)):
    rows = session.exec(select(Connection).order_by(Connection.created_at.desc())).all()
    # sync any pending connections from Composio (flip initiated -> active)
    for c in rows:
        if c.status in ("initiated", "initializing") and c.composio_connection_id:
            st = cs.connection_status(c.composio_connection_id)
            if st.get("status"):
                mapped = "active" if st["status"] == "active" else st["status"]
                if mapped != c.status or st.get("email"):
                    c.status = mapped
                    c.connected_email = st.get("email") or c.connected_email
                    c.updated_at = now()
                    session.add(c)
    session.commit()
    out = []
    for c in rows:
        d = _conn_out(c)
        if c.status == "active":
            tools = cs.get_openai_tools([c.toolkit])
            d["tools"] = [{"name": t.get("function", {}).get("name", ""), "description": ""} for t in tools][:20]
        out.append(d)
    return out


@router.delete("/connections/{conn_id}")
def delete_connection(conn_id: str, session: Session = Depends(get_session)):
    c = session.get(Connection, conn_id)
    if c is None:
        raise HTTPException(404, "Connection not found")
    session.delete(c)
    session.commit()
    return {"ok": True}


# ── custom actions ────────────────────────────────────────────────────────


class ActionRequest(BaseModel):
    name: str
    description: str = ""
    method: str = "POST"
    url: str
    auth_type: str = "none"
    auth_value: str = ""
    args: list[dict] = []
    headers: dict = {}
    enabled: bool = True


def _action_out(a: CustomAction) -> dict:
    return {
        "id": a.id, "name": a.name, "description": a.description, "method": a.method,
        "url": a.url, "auth_type": a.auth_type, "args": a.args, "headers": a.headers,
        "enabled": a.enabled,
    }


@router.get("/actions")
def list_actions(session: Session = Depends(get_session)):
    rows = session.exec(select(CustomAction).order_by(CustomAction.created_at.desc())).all()
    return [_action_out(a) for a in rows]


@router.post("/actions")
def create_action(req: ActionRequest, session: Session = Depends(get_session)):
    a = CustomAction(
        id=new_id("act"), name=req.name, description=req.description, method=req.method,
        url=req.url, auth_type=req.auth_type, auth_value=req.auth_value,
        args_json=json.dumps(req.args), headers_json=json.dumps(req.headers), enabled=req.enabled,
    )
    session.add(a)
    session.commit()
    return _action_out(a)


@router.put("/actions/{action_id}")
def update_action(action_id: str, req: ActionRequest, session: Session = Depends(get_session)):
    a = session.get(CustomAction, action_id)
    if a is None:
        raise HTTPException(404, "Action not found")
    a.name, a.description, a.method, a.url = req.name, req.description, req.method, req.url
    a.auth_type, a.auth_value = req.auth_type, req.auth_value
    a.args_json, a.headers_json, a.enabled = json.dumps(req.args), json.dumps(req.headers), req.enabled
    a.updated_at = now()
    session.add(a)
    session.commit()
    return _action_out(a)


@router.delete("/actions/{action_id}")
def delete_action(action_id: str, session: Session = Depends(get_session)):
    a = session.get(CustomAction, action_id)
    if a is None:
        raise HTTPException(404, "Action not found")
    session.delete(a)
    session.commit()
    return {"ok": True}


@router.post("/actions/{action_id}/test")
async def test_action(action_id: str, arguments: dict | None = None, session: Session = Depends(get_session)):
    a = session.get(CustomAction, action_id)
    if a is None:
        raise HTTPException(404, "Action not found")
    return await execute_action(a, arguments or {})


# ── MCP servers ───────────────────────────────────────────────────────────


class McpTestRequest(BaseModel):
    url: str
    transport: str = "streamable_http"
    auth_type: str = "none"
    auth_value: str = ""


class McpCreateRequest(McpTestRequest):
    name: str


def _mcp_out(m: McpServer) -> dict:
    return {
        "id": m.id, "name": m.name, "url": m.url, "transport": m.transport,
        "auth_type": m.auth_type, "status": m.status, "enabled": m.enabled, "tools": m.tools,
    }


@router.get("/mcp")
def list_mcp(session: Session = Depends(get_session)):
    rows = session.exec(select(McpServer).order_by(McpServer.created_at.desc())).all()
    return [_mcp_out(m) for m in rows]


@router.post("/mcp/test")
async def test_mcp(req: McpTestRequest):
    return await mcp_client.list_tools(req.url, req.transport, req.auth_type, req.auth_value)


@router.post("/mcp")
async def create_mcp(req: McpCreateRequest, session: Session = Depends(get_session)):
    probe = await mcp_client.list_tools(req.url, req.transport, req.auth_type, req.auth_value)
    m = McpServer(
        id=new_id("mcp"), name=req.name, url=req.url, transport=req.transport,
        auth_type=req.auth_type, auth_value=req.auth_value,
        tools_json=json.dumps(probe.get("tools", [])),
        status="connected" if probe.get("ok") else "error",
    )
    session.add(m)
    session.commit()
    return _mcp_out(m)


@router.delete("/mcp/{mcp_id}")
def delete_mcp(mcp_id: str, session: Session = Depends(get_session)):
    m = session.get(McpServer, mcp_id)
    if m is None:
        raise HTTPException(404, "MCP server not found")
    session.delete(m)
    session.commit()
    return {"ok": True}


class ExecuteRequest(BaseModel):
    kind: str  # "composio" | "action" | "mcp"
    ref: str  # composio tool slug | action id | mcp server id
    name: str = ""  # mcp tool name
    arguments: dict = {}


@router.post("/execute")
async def execute_tool(req: ExecuteRequest, session: Session = Depends(get_session)):
    """Unified tool execution called by the voice worker's tool handlers."""
    if req.kind == "composio":
        return cs.execute(req.ref, req.arguments)
    if req.kind == "action":
        a = session.get(CustomAction, req.ref)
        if a is None:
            return {"successful": False, "error": "action not found"}
        return await execute_action(a, req.arguments)
    if req.kind == "mcp":
        m = session.get(McpServer, req.ref)
        if m is None:
            return {"successful": False, "error": "mcp server not found"}
        return await mcp_client.call_tool(m.url, m.transport, m.auth_type, m.auth_value, req.name, req.arguments)
    return {"successful": False, "error": f"unknown kind {req.kind}"}


# ── aggregated tools for the voice worker ────────────────────────────────


@router.get("/agent-tools")
def agent_tools(session: Session = Depends(get_session)):
    """Everything the voice agent should load as callable tools this session:
    Composio tool schemas (flattened for LiveKit raw_schema), custom-action
    schemas, and MCP server connection info (agent uses native MCP)."""
    toolkits = [
        c.toolkit for c in session.exec(select(Connection).where(Connection.status == "active")).all()
    ]
    composio_tools: list[dict] = []
    if toolkits and cs.is_configured():
        for t in cs.get_openai_tools(toolkits):
            fn = t.get("function", t)  # composio returns nested {type, function}
            composio_tools.append({
                "slug": fn.get("name"),
                "description": fn.get("description", ""),
                "parameters": fn.get("parameters", {"type": "object", "properties": {}}),
            })

    actions = [
        {"id": a.id, "schema": action_tool_schema(a)}
        for a in session.exec(select(CustomAction).where(CustomAction.enabled == True)).all()  # noqa: E712
    ]
    mcps = [
        {"id": m.id, "name": m.name, "url": m.url, "transport": m.transport,
         "auth_type": m.auth_type, "auth_value": m.auth_value}
        for m in session.exec(select(McpServer).where(McpServer.enabled == True)).all()  # noqa: E712
        if m.status == "connected"
    ]
    return {
        "composio_configured": cs.is_configured(),
        "composio_tools": composio_tools,
        "custom_actions": actions,
        "mcp_servers": mcps,
    }
