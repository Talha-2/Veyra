import { Head } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, ChevronRight, FlaskConical, Gauge, PlugZap, Users, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Callout, Card, CardHeader, Meter, SearchField, SegmentedControl, StatTile } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, RelativeTime, StatusDot, type Tone } from '../../components/ui/primitives';

interface Run {
    id: number; name: string | null; status: string; scenario: string | null; persona: string | null; language: string;
    p95_ms: number | null;
    /** The judge's output: numeric dimensions (1–5), plus `verdict` and `notes` as strings. */
    scores: Record<string, number | string> | null;
    error: string | null; started_by: string | null; created_at: string | null;
}
interface Props { runs: Run[]; personas: { key: string; description: string }[]; runner_available: boolean }

type Outcome = 'pass' | 'fail' | 'error' | 'running';
type Filter = 'all' | Outcome;

const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function languageName(code: string): string {
    try { return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code; } catch { return code; }
}

/** Numeric judge dimensions, each as a 0–1 fraction of the scale it was scored on. */
function dimensions(scores: Run['scores']): { key: string; value: number; scale: number }[] {
    if (!scores) return [];
    const entries = Object.entries(scores).filter((e): e is [string, number] => typeof e[1] === 'number');
    const max = Math.max(0, ...entries.map(([, v]) => v));
    const scale = max <= 1 ? 1 : max <= 5 ? 5 : max <= 10 ? 10 : 100;
    return entries.map(([key, value]) => ({ key, value, scale }));
}

function meanScore(run: Run): number | null {
    const dims = dimensions(run.scores);
    if (dims.length === 0) return null;
    return dims.reduce((sum, d) => sum + d.value / d.scale, 0) / dims.length;
}

/** The judge's verdict when it gave one; otherwise 80% of the scale counts as a pass. */
function outcome(run: Run): Outcome {
    if (run.status === 'error') return 'error';
    if (run.status !== 'done') return 'running';
    const verdict = run.scores?.verdict;
    if (verdict === 'pass' || verdict === 'fail') return verdict;
    const mean = meanScore(run);
    if (mean == null) return 'error';
    return mean >= 0.8 ? 'pass' : 'fail';
}

const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
    pass: { label: 'Passed', tone: 'success' },
    fail: { label: 'Failed', tone: 'danger' },
    error: { label: 'Errored', tone: 'warning' },
    running: { label: 'Running', tone: 'info' },
};

const rateTone = (rate: number): Tone => (rate >= 0.8 ? 'success' : rate >= 0.5 ? 'warning' : 'danger');
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n} ms`);

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export default function Evals({ runs, personas, runner_available }: Props) {
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState<number | null>(null);

    const scored = useMemo(() => runs.map((r) => ({ run: r, outcome: outcome(r), mean: meanScore(r) })), [runs]);
    const judged = scored.filter((s) => s.outcome === 'pass' || s.outcome === 'fail');
    const passed = judged.filter((s) => s.outcome === 'pass').length;
    const errored = scored.filter((s) => s.outcome === 'error').length;
    const latencies = runs.filter((r) => r.status === 'done' && r.p95_ms != null).map((r) => r.p95_ms as number);
    const p95 = median(latencies);
    const worst = latencies.length ? Math.max(...latencies) : null;

    const counts: Record<Filter, number> = {
        all: scored.length,
        pass: passed,
        fail: judged.length - passed,
        error: errored,
        running: scored.filter((s) => s.outcome === 'running').length,
    };

    const q = query.trim().toLowerCase();
    const visible = scored.filter((s) =>
        (filter === 'all' || s.outcome === filter) &&
        (!q || [s.run.name, s.run.scenario, s.run.persona, s.run.started_by].some((v) => v?.toLowerCase().includes(q))),
    );

    return (
        <>
            <Head title="Evaluations" />
            <PageHeader
                title="Evaluations"
                description="Simulated callers run against the same prompt, skills and knowledge as a live call. If the interrupter scores badly here, real callers were about to find out for you."
                meta={runs.length > 0 ? <Badge>Last {runs.length} {runs.length === 1 ? 'run' : 'runs'}</Badge> : undefined}
            />

            {!runner_available && (
                <div className="mb-6">
                    {/* Said plainly rather than hidden behind a disabled button. */}
                    <Callout tone="warning" icon={<PlugZap size={16} strokeWidth={2} />} title="New runs start from the agent layer, which is not connected yet">
                        Past results stay here. Once the agent layer is connected, runs it finishes appear in this list automatically.
                    </Callout>
                </div>
            )}

            {runs.length > 0 && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatTile
                        label="Pass rate"
                        icon={<CheckCircle2 size={15} strokeWidth={2} />}
                        value={judged.length ? pct(passed / judged.length) : '—'}
                        tone={judged.length ? rateTone(passed / judged.length) : undefined}
                        hint={judged.length ? `${passed} of ${judged.length} judged runs` : 'No run has been judged yet'}
                    />
                    <StatTile
                        label="p95 voice-to-voice"
                        icon={<Gauge size={15} strokeWidth={2} />}
                        value={p95 != null ? ms(p95) : '—'}
                        hint={worst != null ? `Median across ${latencies.length} runs · slowest ${ms(worst)}` : 'No latency recorded yet'}
                    />
                    <StatTile
                        label="Failed"
                        icon={<XCircle size={15} strokeWidth={2} />}
                        value={counts.fail}
                        tone={counts.fail > 0 ? 'danger' : undefined}
                        hint="Judge scored the agent below the bar"
                    />
                    <StatTile
                        label="Errored"
                        icon={<AlertTriangle size={15} strokeWidth={2} />}
                        value={errored}
                        tone={errored > 0 ? 'warning' : undefined}
                        hint="Run did not finish, so it was not scored"
                    />
                </div>
            )}

            <Card className="mb-6">
                <CardHeader icon={<Users size={16} strokeWidth={1.9} />} title="Personas" description="Each run plays one of these callers. A persona that keeps failing points at a behaviour to fix in the prompt or a skill." />
                <div className="grid sm:grid-cols-2">
                    {personas.map((p, i) => {
                        const mine = judged.filter((s) => s.run.persona === p.key);
                        const ok = mine.filter((s) => s.outcome === 'pass').length;
                        const rate = mine.length ? ok / mine.length : null;
                        return (
                            <div key={p.key} className={`flex flex-col border-separator px-5 py-4 ${i > 0 ? 'border-t' : ''} ${i === 1 ? 'sm:border-t-0' : ''} ${i % 2 ? 'sm:border-l' : ''}`}>
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-base font-medium text-primary">{humanize(p.key)}</span>
                                    <span className="text-sm font-medium tabular-nums" style={{ color: rate == null ? 'var(--text-tertiary)' : `var(--${rateTone(rate)})` }}>{rate == null ? 'Not run' : pct(rate)}</span>
                                </div>
                                <p className="mt-0.5 mb-3 flex-1 text-sm text-secondary">{p.description}</p>
                                <Meter value={rate == null ? 0 : rate * 100} tone={rate == null ? 'muted' : rateTone(rate)} label={`${humanize(p.key)} pass rate`} />
                                <span className="mt-1.5 text-xs text-tertiary tabular-nums">{mine.length ? `${ok} of ${mine.length} judged runs passed` : 'No judged runs with this persona'}</span>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {runs.length === 0 ? (
                <Card>
                    <EmptyState icon={<FlaskConical size={20} strokeWidth={1.8} />} title="No evaluation runs yet">
                        A run is one simulated call, scored by a judge on task completion, groundedness, conversation quality and safety, with its p95 latency. Results will collect here.
                    </EmptyState>
                </Card>
            ) : (
                <>
                    <div className="mb-4 flex flex-wrap items-center gap-2.5">
                        <SegmentedControl<Filter>
                            value={filter}
                            onChange={setFilter}
                            options={(['all', 'pass', 'fail', 'error', 'running'] as Filter[])
                                .filter((f) => f === 'all' || counts[f] > 0 || f === filter)
                                .map((f) => ({ value: f, label: <>{f === 'all' ? 'All' : OUTCOME[f].label}<span className="text-2xs text-tertiary tabular-nums">{counts[f]}</span></> }))}
                        />
                        <div className="flex-1" />
                        <SearchField value={query} onChange={setQuery} placeholder="Search runs" />
                    </div>

                    <Card>
                        <div className="hidden gap-4 px-5 pt-3 pb-2 text-xs font-medium text-tertiary md:grid md:grid-cols-[minmax(0,1fr)_120px_84px_150px_72px_16px]" style={{ borderBottom: '1px solid var(--separator)' }}>
                            <span>Run</span><span>Persona</span><span className="text-right">p95</span><span>Score</span><span className="text-right">When</span><span />
                        </div>
                        {visible.length === 0 && (
                            <p className="px-5 py-8 text-center text-sm text-secondary">No runs match. Clear the search or pick another filter.</p>
                        )}
                        <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                            {visible.map(({ run, outcome: o, mean }) => (
                                <RunRow key={run.id} run={run} outcome={o} mean={mean} expanded={open === run.id} onToggle={() => setOpen(open === run.id ? null : run.id)} />
                            ))}
                        </div>
                    </Card>
                </>
            )}
        </>
    );
}

function RunRow({ run, outcome: o, mean, expanded, onToggle }: { run: Run; outcome: Outcome; mean: number | null; expanded: boolean; onToggle: () => void }) {
    const dims = dimensions(run.scores);
    const notes = typeof run.scores?.notes === 'string' ? run.scores.notes : null;
    const title = run.name ?? run.scenario ?? `Run ${run.id}`;

    return (
        <div>
            <button type="button" onClick={onToggle} aria-expanded={expanded}
                className="grid w-full items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-left transition-colors hover:bg-surface-hover md:grid-cols-[minmax(0,1fr)_120px_84px_150px_72px_16px]">
                <div className="flex min-w-0 items-center gap-3">
                    <StatusDot tone={OUTCOME[o].tone} live={o === 'running'} label={OUTCOME[o].label} />
                    <div className="min-w-0">
                        <div className="truncate text-base font-medium text-primary">{title}</div>
                        <div className="truncate text-sm text-secondary">{OUTCOME[o].label} · {languageName(run.language)}{run.scenario && run.name ? ` · ${run.scenario}` : ''}</div>
                    </div>
                </div>
                <div>{run.persona ? <Badge>{humanize(run.persona)}</Badge> : <span className="text-sm text-tertiary">None</span>}</div>
                <div className="text-sm text-primary tabular-nums md:text-right">{run.p95_ms != null ? ms(run.p95_ms) : <span className="text-tertiary">—</span>}</div>
                <div className="flex items-center gap-2.5">
                    {mean != null ? (
                        <>
                            <div className="flex-1"><Meter value={mean * 100} tone={rateTone(mean)} label={`${title} score`} /></div>
                            <span className="w-9 text-right text-sm font-medium text-primary tabular-nums">{pct(mean)}</span>
                        </>
                    ) : <span className="text-sm text-tertiary">Not scored</span>}
                </div>
                <div className="md:text-right"><RelativeTime at={run.created_at} /></div>
                <ChevronRight size={15} strokeWidth={2} className="hidden text-tertiary transition-transform md:block" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
            </button>

            {expanded && (
                <div className="animate-fade-in grid gap-6 px-5 pt-1 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:pl-10">
                    <div>
                        <div className="mb-2.5 text-xs font-medium text-tertiary">Judge scores</div>
                        {dims.length === 0 && <p className="text-sm text-secondary">This run has no scores.</p>}
                        <div className="flex flex-col gap-3">
                            {dims.map((d) => (
                                <div key={d.key}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <span className="text-secondary">{humanize(d.key)}</span>
                                        <span className="font-medium text-primary tabular-nums">{d.value} <span className="text-tertiary">/ {d.scale}</span></span>
                                    </div>
                                    <Meter value={(d.value / d.scale) * 100} tone={rateTone(d.value / d.scale)} label={humanize(d.key)} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-3">
                        {run.error && <Callout tone="danger" title="The run stopped">{run.error}</Callout>}
                        {notes && (
                            <div>
                                <div className="mb-1.5 text-xs font-medium text-tertiary">Judge's notes</div>
                                <p className="text-sm text-primary">{notes}</p>
                            </div>
                        )}
                        <p className="text-xs text-tertiary">{run.started_by ? `Started by ${run.started_by}` : 'Who started it was not recorded'}{run.created_at && <> · {new Date(run.created_at).toLocaleString()}</>}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
