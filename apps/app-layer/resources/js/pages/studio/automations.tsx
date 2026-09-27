import { Head, Link, router, useForm } from '@inertiajs/react';
import { Activity, ChevronRight, CircleAlert, Clock, Play, Plus, Power, Webhook, Workflow, Zap } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { useCreateParam } from '../../components/studio-capability/use-create-param';
import { Field } from '../../components/studio/form';
import Dialog from '../../components/ui/dialog';
import { Card, IconTile, List, SearchField, SegmentedControl, StatTile, Switch, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, RelativeTime, StatusDot, type Tone } from '../../components/ui/primitives';

interface Row {
    id: number; name: string; description: string | null; triggers: string[]; schedule_label: string | null; app_event: string | null;
    reasoning: string; enabled: boolean; runs_count: number; failed_runs_count: number;
    recent_runs_count?: number; recent_failed_runs_count?: number; last_run_status?: string | null;
    next_run_at: string | null; last_run_at: string | null; created_by: string | null;
}

type Filter = 'all' | 'active' | 'paused' | 'failing';

const RUN_TONE: Record<string, Tone> = { done: 'success', error: 'danger', running: 'info', queued: 'muted' };

const isFailing = (a: Row) => (a.recent_failed_runs_count ?? 0) > 0 || a.last_run_status === 'error';

/**
 * Automations — what the retired server called Experts. A job the agent runs
 * on its own, on a schedule, a webhook, an app event, or a button.
 */
export default function Automations({ automations }: { automations: Row[] }) {
    const [creating, setCreating] = useCreateParam();
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    // The switch answers at once; the server's answer replaces it when the page reloads.
    const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});

    const isOn = (a: Row) => optimistic[a.id] ?? a.enabled;

    const totals = useMemo(() => ({
        active: automations.filter((a) => a.enabled).length,
        recentRuns: automations.reduce((n, a) => n + (a.recent_runs_count ?? 0), 0),
        allRuns: automations.reduce((n, a) => n + a.runs_count, 0),
        recentFailed: automations.reduce((n, a) => n + (a.recent_failed_runs_count ?? 0), 0),
        failing: automations.filter(isFailing).length,
    }), [automations]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return automations.filter((a) => {
            if (filter === 'active' && !a.enabled) return false;
            if (filter === 'paused' && a.enabled) return false;
            if (filter === 'failing' && !isFailing(a)) return false;
            return !q || [a.name, a.description ?? '', a.app_event ?? '', a.schedule_label ?? ''].some((t) => t.toLowerCase().includes(q));
        });
    }, [automations, filter, query]);

    const toggle = (a: Row, value: boolean) => {
        setOptimistic((o) => ({ ...o, [a.id]: value }));
        router.patch(`/studio/automations/${a.id}`, { enabled: value }, {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => setOptimistic((o) => { const next = { ...o }; delete next[a.id]; return next; }),
        });
    };

    return (
        <>
            <Head title="Automations" />

            <PageHeader
                title="Automations"
                description="Jobs the agent runs without a call: a morning digest, a text-back after a missed call, a weekly report. Each has a goal, the tools it may use, and what starts it."
                actions={
                    <button type="button" className="v-btn v-btn--primary" onClick={() => setCreating(true)}>
                        <Plus size={15} strokeWidth={2} />
                        New automation
                    </button>
                }
            />

            {automations.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Workflow size={22} strokeWidth={1.6} />}
                        title="No automations yet"
                        action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setCreating(true)}>Create the first one</button>}
                    >
                        Start with something you do by hand every morning. Give it a goal, choose when it runs, and allow only the tools it needs.
                    </EmptyState>
                </Card>
            ) : (
                <>
                    <div className="mb-6 grid gap-4 sm:grid-cols-3">
                        <StatTile label="Active" icon={<Power size={15} strokeWidth={1.9} />} value={totals.active}
                            hint={`of ${automations.length} ${automations.length === 1 ? 'automation' : 'automations'}; paused ones never fire`} />
                        <StatTile label="Runs, last 7 days" icon={<Activity size={15} strokeWidth={1.9} />} value={totals.recentRuns.toLocaleString()}
                            hint={`${totals.allRuns.toLocaleString()} runs since the first one`} />
                        <StatTile label="Failed, last 7 days" icon={<CircleAlert size={15} strokeWidth={1.9} />} value={totals.recentFailed.toLocaleString()}
                            tone={totals.recentFailed > 0 ? 'danger' : undefined}
                            hint={totals.recentFailed > 0 ? `across ${totals.failing} ${totals.failing === 1 ? 'automation' : 'automations'}; open one to read the error` : 'Nothing failed this week'} />
                    </div>

                    <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search automations" className="w-full sm:w-70" />}>
                        <SegmentedControl<Filter> value={filter} onChange={setFilter} options={[
                            { value: 'all', label: <Count text="All" n={automations.length} /> },
                            { value: 'active', label: <Count text="Active" n={totals.active} /> },
                            { value: 'paused', label: <Count text="Paused" n={automations.length - totals.active} /> },
                            ...(totals.failing > 0 ? [{ value: 'failing' as Filter, label: <Count text="Failing" n={totals.failing} /> }] : []),
                        ]} />
                    </Toolbar>

                    <Card>
                        {visible.length === 0 ? (
                            <EmptyState icon={<Workflow size={22} strokeWidth={1.6} />}
                                title={query ? `No automations match “${query.trim()}”` : 'Nothing in this view'}
                                action={<button type="button" className="v-btn v-btn--ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Show all automations</button>}>
                                Search looks at names, descriptions, schedules and app events.
                            </EmptyState>
                        ) : (
                            <List>
                                {visible.map((a) => <AutomationRow key={a.id} a={a} on={isOn(a)} onToggle={(v) => toggle(a, v)} />)}
                            </List>
                        )}
                    </Card>
                </>
            )}

            <Dialog open={creating} onClose={() => setCreating(false)} title="New automation"
                description="It starts with a manual trigger and balanced reasoning. You set the goal, when it runs and what it may use on the next screen.">
                <CreateForm onDone={() => setCreating(false)} />
            </Dialog>
        </>
    );
}

function Count({ text, n }: { text: string; n: number }) {
    return <>{text}<span className="text-2xs text-tertiary tabular-nums">{n}</span></>;
}

function TriggerChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap">{icon}{children}</span>;
}

/**
 * A row that navigates and also holds a switch. Not a ListRow: a switch
 * cannot live inside the anchor or button a ListRow renders, so the row
 * navigates on click and the name is the keyboard-reachable link.
 */
function AutomationRow({ a, on, onToggle }: { a: Row; on: boolean; onToggle: (v: boolean) => void }) {
    const href = `/studio/automations/${a.id}`;
    const failing = (a.recent_failed_runs_count ?? 0) > 0;

    return (
        <div
            className="flex cursor-pointer items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-hover"
            onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) return; router.visit(href); }}
        >
            <IconTile tone={on ? 'success' : 'muted'}><Workflow size={16} strokeWidth={1.9} /></IconTile>

            <div className={`min-w-0 flex-1 ${on ? '' : 'opacity-60'}`}>
                <div className="flex min-w-0 items-center gap-2">
                    <Link href={href} className="truncate text-base font-medium text-primary">{a.name}</Link>
                    {a.failed_runs_count > 0 && (
                        <span title={`${a.failed_runs_count} failed of ${a.runs_count} runs in total`}>
                            <Badge tone={failing ? 'danger' : 'muted'}>
                                {failing ? `${a.recent_failed_runs_count} failed this week` : `${a.failed_runs_count} failed`}
                            </Badge>
                        </span>
                    )}
                </div>
                {a.description && <div className="mt-0.5 truncate text-sm text-secondary">{a.description}</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tertiary">
                    {a.schedule_label && <TriggerChip icon={<Clock size={14} strokeWidth={1.8} />}>{a.schedule_label}</TriggerChip>}
                    {a.triggers.includes('webhook') && <TriggerChip icon={<Webhook size={14} strokeWidth={1.8} />}>Webhook</TriggerChip>}
                    {a.app_event && <TriggerChip icon={<Zap size={14} strokeWidth={1.8} />}>On {a.app_event}</TriggerChip>}
                    {a.triggers.includes('manual') && <TriggerChip icon={<Play size={14} strokeWidth={1.8} />}>By hand</TriggerChip>}
                    <span className="capitalize">{a.reasoning} reasoning</span>
                </div>
            </div>

            <div className="hidden w-44 shrink-0 text-right md:block">
                {on && a.next_run_at ? (
                    <>
                        <div className="text-xs text-tertiary">Next run</div>
                        <RelativeTime at={a.next_run_at} />
                    </>
                ) : a.last_run_at ? (
                    <>
                        <div className="text-xs text-tertiary">Last run</div>
                        <span className="inline-flex items-center gap-1.5">
                            {a.last_run_status && <StatusDot tone={RUN_TONE[a.last_run_status] ?? 'muted'} live={a.last_run_status === 'running'} label={a.last_run_status} />}
                            <RelativeTime at={a.last_run_at} />
                        </span>
                    </>
                ) : (
                    <span className="text-xs text-tertiary">{a.runs_count === 0 ? 'Never run' : `${a.runs_count} runs`}</span>
                )}
            </div>

            <Switch checked={on} onChange={onToggle} label={`${on ? 'Pause' : 'Turn on'} ${a.name}`} size="sm" />
            <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-tertiary" />
        </div>
    );
}

function CreateForm({ onDone }: { onDone: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', description: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/automations'); };

    return (
        <form onSubmit={submit}>
            <Field label="Name" error={errors.name}>
                <input className="v-field" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} placeholder="Morning digest" autoFocus />
            </Field>
            <Field label="What it does" error={errors.description} hint="One line, for the list. The goal you brief it with comes next.">
                <input className="v-field" value={data.description} maxLength={300} onChange={(e) => setData('description', e.target.value)} placeholder="Summarise overnight calls for the team at 8am." />
            </Field>
            <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="v-btn v-btn--ghost" onClick={onDone}>Cancel</button>
                <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim()}>{processing ? 'Creating…' : 'Create automation'}</button>
            </div>
        </form>
    );
}
