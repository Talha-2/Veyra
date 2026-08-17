"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  KeyRound,
  Plug,
  Plus,
  Puzzle,
  Server,
  Trash2,
  Wrench,
} from "lucide-react";
import { api, AppCard, ConnectionRow, CustomActionRow, McpServerRow } from "@/lib/api";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { AppGrid, ConnectModal, ConnectedAppCard, ToolsModal, CreateActionModal, ConfigureMcpModal } from "@/components/integrations";

type ToolsTarget = { slug: string; name: string; logo?: string | null; category?: string };

type Tab = "browse" | "connected";

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("browse");
  const [composioReady, setComposioReady] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [actions, setActions] = useState<CustomActionRow[]>([]);
  const [mcps, setMcps] = useState<McpServerRow[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectApp, setConnectApp] = useState<AppCard | null>(null);
  const [toolsApp, setToolsApp] = useState<ToolsTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [modal, setModal] = useState<null | "action" | "mcp">(null);
  const addRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [status, conns, acts, mcpRes] = await Promise.all([
        api.get("/api/integrations/status"),
        api.get("/api/integrations/connections"),
        api.get("/api/integrations/actions"),
        api.get("/api/integrations/mcp"),
      ]);
      setComposioReady(status.composio_configured);
      setCanWrite(status.composio_can_write !== false);
      setConnections(conns);
      setActions(acts);
      setMcps(mcpRes);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const connectedSlugs = new Set(connections.filter((c) => c.status === "active").map((c) => c.toolkit));
  const connectedCount = connections.length + actions.length + mcps.length;

  // the modal figures out what the app needs (managed OAuth or typed credentials)
  const onConnected = () => {
    setConnectApp(null);
    setConnecting(null);
    setTimeout(() => { load(); setRefreshKey((k) => k + 1); }, 1200);
  };

  const remove = async (kind: "connections" | "actions" | "mcp", id: string, label: string) => {
    if (!confirm(`Remove "${label}"? The agent will lose these tools.`)) return;
    await api.del(`/api/integrations/${kind}/${id}`);
    load();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Integrations"
        description="Give the voice agent real world tools. Connect any of 1000+ apps through Composio managed auth, add custom HTTP actions, or attach an MCP server. Tools become callable mid call."
        actions={
          <div ref={addRef} className="relative">
            <button className="btn btn-primary" onClick={() => setAddOpen((o) => !o)}>
              <Plus size={16} /> Add integration <ChevronDown size={14} />
            </button>
            {addOpen && (
              <div
                className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-[var(--radius-md)] p-1"
                style={{ background: "var(--surface-overlay)", border: "1px solid var(--border)", boxShadow: "var(--shadow-overlay)" }}
              >
                {[
                  ["Browse library", Puzzle, () => { setTab("browse"); setAddOpen(false); }],
                  ["Add custom action", Wrench, () => { setModal("action"); setAddOpen(false); }],
                  ["Configure MCP", Server, () => { setModal("mcp"); setAddOpen(false); }],
                ].map(([label, Icon, fn]: any) => (
                  <button key={label} className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[14px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]" onClick={fn}>
                    <Icon size={16} className="text-tertiary" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {!composioReady && (
        <div className="card mb-6 flex items-start gap-3 p-4" style={{ borderColor: "var(--border-accent)" }}>
          <Plug size={18} className="mt-0.5 shrink-0" style={{ color: "var(--accent-text)" }} />
          <div className="text-[13px]">
            <b>Composio isn&apos;t connected yet.</b> The catalog below is browsable, and custom actions + MCP servers work
            now. To enable one-click OAuth for these apps, add a free <span className="kbd">COMPOSIO_API_KEY</span> to{" "}
            <span className="kbd">.env</span> (get one at composio.dev) and restart the server.
          </div>
        </div>
      )}

      {composioReady && !canWrite && (
        <div className="card mb-6 flex items-start gap-3 p-4" style={{ borderColor: "var(--warning-border)" }}>
          <KeyRound size={18} className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
          <div className="text-[13px]">
            <b>Your Composio API key is read only.</b> The catalog below browses fine, but connecting an app is a write and
            will be rejected. Create a key with write access in the Composio dashboard, set{" "}
            <span className="kbd">COMPOSIO_API_KEY</span> in <span className="kbd">.env</span>, then restart the server.
          </div>
        </div>
      )}

      {error && (
        <div className="card mb-6 p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {/* tabs */}
      <div className="mb-6 flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {([["browse", "Library"], ["connected", `Connected${connectedCount ? ` (${connectedCount})` : ""}`]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative px-4 py-2.5 text-[14px] font-medium"
            style={{ color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)" }}
          >
            {label}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5" style={{ background: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      {tab === "browse" ? (
        <AppGrid
          connectedSlugs={connectedSlugs}
          connecting={connecting}
          onConnect={(app) => setConnectApp(app)}
          onViewTools={(app) => setToolsApp({ slug: app.slug, name: app.name, logo: app.logo, category: app.category })}
          refreshKey={refreshKey}
        />
      ) : (
        <div className="space-y-10">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Connected accounts</span>
            </div>
            {connections.length === 0 ? (
              <div className="card">
                <EmptyState icon={Plug} title="Connected accounts" body="No apps connected. Browse the library and connect one through Composio." />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {connections.map((c) => (
                  <ConnectedAppCard
                    key={c.id}
                    conn={c}
                    onViewTools={() => setToolsApp({ slug: c.toolkit, name: c.app_name || c.toolkit, logo: c.logo, category: c.category })}
                    onRemove={() => remove("connections", c.id, c.app_name || c.toolkit)}
                  />
                ))}
              </div>
            )}
          </section>
          <ConnectedSection
            title="Custom actions"
            icon={Wrench}
            empty="No custom actions. Add one to expose any HTTP endpoint as a tool."
            action={<button className="btn btn-secondary btn-sm" onClick={() => setModal("action")}><Plus size={14} /> Add action</button>}
            items={actions.map((a) => ({
              id: a.id,
              name: a.name,
              sub: `${a.method} ${a.url}`,
              badge: <span className="badge badge-mono">{a.args.length} args</span>,
              onRemove: () => remove("actions", a.id, a.name),
            }))}
          />
          <ConnectedSection
            title="MCP servers"
            icon={Server}
            empty="No MCP servers. Attach one to import its tools."
            action={<button className="btn btn-secondary btn-sm" onClick={() => setModal("mcp")}><Plus size={14} /> Add MCP</button>}
            items={mcps.map((m) => ({
              id: m.id,
              name: m.name,
              sub: m.url,
              badge: <StatusBadge status={m.status === "connected" ? "ready" : m.status === "error" ? "error" : "processing"} />,
              tools: m.tools,
              onRemove: () => remove("mcp", m.id, m.name),
            }))}
          />
        </div>
      )}

      {connectApp && <ConnectModal app={connectApp} onClose={() => setConnectApp(null)} onConnected={onConnected} />}
      {toolsApp && <ToolsModal app={toolsApp} onClose={() => setToolsApp(null)} />}
      {modal === "action" && <CreateActionModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === "mcp" && <ConfigureMcpModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function ConnectedSection({
  title,
  icon: Icon,
  empty,
  items,
  action,
}: {
  title: string;
  icon: any;
  empty: string;
  items: { id: string; name: string; sub: string; badge?: React.ReactNode; tools?: { name: string }[]; onRemove: () => void }[];
  action?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">{title}</span>
        {action}
      </div>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={Icon} title={title} body={empty} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{it.name}</span>
                    {it.badge}
                  </div>
                  <p className="text-tertiary mono mt-1 truncate text-[12px]">{it.sub}</p>
                </div>
                <button className="btn btn-danger-ghost btn-icon btn-sm shrink-0" onClick={it.onRemove} title="Remove">
                  <Trash2 size={15} />
                </button>
              </div>
              {it.tools && it.tools.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {it.tools.slice(0, 6).map((t) => (
                    <span key={t.name} className="badge badge-mono">{t.name}</span>
                  ))}
                  {it.tools.length > 6 && <span className="badge">+{it.tools.length - 6}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
