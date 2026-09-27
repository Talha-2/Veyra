import { Head, router, useForm } from '@inertiajs/react';
import { Bot, ChevronRight, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { runtimeLook } from '../../components/studio-agent/runtime';
import Dialog from '../../components/ui/dialog';
import { Card, CardHeader, IconTile, List, ListRow } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Mono } from '../../components/ui/primitives';

interface ExpertRow {
    id: number; slug: string; name: string; description: string;
    runtime: string; runtime_label: string; model: string | null;
    is_builtin: boolean; enabled: boolean; skills_count: number; actions_count: number;
}

interface Props {
    experts: ExpertRow[];
    runtimes: { value: string; label: string; description: string }[];
}

const count =(n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * An expert is a record, and this list is meant to make that obvious: the two
 * built-ins are the talker and the worker, and anything an organization adds is
 * the same kind of thing with a different prompt and a different tool list.
 * Grouped by runtime, because the runtime decides what an expert may do.
 */
export default function Experts({ experts, runtimes }: Props) {
    const [creating, setCreating] = useState<string | null>(null);
    const enabled = experts.filter((e) => e.enabled).length;

    return (
        <>
            <Head title="Experts" />

            <PageHeader
                title="Experts"
                description="An expert is a prompt, a set of skills and a set of actions. There is one agent loop; switching expert swaps what it is told and what it can reach."
                meta={<Mono>{count(experts.length, 'expert')} · {enabled} enabled</Mono>}
                actions={
                    <button type="button" className="v-btn v-btn--primary" onClick={() => setCreating('worker')}>
                        <Plus size={15} strokeWidth={2} />
                        New expert
                    </button>
                }
            />

            {experts.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Bot size={20} strokeWidth={1.8} />}
                        title="No experts yet"
                        action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setCreating('talker')}>Add a talker</button>}
                    >
                        A call needs two: a talker that owns every word the caller hears, and a worker that runs skills and actions behind it.
                    </EmptyState>
                </Card>
            ) : (
                <div className="flex flex-col gap-5">
                    {runtimes.map((r) => {
                        const look = runtimeLook(r.value);
                        const group = experts.filter((e) => e.runtime === r.value);
                        return (
                            <Card key={r.value}>
                                <CardHeader
                                    icon={<look.icon size={16} strokeWidth={1.8} />}
                                    title={
                                        <span className="flex items-center gap-2">
                                            {r.label}
                                            <span className="text-sm font-medium text-tertiary tabular-nums">{group.length}</span>
                                        </span>
                                    }
                                    description={r.description}
                                    actions={
                                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setCreating(r.value)} aria-label={`New ${r.label} expert`}>
                                            <Plus size={14} strokeWidth={2} />
                                            Add
                                        </button>
                                    }
                                />
                                {group.length === 0 ? (
                                    <p className="px-5 py-4 text-sm text-tertiary">{look.empty}</p>
                                ) : (
                                    <List>
                                        {group.map((e) => {
                                            const href = `/studio/experts/${e.id}`;
                                            return (
                                                <ListRow
                                                    key={e.id}
                                                    href={href}
                                                    onClick={() => router.visit(href)}
                                                    dim={!e.enabled}
                                                    leading={<IconTile tone={e.enabled ? look.tone : 'muted'}><look.icon size={15} strokeWidth={1.9} /></IconTile>}
                                                    title={
                                                        <span className="flex items-center gap-2">
                                                            <span className="truncate">{e.name}</span>
                                                            {e.is_builtin && <Badge>Built-in</Badge>}
                                                            {!e.enabled && <Badge tone="warning" dot>Disabled</Badge>}
                                                        </span>
                                                    }
                                                    subtitle={e.description}
                                                    trailing={
                                                        <>
                                                            <span className="hidden items-center gap-4 text-right md:flex">
                                                                <Count n={e.skills_count} label="skills" />
                                                                <Count n={e.actions_count} label="actions" />
                                                                <span className="w-30 truncate text-right">
                                                                    <Mono>{e.model || 'Runtime default'}</Mono>
                                                                </span>
                                                            </span>
                                                            <ChevronRight size={16} strokeWidth={1.9} className="text-tertiary" />
                                                        </>
                                                    }
                                                />
                                            );
                                        })}
                                    </List>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog
                open={creating !== null}
                onClose={() => setCreating(null)}
                title="New expert"
                description="Name it and say what it handles. Prompt, skills and actions come next, on its own page."
            >
                {creating !== null && <CreateForm key={creating} runtimes={runtimes} runtime={creating} onDone={() => setCreating(null)} />}
            </Dialog>
        </>
    );
}

function Count({ n, label }: { n: number; label: string }) {
    return (
        <span className="flex flex-col items-end leading-tight">
            <span className="text-base font-semibold text-primary tabular-nums">{n}</span>
            <span className="text-2xs text-tertiary">{label}</span>
        </span>
    );
}

function CreateForm({ runtimes, runtime, onDone }: { runtimes: Props['runtimes']; runtime: string; onDone: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', description: '', runtime });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        post('/studio/experts', { onSuccess: onDone });
    };

    const chosen = runtimes.find((r) => r.value === data.runtime);

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
                <label className="v-label" htmlFor="expert-name">Name</label>
                <input id="expert-name" className="v-field" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} autoFocus placeholder="Billing" />
                {errors.name && <p className="mt-1.5 text-sm text-danger">{errors.name}</p>}
            </div>
            <div>
                <label className="v-label" htmlFor="expert-description">One-line description</label>
                <input id="expert-description" className="v-field" value={data.description} onChange={(e) => setData('description', e.target.value)} maxLength={160}
                    placeholder="Refunds, invoices and failed payments." />
                <p className="mt-1.5 text-sm" style={{ color: errors.description ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                    {errors.description ?? `Other experts read this to decide when to hand off. ${data.description.length}/160`}
                </p>
            </div>
            <div>
                <span className="v-label">Runtime</span>
                <div role="radiogroup" aria-label="Runtime" className="grid gap-2 sm:grid-cols-3">
                    {runtimes.map((r) => {
                        const look = runtimeLook(r.value);
                        const on = data.runtime === r.value;
                        return (
                            <label key={r.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors has-focus-visible:[box-shadow:var(--ring)]"
                                style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent-subtle)' : 'var(--surface)', color: 'var(--text-primary)' }}>
                                <input type="radio" name="runtime" className="sr-only" checked={on} onChange={() => setData('runtime', r.value)} />
                                <look.icon size={15} strokeWidth={1.9} style={{ color: on ? 'var(--accent-text)' : 'var(--text-secondary)' }} />
                                {r.label}
                            </label>
                        );
                    })}
                </div>
                {chosen && <p className="mt-2 text-sm text-secondary">{chosen.description}</p>}
            </div>
            <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="v-btn v-btn--ghost" onClick={onDone}>Cancel</button>
                <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Creating…' : 'Create expert'}</button>
            </div>
        </form>
    );
}
