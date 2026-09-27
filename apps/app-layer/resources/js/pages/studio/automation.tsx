import { Head, Link, router, useForm } from '@inertiajs/react';
import { ChevronDown, Clock, Eye, EyeOff, History, LocateFixed, Play, Trash2, Webhook, Zap } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { ChoiceCard } from '../../components/studio-capability/choice-card';
import { Field, SaveBar, Section, Toggle } from '../../components/studio/form';
import { Callout, Card, CardHeader, CopyButton, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Mono, RelativeTime, StatusDot, type Tone } from '../../components/ui/primitives';

interface Run { id: number; trigger: string; status: string; result: string | null; error: string | null; tokens: number; duration_ms: number | null; steps: { type: string; name?: string; args?: unknown; summary?: string }[]; started_at: string | null }
interface Props {
    automation: {
        id: number; name: string; description: string | null; system_prompt: string | null; goal: string | null; triggers: string[];
        schedule: { kind: string; at: string; weekday: string; interval_minutes: number; tz: string };
        app_trigger: { event?: string } | null; reasoning: string; allowed_action_ids: number[]; can_search_knowledge: boolean; enabled: boolean;
        webhook_url: string | null; webhook_secret: string | null; next_run_at: string | null; runs: Run[];
    };
    actions: { id: number; name: string; kind: string; durable: boolean }[];
    events: string[];
    triggers: string[];
}

const TRIGGER_META: Record<string, { icon: ReactNode; title: string; description: string; short: string }> = {
    manual: { icon: <Play size={16} strokeWidth={1.9} />, title: 'By hand', short: 'By hand', description: 'Someone presses Run now on this page.' },
    schedule: { icon: <Clock size={16} strokeWidth={1.9} />, title: 'On a schedule', short: 'Schedule', description: 'Every hour, day or week, or every few minutes.' },
    webhook: { icon: <Webhook size={16} strokeWidth={1.9} />, title: 'From a webhook', short: 'Webhook', description: 'Another system posts to a signed URL; the body becomes the input.' },
    app_event: { icon: <Zap size={16} strokeWidth={1.9} />, title: 'On an app event', short: 'App event', description: 'Each time something happens in Veyra, like a new ticket.' },
};
const triggerMeta = (t: string) => TRIGGER_META[t] ?? { icon: <Zap size={16} strokeWidth={1.9} />, title: t.replace(/_/g, ' '), short: t.replace(/_/g, ' '), description: '' };

const REASONING: { value: string; label: string; hint: string }[] = [
    { value: 'fast', label: 'Fast', hint: 'Quickest and cheapest. For jobs that mostly copy data from one place to another.' },
    { value: 'balanced', label: 'Balanced', hint: 'The default. Right for summaries, follow-ups and most reports.' },
    { value: 'deep', label: 'Deep', hint: 'Slower and costs more per run. For jobs that weigh several sources before acting.' },
];

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const RUN_STATUS: Record<string, { tone: Tone; label: string }> = {
    done: { tone: 'success', label: 'Done' },
    error: { tone: 'danger', label: 'Failed' },
    running: { tone: 'info', label: 'Running' },
    queued: { tone: 'muted', label: 'Queued' },
};
const runStatus = (s: string) => RUN_STATUS[s] ?? { tone: 'muted' as Tone, label: cap(s) };

function duration(ms: number | null): string | null {
    if (ms == null) return null;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function scheduleSummary(s: Props['automation']['schedule']): string {
    const tz = s.tz || 'UTC';
    switch (s.kind) {
        case 'hourly': return `Runs at the top of every hour (${tz}).`;
        case 'daily': return `Runs every day at ${s.at || '—'}, ${tz} time.`;
        case 'weekly': return `Runs every ${cap(s.weekday || 'monday')} at ${s.at || '—'}, ${tz} time.`;
        case 'interval': return `Runs every ${s.interval_minutes || '—'} minutes.`;
        default: return '';
    }
}

export default function AutomationDetail({ automation: a, actions, events, triggers }: Props) {
    const { data, setData, patch, processing, errors, isDirty, reset } = useForm({
        name: a.name, description: a.description ?? '', system_prompt: a.system_prompt ?? '', goal: a.goal ?? '',
        triggers: a.triggers, schedule: a.schedule, app_trigger: a.app_trigger ?? { event: '' },
        reasoning: a.reasoning, allowed_action_ids: a.allowed_action_ids, can_search_knowledge: a.can_search_knowledge, enabled: a.enabled,
    });
    const fieldErrors = errors as Record<string, string | undefined>;
    const [starting, setStarting] = useState(false);

    const submit = (e: FormEvent) => { e.preventDefault(); patch(`/studio/automations/${a.id}`, { preserveScroll: true }); };
    const has = (t: string) => data.triggers.includes(t);
    const toggleTrigger = (t: string) => setData('triggers', has(t) ? data.triggers.filter((x) => x !== t) : [...data.triggers, t]);
    const setSchedule = (patchSchedule: Partial<Props['automation']['schedule']>) => setData('schedule', { ...data.schedule, ...patchSchedule });
    const allowed = (id: number) => data.allowed_action_ids.includes(id);
    const toggleAction = (id: number) => setData('allowed_action_ids', allowed(id) ? data.allowed_action_ids.filter((x) => x !== id) : [...data.allowed_action_ids, id]);

    const runNow = () => {
        setStarting(true);
        router.post(`/studio/automations/${a.id}/run`, {}, { preserveScroll: true, onFinish: () => setStarting(false) });
    };

    const destroy = () => {
        if (!confirm(`Delete “${a.name}”? Its schedule and webhook stop working and its run history is deleted with it.`)) return;
        router.delete(`/studio/automations/${a.id}`);
    };

    const reasoning = REASONING.find((r) => r.value === data.reasoning);
    const writers = actions.filter((act) => act.durable && allowed(act.id));
    const configured = triggers.filter((t) => has(t) && t !== 'manual');

    return (
        <form onSubmit={submit}>
            <Head title={a.name} />

            <PageHeader
                back={{ href: '/studio/automations', label: 'Automations' }}
                title={a.name}
                description={a.description || undefined}
                meta={
                    <>
                        <Badge tone={a.enabled ? 'success' : 'muted'} dot>{a.enabled ? 'Enabled' : 'Paused'}</Badge>
                        {a.triggers.map((t) => <Badge key={t}>{triggerMeta(t).short}</Badge>)}
                        {a.enabled && a.next_run_at && <Mono>Next run {new Date(a.next_run_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Mono>}
                    </>
                }
                actions={
                    // The title sits on a wrapper: a disabled button gets no hover, so it could not explain itself.
                    <span title={has('manual') ? (isDirty ? 'Runs the saved version, not your unsaved edits.' : 'Start a run now with the saved goal.') : 'Turn on the “By hand” trigger to run it from here.'}>
                        <button type="button" className="v-btn v-btn--primary" onClick={runNow} disabled={!has('manual') || starting}>
                            <Play size={14} strokeWidth={2} />
                            {starting ? 'Starting…' : 'Run now'}
                        </button>
                    </span>
                }
            />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0">
                    <Section title="What it does" description="Brief it the way you would brief a new colleague: the task, who it is for, and what good looks like.">
                        <Field label="Name" error={errors.name}>
                            <input className="v-field max-w-90" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} />
                        </Field>
                        <Field label="Description" error={errors.description} hint="One line, shown in the list.">
                            <input className="v-field" value={data.description} maxLength={300} onChange={(e) => setData('description', e.target.value)} />
                        </Field>
                        <Field label="Goal" error={errors.goal} hint="The task itself. Every scheduled, webhook and manual run starts from this.">
                            <textarea className="v-field h-auto leading-relaxed" rows={4} maxLength={5000} value={data.goal} onChange={(e) => setData('goal', e.target.value)} dir="auto"
                                placeholder="Summarise yesterday’s missed calls and open tickets for the front desk, most urgent first." />
                        </Field>
                        <Field label="Standing instructions" error={errors.system_prompt} hint="Tone, audience, what to lead with. Applies to every run.">
                            <textarea className="v-field h-auto leading-relaxed" rows={5} maxLength={20000} value={data.system_prompt} onChange={(e) => setData('system_prompt', e.target.value)} dir="auto"
                                placeholder="Write for the owner. Plain sentences, no headings. Lead with anything that needs a reply today." />
                        </Field>
                        <Field label="Reasoning" error={errors.reasoning} hint={reasoning?.hint}>
                            <SegmentedControl value={data.reasoning} onChange={(v) => setData('reasoning', v)} options={REASONING.map((r) => ({ value: r.value, label: r.label }))} />
                        </Field>
                    </Section>

                    <Section title="Triggers" description="What starts a run. Any combination; it needs at least one.">
                        <div className="grid gap-2 sm:grid-cols-2">
                            {triggers.map((t) => {
                                const m = triggerMeta(t);
                                return (
                                    <ChoiceCard key={t} multiple selected={has(t)} onSelect={() => toggleTrigger(t)} icon={m.icon} title={m.title}
                                        description={t === 'schedule' && has(t) ? scheduleSummary(data.schedule) : m.description} />
                                );
                            })}
                        </div>
                        {errors.triggers && <p className="mt-2 text-sm text-danger">{errors.triggers}</p>}

                        {configured.length > 0 && (
                            <div className="mt-4 flex flex-col gap-3">
                                {configured.map((t) => (
                                    <TriggerConfig key={t} icon={triggerMeta(t).icon} title={triggerMeta(t).title}>
                                        {t === 'schedule' && (
                                            <>
                                                <div className="mb-4">
                                                    <span className="v-label">Repeats</span>
                                                    <SegmentedControl value={data.schedule.kind} onChange={(v) => setSchedule({ kind: v })} options={[
                                                        { value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' },
                                                        { value: 'weekly', label: 'Weekly' }, { value: 'interval', label: 'Every N minutes' },
                                                    ]} />
                                                    {fieldErrors['schedule.kind'] && <p className="mt-1.5 text-sm text-danger">{fieldErrors['schedule.kind']}</p>}
                                                </div>
                                                <div className="grid gap-4 sm:grid-cols-3">
                                                    {data.schedule.kind === 'weekly' && (
                                                        <Field label="On" error={fieldErrors['schedule.weekday']}>
                                                            <select className="v-field" value={data.schedule.weekday} onChange={(e) => setSchedule({ weekday: e.target.value })}>
                                                                {WEEKDAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                                                            </select>
                                                        </Field>
                                                    )}
                                                    {(data.schedule.kind === 'daily' || data.schedule.kind === 'weekly') && (
                                                        <Field label="At" error={fieldErrors['schedule.at']}>
                                                            <input type="time" className="v-field" value={data.schedule.at} onChange={(e) => setSchedule({ at: e.target.value })} />
                                                        </Field>
                                                    )}
                                                    {data.schedule.kind === 'interval' && (
                                                        <Field label="Every" error={fieldErrors['schedule.interval_minutes']} hint="5 to 1,440 minutes.">
                                                            <div className="relative">
                                                                <input type="number" min={5} max={1440} className="v-field pr-12" value={data.schedule.interval_minutes} onChange={(e) => setSchedule({ interval_minutes: Number(e.target.value) })} />
                                                                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-tertiary">min</span>
                                                            </div>
                                                        </Field>
                                                    )}
                                                    <Field label="Timezone" error={fieldErrors['schedule.tz']}>
                                                        <input className="v-field" value={data.schedule.tz} onChange={(e) => setSchedule({ tz: e.target.value })} placeholder="Europe/London" spellCheck={false} />
                                                    </Field>
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm text-secondary">{scheduleSummary(data.schedule)}{!data.enabled && ' Nothing fires while the automation is paused.'}</p>
                                                    <LocalTimezone current={data.schedule.tz} onUse={(tz) => setSchedule({ tz })} />
                                                </div>
                                            </>
                                        )}

                                        {t === 'app_event' && (
                                            <Field label="When this happens" error={fieldErrors['app_trigger.event']} hint="Runs once for each event while the automation is enabled.">
                                                <select className="v-field max-w-80" value={data.app_trigger?.event ?? ''} onChange={(e) => setData('app_trigger', { event: e.target.value })}>
                                                    <option value="">Choose an event</option>
                                                    {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                                                </select>
                                            </Field>
                                        )}

                                        {t === 'webhook' && <WebhookConfig url={a.webhook_url} secret={a.webhook_secret} />}
                                    </TriggerConfig>
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section
                        title="What it may use"
                        description="Only these actions are offered to a run. A digest that can only read cannot accidentally send."
                        aside={actions.length > 0 ? <Mono>{data.allowed_action_ids.length} of {actions.length} allowed</Mono> : undefined}
                        flush
                    >
                        {actions.length === 0 ? (
                            <p className="px-6 pb-5 text-sm text-secondary">
                                No actions are turned on yet. Enable the ones you trust in <Link href="/studio/integrations" className="text-accent-text hover:underline">Integrations</Link>, then allow them here.
                            </p>
                        ) : (
                            <div className="mx-6 overflow-hidden rounded-md" style={{ border: '1px solid var(--border)' }}>
                                {actions.map((act, i) => (
                                    <label key={act.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                                        style={{ borderTop: i === 0 ? undefined : '1px solid var(--separator)', background: allowed(act.id) ? 'var(--bg-subtle)' : undefined }}>
                                        <input type="checkbox" checked={allowed(act.id)} onChange={() => toggleAction(act.id)} />
                                        <span className="min-w-0 flex-1 truncate text-base text-primary">{act.name}</span>
                                        <Mono className="hidden sm:inline">{act.kind}</Mono>
                                        {act.durable ? <Badge tone="warning">Writes</Badge> : <Badge>Reads</Badge>}
                                    </label>
                                ))}
                            </div>
                        )}
                        {writers.length > 0 && (
                            <div className="mx-6 mt-3">
                                <Callout tone="warning" title="This automation can change things">
                                    {writers.map((w) => w.name).join(', ')} {writers.length === 1 ? 'writes' : 'write'} to your systems. Runs act on their own; nobody reviews them first.
                                </Callout>
                            </div>
                        )}
                        <div className="px-6 pt-4 pb-6">
                            <Toggle checked={data.can_search_knowledge} onChange={(v) => setData('can_search_knowledge', v)} label="May search the knowledge base"
                                hint="Lets a run look things up in your documents and saved answers." />
                        </div>
                    </Section>

                    <Section title="Status">
                        <Toggle checked={data.enabled} onChange={(v) => setData('enabled', v)} label="Enabled"
                            hint={a.next_run_at ? `Next run ${new Date(a.next_run_at).toLocaleString()}. Pausing clears it.` : 'Scheduled, webhook and event triggers only fire while enabled.'} />
                        <div className="mt-4 flex items-start justify-between gap-6 border-t pt-4" style={{ borderColor: 'var(--separator)' }}>
                            <div>
                                <div className="text-base font-medium text-primary">Delete automation</div>
                                <div className="mt-0.5 text-sm text-secondary">Stops every trigger and deletes its run history. This cannot be undone.</div>
                            </div>
                            <button type="button" className="v-btn v-btn--danger v-btn--sm" onClick={destroy}>
                                <Trash2 size={14} strokeWidth={1.9} />
                                Delete
                            </button>
                        </div>
                    </Section>
                </div>

                <aside className="lg:sticky lg:top-6">
                    <RunHistory runs={a.runs} />
                </aside>
            </div>

            <SaveBar processing={processing} dirty={isDirty} onDiscard={reset} />
        </form>
    );
}

function TriggerConfig({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <div className="animate-rise rounded-md px-4 pt-3.5 pb-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="text-tertiary">{icon}</span>
                {title}
            </div>
            {children}
        </div>
    );
}

function LocalTimezone({ current, onUse }: { current: string; onUse: (tz: string) => void }) {
    let local = '';
    try { local = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* no Intl zone data */ }
    if (!local || local === current) return null;

    return (
        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => onUse(local)}>
            <LocateFixed size={14} strokeWidth={1.9} />
            Use {local}
        </button>
    );
}

function WebhookConfig({ url, secret }: { url: string | null; secret: string | null }) {
    const [reveal, setReveal] = useState(false);

    if (!url) {
        return <Callout tone="info">Save to generate the URL and its signing secret.</Callout>;
    }

    return (
        <div className="flex flex-col gap-4">
            <div>
                <span className="v-label">POST to</span>
                <div className="flex items-center gap-2">
                    <code className="block min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs text-primary" style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }} title={url}>{url}</code>
                    <CopyButton value={url} />
                </div>
            </div>
            {secret && (
                <div>
                    <span className="v-label">Signing secret</span>
                    <div className="flex items-center gap-2">
                        <code className="block min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs text-primary" style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}>
                            {reveal ? secret : `${secret.slice(0, 6)}${'•'.repeat(18)}`}
                        </code>
                        <button type="button" className="v-btn v-btn--ghost v-btn--icon" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Hide secret' : 'Show secret'}>
                            {reveal ? <EyeOff size={15} strokeWidth={1.9} /> : <Eye size={15} strokeWidth={1.9} />}
                        </button>
                        <CopyButton value={secret} />
                    </div>
                </div>
            )}
            <p className="text-sm text-secondary">
                Sign the raw body with HMAC-SHA256 using the secret and send it as <code>X-Veyra-Signature</code>. The body is passed to the run as its input.
            </p>
        </div>
    );
}

function RunHistory({ runs }: { runs: Run[] }) {
    const done = runs.filter((r) => r.status === 'done').length;
    const failed = runs.filter((r) => r.status === 'error').length;

    return (
        <Card className="flex flex-col overflow-hidden lg:max-h-[calc(100vh-3rem)]">
            <CardHeader
                title="Run history"
                description={runs.length === 0 ? 'Every run shows here with what it did.' : `The last ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}: ${done} done${failed ? `, ${failed} failed` : ''}.`}
            />
            {runs.length === 0 ? (
                <EmptyState icon={<History size={20} strokeWidth={1.6} />} title="No runs yet">
                    Press Run now to try it, or wait for its first trigger.
                </EmptyState>
            ) : (
                <ol className="min-h-0 flex-1 overflow-y-auto py-2">
                    {runs.map((r, i) => <RunRow key={r.id} run={r} last={i === runs.length - 1} />)}
                </ol>
            )}
        </Card>
    );
}

function stepLabel(s: Run['steps'][number]): string {
    switch (s.type) {
        case 'tool_call': return s.name ? `Called ${s.name}` : 'Called a tool';
        case 'tool_result': return s.name ? `${s.name} returned` : 'Tool returned';
        case 'thought': return 'Thought';
        case 'final': return 'Answered';
        default: return s.name ? `${s.type}: ${s.name}` : s.type;
    }
}

function RunRow({ run, last }: { run: Run; last: boolean }) {
    const [open, setOpen] = useState(false);
    const status = runStatus(run.status);
    const took = duration(run.duration_ms);
    const hasDetail = !!(run.error || run.result || run.steps.length);

    return (
        <li className="relative px-3">
            {/* the timeline rail */}
            {!last && <span className="absolute top-7 bottom-0 left-7 w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={!hasDetail}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors enabled:hover:bg-surface-hover">
                <span className="relative mt-1.5 flex size-4 shrink-0 items-center justify-center">
                    <StatusDot tone={status.tone} live={run.status === 'running'} label={status.label} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: run.status === 'error' ? 'var(--danger)' : 'var(--text-primary)' }}>{status.label}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-tertiary">
                            <span className="[&>svg]:size-3.5">{triggerMeta(run.trigger).icon}</span>
                            {triggerMeta(run.trigger).short}
                        </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-tertiary">
                        <RelativeTime at={run.started_at} />
                        {!run.started_at && <span>Not started</span>}
                        {took && <><span aria-hidden="true">·</span><span className="tabular-nums">{took}</span></>}
                    </span>
                </span>
                {hasDetail && <ChevronDown size={14} strokeWidth={2} className="mt-1 shrink-0 text-tertiary transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />}
            </button>

            {open && (
                <div className="animate-fade-in mb-2 ml-9 mr-2 flex flex-col gap-2.5 text-sm">
                    {run.error && (
                        <p className="rounded-md px-3 py-2 whitespace-pre-wrap text-danger" style={{ background: 'var(--danger-subtle)' }}>{run.error}</p>
                    )}
                    {run.result && (
                        <p className="rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap text-secondary" style={{ background: 'var(--surface-sunken)' }} dir="auto">{run.result}</p>
                    )}
                    {run.steps.length > 0 && (
                        <ol className="flex flex-col gap-1.5">
                            {run.steps.map((s, i) => (
                                <li key={i} className="flex gap-2 text-xs">
                                    <span className="w-4 shrink-0 text-right text-tertiary tabular-nums">{i + 1}</span>
                                    <span className="min-w-0">
                                        <span className="font-medium text-primary">{stepLabel(s)}</span>
                                        {s.summary && <span className="text-secondary"> · {s.summary}</span>}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                    <Mono>{run.tokens.toLocaleString()} tokens</Mono>
                </div>
            )}
        </li>
    );
}
