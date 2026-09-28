import { Head, Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, BookOpen, ChevronDown, ExternalLink, KeyRound, LayoutGrid, LogIn, MoreHorizontal, PenLine, Search, SearchX, Unlock, Unplug, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { Menu, MenuItem } from '../../components/shell/menu';
import { Field } from '../../components/studio/form';
import { AppLogo } from '../../components/studio-knowledge/app-logo';
import { plural } from '../../components/studio-knowledge/format';
import Dialog from '../../components/ui/dialog';
import { Callout, Card, SearchField, Skeleton } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Eyebrow, type Tone } from '../../components/ui/primitives';

interface App {
    slug: string; name: string; category: string; description: string; auth: string; popular: boolean;
    logo: string | null; tools_count: number | null; managed_auth?: boolean;
    connected: boolean; integration_id: number | null; status: string | null;
}
interface Tool { slug: string; name: string; description: string; durable: boolean }
interface Props { apps: App[]; categories: string[]; filters: { q: string | null; category: string | null }; live: boolean; configured: boolean }

const AUTH: Record<string, { label: string; icon: ReactNode }> = {
    api_key: { label: 'API key', icon: <KeyRound size={13} strokeWidth={1.9} /> },
    none: { label: 'No sign-in', icon: <Unlock size={13} strokeWidth={1.9} /> },
    oauth: { label: 'Sign in', icon: <LogIn size={13} strokeWidth={1.9} /> },
};
const authOf = (app: App) => AUTH[app.auth] ?? AUTH.oauth;

function connectionStatus(app: App): { tone: Tone; label: string } | null {
    if (!app.connected) return null;
    if (app.status === 'connected') return { tone: 'success', label: 'Connected' };
    if (app.status === 'initiated') return { tone: 'warning', label: 'Sign-in pending' };
    if (app.status === 'error') return { tone: 'danger', label: 'Error' };
    return { tone: 'muted', label: app.status ?? 'Added' };
}

const catalogHref = (q: string, category: string | null) =>
    `/studio/integrations/catalog${(() => { const s = new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}) }).toString(); return s ? `?${s}` : ''; })()}`;

/**
 * Browse and connect an external tool. Composio's live catalog when a key is
 * set and Composio answers; the curated list otherwise — and the page says
 * which, because a stub that passes for the real thing is how a demo ends
 * with "but it worked yesterday".
 */
export default function Catalog({ apps, categories, filters, live, configured }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const [connecting, setConnecting] = useState<App | null>(null);

    // Search on a pause, not on every keystroke: each search is a Composio
    // call server-side.
    useEffect(() => {
        if (q === (filters.q ?? '')) return;
        const t = setTimeout(() => router.get('/studio/integrations/catalog', { q: q || undefined, category: filters.category ?? undefined }, { preserveState: true, replace: true }), 350);
        return () => clearTimeout(t);
    }, [q]);

    const browsing = !filters.q && !filters.category;
    const popular = browsing ? apps.filter((a) => a.popular).slice(0, 6) : [];
    const popularSlugs = new Set(popular.map((a) => a.slug));
    const rest = apps.filter((a) => !popularSlugs.has(a.slug));
    const disconnect = (app: App) => confirm(`Disconnect ${app.name}? Its actions are removed from every expert.`) && router.delete(`/studio/integrations/${app.integration_id}`);

    const heading = filters.q
        ? `${plural(apps.length, 'result')} for “${filters.q}”${filters.category ? ` in ${filters.category}` : ''}`
        : filters.category ?? (popular.length ? 'All apps' : 'Apps');

    return (
        <>
            <Head title="App catalog" />

            <PageHeader
                back={{ href: '/studio/integrations', label: 'Integrations' }}
                title="Connect an app"
                description="Connecting an app turns the tools you pick into actions the agent can be granted. Sign in once; the connection belongs to the organization."
                meta={
                    live ? <Badge tone="success" dot>Live catalog</Badge>
                        : configured ? <Badge tone="danger" dot>Composio unreachable</Badge>
                            : <Badge tone="warning" dot>Curated list</Badge>
                }
            />

            {!live && (
                <div className="mb-6">
                    {configured ? (
                        <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={1.8} />} title="Showing the curated list">
                            Composio is configured but did not answer, so this is the built-in list of common apps. Connections still go through Composio; try again shortly.
                        </Callout>
                    ) : (
                        <Callout tone="warning" icon={<AlertTriangle size={16} strokeWidth={1.8} />} title="Curated mode">
                            Connections here are recorded without a real sign-in, so actions can be built and tested against them. Set <code>COMPOSIO_API_KEY</code> to browse the full catalog of 1,500+ apps and connect for real.
                        </Callout>
                    )}
                </div>
            )}

            {/* One row: what you are looking for, and where. */}
            <div className="mt-3 mb-12 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                    <Search size={18} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 text-tertiary" />
                    <input
                        type="search"
                        className="v-field h-12 rounded-full pr-5 pl-12 text-md"
                        placeholder={live ? 'Search 1,500+ apps: calendars, CRMs, payments' : 'Search apps: calendars, CRMs, payments'}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        aria-label="Search apps"
                        autoFocus
                    />
                </div>
                {categories.length > 0 && (
                    <Menu align="right" width={280} trigger={(open, t) => (
                        <button type="button" className="v-btn v-btn--quiet v-btn--lg justify-between sm:min-w-56" onClick={t} aria-expanded={open} aria-haspopup="menu">
                            <span className="flex min-w-0 items-center gap-2">
                                <LayoutGrid size={15} strokeWidth={1.9} className="shrink-0 text-tertiary" />
                                <span className="truncate first-letter:uppercase">{filters.category ?? 'All categories'}</span>
                            </span>
                            <ChevronDown size={15} strokeWidth={2} className="-mr-1 shrink-0 opacity-60" />
                        </button>
                    )}>
                        {(close) => (
                            // A bounded list inside a popover: the one place this page scrolls inside.
                            <div className="max-h-90 overflow-y-auto">
                                <MenuItem active={!filters.category} onSelect={() => { close(); router.visit(catalogHref(q, null), { preserveState: true, preserveScroll: true }); }}>All categories</MenuItem>
                                {categories.map((c) => (
                                    <MenuItem key={c} active={filters.category === c} onSelect={() => { close(); router.visit(catalogHref(q, c), { preserveState: true, preserveScroll: true }); }}>
                                        <span className="first-letter:uppercase">{c}</span>
                                    </MenuItem>
                                ))}
                            </div>
                        )}
                    </Menu>
                )}
            </div>

            {apps.length === 0 ? (
                <Card>
                    <EmptyState icon={<SearchX size={22} strokeWidth={1.6} />} title={filters.q ? `No apps match “${filters.q}”` : 'No apps in this category'}
                        action={<Link href="/studio/integrations/catalog" className="v-btn v-btn--quiet" onClick={() => setQ('')}>Show all apps</Link>}>
                        {live
                            ? 'Try the product name as it is spelled, or a broader word like “calendar” or “invoices”. If it is not here, a custom HTTP action or an MCP server can reach it.'
                            : 'The curated list is short. Set COMPOSIO_API_KEY for the full catalog, or reach any system with a custom HTTP action.'}
                    </EmptyState>
                </Card>
            ) : (
                <>
                    {popular.length > 0 && (
                        <section className="mb-12">
                            <SectionTitle title="Popular" description="What service businesses connect first." />
                            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {popular.map((app) => <FeaturedCard key={app.slug} app={app} onConnect={() => setConnecting(app)} onDisconnect={() => disconnect(app)} />)}
                            </div>
                        </section>
                    )}

                    {rest.length > 0 && (
                        <section>
                            <SectionTitle title={heading} description={popular.length ? `${plural(rest.length, 'more app')}, most used first.` : undefined} />
                            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                                {rest.map((app) => <AppCard key={app.slug} app={app} onConnect={() => setConnecting(app)} onDisconnect={() => disconnect(app)} />)}
                            </div>
                        </section>
                    )}
                </>
            )}

            {connecting && <ConnectDialog app={connecting} onClose={() => setConnecting(null)} live={live} />}
        </>
    );
}

// ── pieces ───────────────────────────────────────────────────────────────

function SectionTitle({ title, description }: { title: string; description?: string }) {
    return (
        <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight text-primary first-letter:uppercase">{title}</h2>
            {description && <p className="mt-1 text-base text-secondary">{description}</p>}
        </div>
    );
}

function Meta({ app }: { app: App }) {
    return (
        <span className="block truncate text-sm text-secondary first-letter:uppercase">
            {app.category}{app.tools_count ? <> · {plural(app.tools_count, 'tool')}</> : null}
        </span>
    );
}

function AuthHint({ app }: { app: App }) {
    const auth = authOf(app);
    return <span className="flex min-w-0 items-center gap-1.5 text-xs text-tertiary"><span className="shrink-0">{auth.icon}</span><span className="truncate">{auth.label}</span></span>;
}

/** The trailing control of a card: Connect, or the connection's state with a way out. */
function CardAction({ app, onConnect, onDisconnect }: { app: App; onConnect: () => void; onDisconnect: () => void }) {
    const status = connectionStatus(app);

    if (!status) {
        return <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={onConnect}>Connect</button>;
    }

    return (
        <div className="flex items-center gap-1">
            <Badge tone={status.tone} dot>{status.label}</Badge>
            <Menu align="right" side="top" width={220} trigger={(open, t) => (
                <button type="button" className="v-btn v-btn--ghost v-btn--icon size-7" onClick={t} aria-label={`Options for ${app.name}`} aria-expanded={open} aria-haspopup="menu">
                    <MoreHorizontal size={15} strokeWidth={2} />
                </button>
            )}>
                {(close) => (
                    <>
                        {app.status !== 'connected' && <MenuItem icon={<LogIn size={14} strokeWidth={1.8} />} onSelect={() => { close(); onConnect(); }}>Connect again</MenuItem>}
                        <MenuItem danger icon={<Unplug size={14} strokeWidth={1.8} />} onSelect={() => { close(); onDisconnect(); }}>Disconnect</MenuItem>
                    </>
                )}
            </Menu>
        </div>
    );
}

function FeaturedCard({ app, onConnect, onDisconnect }: { app: App; onConnect: () => void; onDisconnect: () => void }) {
    return (
        <Card hover className="flex flex-col p-7">
            <div className="flex items-start gap-4">
                <AppLogo name={app.name} logo={app.logo} size={56} />
                <div className="min-w-0 flex-1 pt-1">
                    <h3 className="truncate text-lg font-semibold tracking-tight text-primary">{app.name}</h3>
                    <Meta app={app} />
                </div>
            </div>
            <p className="mt-5 line-clamp-3 flex-1 text-base text-secondary">{app.description}</p>
            <div className="mt-6 flex items-center justify-between gap-3 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                <AuthHint app={app} />
                <CardAction app={app} onConnect={onConnect} onDisconnect={onDisconnect} />
            </div>
        </Card>
    );
}

function AppCard({ app, onConnect, onDisconnect }: { app: App; onConnect: () => void; onDisconnect: () => void }) {
    return (
        <Card hover className="flex flex-col p-6">
            <div className="flex items-center gap-3.5">
                <AppLogo name={app.name} logo={app.logo} size={44} />
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-md font-semibold text-primary">{app.name}</h3>
                    <Meta app={app} />
                </div>
            </div>
            <p className="mt-4 line-clamp-2 flex-1 text-sm text-secondary">{app.description}</p>
            <div className="mt-5 flex items-center justify-between gap-3 pt-4" style={{ borderTop: '1px solid var(--separator)' }}>
                <AuthHint app={app} />
                <CardAction app={app} onConnect={onConnect} onDisconnect={onDisconnect} />
            </div>
        </Card>
    );
}

// ── connect ──────────────────────────────────────────────────────────────

function ConnectDialog({ app, onClose, live }: { app: App; onClose: () => void; live: boolean }) {
    const { data, setData, post, processing, errors } = useForm({ api_key: '', tools: [] as string[] });
    const [tools, setTools] = useState<Tool[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [filter, setFilter] = useState('');

    // The toolkit's tools, for the checklist. Everything is on by default
    // for a small toolkit; a large one starts with its writes off, so a
    // 400-tool app does not hand the agent 400 ways to change things.
    useEffect(() => {
        fetch(`/studio/integrations/catalog/${app.slug}/tools`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((body: { tools: Tool[] }) => {
                setTools(body.tools);
                setData('tools', body.tools.length > 25 ? body.tools.filter((t) => !t.durable).map((t) => t.slug) : body.tools.map((t) => t.slug));
            })
            .catch(() => setFailed(true));
    }, [app.slug]);

    const submit = (e: FormEvent) => { e.preventDefault(); post(`/studio/integrations/catalog/${app.slug}/connect`); };
    const selected = useMemo(() => new Set(data.tools), [data.tools]);
    const toggle = (slug: string) => setData('tools', selected.has(slug) ? data.tools.filter((s) => s !== slug) : [...data.tools, slug]);
    const setMany = (slugs: string[], on: boolean) => {
        const next = new Set(data.tools);
        slugs.forEach((s) => (on ? next.add(s) : next.delete(s)));
        setData('tools', [...next]);
    };

    const needle = filter.trim().toLowerCase();
    const visible = (tools ?? []).filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle));
    const reads = visible.filter((t) => !t.durable);
    const writes = visible.filter((t) => t.durable);
    const writesSelected = (tools ?? []).filter((t) => t.durable && selected.has(t.slug)).length;
    const auth = authOf(app);

    return (
        <Dialog open onClose={onClose} title={`Connect ${app.name}`} description={app.description} width={680}>
            <form onSubmit={submit}>
                <div className="mb-6 flex items-center gap-4 rounded-lg px-5 py-4" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <AppLogo name={app.name} logo={app.logo} size={40} />
                    <div className="min-w-0 flex-1 text-sm text-secondary">
                        <div className="flex items-center gap-1.5 font-medium text-primary">{auth.icon}{app.auth === 'api_key' ? 'Connects with an API key' : app.auth === 'none' ? 'No sign-in needed' : `Sign in with ${app.name}`}</div>
                        {app.auth === 'api_key'
                            ? 'Held by Composio for this organization; the agent layer never sees it.'
                            : live
                                ? <>You will be sent to {app.name} to approve access, then brought back here. <ExternalLink size={12} strokeWidth={2} className="inline" /></>
                                : `With Composio configured this would open ${app.name}'s sign-in. In curated mode the connection is recorded immediately so actions can be built against it.`}
                    </div>
                </div>

                {app.auth === 'api_key' && (
                    <Field label="API key" error={errors.api_key}>
                        <input className="v-field" type="password" value={data.api_key} onChange={(e) => setData('api_key', e.target.value)} autoFocus autoComplete="off" />
                    </Field>
                )}

                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <div className="text-base font-medium text-primary">Tools the agent may be granted</div>
                        <p className="text-sm text-secondary">Each becomes an action you can turn on for an expert. You can change this later.</p>
                    </div>
                </div>

                {tools && tools.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        {tools.length > 8 && <SearchField value={filter} onChange={setFilter} placeholder={`Search ${plural(tools.length, 'tool')}`} className="min-w-0 flex-1" />}
                        <div className="flex items-center gap-0.5">
                            <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setData('tools', tools.map((t) => t.slug))}>All</button>
                            <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setData('tools', tools.filter((t) => !t.durable).map((t) => t.slug))}>Reads only</button>
                            <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setData('tools', [])}>None</button>
                        </div>
                    </div>
                )}

                <div className="max-h-90 overflow-y-auto rounded-md" style={{ border: '1px solid var(--border)' }}>
                    {tools === null && !failed && (
                        <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading tools">
                            {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-4" /><div className="flex-1"><Skeleton className="mb-1.5 h-3 w-1/3" /><Skeleton className="h-2.5 w-2/3" /></div></div>)}
                        </div>
                    )}
                    {failed && (
                        <div className="p-3"><Callout tone="danger">Could not load the tool list. You can still connect; tools can be turned on later on the Integrations page.</Callout></div>
                    )}
                    {tools && tools.length === 0 && <p className="px-4 py-5 text-center text-sm text-tertiary">This app lists no tools yet.</p>}
                    {tools && tools.length > 0 && visible.length === 0 && <p className="px-4 py-5 text-center text-sm text-tertiary">No tools match “{filter}”.</p>}
                    {reads.length > 0 && <ToolGroup title="Reads" hint="Look things up; change nothing" icon={<BookOpen size={13} strokeWidth={1.9} />} tools={reads} selected={selected} onToggle={toggle} onSetMany={setMany} />}
                    {writes.length > 0 && <ToolGroup title="Writes" hint="Change something in the app" icon={<PenLine size={13} strokeWidth={1.9} />} tools={writes} selected={selected} onToggle={toggle} onSetMany={setMany} />}
                </div>

                <p className="mt-2.5 text-xs text-tertiary tabular-nums">
                    {tools ? `${data.tools.length} of ${plural(tools.length, 'tool')} selected` : `${data.tools.length} selected`}
                    {writesSelected > 0 && <> · <span className="text-warning">{plural(writesSelected, 'write')}</span>: set their approval and retry flags carefully on the Integrations page.</>}
                </p>

                <div className="mt-8 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing}>
                        {processing ? 'Connecting…' : app.auth === 'api_key' || !live ? 'Connect' : `Continue to ${app.name}`}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

function ToolGroup({ title, hint, icon, tools, selected, onToggle, onSetMany }: {
    title: string; hint: string; icon: ReactNode; tools: Tool[]; selected: Set<string>;
    onToggle: (slug: string) => void; onSetMany: (slugs: string[], on: boolean) => void;
}) {
    const on = tools.filter((t) => selected.has(t.slug)).length;
    const all = on === tools.length;

    return (
        <div>
            <label className="v-glass sticky top-0 z-10 flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-2" style={{ borderBottom: '1px solid var(--separator)' }}>
                <input
                    type="checkbox"
                    checked={all}
                    ref={(el) => { if (el) el.indeterminate = on > 0 && !all; }}
                    onChange={() => onSetMany(tools.map((t) => t.slug), !all)}
                    aria-label={`Select all ${title.toLowerCase()}`}
                />
                <span className="text-tertiary">{icon}</span>
                <Eyebrow>{title}</Eyebrow>
                <span className="text-xs text-tertiary">{hint}</span>
                <span className="flex-1" />
                <span className="text-xs text-tertiary tabular-nums">{on}/{tools.length}</span>
            </label>
            <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                {tools.map((t) => (
                    <label key={t.slug} className="flex min-h-13 cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
                        <input type="checkbox" className="mt-0.5 shrink-0" checked={selected.has(t.slug)} onChange={() => onToggle(t.slug)} />
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                                {t.name}
                                {t.durable && <Wrench size={12} strokeWidth={1.9} className="text-tertiary" aria-label="Writes" />}
                            </span>
                            {t.description && <span className="block truncate text-xs text-tertiary" title={t.description}>{t.description}</span>}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}
