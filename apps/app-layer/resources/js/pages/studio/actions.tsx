import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    Activity, AppWindow, ChevronDown, FlaskConical, Info, MoreHorizontal, Pencil, PenLine, Plug, Plus, RefreshCw, RotateCcw, Server,
    ShieldCheck, Trash2, Unplug, Wrench, X, Zap,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { Menu, MenuItem, MenuSeparator } from '../../components/shell/menu';
import { Field, Toggle } from '../../components/studio/form';
import { AppLogo } from '../../components/studio-knowledge/app-logo';
import { plural } from '../../components/studio-knowledge/format';
import Dialog from '../../components/ui/dialog';
import { DialogActions, Disclosure, InlineEmpty, PageSection, PanelHeader, StatRow } from '../../components/studio-ops/page-parts';
import { Card, IconTile, List, SearchField, SegmentedControl, Switch, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Eyebrow, RelativeTime, UserText, type Tone } from '../../components/ui/primitives';
import type { SharedProps } from '../../types';

interface HttpConfig { method: string; url: string; auth_type: string; parameters: { name: string; description: string; required: boolean }[] }
interface ActionRow {
    id: number; slug: string; name: string; description: string; kind: string; kind_label: string; external: boolean;
    integration: string | null; is_idempotent: boolean; is_durable_write: boolean; requires_approval: boolean;
    timeout_ms: number; max_retries: number; enabled: boolean; experts_count: number;
    calls_7d: number; success_rate: number | null; timeouts_7d: number; p95_ms: number | null;
    http?: HttpConfig | null;
}
interface IntegrationRow {
    id: number; label: string; provider: string; status: string; actions_count: number; connected_at: string | null; error?: string | null;
    toolkit?: string | null; logo?: string | null; url?: string | null; transport?: string | null;
}

type Flag = 'is_idempotent' | 'is_durable_write' | 'requires_approval' | 'enabled';
type View = 'all' | 'on' | 'off' | 'attention';

function integrationStatus(status: string): { tone: Tone; label: string } {
    if (status === 'connected') return { tone: 'success', label: 'Connected' };
    if (status === 'initiated') return { tone: 'warning', label: 'Sign-in pending' };
    if (status === 'error') return { tone: 'danger', label: 'Needs attention' };
    if (status === 'disconnected') return { tone: 'muted', label: 'Not tested' };
    return { tone: 'muted', label: status };
}

/** A write that timed out without being safe to retry may or may not have happened. */
const riskyTimeouts = (a: ActionRow) => a.timeouts_7d > 0 && !a.is_idempotent && a.is_durable_write;
const needsAttention = (a: ActionRow) => riskyTimeouts(a) || (a.success_rate != null && a.success_rate < 90);

export default function Actions({ actions, integrations }: { actions: ActionRow[]; integrations: IntegrationRow[] }) {
    const { flash } = usePage<SharedProps>().props;
    const [addingMcp, setAddingMcp] = useState(false);
    const [editingHttp, setEditingHttp] = useState<ActionRow | 'new' | null>(null);
    const [view, setView] = useState<View>('all');
    const [query, setQuery] = useState('');
    const flip = (a: ActionRow, key: Flag) =>
        router.patch(`/studio/integrations/actions/${a.id}`, { [key]: !a[key] }, { preserveScroll: true });

    const mcp = integrations.filter((i) => i.provider === 'mcp');
    const apps = integrations.filter((i) => i.provider !== 'mcp');

    // The numbers that change what you do next.
    const enabled = actions.filter((a) => a.enabled).length;
    const calls = actions.reduce((n, a) => n + a.calls_7d, 0);
    const succeeded = actions.reduce((n, a) => n + (a.success_rate != null ? Math.round((a.success_rate / 100) * a.calls_7d) : 0), 0);
    const timeouts = actions.reduce((n, a) => n + a.timeouts_7d, 0);
    const attention = actions.filter(needsAttention);
    const successRate = calls > 0 ? Math.round((succeeded / calls) * 100) : null;

    const needle = query.trim().toLowerCase();
    const shown = actions
        .filter((a) => (view === 'on' ? a.enabled : view === 'off' ? !a.enabled : view === 'attention' ? needsAttention(a) : true))
        .filter((a) => !needle || [a.name, a.description, a.integration ?? '', a.kind_label].some((s) => s.toLowerCase().includes(needle)));

    const testOk = flash.test_result ? flash.test_result.status >= 200 && flash.test_result.status < 300 : false;

    return (
        <>
            <Head title="Integrations" />

            <PageHeader
                title="Integrations"
                description="The apps and endpoints your agent can act on, and how each action is allowed to fail."
                actions={
                    <>
                        <Menu align="right" width={280} trigger={(open, t) => (
                            <button type="button" className="v-btn v-btn--quiet" onClick={t} aria-expanded={open} aria-haspopup="menu">
                                <Plus size={15} strokeWidth={2} />Add<ChevronDown size={14} strokeWidth={2} className="-mr-1 opacity-60" />
                            </button>
                        )}>
                            {(close) => (
                                <>
                                    <MenuItem icon={<Server size={15} strokeWidth={1.8} />} onSelect={() => { close(); setAddingMcp(true); }}>Add MCP server</MenuItem>
                                    <MenuItem icon={<Wrench size={15} strokeWidth={1.8} />} onSelect={() => { close(); setEditingHttp('new'); }}>Custom HTTP action</MenuItem>
                                </>
                            )}
                        </Menu>
                        <Link href="/studio/integrations/catalog" className="v-btn v-btn--primary"><Plug size={15} strokeWidth={1.9} />Connect an app</Link>
                    </>
                }
            />

            <div className="mt-3">
                {flash.test_result && (
                    <Card className="mb-12">
                        <PanelHeader
                            icon={<IconTile tone={testOk ? 'success' : 'danger'}><FlaskConical size={16} strokeWidth={1.8} /></IconTile>}
                            title="Test request"
                            description={testOk ? 'The endpoint answered. This is exactly what the agent would receive.' : 'The endpoint did not answer with success. The agent would treat this call as failed.'}
                            actions={
                                <>
                                    <Badge tone={testOk ? 'success' : 'danger'} dot>HTTP {flash.test_result.status || 'error'}</Badge>
                                    {flash.test_result.ms != null && <span className="text-xs text-tertiary tabular-nums">{flash.test_result.ms.toLocaleString()} ms</span>}
                                </>
                            }
                        />
                        <div className="px-7 py-6">
                            {/* A bounded region on purpose: a response body can be any length. */}
                            <pre className="v-code max-h-70 overflow-auto rounded-md px-4 py-3.5 whitespace-pre-wrap text-secondary" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>{flash.test_result.body || '(empty body)'}</pre>
                        </div>
                    </Card>
                )}

                <StatRow items={[
                    { label: 'Apps connected', icon: <AppWindow size={15} strokeWidth={1.8} />, value: apps.filter((a) => a.status === 'connected').length,
                        hint: apps.length === 0 ? 'None yet' : `of ${plural(apps.length, 'app')} · ${plural(mcp.length, 'MCP server')}` },
                    { label: 'Actions on', icon: <Zap size={15} strokeWidth={1.8} />, value: enabled, hint: `of ${plural(actions.length, 'action')} the agent can be granted` },
                    { label: 'Calls, last 7 days', icon: <Activity size={15} strokeWidth={1.8} />, value: calls.toLocaleString(), hint: timeouts > 0 ? `${plural(timeouts, 'timeout')} among them` : 'No timeouts' },
                    { label: 'Success rate', icon: <ShieldCheck size={15} strokeWidth={1.8} />, value: successRate == null ? '—' : `${successRate}%`,
                        tone: successRate == null ? undefined : successRate < 90 ? 'warning' : 'success',
                        hint: attention.length > 0 ? `${plural(attention.length, 'action')} need attention` : calls > 0 ? 'Across every action, 7 days' : 'No calls yet this week' },
                ]} />

                <div className="mt-12">
                    <PageSection
                        title="Connections"
                        description="Apps the agent acts through, like a calendar or a CRM, and MCP servers that expose their own tools. Connections belong to the organization."
                    >
                        {apps.length === 0 && mcp.length === 0 ? (
                            <InlineEmpty icon={<AppWindow size={18} strokeWidth={1.7} />} title="Nothing connected yet"
                                action={
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" className="v-btn v-btn--ghost" onClick={() => setAddingMcp(true)}><Server size={15} strokeWidth={1.8} />Add MCP server</button>
                                        <Link href="/studio/integrations/catalog" className="v-btn v-btn--quiet"><Plug size={15} strokeWidth={1.9} />Browse apps</Link>
                                    </div>
                                }>
                                Built-in actions work without a connection. Anything that reaches a calendar, a CRM or a payment provider needs its app connected first.
                            </InlineEmpty>
                        ) : (
                            <div className="flex flex-col gap-8">
                                {apps.length > 0 && (
                                    <div>
                                        <Eyebrow className="mb-3 block">Apps</Eyebrow>
                                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                                            {apps.map((i) => <AppCard key={i.id} integration={i} />)}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <Eyebrow className="mb-3 block">MCP servers</Eyebrow>
                                    {mcp.length === 0 ? (
                                        <InlineEmpty icon={<Server size={18} strokeWidth={1.7} />} title="No MCP servers"
                                            action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setAddingMcp(true)}><Plus size={15} strokeWidth={2} />Add MCP server</button>}>
                                            Add a server's URL and test it. Its tools become actions you can grant to an expert; test again to refresh them.
                                        </InlineEmpty>
                                    ) : (
                                        <Card>
                                            <List>
                                                {mcp.map((i) => {
                                                    const s = integrationStatus(i.status);
                                                    return (
                                                        <div key={i.id} className="flex min-h-15 items-center gap-4 px-6 py-3">
                                                            <IconTile tone={i.status === 'error' ? 'danger' : 'muted'} size={36}><Server size={16} strokeWidth={1.8} /></IconTile>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate text-base font-medium text-primary">{i.label}</div>
                                                                <div className="truncate text-sm text-secondary">
                                                                    {i.error
                                                                        ? <span className="text-danger" title={i.error}>{i.error}</span>
                                                                        : <>{i.url ?? 'No URL'}{i.transport && ` · ${i.transport === 'sse' ? 'SSE' : 'Streamable HTTP'}`}{i.connected_at && <> · tested <RelativeTime at={i.connected_at} /></>}</>}
                                                                </div>
                                                            </div>
                                                            <Badge tone={s.tone} dot>{s.label}</Badge>
                                                            <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={() => router.post(`/studio/integrations/mcp/${i.id}/test`, {}, { preserveScroll: true })}>
                                                                <FlaskConical size={13} strokeWidth={1.9} />Test
                                                            </button>
                                                            <RowMenu label={`Actions for ${i.label}`}>
                                                                {(close) => (
                                                                    <MenuItem danger icon={<Trash2 size={14} strokeWidth={1.8} />} onSelect={() => { close(); if (confirm(`Remove ${i.label}? Its actions are removed from every expert.`)) router.delete(`/studio/integrations/${i.id}`); }}>Remove server</MenuItem>
                                                                )}
                                                            </RowMenu>
                                                        </div>
                                                    );
                                                })}
                                            </List>
                                        </Card>
                                    )}
                                </div>
                            </div>
                        )}
                    </PageSection>

                    <PageSection title="Actions" description="Everything the agent can do. Turn one on here, then grant it to an expert.">
                        <div className="mb-6">
                            <Disclosure icon={<Info size={15} strokeWidth={1.9} />} summary="How each action is allowed to fail">
                                <div className="grid gap-x-8 gap-y-5 md:grid-cols-3">
                                    <Legend icon={<RotateCcw size={14} strokeWidth={2} />} name="Repeatable">Calling it twice with the same input is harmless, so a dropped connection is simply retried. Built-in actions always are.</Legend>
                                    <Legend icon={<PenLine size={14} strokeWidth={2} />} name="Writes">It changes something outside. The agent will not hang up while one is in flight.</Legend>
                                    <Legend icon={<ShieldCheck size={14} strokeWidth={2} />} name="Approval">The agent does not run it: it asks, and a person approves or rejects it on the Overview page. The customer is told it is waiting for review.</Legend>
                                </div>
                            </Disclosure>
                        </div>

                        {actions.length === 0 ? (
                            <Card>
                                <EmptyState icon={<Zap size={22} strokeWidth={1.6} />} title="No actions yet"
                                    action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setEditingHttp('new')}><Wrench size={15} strokeWidth={1.8} />Custom HTTP action</button>}>
                                    Connect an app to bring in its tools, or call any endpoint of your own with a custom HTTP action.
                                </EmptyState>
                            </Card>
                        ) : (
                            <>
                                <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search actions" className="w-full sm:w-64" />}>
                                    <SegmentedControl<View>
                                        value={view}
                                        onChange={setView}
                                        options={[
                                            { value: 'all', label: <>All <Count n={actions.length} /></> },
                                            { value: 'on', label: <>On <Count n={enabled} /></> },
                                            { value: 'off', label: <>Off <Count n={actions.length - enabled} /></> },
                                            { value: 'attention', label: <>Needs attention <Count n={attention.length} /></> },
                                        ]}
                                    />
                                </Toolbar>

                                {/* No inner scroll: the table is part of the page, and its
                                    header sticks to the top of the window as you scroll.
                                    Below 1280px it may scroll sideways inside its card. */}
                                <div className="v-panel overflow-x-auto xl:overflow-visible">
                                    <table className="w-full min-w-215 border-collapse text-left xl:min-w-0">
                                        <thead>
                                            <tr>
                                                <H>Action</H>
                                                <H center>Repeatable</H>
                                                <H center>Writes</H>
                                                <H center>Approval</H>
                                                <H>Last 7 days</H>
                                                <H center>On</H>
                                                <H><span className="sr-only">Edit</span></H>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shown.map((a) => (
                                                <tr key={a.id} className="transition-colors hover:bg-surface-hover" style={{ borderTop: '1px solid var(--separator)' }}>
                                                    <C>
                                                        <div className={`min-w-0 max-w-[460px] ${a.enabled ? '' : 'opacity-60'}`}>
                                                            <div className="flex min-w-0 items-center gap-2">
                                                                <span className="truncate text-base font-medium text-primary">{a.name}</span>
                                                                <Badge tone={a.kind === 'internal' ? 'muted' : 'info'}>{a.kind_label}</Badge>
                                                                {a.experts_count > 0 && <span className="shrink-0 text-xs text-tertiary">{plural(a.experts_count, 'expert')}</span>}
                                                            </div>
                                                            <UserText className="mt-0.5 block truncate text-sm text-secondary">
                                                                {a.integration && <span className="text-tertiary">{a.integration} · </span>}{a.description}
                                                            </UserText>
                                                        </div>
                                                    </C>
                                                    <C center>
                                                        {a.external
                                                            ? <Switch size="sm" checked={a.is_idempotent} onChange={() => flip(a, 'is_idempotent')} label={`${a.name}: repeatable`} />
                                                            : <Badge tone="success">Always</Badge>}
                                                    </C>
                                                    <C center><Switch size="sm" checked={a.is_durable_write} onChange={() => flip(a, 'is_durable_write')} label={`${a.name}: writes`} /></C>
                                                    <C center><Switch size="sm" checked={a.requires_approval} onChange={() => flip(a, 'requires_approval')} label={`${a.name}: requires approval`} /></C>
                                                    <C>
                                                        {a.success_rate == null ? (
                                                            <span className="text-sm text-tertiary">No calls yet</span>
                                                        ) : (
                                                            <div className="whitespace-nowrap">
                                                                <div className="text-sm tabular-nums">
                                                                    <span className={`font-semibold ${a.success_rate < 90 ? 'text-warning' : 'text-primary'}`}>{a.success_rate}%</span>
                                                                    <span className="text-tertiary"> of {plural(a.calls_7d, 'call')}</span>
                                                                </div>
                                                                <div className={`mt-0.5 text-xs tabular-nums ${riskyTimeouts(a) ? 'text-danger' : 'text-tertiary'}`}>
                                                                    {a.timeouts_7d > 0
                                                                        ? <>{plural(a.timeouts_7d, 'timeout')}{riskyTimeouts(a) && ', outcome unknown'}</>
                                                                        : a.p95_ms != null ? `p95 ${a.p95_ms.toLocaleString()} ms` : 'No latency yet'}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </C>
                                                    <C center><Switch size="sm" checked={a.enabled} onChange={() => flip(a, 'enabled')} label={`${a.name}: enabled`} /></C>
                                                    <C align="right">
                                                        {a.kind === 'http' && (
                                                            <button type="button" className="v-btn v-btn--ghost v-btn--icon" aria-label={`Edit ${a.name}`} onClick={() => setEditingHttp(a)}>
                                                                <Pencil size={14} strokeWidth={1.8} />
                                                            </button>
                                                        )}
                                                    </C>
                                                </tr>
                                            ))}
                                            {shown.length === 0 && (
                                                <tr style={{ borderTop: '1px solid var(--separator)' }}>
                                                    <td colSpan={7} className="px-6 py-12 text-center">
                                                        <p className="text-base font-medium text-primary">{view === 'attention' && !needle ? 'Nothing needs attention' : 'No actions match'}</p>
                                                        <p className="mt-1 text-sm text-secondary">{view === 'attention' && !needle ? 'Every action with calls this week succeeded at least 90% of the time, and no unsafe write timed out.' : 'Try another search, or switch to All.'}</p>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </PageSection>
                </div>
            </div>

            <McpDialog open={addingMcp} onClose={() => setAddingMcp(false)} />
            {editingHttp && <HttpActionDialog action={editingHttp === 'new' ? null : editingHttp} onClose={() => setEditingHttp(null)} />}
        </>
    );
}

// ── pieces ───────────────────────────────────────────────────────────────

function Count({ n }: { n: number }) {
    return <span className="text-2xs text-tertiary tabular-nums">{n}</span>;
}

function Legend({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-2 text-base font-medium text-primary"><span className="text-info">{icon}</span>{name}</div>
            <p className="mt-1 text-sm text-secondary">{children}</p>
        </div>
    );
}

/**
 * A column head that sticks to the top of the window: the labels stay put
 * while a long action list scrolls under them with the page.
 */
function H({ children, align = 'left', center = false }: { children?: ReactNode; align?: 'left' | 'right'; center?: boolean }) {
    return (
        <th scope="col" className="v-glass sticky top-0 z-10 h-12 px-4 text-xs font-medium whitespace-nowrap text-tertiary first:rounded-tl-lg first:pl-6 last:rounded-tr-lg last:pr-6"
            style={{ textAlign: center ? 'center' : align, boxShadow: 'inset 0 -1px 0 var(--separator)' }}>
            {children}
        </th>
    );
}

/** A body cell: rows land at 60px, with room either side. */
function C({ children, align = 'left', center = false }: { children?: ReactNode; align?: 'left' | 'right'; center?: boolean }) {
    return (
        <td className="h-15 px-4 py-3 align-middle first:pl-6 last:pr-6" style={{ textAlign: center ? 'center' : align }}>
            {center ? <div className="flex justify-center">{children}</div> : children}
        </td>
    );
}

function RowMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
    return (
        <Menu align="right" width={220} trigger={(open, t) => (
            <button type="button" className="v-btn v-btn--ghost v-btn--icon" onClick={t} aria-label={label} aria-expanded={open} aria-haspopup="menu">
                <MoreHorizontal size={16} strokeWidth={2} />
            </button>
        )}>
            {children}
        </Menu>
    );
}

function AppCard({ integration: i }: { integration: IntegrationRow }) {
    const s = integrationStatus(i.status);
    const refresh = () => router.post(`/studio/integrations/${i.id}/refresh`, {}, { preserveScroll: true });

    return (
        <Card className="flex flex-col p-6">
            <div className="flex items-start gap-4">
                <AppLogo name={i.label} logo={i.logo} size={48} />
                <div className="min-w-0 flex-1 pt-0.5">
                    <div className="truncate text-md font-semibold text-primary">{i.label}</div>
                    <div className="mt-1.5"><Badge tone={s.tone} dot>{s.label}</Badge></div>
                </div>
                <RowMenu label={`Actions for ${i.label}`}>
                    {(close) => (
                        <>
                            <MenuItem icon={<RefreshCw size={14} strokeWidth={1.8} />} onSelect={() => { close(); refresh(); }}>Check again</MenuItem>
                            <MenuSeparator />
                            <MenuItem danger icon={<Unplug size={14} strokeWidth={1.8} />} onSelect={() => { close(); if (confirm(`Disconnect ${i.label}? Its actions are removed from every expert.`)) router.delete(`/studio/integrations/${i.id}`); }}>Disconnect</MenuItem>
                        </>
                    )}
                </RowMenu>
            </div>
            <div className="mt-5 flex-1 pt-4 text-sm" style={{ borderTop: '1px solid var(--separator)' }}>
                {i.error
                    ? <p className="line-clamp-2 text-danger" title={i.error}>{i.error}</p>
                    : <p className="text-secondary">{plural(i.actions_count, 'action')}{i.connected_at && <> · connected <RelativeTime at={i.connected_at} /></>}</p>}
            </div>
            {i.status !== 'connected' && (
                <div className="mt-4">
                    <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={refresh}><RefreshCw size={13} strokeWidth={1.9} />Check again</button>
                </div>
            )}
        </Card>
    );
}

// ── dialogs ──────────────────────────────────────────────────────────────

function DialogFooter({ onClose, processing, label }: { onClose: () => void; processing: boolean; label: string }) {
    return (
        <DialogActions>
            <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Saving…' : label}</button>
        </DialogActions>
    );
}

function McpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { data, setData, post, processing, errors, reset } = useForm({ label: '', url: '', transport: 'streamable_http', auth_type: 'none', auth_value: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/integrations/mcp', { onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="Add an MCP server" description="Its tools become actions the agent can be granted, once the server is tested." width={600}>
            <form onSubmit={submit}>
                <Field label="Name" error={errors.label} hint="What people in Studio will see, e.g. “Booking system”.">
                    <input className="v-field" value={data.label} onChange={(e) => setData('label', e.target.value)} autoFocus />
                </Field>
                <Field label="URL" error={errors.url}>
                    <input className="v-field" type="url" value={data.url} onChange={(e) => setData('url', e.target.value)} placeholder="https://mcp.example.com/sse" />
                </Field>
                <div className="grid gap-x-4 md:grid-cols-2">
                    <Field label="Transport" error={errors.transport}>
                        <select className="v-field" value={data.transport} onChange={(e) => setData('transport', e.target.value)}><option value="streamable_http">Streamable HTTP</option><option value="sse">SSE</option></select>
                    </Field>
                    <Field label="Authentication" error={errors.auth_type}>
                        <select className="v-field" value={data.auth_type} onChange={(e) => setData('auth_type', e.target.value)}><option value="none">None</option><option value="bearer">Bearer token</option><option value="header">Custom header</option></select>
                    </Field>
                </div>
                {data.auth_type !== 'none' && (
                    <Field label={data.auth_type === 'bearer' ? 'Token' : 'Header'} error={errors.auth_value} hint={data.auth_type === 'header' ? 'As Name: value, e.g. X-Api-Key: abc123' : 'Stored encrypted; never shown again.'}>
                        <input className="v-field" type="password" value={data.auth_value} onChange={(e) => setData('auth_value', e.target.value)} />
                    </Field>
                )}
                <DialogFooter onClose={onClose} processing={processing} label="Add server" />
            </form>
        </Dialog>
    );
}

function HttpActionDialog({ action, onClose }: { action: ActionRow | null; onClose: () => void }) {
    const { data, setData, post, patch, processing, errors } = useForm({
        name: action?.name ?? '', description: action?.description ?? '', method: action?.http?.method ?? 'POST', url: action?.http?.url ?? '',
        auth_type: action?.http?.auth_type ?? 'none', auth_value: '',
        parameters: (action?.http?.parameters ?? []) as { name: string; description: string; required: boolean }[],
        is_idempotent: action?.is_idempotent ?? false, is_durable_write: action?.is_durable_write ?? true, requires_approval: action?.requires_approval ?? false, timeout_ms: action?.timeout_ms ?? 15000,
    });
    const [testArgs, setTestArgs] = useState('{}');
    const [testError, setTestError] = useState<string | null>(null);
    const submit = (e: FormEvent) => { e.preventDefault(); if (action) patch(`/studio/integrations/http/${action.id}`, { onSuccess: onClose }); else post('/studio/integrations/http', { onSuccess: onClose }); };
    const err = (k: string) => (errors as Record<string, string>)[k];
    const setParam = (i: number, patchValue: Partial<{ name: string; description: string; required: boolean }>) =>
        setData('parameters', data.parameters.map((x, j) => (j === i ? { ...x, ...patchValue } : x)));
    const sendTest = () => {
        if (!action) return;
        let args = {};
        try { args = JSON.parse(testArgs); } catch { setTestError('That is not valid JSON.'); return; }
        setTestError(null);
        router.post(`/studio/integrations/http/${action.id}/test`, { arguments: args }, { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Dialog open onClose={onClose} title={action ? `Edit ${action.name}` : 'Custom HTTP action'} description="Call any endpoint. The agent fills in the parameters; the URL, method and authentication stay yours." width={720}>
            <form onSubmit={submit}>
                <div className="grid gap-x-4 md:grid-cols-[1fr_160px]">
                    <Field label="Name" error={err('name')}>
                        <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Book a job" autoFocus />
                    </Field>
                    <Field label="Method" error={err('method')}>
                        <select className="v-field" value={data.method} onChange={(e) => setData('method', e.target.value)}><option>POST</option><option>GET</option></select>
                    </Field>
                </div>
                <Field label="Description" error={err('description')} hint="The agent decides when to call this from the description alone. Say what it does and when to use it.">
                    <input className="v-field" value={data.description} onChange={(e) => setData('description', e.target.value)} />
                </Field>
                <Field label="URL" error={err('url')}>
                    <input className="v-field" type="url" value={data.url} onChange={(e) => setData('url', e.target.value)} placeholder="https://api.example.com/bookings" />
                </Field>
                <div className="grid gap-x-4 md:grid-cols-2">
                    <Field label="Authentication" error={err('auth_type')}>
                        <select className="v-field" value={data.auth_type} onChange={(e) => setData('auth_type', e.target.value)}><option value="none">None</option><option value="bearer">Bearer</option><option value="basic">Basic (user:pass)</option><option value="header">Header (Name: value)</option></select>
                    </Field>
                    {data.auth_type !== 'none' && (
                        <Field label="Secret" error={err('auth_value')} hint={action ? 'Never sent back to the browser: re-enter it when saving.' : undefined}>
                            <input className="v-field" type="password" value={data.auth_value} onChange={(e) => setData('auth_value', e.target.value)} />
                        </Field>
                    )}
                </div>

                <div className="mb-6">
                    <div className="mb-2.5 flex items-center justify-between">
                        <span className="v-label" style={{ marginBottom: 0 }}>Parameters</span>
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setData('parameters', [...data.parameters, { name: '', description: '', required: true }])}><Plus size={13} strokeWidth={2} />Add parameter</button>
                    </div>
                    {data.parameters.length === 0 ? (
                        <p className="rounded-md px-4 py-3.5 text-sm text-tertiary" style={{ background: 'var(--surface-sunken)' }}>None. Add one for each value the agent should fill in from the conversation, like a date or an address.</p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {data.parameters.map((p, i) => (
                                <div key={i}>
                                    <div className="grid grid-cols-[160px_1fr_auto_auto] items-center gap-2.5">
                                        <input className="v-field font-mono text-sm" placeholder="name" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} aria-label="Parameter name" />
                                        <input className="v-field" placeholder="What it is, for the agent" value={p.description} onChange={(e) => setParam(i, { description: e.target.value })} aria-label="Parameter description" />
                                        <label className="flex items-center gap-1.5 text-xs text-secondary"><input type="checkbox" checked={p.required} onChange={(e) => setParam(i, { required: e.target.checked })} />Required</label>
                                        <button type="button" aria-label="Remove parameter" className="v-btn v-btn--ghost v-btn--icon" onClick={() => setData('parameters', data.parameters.filter((_, j) => j !== i))}><X size={13} strokeWidth={2} /></button>
                                    </div>
                                    {(err(`parameters.${i}.name`) || err(`parameters.${i}.description`)) && <p className="mt-1 text-xs text-danger">{err(`parameters.${i}.name`) ?? err(`parameters.${i}.description`)}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-lg px-5 py-5" style={{ border: '1px solid var(--border)' }}>
                    <Toggle checked={data.is_idempotent} onChange={(v) => setData('is_idempotent', v)} label="Repeatable" hint="Calling it twice with the same input is harmless, so a dropped connection is retried automatically." />
                    <Toggle checked={data.is_durable_write} onChange={(v) => setData('is_durable_write', v)} label="Writes" hint="It changes something outside. The agent will not hang up while it is in flight."
                        caution={data.is_durable_write && !data.is_idempotent ? 'A write that is not repeatable is never retried: a timeout leaves its outcome unknown.' : undefined} />
                    <Toggle checked={data.requires_approval} onChange={(v) => setData('requires_approval', v)} label="Needs approval" hint="The agent asks instead of running it; a person approves or rejects it on the Overview page." />
                </div>

                {action && (
                    <div className="mt-6 rounded-lg px-5 py-5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                        <div className="mb-1 text-base font-medium text-primary">Send a test request</div>
                        <p className="mb-3 text-sm text-secondary">Uses the saved version of this action. The response appears at the top of the page.</p>
                        <textarea className="v-field h-auto font-mono text-sm" rows={4} value={testArgs} onChange={(e) => setTestArgs(e.target.value)} aria-label="Test arguments as JSON" />
                        {testError && <p className="mt-1.5 text-sm text-danger">{testError}</p>}
                        <button type="button" className="v-btn v-btn--quiet v-btn--sm mt-3" onClick={sendTest}><FlaskConical size={13} strokeWidth={1.9} />Send test request</button>
                    </div>
                )}

                <DialogFooter onClose={onClose} processing={processing} label={action ? 'Save' : 'Create action'} />
            </form>
        </Dialog>
    );
}
