import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Ban, CheckCircle2, Copy, Key, Plus, Send, Trash2, Webhook } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { RowMenu } from '../../components/studio-ops/row-menu';
import { Field, Toggle } from '../../components/studio/form';
import { MenuItem, MenuSeparator } from '../../components/shell/menu';
import Dialog from '../../components/ui/dialog';
import { Callout, Card, CardBody, CardHeader, CopyButton, IconTile, KeyValues, List, ListRow, Switch } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Eyebrow, RelativeTime, type Tone } from '../../components/ui/primitives';
import { toast } from '../../components/ui/toaster';
import type { SharedProps } from '../../types';

interface ApiKeyRow { id: number; name: string; prefix: string; scopes: string[]; publishable: boolean; active: boolean; last_used_at: string | null; created_at: string; created_by: string | null }
interface Delivery { id: number; event: string; status: string; response_status: number | null; attempt: number; at: string }
interface WebhookRow { id: number; url: string; events: string[]; enabled: boolean; deliveries_count: number; consecutive_failures: number; last_delivered_at: string | null; recent: Delivery[] }
interface Props { keys: ApiKeyRow[]; scopes: string[]; webhooks: WebhookRow[]; events: string[]; base_url: string }

const STRIP = 20;
const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** `calls:read`, `call.ended` → grouped by the part before the separator. */
function groupBy(items: string[], sep: string): [string, string[]][] {
    const groups = new Map<string, string[]>();
    for (const item of items) {
        const head = item.split(sep)[0];
        groups.set(head, [...(groups.get(head) ?? []), item]);
    }
    return [...groups.entries()];
}

export default function Developer({ keys, scopes, webhooks, events, base_url }: Props) {
    const { flash } = usePage<SharedProps>().props;
    const [creatingKey, setCreatingKey] = useState(false);
    const [creatingHook, setCreatingHook] = useState(false);
    const activeKeys = keys.filter((k) => k.active).length;

    return (
        <>
            <Head title="Developer" />
            <PageHeader
                title="Developer"
                description="Keys for the public API, and webhooks that tell your own systems when something happens in Veyra."
                meta={<><Badge>{activeKeys} active {activeKeys === 1 ? 'key' : 'keys'}</Badge><Badge>{webhooks.length} {webhooks.length === 1 ? 'endpoint' : 'endpoints'}</Badge></>}
                actions={<button type="button" className="v-btn v-btn--primary" onClick={() => setCreatingKey(true)}><Plus size={15} strokeWidth={2} />New API key</button>}
            />

            {flash.new_key && (
                <Secret title="Copy your new API key now" value={flash.new_key}>
                    It will not be shown again. Only a hash is stored, so a lost key cannot be recovered; revoke it and create another.
                </Secret>
            )}
            {flash.new_webhook_secret && (
                <Secret title="Copy the signing secret for this endpoint" value={flash.new_webhook_secret}>
                    Shown once. Verify each delivery by computing HMAC-SHA256 of the raw body with this secret and comparing it to the <span className="font-mono">X-Veyra-Signature</span> header.
                </Secret>
            )}

            <Card className="mb-6">
                <CardHeader title="Connect" description="Every request goes to the base URL with a server key in the Authorization header." />
                <CardBody>
                    <KeyValues items={[
                        { label: 'Base URL', value: <Inline value={base_url} /> },
                        { label: 'Authentication', value: <Inline value="Authorization: Bearer vy_sk_…" copy={false} /> },
                        { label: 'Webhook signature', value: <Inline value="X-Veyra-Signature: sha256=<hex>" copy={false} /> },
                    ]} />
                </CardBody>
            </Card>

            <Card className="mb-8">
                <CardHeader
                    icon={<Key size={16} strokeWidth={1.9} />}
                    title="API keys"
                    description="A server key can do whatever its scopes allow; keep it out of browsers and repositories. A publishable key is safe to embed, and only its read scopes take effect."
                />
                {keys.length === 0 ? (
                    <EmptyState icon={<Key size={20} strokeWidth={1.8} />} title="No API keys yet" action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setCreatingKey(true)}><Plus size={14} strokeWidth={2} />Create a key</button>}>
                        Create a key for each system that calls the API, so you can revoke one without breaking the others.
                    </EmptyState>
                ) : (
                    <List>{keys.map((k) => <KeyRow key={k.id} apiKey={k} />)}</List>
                )}
            </Card>

            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-primary">Webhooks</h2>
                    <p className="mt-0.5 max-w-[68ch] text-sm text-secondary">Events are delivered as signed JSON POSTs. An endpoint that keeps failing is worth a look before it misses something that matters.</p>
                </div>
                <button type="button" className="v-btn v-btn--quiet" onClick={() => setCreatingHook(true)}><Webhook size={14} strokeWidth={2} />Add endpoint</button>
            </div>
            <div className="mb-8 flex flex-col gap-4">
                {webhooks.length === 0 && (
                    <Card>
                        <EmptyState icon={<Webhook size={20} strokeWidth={1.8} />} title="No endpoints yet">
                            Add an HTTPS URL and Veyra will POST to it when a call ends, a ticket is created, a run completes and more. Send a test first to see the payload.
                        </EmptyState>
                    </Card>
                )}
                {webhooks.map((w) => <WebhookCard key={w.id} hook={w} />)}
            </div>

            <Card>
                <CardHeader title="Event catalog" description="Everything an endpoint can subscribe to. Choose All events to also receive ones added later. Click a name to copy it." />
                <CardBody className="flex flex-col gap-4">
                    {groupBy(events, '.').map(([group, list]) => (
                        <div key={group} className="grid items-start gap-2 sm:grid-cols-[110px_1fr]">
                            <Eyebrow className="pt-1.5">{humanize(group)}</Eyebrow>
                            <div className="flex flex-wrap gap-1.5">
                                {list.map((e) => (
                                    <button key={e} type="button" onClick={() => { navigator.clipboard?.writeText(e); toast(`Copied ${e}`); }}
                                        className="h-7 rounded-full px-2.5 font-mono text-xs text-secondary transition-colors hover:text-primary"
                                        style={{ background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </CardBody>
            </Card>

            <KeyDialog open={creatingKey} onClose={() => setCreatingKey(false)} scopes={scopes} />
            <HookDialog open={creatingHook} onClose={() => setCreatingHook(false)} events={events} />
        </>
    );
}

function Inline({ value, copy = true }: { value: string; copy?: boolean }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-mono text-sm text-primary">{value}</span>
            {copy && <CopyButton value={value} />}
        </span>
    );
}

function Secret({ title, value, children }: { title: string; value: string; children: ReactNode }) {
    return (
        <div className="mb-6 animate-rise">
            <Callout tone="success" icon={<CheckCircle2 size={16} strokeWidth={2} />} title={title}>
                <p>{children}</p>
                <div className="mt-3 flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
                    <code className="min-w-0 flex-1 font-mono text-sm break-all text-primary select-all" style={{ background: 'none', border: 'none', padding: 0 }}>{value}</code>
                    <CopyButton value={value} />
                </div>
            </Callout>
        </div>
    );
}

function KeyRow({ apiKey: k }: { apiKey: ApiKeyRow }) {
    const revoke = () => confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`) && router.delete(`/studio/developer/keys/${k.id}`, { preserveScroll: true });

    return (
        <ListRow
            dim={!k.active}
            leading={<IconTile tone={k.active ? (k.publishable ? 'info' : 'muted') : 'muted'}><Key size={16} strokeWidth={1.9} /></IconTile>}
            title={
                <span className="flex items-center gap-2">
                    <span className="truncate">{k.name}</span>
                    {k.publishable ? <Badge tone="info">Publishable</Badge> : <Badge>Server</Badge>}
                    {!k.active && <Badge tone="danger">Revoked</Badge>}
                </span>
            }
            subtitle={
                <span className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 font-mono text-xs text-secondary">{k.prefix}••••••••</span>
                    {k.scopes.map((s) => <Badge key={s} tone={s.endsWith(':write') ? 'warning' : 'muted'}>{s}</Badge>)}
                </span>
            }
            trailing={
                <>
                    <div className="hidden text-right md:block">
                        <div className="text-xs text-secondary">{k.last_used_at ? <>Used <RelativeTime at={k.last_used_at} /></> : 'Never used'}</div>
                        <div className="text-xs text-tertiary">Created <RelativeTime at={k.created_at} />{k.created_by && <> by {k.created_by}</>}</div>
                    </div>
                    <RowMenu label={`More for ${k.name}`}>
                        {(close) => (
                            <>
                                <MenuItem icon={<Copy size={14} strokeWidth={2} />} onSelect={() => { close(); navigator.clipboard?.writeText(k.prefix); toast('Key prefix copied.'); }}>Copy prefix</MenuItem>
                                {k.active && (
                                    <>
                                        <MenuSeparator />
                                        <MenuItem danger icon={<Ban size={14} strokeWidth={2} />} onSelect={() => { close(); revoke(); }}>Revoke key</MenuItem>
                                    </>
                                )}
                            </>
                        )}
                    </RowMenu>
                </>
            }
        />
    );
}

function health(w: WebhookRow): { tone: Tone; label: string } {
    if (!w.enabled) return { tone: 'muted', label: 'Off' };
    if (w.consecutive_failures > 2) return { tone: 'danger', label: `Failing · ${w.consecutive_failures} in a row` };
    if (w.consecutive_failures > 0) return { tone: 'warning', label: `${w.consecutive_failures} recent ${w.consecutive_failures === 1 ? 'failure' : 'failures'}` };
    if (w.deliveries_count === 0) return { tone: 'info', label: 'No deliveries yet' };
    return { tone: 'success', label: 'Healthy' };
}

function WebhookCard({ hook: w }: { hook: WebhookRow }) {
    const [sending, setSending] = useState(false);
    const h = health(w);
    // Oldest on the left, newest on the right, the way a timeline reads.
    const recent = [...w.recent].reverse().slice(-STRIP);
    const delivered = recent.filter((d) => d.status === 'delivered').length;
    const all = w.events.includes('*');

    const test = () => router.post(`/studio/developer/webhooks/${w.id}/test`, {}, { preserveScroll: true, onStart: () => setSending(true), onFinish: () => setSending(false) });

    return (
        <Card className={w.enabled ? '' : 'opacity-75'}>
            <div className="flex items-start gap-3.5 px-5 pt-4 pb-3.5">
                <IconTile tone={h.tone === 'muted' ? 'muted' : h.tone}><Webhook size={16} strokeWidth={1.9} /></IconTile>
                <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-medium text-primary" title={w.url}>{w.url}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={h.tone} dot>{h.label}</Badge>
                        {all ? <Badge>All events</Badge> : w.events.slice(0, 4).map((e) => <Badge key={e}><span className="font-mono">{e}</span></Badge>)}
                        {!all && w.events.length > 4 && <Badge>+{w.events.length - 4} more</Badge>}
                    </div>
                </div>
                <Switch checked={w.enabled} label={`Deliver to ${w.url}`} onChange={(v) => router.patch(`/studio/developer/webhooks/${w.id}`, { enabled: v }, { preserveScroll: true })} />
            </div>

            <div className="px-5 pb-4">
                <div className="flex items-center justify-between gap-3 rounded-md px-3.5 py-3" style={{ background: 'var(--surface-sunken)' }}>
                    <div className="flex items-center gap-1.5" role="img" aria-label={recent.length ? `${delivered} of the last ${recent.length} deliveries succeeded` : 'No deliveries yet'}>
                        {Array.from({ length: STRIP - recent.length }).map((_, i) => (
                            <span key={`empty-${i}`} className="size-2 rounded-full" style={{ background: 'var(--border)' }} />
                        ))}
                        {recent.map((d) => (
                            <span key={d.id} className="size-2 rounded-full" title={`${d.event} · ${d.response_status ? `HTTP ${d.response_status}` : 'no response'} · ${new Date(d.at).toLocaleString()}`}
                                style={{ background: d.status === 'delivered' ? 'var(--success-fill)' : 'var(--danger-fill)' }} />
                        ))}
                    </div>
                    <span className="text-right text-xs text-secondary tabular-nums">
                        {recent.length ? <><span className="font-medium text-primary">{delivered} of {recent.length}</span> recent delivered</> : 'Nothing delivered yet'}
                    </span>
                </div>
                {w.consecutive_failures > 2 && w.enabled && (
                    <p className="mt-2 text-xs text-danger">The last {w.consecutive_failures} deliveries failed. Check the endpoint is reachable and answers with a 2xx status.</p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--separator)' }}>
                <span className="mr-auto text-xs text-tertiary tabular-nums">
                    {w.deliveries_count} {w.deliveries_count === 1 ? 'delivery' : 'deliveries'} in total
                    {w.last_delivered_at && <> · last success <RelativeTime at={w.last_delivered_at} /></>}
                </span>
                <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={test} disabled={sending}>
                    <Send size={13} strokeWidth={2} />{sending ? 'Sending…' : 'Send test'}
                </button>
                <RowMenu label={`More for ${w.url}`} side="top">
                    {(close) => (
                        <>
                            <MenuItem icon={<Copy size={14} strokeWidth={2} />} onSelect={() => { close(); navigator.clipboard?.writeText(w.url); toast('Endpoint URL copied.'); }}>Copy URL</MenuItem>
                            <MenuSeparator />
                            <MenuItem danger icon={<Trash2 size={14} strokeWidth={2} />} onSelect={() => { close(); if (confirm('Delete this endpoint? It stops receiving events immediately.')) router.delete(`/studio/developer/webhooks/${w.id}`, { preserveScroll: true }); }}>Delete endpoint</MenuItem>
                        </>
                    )}
                </RowMenu>
            </div>
        </Card>
    );
}

/** A pill that toggles one value in or out of a list. */
function ChipToggle({ on, onClick, children, mono = true }: { on: boolean; onClick: () => void; children: ReactNode; mono?: boolean }) {
    return (
        <button type="button" role="checkbox" aria-checked={on} onClick={onClick}
            className={`h-7 rounded-full px-2.5 text-xs font-medium transition-colors ${mono ? 'font-mono' : ''}`}
            style={on
                ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)', boxShadow: 'inset 0 0 0 1px var(--border-accent)' }
                : { background: 'transparent', color: 'var(--text-secondary)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
            {children}
        </button>
    );
}

function KeyDialog({ open, onClose, scopes }: { open: boolean; onClose: () => void; scopes: string[] }) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ name: '', scopes: ['calls:read'] as string[], publishable: false });
    const close = () => { clearErrors(); onClose(); };
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/developer/keys', { onSuccess: () => { reset(); onClose(); } }); };
    const toggle = (s: string) => setData('scopes', data.scopes.includes(s) ? data.scopes.filter((x) => x !== s) : [...data.scopes, s]);

    return (
        <Dialog open={open} onClose={close} title="New API key" description="The full key is shown once, right after you create it.">
            <form onSubmit={submit}>
                <Field label="Name" hint="Name it after what uses it, so you know what breaks if you revoke it." error={errors.name}>
                    <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Website booking widget" autoFocus />
                </Field>
                <Field label="Scopes" error={errors.scopes}>
                    <div className="rounded-md" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}>
                        {groupBy(scopes, ':').map(([resource, list], i) => (
                            <div key={resource} className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ borderTop: i ? '1px solid var(--separator)' : undefined }}>
                                <span className="text-sm font-medium text-primary">{humanize(resource)}</span>
                                <div className="flex gap-1.5">
                                    {list.map((s) => <ChipToggle key={s} on={data.scopes.includes(s)} onClick={() => toggle(s)} mono={false}>{humanize(s.split(':')[1] ?? s)}</ChipToggle>)}
                                </div>
                            </div>
                        ))}
                    </div>
                </Field>
                <Toggle checked={data.publishable} onChange={(v) => setData('publishable', v)} label="Publishable" hint="Safe to embed in a browser or app. Only read scopes take effect." />
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={close}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim() || data.scopes.length === 0}>{processing ? 'Creating…' : 'Create key'}</button>
                </div>
            </form>
        </Dialog>
    );
}

function HookDialog({ open, onClose, events }: { open: boolean; onClose: () => void; events: string[] }) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ url: '', events: ['*'] as string[] });
    const close = () => { clearErrors(); onClose(); };
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/developer/webhooks', { onSuccess: () => { reset(); onClose(); } }); };
    const all = data.events.includes('*');
    const toggle = (ev: string) => setData('events', data.events.includes(ev) ? data.events.filter((x) => x !== ev) : [...data.events, ev]);

    return (
        <Dialog open={open} onClose={close} title="Add a webhook endpoint" description="Veyra POSTs signed JSON to this URL. The signing secret is shown once, after you add it." width={560}>
            <form onSubmit={submit}>
                <Field label="HTTPS URL" hint="Must start with https://. Answer with any 2xx status to acknowledge a delivery." error={errors.url}>
                    <input className="v-field font-mono" value={data.url} onChange={(e) => setData('url', e.target.value)} placeholder="https://hooks.example.com/veyra" autoFocus spellCheck={false} />
                </Field>
                <Toggle checked={all} onChange={(v) => setData('events', v ? ['*'] : [])} label="All events" hint="Includes event types added in the future." />
                {!all && (
                    <div className="mt-3 flex flex-col gap-3 rounded-md p-3.5" style={{ background: 'var(--surface-sunken)' }}>
                        {groupBy(events, '.').map(([group, list]) => (
                            <div key={group} className="flex flex-wrap items-center gap-1.5">
                                <span className="w-20 text-xs font-medium text-tertiary">{humanize(group)}</span>
                                {list.map((ev) => <ChipToggle key={ev} on={data.events.includes(ev)} onClick={() => toggle(ev)}>{ev}</ChipToggle>)}
                            </div>
                        ))}
                    </div>
                )}
                {errors.events && <p className="mt-1.5 text-sm text-danger">{errors.events}</p>}
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={close}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.url || data.events.length === 0}>{processing ? 'Adding…' : 'Add endpoint'}</button>
                </div>
            </form>
        </Dialog>
    );
}
