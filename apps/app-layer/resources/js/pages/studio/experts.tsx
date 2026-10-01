import { Head, router, useForm } from '@inertiajs/react';
import { Bot, ChevronRight, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { runtimeLook } from '../../components/studio-agent/runtime';
import { ChoiceCard } from '../../components/studio-capability/choice-card';
import { Group, PageStack, Stacked } from '../../components/studio/space';
import Dialog from '../../components/ui/dialog';
import { Card, IconTile, List, ListRow } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Mono } from '../../components/ui/primitives';

interface ExpertRow {
    id: number; slug: string; name: string; description: string;
    runtime: string; runtime_label: string; model: string | null;
    is_builtin: boolean; enabled: boolean; skills_count: number; actions_count: number;
    /** The first enabled expert of its runtime: the talker that speaks, the worker that starts. */
    primary: boolean;
}

interface Props {
    experts: ExpertRow[];
    runtimes: { value: string; label: string; description: string }[];
}

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

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
                description="An expert is a prompt, a set of skills and a set of actions. There is one agent loop: it starts as the first enabled worker and switches to another when that one’s description fits the task better."
                meta={<Mono>{count(experts.length, 'expert')} · {enabled} enabled</Mono>}
                actions={
                    <button type="button" className="v-btn v-btn--primary" onClick={() => setCreating('worker')}>
                        <Plus size={15} strokeWidth={2} />
                        New expert
                    </button>
                }
            />

            <PageStack>
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
                    runtimes.map((r) => {
                        const look = runtimeLook(r.value);
                        const group = experts.filter((e) => e.runtime === r.value);
                        return (
                            <Group
                                key={r.value}
                                title={
                                    <span className="flex items-center gap-2.5">
                                        {r.label}
                                        <span className="text-md font-medium text-tertiary tabular-nums">{group.length}</span>
                                    </span>
                                }
                                description={r.description}
                                aside={
                                    <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={() => setCreating(r.value)} aria-label={`New ${r.label} expert`}>
                                        <Plus size={14} strokeWidth={2} />
                                        Add
                                    </button>
                                }
                            >
                                <Card>
                                    {group.length === 0 ? (
                                        <div className="flex min-h-15 items-center gap-3.5 px-5 text-sm text-secondary">
                                            <IconTile><look.icon size={15} strokeWidth={1.9} /></IconTile>
                                            {look.empty}
                                        </div>
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
                                                                {e.primary && group.filter((x) => x.enabled).length > 1 && <Badge tone="info">{e.runtime === 'talker' ? 'Speaks' : 'Starts here'}</Badge>}
                                                                {e.enabled && !e.primary && e.runtime === 'talker' && <Badge tone="warning">Not used</Badge>}
                                                                {!e.enabled && <Badge tone="warning" dot>Disabled</Badge>}
                                                            </span>
                                                        }
                                                        subtitle={e.description}
                                                        trailing={
                                                            <>
                                                                {e.runtime !== 'talker' && (
                                                                    <span className="hidden items-center gap-6 text-sm text-secondary tabular-nums md:flex">
                                                                        <span>{count(e.skills_count, 'skill')}</span>
                                                                        <span>{count(e.actions_count, 'action')}</span>
                                                                    </span>
                                                                )}
                                                                <span className="hidden w-36 truncate text-right lg:block">
                                                                    <Mono>{e.model || 'Runtime default'}</Mono>
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
                            </Group>
                        );
                    })
                )}
            </PageStack>

            <Dialog
                open={creating !== null}
                onClose={() => setCreating(null)}
                title="New expert"
                description="Name it and say what it handles. Prompt, skills and actions come next, on its own page."
                width={620}
            >
                {creating !== null && <CreateForm key={creating} runtimes={runtimes} runtime={creating} onDone={() => setCreating(null)} />}
            </Dialog>
        </>
    );
}

function CreateForm({ runtimes, runtime, onDone }: { runtimes: Props['runtimes']; runtime: string; onDone: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', description: '', runtime });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        post('/studio/experts', { onSuccess: onDone });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-5 pt-1">
            <Stacked label="Runtime" error={errors.runtime}>
                <div role="radiogroup" aria-label="Runtime" className="flex flex-col gap-3">
                    {runtimes.map((r) => {
                        const look = runtimeLook(r.value);
                        return (
                            <ChoiceCard key={r.value} selected={data.runtime === r.value} onSelect={() => setData('runtime', r.value)}
                                icon={<look.icon size={16} strokeWidth={1.9} />} title={r.label} description={r.description} />
                        );
                    })}
                </div>
            </Stacked>
            <Stacked label="Name" htmlFor="expert-name" error={errors.name}>
                <input id="expert-name" className="v-field" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} autoFocus placeholder="Billing" />
            </Stacked>
            <Stacked label="One-line description" htmlFor="expert-description" error={errors.description}
                hint="Other experts read this to decide when to hand off."
                aside={<Mono>{data.description.length}/160</Mono>}>
                <input id="expert-description" className="v-field" value={data.description} onChange={(e) => setData('description', e.target.value)} maxLength={160}
                    placeholder="Refunds, invoices and failed payments." />
            </Stacked>
            <div className="mt-2 flex justify-end gap-2 border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                <button type="button" className="v-btn v-btn--ghost" onClick={onDone}>Cancel</button>
                <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Creating…' : 'Create expert'}</button>
            </div>
        </form>
    );
}
