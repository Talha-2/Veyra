import { useId } from 'react';
import { visitStageLabels, type VisitStage } from '../../types/clinic-worklist';

type VisitTotals = { total: number; booked: number; checked_in: number; completed: number; cancelled: number; no_show: number };
export type DashboardVisualsData = {
    trend: (VisitTotals & { date: string })[];
    provider_load: (VisitTotals & { id: number; name: string })[];
    wait: { mean_minutes: number | null; samples: number };
};
const statuses = [
    { key: 'booked', label: 'Booked', color: 'var(--text-secondary)' },
    { key: 'checked_in', label: 'Checked in', color: 'var(--info)' },
    { key: 'completed', label: 'Completed', color: 'var(--success)' },
    { key: 'cancelled', label: 'Cancelled', color: 'var(--text-tertiary)' },
    { key: 'no_show', label: 'No-show', color: 'var(--warning)' },
] as const;
const stageColors: Record<VisitStage, string> = { scheduled: 'var(--text-secondary)', waiting: 'var(--warning)', in_consultation: 'var(--info)', ready_checkout: 'var(--accent)', completed: 'var(--success)', cancelled: 'var(--text-tertiary)', no_show: 'var(--warning)' };
const clinicDay = (day: string, long = false) => new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, { timeZone: 'UTC', month: long ? 'long' : 'short', day: 'numeric', ...(long ? { year: 'numeric' } : {}) });

export function DashboardVisuals({ visuals, counts, clinicDate, timezone }: { visuals: DashboardVisualsData; counts: Record<VisitStage, number> & { total: number }; clinicDate: string; timezone: string }) {
    return <section aria-labelledby="clinic-overview-heading" className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="clinic-overview-heading" className="text-xl font-semibold">Clinic overview</h2><p className="mt-1 max-w-[75ch] text-sm leading-relaxed text-secondary">Selected provider, location and patient search · All visit stages. Clinic dates use {timezone}.</p></div><a className="v-btn v-btn--quiet" href="#visit-worklist">Go to worklist</a></header>
        <div className="flex flex-wrap gap-x-8 gap-y-4 border-y border-border py-4"><p className="text-sm text-secondary"><strong className="mr-1 text-base font-semibold text-primary tabular-nums">{counts.total.toLocaleString()}</strong>visits on {clinicDay(clinicDate)}</p><div><p className="text-sm text-secondary"><strong className="mr-1 text-base font-semibold text-primary tabular-nums">{visuals.wait.mean_minutes == null ? 'Unknown' : visuals.wait.mean_minutes.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' min'}</strong>mean arrival-to-consultation wait</p><p className="mt-1 max-w-[75ch] text-xs leading-relaxed text-secondary">{visuals.wait.samples.toLocaleString()} recorded arrival and consultation-start {visuals.wait.samples === 1 ? 'pair' : 'pairs'}.{visuals.wait.mean_minutes == null && ' No measured wait available.'}</p></div></div>
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"><VisitTrend days={visuals.trend} /><section aria-labelledby="visit-stage-heading" className="min-w-0"><h3 id="visit-stage-heading" className="text-base font-semibold">Visit stages on {clinicDay(clinicDate)}</h3><p className="mt-1 text-sm text-secondary">Where the selected day’s visits stand.</p><dl className="mt-5 space-y-3">{Object.entries(visitStageLabels).map(([key, label]) => { const stage = key as VisitStage; return <div key={stage}><div className="flex items-center justify-between gap-4 text-sm"><dt>{label}</dt><dd className="font-medium tabular-nums">{counts[stage].toLocaleString()}</dd></div><div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-surface-sunken"><div className="h-full rounded-sm" style={{ width: `${counts.total ? counts[stage] / counts.total * 100 : 0}%`, background: stageColors[stage] }} /></div></div>; })}</dl></section></div>
        <ProviderVisits providers={visuals.provider_load} clinicDate={clinicDate} />
    </section>;
}

function VisitTrend({ days }: { days: DashboardVisualsData['trend'] }) {
    const titleId = useId();
    const descriptionId = useId();
    const maximum = Math.max(1, ...days.map(day => day.total));
    const top = 28, bottom = 190, left = 40, slot = 76, barWidth = 36;
    const scale = (bottom - top) / maximum;
    const chartWidth = left + Math.max(days.length, 1) * slot + 16;
    const sum = days.reduce((total, day) => total + day.total, 0);
    return <section aria-labelledby={titleId} className="min-w-0"><div className="flex flex-wrap items-baseline justify-between gap-3"><h3 id={titleId} className="text-base font-semibold">Seven clinic days</h3><span className="text-sm text-secondary">{sum.toLocaleString()} visits</span></div><p className="mt-1 text-sm text-secondary">Recorded visits by date and current appointment status.</p>
        {days.length ? <div className="mt-4 overflow-x-auto"><svg role="img" aria-labelledby={`${titleId} ${descriptionId}`} viewBox={`0 0 ${chartWidth} 238`} className="block w-full" style={{ minWidth: chartWidth, maxHeight: 260 }}><desc id={descriptionId}>Visit counts for seven clinic days. Each stacked bar shows booked, checked-in, completed, cancelled and no-show appointments. Exact counts are in the table below.</desc>
            {[0, maximum].map(tick => <g key={tick}><line x1={left} x2={chartWidth - 8} y1={bottom - tick * scale} y2={bottom - tick * scale} stroke="var(--separator)" /><text x={left - 8} y={bottom - tick * scale + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={12}>{tick}</text></g>)}
            {days.map((day, index) => { let used = 0; const x = left + index * slot + (slot - barWidth) / 2; return <g key={day.date}><title>{clinicDay(day.date, true)}: {day.total} visits; {statuses.map(status => `${status.label}: ${day[status.key]}`).join('; ')}</title>{statuses.map(status => { const height = day[status.key] * scale; const y = bottom - (used + day[status.key]) * scale; used += day[status.key]; return <rect key={status.key} x={x} y={y} width={barWidth} height={height} fill={status.color} />; })}<text x={x + barWidth / 2} y={bottom - day.total * scale - 8} textAnchor="middle" fill="var(--text-primary)" fontSize={13} fontWeight={600}>{day.total}</text><text x={x + barWidth / 2} y={bottom + 24} textAnchor="middle" fill="var(--text-secondary)" fontSize={12}>{clinicDay(day.date)}</text></g>; })}
        </svg></div> : <p className="mt-5 text-sm text-secondary">No clinic-day trend available.</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2" aria-label="Appointment status legend">{statuses.map(status => <span key={status.key} className="flex items-center gap-1.5 text-xs text-secondary"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: status.color }} />{status.label}</span>)}</div>
        <details className="mt-4"><summary className="w-fit cursor-pointer py-1 text-sm font-medium hover:text-accent-text">View daily counts</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Daily appointment counts for the selected seven clinic days</caption><thead><tr><th scope="col" className="py-2 pr-4">Clinic date</th>{statuses.map(status => <th key={status.key} scope="col" className="px-2 py-2 text-right">{status.label}</th>)}<th scope="col" className="py-2 pl-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-border">{days.map(day => <tr key={day.date}><th scope="row" className="py-2 pr-4 font-normal whitespace-nowrap">{clinicDay(day.date, true)}</th>{statuses.map(status => <td key={status.key} className="px-2 py-2 text-right tabular-nums">{day[status.key]}</td>)}<td className="py-2 pl-2 text-right font-medium tabular-nums">{day.total}</td></tr>)}</tbody></table></div></details>
    </section>;
}

function ProviderVisits({ providers, clinicDate }: { providers: DashboardVisualsData['provider_load']; clinicDate: string }) {
    const maximum = Math.max(1, ...providers.map(provider => provider.total));
    return <section aria-labelledby="provider-visits-heading" className="border-t border-border pt-6"><div className="flex flex-wrap items-baseline justify-between gap-3"><h3 id="provider-visits-heading" className="text-base font-semibold">Provider visits on {clinicDay(clinicDate)}</h3><p className="text-sm text-secondary">Visit counts, across all statuses</p></div><p className="mt-1 max-w-[75ch] text-xs leading-relaxed text-secondary">Bar lengths compare recorded visits for the selected day. They do not represent availability or capacity.</p>
        {providers.length ? <ul className="mt-5 grid items-start gap-x-8 gap-y-4 lg:grid-cols-2">{providers.map(provider => <li key={provider.id}><div className="flex items-baseline justify-between gap-4 text-sm"><span className="min-w-0 break-words font-medium">{provider.name}</span><span className="shrink-0 tabular-nums">{provider.total.toLocaleString()} visits</span></div><div aria-hidden="true" className="mt-2 h-3 overflow-hidden rounded-sm bg-surface-sunken"><div className="flex h-full" style={{ width: `${provider.total / maximum * 100}%` }}>{statuses.map(status => <span key={status.key} style={{ width: `${provider.total ? provider[status.key] / provider.total * 100 : 0}%`, background: status.color }} />)}</div></div><p className="mt-2 text-xs leading-relaxed text-secondary">{statuses.map(status => `${provider[status.key]} ${status.label.toLowerCase()}`).join(' · ')}</p></li>)}</ul> : <p className="mt-4 text-sm text-secondary">No provider visits match the selected day and filters.</p>}
    </section>;
}
