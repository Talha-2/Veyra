import { router, useForm } from '@inertiajs/react';
import { Ban, Copy, Key, Plus } from 'lucide-react';
import type { FormEvent } from 'react';

import { MenuItem, MenuSeparator } from '../shell/menu';
import { Field, Toggle } from '../studio/form';
import { RowMenu } from '../studio-ops/row-menu';
import Dialog from '../ui/dialog';
import { Card, IconTile, List, ListRow } from '../ui/kit';
import { Badge, EmptyState, RelativeTime } from '../ui/primitives';
import { toast } from '../ui/toaster';
import type { ApiKeyRow } from './types';

/** `contacts:read` + `contacts:write` → one row with Read / Write. */
export interface ScopeRow { resource: string; label: string; read?: string; write?: string; description: string }

const LABELS: Record<string, string> = { contacts: 'Contacts', conversations: 'Conversations', messages: 'Messages', tickets: 'Tickets', leads: 'Leads & pipelines', calls: 'Calls', knowledge: 'Knowledge', webhooks: 'Webhook endpoints', chat: 'Agent chat' };

export function scopeRows(scopes: string[], descriptions: Record<string, string>): ScopeRow[] {
    const rows = new Map<string, ScopeRow>();
    for (const s of scopes) {
        const [resource, access] = s.split(':');
        const row = rows.get(resource) ?? { resource, label: LABELS[resource] ?? resource, description: '' };
        if (access === 'read') row.read = s;
        if (access === 'write') row.write = s;
        row.description = [row.description, descriptions[s]].filter(Boolean).join(' ');
        rows.set(resource, row);
    }
    return [...rows.values()];
}

export function KeyList({ keys, onCreate }: { keys: ApiKeyRow[]; onCreate: () => void }) {
    if (keys.length === 0) {
        return (
            <Card>
                <EmptyState icon={<Key size={20} strokeWidth={1.8} />} title="No API keys yet" action={<button type="button" className="v-btn v-btn--quiet" onClick={onCreate}><Plus size={14} strokeWidth={2} />Create a key</button>}>
                    Create one key for each system that calls the API, so you can revoke one without breaking the others.
                </EmptyState>
            </Card>
        );
    }

    const active = keys.filter((k) => k.active);
    const revoked = keys.filter((k) => !k.active);

    return (
        <div className="flex flex-col gap-6">
            <Card className="overflow-hidden"><List>{active.map((k) => <KeyRow key={k.id} apiKey={k} />)}</List>
                {active.length === 0 && <p className="px-6 py-5 text-sm text-secondary">Every key has been revoked. Create a new one to call the API.</p>}
            </Card>
            {revoked.length > 0 && (
                <details className="group">
                    <summary className="cursor-pointer list-none text-sm font-medium text-secondary hover:text-primary">
                        {revoked.length} revoked {revoked.length === 1 ? 'key' : 'keys'} <span className="text-tertiary group-open:hidden">· show</span>
                    </summary>
                    <Card className="mt-3 overflow-hidden"><List>{revoked.map((k) => <KeyRow key={k.id} apiKey={k} />)}</List></Card>
                </details>
            )}
        </div>
    );
}

function KeyRow({ apiKey: k }: { apiKey: ApiKeyRow }) {
    const revoke = () => confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`) && router.delete(`/studio/developer/keys/${k.id}`, { preserveScroll: true });
    const reads = k.scopes.filter((s) => s.endsWith(':read')).length;
    const writes = k.scopes.length - reads;

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
                <span className="flex items-center gap-2" title={k.scopes.join(', ')}>
                    <span className="font-mono text-xs">{k.prefix}••••••••</span>
                    <span className="text-tertiary">·</span>
                    <span>{reads ? `${reads} read` : ''}{reads && writes ? ', ' : ''}{writes ? `${writes} write` : ''} {k.scopes.length === 1 ? 'scope' : 'scopes'}</span>
                </span>
            }
            trailing={
                <>
                    <div className="hidden text-right md:block">
                        <div className="text-sm text-secondary">{!k.active && k.revoked_at ? <>Revoked <RelativeTime at={k.revoked_at} /></> : k.last_used_at ? <>Used <RelativeTime at={k.last_used_at} /></> : 'Never used'}</div>
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

/** A read or write cell in the scope matrix. */
function Cell({ scope, on, disabled, onToggle, label }: { scope?: string; on: boolean; disabled: boolean; onToggle: () => void; label: string }) {
    if (!scope) return <span className="flex h-8 w-16 items-center justify-center text-sm text-tertiary" aria-hidden="true">—</span>;
    return (
        <button type="button" role="checkbox" aria-checked={on} aria-label={`${label}: ${scope}`} disabled={disabled} onClick={onToggle}
            className="h-8 w-16 rounded-full text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={on
                ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)', boxShadow: 'inset 0 0 0 1px var(--border-accent)' }
                : { background: 'transparent', color: 'var(--text-secondary)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
            {scope.split(':')[1] === 'read' ? 'Read' : 'Write'}
        </button>
    );
}

export function KeyDialog({ open, onClose, scopes, descriptions, publishableScopes }: { open: boolean; onClose: () => void; scopes: string[]; descriptions: Record<string, string>; publishableScopes: string[] }) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ name: '', scopes: [] as string[], publishable: false });
    const close = () => { clearErrors(); onClose(); };
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/developer/keys', { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };
    const has = (s?: string) => !!s && data.scopes.includes(s);
    const allowed = (s?: string) => !!s && (!data.publishable || publishableScopes.includes(s));
    const toggle = (s: string) => setData('scopes', has(s) ? data.scopes.filter((x) => x !== s) : [...data.scopes, s]);
    const rows = scopeRows(scopes, descriptions);
    const scopeError = errors.scopes ?? Object.entries(errors).find(([k]) => k.startsWith('scopes.'))?.[1];

    const preset = (kind: 'read' | 'all' | 'none') => setData('scopes', kind === 'none' ? [] : scopes.filter((s) => allowed(s) && (kind === 'all' || s.endsWith(':read'))));

    return (
        <Dialog open={open} onClose={close} title="New API key" description="The full key is shown once, right after you create it. Give it only the access the system using it needs." width={640}>
            <form onSubmit={submit}>
                <Field label="Name" hint="Name it after what uses it, so you know what breaks if you revoke it." error={errors.name}>
                    <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Helpdesk sync" autoFocus />
                </Field>

                <div className="mb-5">
                    <Toggle checked={data.publishable} label="Publishable key"
                        hint={`Safe to put in a web page. Can only use ${publishableScopes.join(', ')} and read its own details.`}
                        onChange={(v) => setData((d) => ({ ...d, publishable: v, scopes: v ? d.scopes.filter((s) => publishableScopes.includes(s)) : d.scopes }))} />
                </div>

                <Field label="Access" error={scopeError}>
                    <div className="mb-2.5 flex items-center gap-1.5">
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => preset('read')}>Read only</button>
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => preset('all')} disabled={data.publishable}>Everything</button>
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => preset('none')}>Clear</button>
                        <span className="ml-auto text-xs text-tertiary tabular-nums">{data.scopes.length} of {scopes.length}</span>
                    </div>
                    <div className="rounded-md" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}>
                        {rows.map((row, i) => (
                            <div key={row.resource} className="flex items-center gap-4 px-4 py-3" style={{ borderTop: i ? '1px solid var(--separator)' : undefined, opacity: allowed(row.read) || allowed(row.write) ? 1 : 0.55 }}>
                                <div className="min-w-0 flex-1">
                                    <div className="text-base font-medium text-primary">{row.label}</div>
                                    <div className="mt-0.5 line-clamp-2 text-xs text-tertiary">{row.description}</div>
                                </div>
                                <Cell label={row.label} scope={row.read} on={has(row.read)} disabled={!allowed(row.read)} onToggle={() => row.read && toggle(row.read)} />
                                <Cell label={row.label} scope={row.write} on={has(row.write)} disabled={!allowed(row.write)} onToggle={() => row.write && toggle(row.write)} />
                            </div>
                        ))}
                    </div>
                </Field>

                <div className="mt-7 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={close}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim() || data.scopes.length === 0}>{processing ? 'Creating…' : 'Create key'}</button>
                </div>
            </form>
        </Dialog>
    );
}
