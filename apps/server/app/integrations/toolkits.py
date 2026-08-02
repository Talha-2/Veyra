"""Live Composio toolkit catalog: all 1000+ apps with real logos, categories,
tool counts, and auth schemes.

Replaces the hand curated app list. The catalog is fetched once from Composio's
REST API (cursor paginated, ~11 requests), then cached in memory and on disk so
the Integrations grid is instant and survives restarts. Falls back to the small
static catalog when no COMPOSIO_API_KEY is set, so the page is never empty.

  GET {BASE}/toolkits?limit=100&cursor=...   ->  items[], next_cursor
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

from ..config import DATA_DIR, settings
from .catalog import base_catalog

logger = logging.getLogger("voice-agent.toolkits")

BASE = "https://backend.composio.dev/api/v3.1"
CACHE_FILE = Path(DATA_DIR) / "composio_toolkits.json"
CACHE_TTL = 24 * 3600  # a day; the app catalog moves slowly

# curated slugs we surface first in the grid (everything else is still listed)
POPULAR = {
    "gmail", "googlecalendar", "googledrive", "googlesheets", "googledocs", "googlemeet",
    "slack", "github", "notion", "linear", "airtable", "asana", "calendly", "clickup",
    "dropbox", "trello", "jira", "hubspot", "salesforce", "zendesk", "intercom", "stripe",
    "shopify", "twilio", "discord", "zoom", "outlook", "microsoft_teams", "typeform", "mailchimp",
}

_lock = threading.Lock()
_mem: dict = {"ts": 0.0, "items": []}


def _api_get(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", headers={"x-api-key": settings.composio_api_key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _normalize(t: dict) -> dict:
    meta = t.get("meta") or {}
    cats = [c.get("name") for c in (meta.get("categories") or []) if c.get("name")]
    managed = t.get("composio_managed_auth_schemes") or []
    schemes = t.get("auth_schemes") or []
    slug = t.get("slug") or ""
    return {
        "slug": slug,
        "name": t.get("name") or slug,
        "description": (meta.get("description") or "").strip()[:240],
        "logo": meta.get("logo"),
        "categories": cats,
        "category": cats[0] if cats else "Other",
        "tools_count": meta.get("tools_count") or 0,
        "triggers_count": meta.get("triggers_count") or 0,
        "auth_schemes": schemes,
        "managed_schemes": managed,
        "no_auth": bool(t.get("no_auth")),
        "app_url": meta.get("app_url"),
        # OAuth via Composio managed auth needs no credentials from the user
        "oauth": any(str(s).upper().startswith("OAUTH") for s in managed),
        "popular": slug in POPULAR,
    }


def _fetch_all() -> list[dict]:
    """Page through the whole catalog via cursor pagination."""
    items: list[dict] = []
    cursor: str | None = None
    for _ in range(40):  # safety bound; 1000+ apps at 100/page is ~11 pages
        q = "/toolkits?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
        data = _api_get(q)
        page = data.get("items") or []
        items.extend(page)
        cursor = data.get("next_cursor")
        if not cursor or not page:
            break
    return [_normalize(t) for t in items if t.get("slug")]


def _fallback() -> list[dict]:
    """Static catalog so the grid still renders without a Composio key."""
    out = []
    for a in base_catalog():
        out.append({
            **a, "description": "", "categories": [a["category"]], "triggers_count": 0,
            "auth_schemes": ["OAUTH2"], "managed_schemes": ["OAUTH2"], "no_auth": False,
            "app_url": None, "tools_count": a.get("tools_count") or 0,
        })
    return out


def _load_disk() -> list[dict] | None:
    try:
        if CACHE_FILE.exists():
            blob = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            if time.time() - blob.get("ts", 0) < CACHE_TTL and blob.get("items"):
                return blob["items"]
    except Exception as exc:
        logger.warning("toolkit cache read failed: %s", exc)
    return None


def _save_disk(items: list[dict]) -> None:
    try:
        CACHE_FILE.write_text(json.dumps({"ts": time.time(), "items": items}), encoding="utf-8")
    except Exception as exc:
        logger.warning("toolkit cache write failed: %s", exc)


def all_toolkits(refresh: bool = False) -> list[dict]:
    """The full catalog. Memory cache -> disk cache -> live fetch -> fallback."""
    if not settings.composio_api_key:
        return _fallback()

    with _lock:
        if not refresh and _mem["items"] and time.time() - _mem["ts"] < CACHE_TTL:
            return _mem["items"]

        if not refresh:
            disk = _load_disk()
            if disk:
                _mem.update(ts=time.time(), items=disk)
                return disk

        try:
            items = _fetch_all()
            if items:
                _mem.update(ts=time.time(), items=items)
                _save_disk(items)
                logger.info("Composio catalog loaded: %d toolkits", len(items))
                return items
        except Exception as exc:
            logger.error("toolkit fetch failed: %s", exc)

        # a stale cache beats an empty grid
        return _mem["items"] or _load_disk() or _fallback()


def categories() -> list[dict]:
    """Distinct categories with app counts, most populated first."""
    counts: dict[str, int] = {}
    for t in all_toolkits():
        for c in t.get("categories") or ["Other"]:
            counts[c] = counts.get(c, 0) + 1
    return sorted(
        [{"name": k, "count": v} for k, v in counts.items()],
        key=lambda x: (-x["count"], x["name"].lower()),
    )


def search(q: str = "", category: str = "", popular_only: bool = False,
           offset: int = 0, limit: int = 60) -> dict:
    """Server side filter + paginate: 1000+ apps never ship to the browser at once."""
    items = all_toolkits()
    ql = (q or "").strip().lower()
    if ql:
        items = [t for t in items if ql in t["name"].lower() or ql in t["slug"].lower()
                 or ql in (t.get("description") or "").lower()]
    if category:
        items = [t for t in items if category in (t.get("categories") or [])]
    if popular_only:
        items = [t for t in items if t.get("popular")]

    # popular first, then richer apps (more tools), then alphabetical
    items = sorted(items, key=lambda t: (not t.get("popular"), -(t.get("tools_count") or 0), t["name"].lower()))
    total = len(items)
    return {"apps": items[offset: offset + limit], "total": total, "offset": offset, "limit": limit}


def get(slug: str) -> dict | None:
    return next((t for t in all_toolkits() if t["slug"] == slug), None)


_tools_cache: dict[str, list[dict]] = {}


def tools(slug: str, limit: int = 1200) -> list[dict]:
    """Every tool (action) this app exposes, so the user can see what the agent
    would actually be able to do. The largest apps carry ~900 tools, so page
    until the cursor runs out rather than truncating. Cached per app."""
    if not settings.composio_api_key:
        return []
    if slug in _tools_cache:
        return _tools_cache[slug]

    out: list[dict] = []
    cursor: str | None = None
    for _ in range(14):
        q = f"/tools?toolkit_slug={urllib.parse.quote(slug)}&limit=100"
        if cursor:
            q += f"&cursor={urllib.parse.quote(cursor)}"
        try:
            data = _api_get(q)
        except Exception as exc:
            logger.warning("tools(%s) failed: %s", slug, exc)
            break
        for t in data.get("items") or []:
            ip = t.get("input_parameters") or {}
            props = ip.get("properties") or {}
            required = set(ip.get("required") or [])
            # keep the parameter shape so a node can render real fields instead
            # of asking the user to hand write JSON
            params = [
                {
                    "name": pname,
                    "type": pv.get("type") or "string",
                    "description": (pv.get("description") or "").strip()[:160],
                    "required": pname in required,
                    "enum": (pv.get("enum") or [])[:12] or None,
                    "default": pv.get("default"),
                }
                for pname, pv in list(props.items())[:24]
            ]
            params.sort(key=lambda p: (not p["required"], p["name"]))
            out.append({
                "slug": t.get("slug"),
                "name": t.get("name") or t.get("slug"),
                "description": (t.get("description") or "").strip()[:200],
                "params": params,
                "no_auth": bool(t.get("no_auth")),
                "deprecated": bool(t.get("is_deprecated") or t.get("deprecated")),
            })
        cursor = data.get("next_cursor")
        if not cursor or len(out) >= limit:
            break

    _tools_cache[slug] = out
    return out


_triggers_cache: dict[str, list[dict]] = {}


def _schema_fields(schema: dict | None) -> list[dict]:
    """Flatten a JSON Schema into fields a form can render."""
    schema = schema or {}
    props = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    out = [
        {
            "name": n,
            "type": v.get("type") or "string",
            "description": (v.get("description") or "").strip()[:180],
            "required": n in required,
            "default": v.get("default"),
            "enum": (v.get("enum") or [])[:12] or None,
        }
        for n, v in list(props.items())[:20]
    ]
    out.sort(key=lambda f: (not f["required"], f["name"]))
    return out


def triggers(slug: str) -> list[dict]:
    """The events an app can fire.

    This is the other half of an integration. Tools are what the agent can *do*;
    triggers are what the app can *tell us*, so an expert can run when a Gmail
    message arrives rather than only when someone POSTs a URL.
    """
    if not settings.composio_api_key:
        return []
    if slug in _triggers_cache:
        return _triggers_cache[slug]

    out: list[dict] = []
    try:
        data = _api_get(f"/triggers_types?toolkit_slugs={urllib.parse.quote(slug)}&limit=50")
        for t in data.get("items") or []:
            out.append({
                "slug": t.get("slug"),
                "name": t.get("name") or t.get("slug"),
                "description": (t.get("description") or "").strip()[:220],
                "kind": t.get("type"),  # poll or webhook
                "instructions": (t.get("instructions") or "").strip()[:300],
                "config": _schema_fields(t.get("config")),
                # what the expert actually receives when it fires
                "payload": [f["name"] for f in _schema_fields(t.get("payload"))],
            })
    except Exception as exc:
        logger.warning("triggers(%s) failed: %s", slug, exc)

    _triggers_cache[slug] = out
    return out


def auth_spec(slug: str) -> dict:
    """What this app needs to connect.

    Managed OAuth apps need nothing from the user (we just hand back a redirect).
    Everything else (API key, bearer, basic) declares its fields in
    auth_config_details, so one generic form covers all 1000+ apps.
    """
    if not settings.composio_api_key:
        return {"mode": "OAUTH2", "managed": True, "fields": []}
    try:
        t = _api_get(f"/toolkits/{urllib.parse.quote(slug)}")
    except Exception as exc:
        logger.warning("auth_spec(%s) failed: %s", slug, exc)
        return {"mode": "OAUTH2", "managed": True, "fields": []}

    if t.get("no_auth"):
        return {"mode": "NO_AUTH", "managed": False, "fields": []}

    managed = t.get("composio_managed_auth_schemes") or []
    if any(str(s).upper().startswith("OAUTH") for s in managed):
        return {"mode": next(s for s in managed if str(s).upper().startswith("OAUTH")),
                "managed": True, "fields": []}

    def _field(f: dict, required: bool) -> dict:
        return {
            "name": f.get("name"),
            "label": f.get("displayName") or f.get("name"),
            "type": f.get("type") or "string",
            "description": f.get("description") or "",
            "required": required,
            "secret": "key" in (f.get("name") or "").lower() or "secret" in (f.get("name") or "").lower()
            or "token" in (f.get("name") or "").lower() or "password" in (f.get("name") or "").lower(),
        }

    for d in t.get("auth_config_details") or []:
        mode = (d.get("mode") or "").upper()
        if not mode or mode == "NO_AUTH":
            continue
        buckets = (d.get("fields") or {}).get("connected_account_initiation") or {}
        fields = [_field(f, True) for f in (buckets.get("required") or [])]
        fields += [_field(f, False) for f in (buckets.get("optional") or [])]
        return {"mode": mode, "managed": False, "fields": [f for f in fields if f["name"]]}

    return {"mode": "NO_AUTH", "managed": False, "fields": []}
