import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { DeskPage } from '../../components/desk-pages/layout';
import { PageHeader } from '../../components/ui/page';
import { Errors, Field, fieldClass, money } from './billing-ui';

export default function Analytics({ filters, timezone, metrics }: {
    filters: { from: string; to: string }; timezone: string;
    metrics: { appointments: number; appointment_statuses: Record<string, number>; invoiced_minor: number; collected_minor: number; outstanding_minor: number };
}) {
    const [from, setFrom] = useState(filters.from);
    const [to, setTo] = useState(filters.to);
    const [loading, setLoading] = useState(false);
    const { errors } = usePage().props;
    const period = new Date(filters.from + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' – ' + new Date(filters.to + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return <><Head title="Clinic analytics" /><DeskPage header={<PageHeader title="Clinic analytics" description={'Operational performance from real clinic records. Dates use ' + timezone + '.'} />}>
        <form aria-busy={loading} onSubmit={event => { event.preventDefault(); if (loading) return; router.get('/desk/analytics', { from, to }, { onStart: () => setLoading(true), onFinish: () => setLoading(false) }); }}>
            <fieldset disabled={loading} className="m-0 flex min-w-0 flex-wrap items-end gap-4 border-0 p-0">
                <Field label="From"><input required type="date" className={fieldClass} value={from} onChange={event => setFrom(event.target.value)} /></Field>
                <Field label="To"><input required type="date" min={from} className={fieldClass} value={to} onChange={event => setTo(event.target.value)} /></Field>
                <button className="v-btn v-btn--secondary">{loading ? 'Loading…' : 'Apply dates'}</button>
            </fieldset><div className="mt-3"><Errors errors={errors} /></div>
        </form>
        <div className="grid items-start gap-8 lg:grid-cols-2">
            <section className="min-w-0"><h2 className="text-lg font-semibold">Selected period</h2><p className="mt-2 text-sm text-secondary">{period} · {timezone}</p><dl className="mt-5 divide-y divide-border border-y border-border">
                {[
                    ['Appointments', metrics.appointments.toLocaleString(), 'Appointments starting within the selected clinic dates.'],
                    ['Issued invoices', money(metrics.invoiced_minor), 'Issued within the selected dates.'],
                    ['Payments collected', money(metrics.collected_minor), 'Payments recorded within the selected dates.'],
                ].map(([label, value, note]) => <div key={label} className="flex flex-wrap items-start justify-between gap-4 py-5"><div className="min-w-0"><dt className="font-medium">{label}</dt><p className="mt-1 text-sm text-secondary">{note}</p></div><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>)}
            </dl><div className="mt-6"><h3 className="font-semibold">Outstanding · all time</h3><p className="mt-2 text-lg font-semibold tabular-nums">{money(metrics.outstanding_minor)}</p><p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary">Balance on all issued invoices, including invoices outside the selected period.</p></div></section>
            <section className="min-w-0"><h2 className="text-lg font-semibold">Appointment outcomes</h2><p className="mt-2 text-sm text-secondary">Status of the appointments in this period.</p><div className="mt-5 divide-y divide-border border-y border-border">{Object.entries(metrics.appointment_statuses).map(([status, count]) => <div key={status} className="flex flex-wrap items-center justify-between gap-4 py-4"><span className="text-sm capitalize">{status.replaceAll('_', ' ')}</span><span className="flex items-baseline gap-4"><strong className="tabular-nums">{count.toLocaleString()}</strong><span className="w-14 text-right text-sm text-secondary tabular-nums">{metrics.appointments ? Math.round(count / metrics.appointments * 100) : 0}%</span></span></div>)}{!metrics.appointments && <p className="py-6 text-sm text-secondary">No appointments in this date range.</p>}</div>{metrics.appointments > 0 && <p className="mt-3 text-xs text-secondary">Percentages are rounded shares of {metrics.appointments.toLocaleString()} appointments.</p>}</section>
        </div>
    </DeskPage></>;
}
