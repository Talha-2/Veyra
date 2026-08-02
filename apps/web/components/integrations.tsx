"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown, Plus, Search, Trash2, X, Check, Loader2,
  KeyRound, ShieldCheck, Unlock, Eye, ExternalLink,
} from "lucide-react";
import { api, AppCard, AuthSpec, ConnectionRow, ToolRow } from "@/lib/api";
import { Modal, Spinner } from "@/components/ui";

/* Real Composio logo with a graceful initials fallback if the image fails. */
export function AppLogo({ app, size = 44 }: { app: { name: string; logo?: string | null; color?: string }; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = app.name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (app.logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="app-logo"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className="app-logo app-logo--fallback" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials || "?"}
    </div>
  );
}

function AuthBadge({ app }: { app: AppCard }) {
  if (app.no_auth) return <span className="badge"><Unlock size={11} /> No auth</span>;
  if (app.oauth) return <span className="badge badge-success"><ShieldCheck size={11} /> OAuth</span>;
  return <span className="badge badge-mono"><KeyRound size={11} /> API key</span>;
}

/* ── live catalog: 1000+ apps, searched and paged on the server ────────── */

const PAGE = 60;

export function AppGrid({
  connectedSlugs,
  connecting,
  onConnect,
  onViewTools,
  refreshKey = 0,
}: {
  connectedSlugs: Set<string>;
  connecting: string | null;
  onConnect: (app: AppCard) => void;
  onViewTools: (app: AppCard) => void;
  refreshKey?: number;
}) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [cat, setCat] = useState("");
  const [popularOnly, setPopularOnly] = useState(false);
  const [cats, setCats] = useState<{ name: string; count: number }[]>([]);
  const [apps, setApps] = useState<AppCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250); // debounce so typing does not hammer the API
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api.get("/api/integrations/categories").then((r) => setCats(r.categories || [])).catch(() => {});
  }, []);

  const fetchPage = (offset: number) => {
    const p = new URLSearchParams({
      q: dq, category: cat, popular: String(popularOnly),
      offset: String(offset), limit: String(PAGE),
    });
    return api.get(`/api/integrations/apps?${p.toString()}`);
  };

  useEffect(() => {
    let stale = false;
    setLoading(true);
    fetchPage(0)
      .then((r) => { if (!stale) { setApps(r.apps || []); setTotal(r.total || 0); } })
      .catch(() => { if (!stale) { setApps([]); setTotal(0); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, cat, popularOnly, refreshKey]);

  const loadMore = async () => {
    setMore(true);
    try {
      const r = await fetchPage(apps.length);
      setApps((a) => [...a, ...(r.apps || [])]);
    } finally { setMore(false); }
  };

  // "more categories below" affordance: fade + chevron, hidden once you reach the end
  const railRef = useRef<HTMLDivElement>(null);
  const [railMore, setRailMore] = useState(false);
  const syncRail = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setRailMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);
  useLayoutEffect(syncRail, [cats, syncRail]);
  useEffect(() => {
    window.addEventListener("resize", syncRail);
    return () => window.removeEventListener("resize", syncRail);
  }, [syncRail]);

  return (
    <div className="int-browse">
      {/* category rail: scrolls on its own, never the page */}
      <aside className="int-rail hidden lg:flex">
        <label className="mb-3 flex shrink-0 items-center gap-2 text-[13px]">
          <input type="checkbox" checked={popularOnly} onChange={(e) => setPopularOnly(e.target.checked)} />
          Popular only
        </label>
        <div className="sidebar-group-label shrink-0" style={{ marginTop: 4 }}>Categories</div>

        <div className="int-rail__wrap">
          <div className="int-rail__scroll" ref={railRef} onScroll={syncRail}>
            <button onClick={() => setCat("")} className={`sidebar-item ${cat === "" ? "active" : ""}`} style={{ height: 32, fontSize: 13 }}>
              <span className="flex-1 text-left">All apps</span>
            </button>
            {cats.map((c) => (
              <button
                key={c.name}
                onClick={() => setCat(c.name)}
                className={`sidebar-item ${cat === c.name ? "active" : ""}`}
                style={{ height: 32, fontSize: 13 }}
                title={c.name}
              >
                <span className="flex-1 truncate text-left capitalize">{c.name}</span>
                <span className="text-tertiary text-[11px]">{c.count}</span>
              </button>
            ))}
          </div>

          {railMore && (
            <button
              className="int-rail__more"
              aria-label="Scroll for more categories"
              onClick={() => railRef.current?.scrollBy({ top: 220, behavior: "smooth" })}
            >
              <span className="int-rail__chev"><ChevronDown size={14} /></span>
            </button>
          )}
        </div>
      </aside>

      {/* apps column: header stays put, the grid scrolls under the cursor */}
      <div className="int-apps">
        <div className="int-apps__head">
          <div className="relative mb-3">
            <Search size={16} className="text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input pl-9" placeholder="Search 1000+ integrations" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-tertiary mb-4 text-[12px]">
            {loading ? "Loading catalog" : `${total.toLocaleString()} app${total === 1 ? "" : "s"}${cat ? ` in ${cat}` : ""}`}
          </p>
        </div>

        <div className="int-apps__scroll">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[188px] w-full rounded-[var(--radius-md)]" />)}
            </div>
          ) : apps.length === 0 ? (
            <p className="text-tertiary py-16 text-center text-sm">No integrations match your search.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {apps.map((app) => {
                  const isConnected = connectedSlugs.has(app.slug) || app.connected;
                  const isBusy = connecting === app.slug;
                  return (
                    <div key={app.slug} className="app-card">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <AppLogo app={app} />
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {app.popular && <span className="badge badge-accent">Popular</span>}
                          <AuthBadge app={app} />
                        </div>
                      </div>
                      <h3 className="truncate text-[15px] font-semibold">{app.name}</h3>
                      <p className="app-card__desc">{app.description || app.category}</p>
                      <div className="mt-auto flex items-center gap-2 pt-4">
                        {isConnected ? (
                          <button className="btn btn-secondary flex-1" disabled><Check size={15} /> Connected</button>
                        ) : (
                          <button className="btn btn-primary flex-1" onClick={() => onConnect(app)} disabled={isBusy}>
                            {isBusy ? <Spinner size={15} /> : <Plus size={15} />} Connect
                          </button>
                        )}
                        {!!app.tools_count && (
                          <button className="tool-count" onClick={() => onViewTools(app)} title={`View the ${app.tools_count} tools`}>
                            <Eye size={12} /> {app.tools_count}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {apps.length < total && (
                <div className="mt-8 flex justify-center">
                  <button className="btn btn-secondary" onClick={loadMore} disabled={more}>
                    {more && <Spinner size={15} />} Load more ({total - apps.length} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── connect modal: managed OAuth, or a generic form for key based apps ── */

export function ConnectModal({
  app, onClose, onConnected,
}: {
  app: AppCard;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [spec, setSpec] = useState<AuthSpec | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const doneRef = useRef(onConnected);
  doneRef.current = onConnected;

  useEffect(() => {
    api.get(`/api/integrations/apps/${app.slug}/auth`)
      .then((r) => setSpec(r.auth))
      .catch((e) => setError(e.message));
  }, [app.slug]);

  // while the user authorizes in the other tab, poll until Composio marks it active
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const conns = await api.get("/api/integrations/connections");
        if (conns.some((c: any) => c.toolkit === app.slug && c.status === "active")) {
          clearInterval(timer);
          doneRef.current();
        }
      } catch { /* keep polling */ }
      if (tries > 40) clearInterval(timer); // give up after ~2 minutes
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, app.slug]);

  const submit = async () => {
    setBusy(true); setError(null);

    // Open the tab NOW, synchronously. A window.open() that runs after an await
    // is not tied to the click and browsers block it as a popup, which is why
    // the OAuth screen never appeared. Do not pass noopener: it returns null.
    const popup = spec?.managed ? window.open("", "_blank") : null;

    try {
      const r = await api.post("/api/integrations/connect", {
        toolkit: app.slug,
        scheme: spec?.mode || "",
        credentials: spec?.managed ? {} : values,
      });
      if (r.configured === false) {
        popup?.close();
        setError("Connecting apps needs a Composio API key in .env.");
        return;
      }
      if (r.redirect_url) {
        if (popup && !popup.closed) popup.location.href = r.redirect_url;
        else setAuthUrl(r.redirect_url); // popup was blocked: offer a manual link
        setWaiting(true);
        return; // stay open and poll until the authorization lands
      }
      onConnected(); // key based apps connect immediately
    } catch (e: any) {
      popup?.close();
      setError(e.message);
    } finally { setBusy(false); }
  };

  const missing = (spec?.fields || []).filter((f) => f.required && !values[f.name]?.trim()).length > 0;

  return (
    <Modal title={`Connect ${app.name}`} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <AppLogo app={app} size={40} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{app.name}</div>
          <div className="text-tertiary truncate text-[12px]">{app.tools_count || 0} tools · {app.category}</div>
        </div>
      </div>

      {waiting ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] p-3" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}>
            <Spinner size={16} />
            <div className="text-[13px]">
              <b>Waiting for you to authorize {app.name}.</b>
              <p className="text-tertiary mt-1">Approve access in the other tab. This updates automatically once it is done.</p>
            </div>
          </div>
          {authUrl && (
            <div>
              <p className="hint mb-2">Your browser blocked the popup. Open the authorization page manually:</p>
              <a className="btn btn-primary w-full" href={authUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Authorize {app.name}
              </a>
            </div>
          )}
          <div className="flex justify-end"><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
        </div>
      ) : !spec ? (
        <div className="flex items-center gap-2 py-6"><Spinner size={16} /> <span className="text-secondary text-[13px]">Checking what this app needs</span></div>
      ) : (
        <div className="space-y-4">
          {spec.managed ? (
            <p className="hint">This app uses managed OAuth. A new tab opens so you can authorize {app.name}, then you are returned here. No credentials are stored by us.</p>
          ) : spec.fields.length === 0 ? (
            <p className="hint">This app needs no authentication.</p>
          ) : (
            <>
              <p className="hint">Enter your {app.name} credentials. They are stored by Composio, not by us.</p>
              {spec.fields.map((f) => (
                <div key={f.name}>
                  <label className="label">{f.label}{f.required ? "" : " (optional)"}</label>
                  <input
                    className="input mono"
                    type={f.secret ? "password" : "text"}
                    value={values[f.name] || ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    placeholder={f.description || f.label}
                  />
                </div>
              ))}
            </>
          )}

          {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}

          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy || (!spec.managed && missing)}>
              {busy ? <Spinner size={15} /> : <Plus size={15} />}
              {spec.managed ? `Continue to ${app.name}` : "Connect"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── tools detail: what the agent can actually do with this app ────────── */

export function ToolsModal({
  app, onClose,
}: {
  app: { slug: string; name: string; logo?: string | null; category?: string };
  onClose: () => void;
}) {
  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get(`/api/integrations/apps/${app.slug}/tools`)
      .then((r) => setTools(r.tools || []))
      .catch(() => setTools([]));
  }, [app.slug]);

  const ql = q.trim().toLowerCase();
  const list = (tools || []).filter(
    (t) => !ql || t.name.toLowerCase().includes(ql) || t.slug.toLowerCase().includes(ql) || t.description.toLowerCase().includes(ql),
  );

  return (
    <Modal wide title={`${app.name} tools`} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <AppLogo app={app} size={40} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{app.name}</div>
          <div className="text-tertiary text-[12px]">
            {tools === null ? "Loading tools" : `${tools.length} tools the agent can call`}
          </div>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9" placeholder="Search tools" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {tools === null ? (
        <div className="flex items-center gap-2 py-8"><Spinner size={16} /> <span className="text-secondary text-[13px]">Loading tools</span></div>
      ) : list.length === 0 ? (
        <p className="text-tertiary py-10 text-center text-sm">
          {tools.length === 0 ? "No tools listed for this app." : "No tools match your search."}
        </p>
      ) : (
        <div className="tool-list">
          {list.map((t) => (
            <div key={t.slug} className="tool-row">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{t.name}</div>
                <div className="mono text-tertiary text-[11px]">{t.slug}</div>
                {t.description && <p className="text-secondary mt-1 text-[12px] leading-relaxed">{t.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ── connected account card ────────────────────────────────────────────── */

export function ConnectedAppCard({
  conn, onViewTools, onRemove,
}: {
  conn: ConnectionRow;
  onViewTools: () => void;
  onRemove: () => void;
}) {
  const active = conn.status === "active";
  return (
    <div className="app-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <AppLogo app={{ name: conn.app_name || conn.toolkit, logo: conn.logo }} />
        <div className="flex items-center gap-1.5">
          {active
            ? <span className="badge badge-success"><Check size={11} /> Connected</span>
            : <span className="badge badge-warning"><span className="dot dot-pulse" /> {conn.status}</span>}
          <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={onRemove} title="Disconnect"><Trash2 size={14} /></button>
        </div>
      </div>

      <h3 className="truncate text-[15px] font-semibold">{conn.app_name || conn.toolkit}</h3>
      <p className="app-card__desc">
        {active
          ? (conn.connected_email ? `Connected as ${conn.connected_email}` : "Account linked and ready")
          : "Waiting for authorization to finish."}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button className="btn btn-secondary flex-1" onClick={onViewTools}>
          <Eye size={15} /> View tools
        </button>
        {!!conn.tools_count && <span className="badge badge-mono shrink-0">{conn.tools_count} tools</span>}
      </div>
    </div>
  );
}

/* ── Create custom action modal ───────────────────────────────────────── */

type ActionArg = { name: string; description: string; required: boolean; location: string };

export function CreateActionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [authType, setAuthType] = useState("none");
  const [authValue, setAuthValue] = useState("");
  const [method, setMethod] = useState("POST");
  const [url, setUrl] = useState("");
  const [args, setArgs] = useState<ActionArg[]>([]);
  const [headers, setHeaders] = useState<[string, string][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/integrations/actions", {
        name,
        description,
        method,
        url,
        auth_type: authType,
        auth_value: authValue,
        args,
        headers: Object.fromEntries(headers.filter(([k]) => k)),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal wide title="Create action" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Action name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Create CRM lead" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="textarea min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this action does — the agent uses this to decide when to call it."
          />
        </div>
        <div>
          <label className="label">Authentication</label>
          <select className="select" value={authType} onChange={(e) => setAuthType(e.target.value)}>
            <option value="none">No auth</option>
            <option value="bearer">Bearer token</option>
            <option value="header">Custom header (Name: Value)</option>
            <option value="basic">Basic (user:pass)</option>
          </select>
          {authType !== "none" && (
            <input
              className="input mt-2 mono"
              value={authValue}
              onChange={(e) => setAuthValue(e.target.value)}
              placeholder={authType === "header" ? "X-Api-Key: abc123" : authType === "basic" ? "user:pass" : "token"}
            />
          )}
        </div>
        <div>
          <label className="label">Endpoint</label>
          <div className="flex gap-2">
            <select className="select w-28" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>POST</option>
              <option>GET</option>
            </select>
            <input className="input flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/leads" />
          </div>
        </div>

        {/* arguments */}
        <div className="card p-3" style={{ background: "var(--surface-sunken)" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Arguments</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setArgs([...args, { name: "", description: "", required: true, location: "body" }])}>
              <Plus size={14} /> Add
            </button>
          </div>
          {args.length === 0 && <p className="hint">No arguments yet.</p>}
          <div className="space-y-2">
            {args.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input className="input w-36 mono" placeholder="name" value={a.name} onChange={(e) => setArgs(args.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input min-w-[120px] flex-1" placeholder="description" value={a.description} onChange={(e) => setArgs(args.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <select className="select w-24" value={a.location} onChange={(e) => setArgs(args.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))}>
                  <option value="body">body</option>
                  <option value="query">query</option>
                </select>
                <label className="flex items-center gap-1 text-[12px]">
                  <input type="checkbox" checked={a.required} onChange={(e) => setArgs(args.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> req
                </label>
                <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => setArgs(args.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* headers */}
        <div className="card p-3" style={{ background: "var(--surface-sunken)" }}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Headers</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setHeaders([...headers, ["", ""]])}>
              <Plus size={14} /> Add
            </button>
          </div>
          <p className="hint mb-2">Custom headers in addition to the auth above.</p>
          <div className="space-y-2">
            {headers.map(([k, v], i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input mono" placeholder="Header" value={k} onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)))} />
                <input className="input mono" placeholder="Value" value={v} onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)))} />
                <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim() || !url.trim()}>
            {saving && <Spinner size={15} />} Create action
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Configure MCP modal ──────────────────────────────────────────────── */

export function ConfigureMcpModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState("streamable_http");
  const [authType, setAuthType] = useState("none");
  const [authValue, setAuthValue] = useState("");
  const [testing, setTesting] = useState(false);
  const [tools, setTools] = useState<{ name: string; description?: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const test = async () => {
    setTesting(true);
    setError(null);
    setTools(null);
    try {
      const r = await api.post("/api/integrations/mcp/test", { url, transport, auth_type: authType, auth_value: authValue });
      if (r.ok) setTools(r.tools);
      else setError(r.error || "Could not connect");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/integrations/mcp", { name, url, transport, auth_type: authType, auth_value: authValue });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Configure MCP" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">MCP name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP server" />
        </div>
        <div>
          <label className="label">Server URL</label>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Transport</label>
            <select className="select" value={transport} onChange={(e) => setTransport(e.target.value)}>
              <option value="streamable_http">streamable_http</option>
              <option value="sse">sse</option>
            </select>
          </div>
          <div>
            <label className="label">Authentication</label>
            <select className="select" value={authType} onChange={(e) => setAuthType(e.target.value)}>
              <option value="none">No auth</option>
              <option value="bearer">Bearer token</option>
              <option value="header">Header (Name: Value)</option>
            </select>
          </div>
        </div>
        {authType !== "none" && (
          <input className="input mono" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder={authType === "header" ? "X-Api-Key: abc" : "token"} />
        )}

        <button className="btn btn-secondary w-full" onClick={test} disabled={testing || !url.trim()}>
          {testing ? <Loader2 size={15} className="animate-spin" /> : null} Test connection & fetch tools
        </button>

        {tools && (
          <div className="card p-3" style={{ background: "var(--surface-sunken)" }}>
            <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--success)" }}>
              <Check size={14} className="inline" /> {tools.length} tools found
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {tools.map((t) => (
                <div key={t.name} className="mono text-[12px]">{t.name}</div>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim() || !url.trim()}>
            {saving && <Spinner size={15} />} Configure MCP
          </button>
        </div>
      </div>
    </Modal>
  );
}
