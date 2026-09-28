import { router, useForm } from '@inertiajs/react';
import { AlertTriangle, ChevronRight, Copy, Send, Trash2, Webhook } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { MenuItem, MenuSeparator } from '../shell/menu';
import { Field, Toggle } from '../studio/form';
import { RowMenu } from '../studio-ops/row-menu';
import Dialog from '../ui/dialog';
import { Callout, Card, IconTile, Switch } from '../ui/kit';
import { Badge, EmptyState, Eyebrow, RelativeTime, type Tone } from '../ui/primitives';
import { toast } from '../ui/toaster';
import { CodeBlock, CodeTabs, pretty } from './code-block';
import { VERIFY } from './snippets';
import type { Delivery, WebhookRow } from './types';

const STRIP = 20;
const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** `call.ended` → grouped by the part before the dot. */
export function groupEvents(events: string[]): [string, string[]][] {
    const groups = new Map<string, string[]>();
    for (const e of events) groups.set(e.split('.')[0], [...(groups.get(e.split('.')[0]) ?? []), e]);
    return [...groups.entries()];
}

function health(w: WebhookRow): { tone: Tone; label: string } {
    if (!w.enabled) return { tone: w.disabled_reason ? 'danger' : 'muted', label: w.disabled_reason ? 'Turned off automatically' : 'Off' };
    if (w.consecutive_failures > 2) return { tone: 'danger', label: `Failing · ${w.consecutive_failures} in a row` };
    if (w.consecutive_failures > 0) return { tone: 'warning', label: `${w.consecutive_failures} recent ${w.consecutive_failures === 1 ? 'failure' : 'failures'}` };
    if (w.deliveries_count === 0) return { tone: 'info', label: 'No deliveries yet' };
    return { tone: 'success', label: 'Healthy' };
}

export function WebhookList({ webhooks, onCreate, disableAfter }: { webhooks: WebhookRow[]; onCreate: () => void; disableAfter: number }) {
    if (webhooks.length === 0) {
        return (
            <Card>
                <EmptyState icon={<Webhook size={20} strokeWidth={1.8} />} title="No endpoints yet" action={<button type="button" className="v-btn v-btn--quiet" onClick={onCreate}><Webhook size={14} strokeWidth={2} />Add endpoint</button>}>
                    Add an HTTPS URL and Veyra will POST to it when a ticket is raised, a call ends, a lead moves stage and more. Send a test first to see the payload.
                </EmptyState>
            </Card>
        );
    }
    return <div className="flex flex-col gap-6">{webhooks.map((w) => <WebhookCard key={w.id} hook={w} disableAfter={disableAfter} />)}</div>;
}

function WebhookCard({ hook: w, disableAfter }: { hook: WebhookRow; disableAfter: number }) {
    const [sending, setSending] = useState(false);
    const [open, setOpen] = useState<number | null>(null);
    const h = health(w);
    // Oldest on the left, newest on the right, the way a timeline reads.
    const strip = [...w.recent].reverse().slice(-STRIP);
    const delivered = strip.filter((d) => d.status === 'delivered').length;
    const all = w.events.includes('*');

    const test = () => router.post(`/studio/developer/webhooks/${w.id}/test`, {}, { preserveScroll: true, onStart: () => setSending(true), onFinish: () => setSending(false) });

    return (
        <Card className="overflow-hidden">
            <div className="flex items-start gap-4 px-7 pt-6 pb-5">
                <IconTile tone={h.tone === 'muted' ? 'muted' : h.tone}><Webhook size={16} strokeWidth={1.9} /></IconTile>
                <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-base font-medium text-primary" title={w.url}>{w.url}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={h.tone} dot>{h.label}</Badge>
                        {all ? <Badge>All events</Badge> : w.events.slice(0, 4).map((e) => <Badge key={e}><span className="font-mono">{e}</span></Badge>)}
                        {!all && w.events.length > 4 && <Badge>+{w.events.length - 4} more</Badge>}
                    </div>
                </div>
                <Switch checked={w.enabled} label={`Deliver to ${w.url}`} onChange={(v) => router.patch(`/studio/developer/webhooks/${w.id}`, { enabled: v }, { preserveScroll: true })} />
            </div>

            {(w.disabled_reason || (w.consecutive_failures > 2 && w.enabled)) && (
                <div className="px-7 pb-5">
                    <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={2} />} title={w.disabled_reason ?? `The last ${w.consecutive_failures} deliveries failed`}>
                        {w.disabled_reason
                            ? 'Nothing is being delivered. Fix the endpoint, send a test, then switch it back on.'
                            : `Check the endpoint is reachable and answers 2xx within 5 seconds. It turns off by itself after ${disableAfter} failures in a row.`}
                    </Callout>
                </div>
            )}

            <div className="px-7 pb-6">
                <div className="flex items-center justify-between gap-3 rounded-md px-4 py-3" style={{ background: 'var(--surface-sunken)' }}>
                    <div className="flex items-center gap-1.5" role="img" aria-label={strip.length ? `${delivered} of the last ${strip.length} deliveries succeeded` : 'No deliveries yet'}>
                        {Array.from({ length: STRIP - strip.length }).map((_, i) => <span key={`empty-${i}`} className="size-2 rounded-full" style={{ background: 'var(--border)' }} />)}
                        {strip.map((d) => (
                            <span key={d.id} className="size-2 rounded-full" title={`${d.event} · ${d.response_status ? `HTTP ${d.response_status}` : 'no response'} · ${new Date(d.at).toLocaleString()}`}
                                style={{ background: d.status === 'delivered' ? 'var(--success-fill)' : d.status === 'pending' ? 'var(--border-strong)' : 'var(--danger-fill)' }} />
                        ))}
                    </div>
                    <span className="text-right text-xs text-secondary tabular-nums">
                        {strip.length ? <><span className="font-medium text-primary">{delivered} of {strip.length}</span> recent delivered</> : 'Nothing delivered yet'}
                    </span>
                </div>
            </div>

            {w.recent.length > 0 && (
                <div style={{ borderTop: '1px solid var(--separator)' }}>
                    <Eyebrow className="block px-7 pt-5 pb-2">Recent deliveries</Eyebrow>
                    {w.recent.slice(0, 8).map((d) => (
                        <DeliveryRow key={d.id} delivery={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} />
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 px-7 py-4" style={{ borderTop: '1px solid var(--separator)' }}>
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

function DeliveryRow({ delivery: d, open, onToggle }: { delivery: Delivery; open: boolean; onToggle: () => void }) {
    const ok = d.status === 'delivered';
    return (
        <div style={{ borderTop: '1px solid var(--separator)' }}>
            <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-13 w-full items-center gap-4 px-7 py-3 text-left transition-colors hover:bg-surface-hover">
                <span className="size-2 shrink-0 rounded-full" style={{ background: ok ? 'var(--success-fill)' : d.status === 'pending' ? 'var(--border-strong)' : 'var(--danger-fill)' }} />
                <span className="w-40 shrink-0 truncate font-mono text-sm text-primary">{d.event}</span>
                <span className="w-20 shrink-0 font-mono text-sm text-secondary tabular-nums">{d.response_status ? `HTTP ${d.response_status}` : ok ? '—' : 'No answer'}</span>
                <span className="hidden w-20 shrink-0 text-sm text-tertiary tabular-nums sm:block">{d.duration_ms != null ? `${d.duration_ms} ms` : ''}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-tertiary">{d.attempt > 1 ? `Retry ${d.attempt - 1}` : ''}</span>
                <span className="shrink-0 text-sm text-secondary"><RelativeTime at={d.at} /></span>
                <ChevronRight size={15} className="shrink-0 text-tertiary transition-transform" style={{ transform: open ? 'rotate(90deg)' : undefined }} />
            </button>
            {open && (
                <div className="grid gap-4 px-7 pb-6 xl:grid-cols-2">
                    <CodeBlock code={pretty(d.payload)} title={`Sent · delivery ${d.id}`} maxHeight={320} />
                    <CodeBlock code={d.response_body || '(empty)'} title={d.response_status ? `Answered HTTP ${d.response_status}` : 'Error'} maxHeight={320} />
                </div>
            )}
        </div>
    );
}

export function EventCatalog({ events, descriptions }: { events: string[]; descriptions: Record<string, string> }) {
    return (
        <Card className="overflow-hidden">
            {groupEvents(events).map(([group, list], gi) => (
                <div key={group} className="grid gap-x-8 gap-y-3 px-7 py-6 lg:grid-cols-[140px_1fr]" style={{ borderTop: gi ? '1px solid var(--separator)' : undefined }}>
                    <Eyebrow className="pt-1">{humanize(group)}</Eyebrow>
                    <ul className="flex flex-col gap-3">
                        {list.map((e) => (
                            <li key={e} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                                <button type="button" onClick={() => { navigator.clipboard?.writeText(e); toast(`Copied ${e}`); }} title="Copy"
                                    className="w-44 shrink-0 text-left font-mono text-sm font-medium text-primary hover:text-accent-text">{e}</button>
                                <span className="text-sm text-secondary">{descriptions[e]}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </Card>
    );
}

export function SignatureHelp() {
    return (
        <Card className="p-7">
            <p className="mb-5 max-w-[72ch] text-base text-secondary">
                Each delivery is a JSON POST with <code className="font-mono text-sm">X-Veyra-Event</code>, <code className="font-mono text-sm">X-Veyra-Delivery</code> and <code className="font-mono text-sm">X-Veyra-Signature: sha256=&lt;hex&gt;</code> — the HMAC-SHA256 of the raw body, keyed with the endpoint's signing secret. Reject anything that does not match.
            </p>
            <CodeTabs samples={VERIFY} fallback="node" />
        </Card>
    );
}

/** A pill that toggles one value in or out of a list. */
function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" role="checkbox" aria-checked={on} onClick={onClick}
            className="h-8 rounded-full px-3 font-mono text-xs font-medium transition-colors"
            style={on
                ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)', boxShadow: 'inset 0 0 0 1px var(--border-accent)' }
                : { background: 'transparent', color: 'var(--text-secondary)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
            {children}
        </button>
    );
}

export function HookDialog({ open, onClose, events }: { open: boolean; onClose: () => void; events: string[] }) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ url: '', events: ['*'] as string[] });
    const close = () => { clearErrors(); onClose(); };
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/developer/webhooks', { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };
    const all = data.events.includes('*');
    const toggle = (ev: string) => setData('events', data.events.includes(ev) ? data.events.filter((x) => x !== ev) : [...data.events, ev]);

    return (
        <Dialog open={open} onClose={close} title="Add a webhook endpoint" description="Veyra POSTs signed JSON to this URL. The signing secret is shown once, after you add it." width={600}>
            <form onSubmit={submit}>
                <Field label="HTTPS URL" hint="Must start with https://. Answer with any 2xx status within 5 seconds to acknowledge a delivery." error={errors.url}>
                    <input className="v-field font-mono" value={data.url} onChange={(e) => setData('url', e.target.value)} placeholder="https://hooks.example.com/veyra" autoFocus spellCheck={false} />
                </Field>
                <Toggle checked={all} onChange={(v) => setData('events', v ? ['*'] : [])} label="All events" hint="Includes event types added in the future." />
                {!all && (
                    <div className="mt-4 flex flex-col gap-3.5 rounded-md p-4" style={{ background: 'var(--surface-sunken)' }}>
                        {groupEvents(events).map(([group, list]) => (
                            <div key={group} className="flex flex-wrap items-center gap-2">
                                <span className="w-20 text-xs font-medium text-tertiary">{humanize(group)}</span>
                                {list.map((ev) => <ChipToggle key={ev} on={data.events.includes(ev)} onClick={() => toggle(ev)}>{ev}</ChipToggle>)}
                            </div>
                        ))}
                    </div>
                )}
                {errors.events && <p className="mt-1.5 text-sm text-danger">{errors.events}</p>}
                <div className="mt-7 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={close}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.url || data.events.length === 0}>{processing ? 'Adding…' : 'Add endpoint'}</button>
                </div>
            </form>
        </Dialog>
    );
}
