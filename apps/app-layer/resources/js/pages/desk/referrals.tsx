import { Head, Link, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { DeskPage } from '../../components/desk-pages/layout';
import { PageHeader } from '../../components/ui/page';
import { Badge } from '../../components/ui/primitives';
import Sidebar from '../../components/ui/sidebar';
import { ContextFields, Field, Errors, Pagination, RecordPatient, type AncillaryContext, type PageRecords } from './diagnostics-components';
import { canCoordinate, CoordinationBadge, CoordinationSidebar, EditReferralSidebar, ReferralActions, ReferralFields, ReferralTransitionSidebar, referralTime, type ReferralRecord } from './referral-components';

type Filters = { status: string; coordination: string; search: string; mine: string };
type Props = AncillaryContext & { records: PageRecords<ReferralRecord>; filters: Filters; counts: { pending: number; scheduled: number; completed: number; declined: number }; timezone: string; clinic_date: string };
type Selected = { record: ReferralRecord; mode: 'edit' | 'issue' | 'revoke' | 'coordinate' };
const queueLabels = { pending: 'Needs update', scheduled: 'Scheduled', completed: 'Completed', declined: 'Declined' };
export default function Referrals(props: Props) {
    const [creating, setCreating] = useState(false);
    const [selected, setSelected] = useState<Selected | null>(null);
    const [filters, setFilters] = useState(props.filters);
    const [patientSearch, setPatientSearch] = useState(props.q);
    useEffect(() => { setFilters(props.filters); setPatientSearch(props.q); }, [props.filters, props.q]);
    const form = useForm({ patient_id: String(props.patient?.id || ''), clinical_encounter_id: '', recipient: '', reason: '', letter: '' });
    const query = (patch: Partial<Filters> = {}, patientId = String(props.patient?.id || '')) => ({ ...filters, ...patch, patient_id: patientId, q: patientSearch });
    const queueHref = (coordination: string) => '/desk/referrals?' + new URLSearchParams(query({ status: 'issued', coordination })).toString();
    const closeCreate = () => { if (!form.processing) setCreating(false); };
    return <>
        <Head title="Referrals" />
        <DeskPage width="wide" header={<PageHeader title="Referrals" description="Prepare letters, track specialist follow-through and preserve the original clinical record." actions={<button type="button" className="v-btn v-btn--primary" onClick={() => { form.clearErrors(); form.setData('patient_id', String(props.patient?.id || '')); setCreating(true); }}><Plus size={16} />New referral</button>} back={props.patient ? { href: '/desk/patients/' + props.patient.id + '/chart', label: props.patient.name + ' · Chart' } : undefined} />}>
            <nav aria-label="Clinical modules" className="flex flex-wrap gap-2">{[['/desk/labs', 'Labs'], ['/desk/images', 'Imaging'], ['/desk/documents', 'Documents'], ['/desk/referrals', 'Referrals']].map(([href, label]) => <Link key={href} href={href + (props.patient ? '?patient_id=' + props.patient.id : '')} className={'v-btn ' + (href === '/desk/referrals' ? 'v-btn--primary' : 'v-btn--ghost')} aria-current={href === '/desk/referrals' ? 'page' : undefined}>{label}</Link>)}</nav>
            <section className="space-y-6" aria-label="Referral worklist">
                <nav aria-label="Issued referral tracking queues" className="flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-medium text-secondary">Issued referrals</span>{(['pending', 'scheduled', 'completed', 'declined'] as const).map(status => <Link key={status} href={queueHref(status)} className={'v-btn ' + (filters.status === 'issued' && filters.coordination === status ? 'v-btn--quiet' : 'v-btn--ghost')} aria-current={filters.status === 'issued' && filters.coordination === status ? 'page' : undefined}>{queueLabels[status]}<span className="font-semibold tabular-nums">{props.counts[status]}</span></Link>)}</nav>
                <form className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={event => { event.preventDefault(); router.get('/desk/referrals', query(), { preserveState: true, preserveScroll: true }); }}>
                    <Field label="Search referrals"><input className="v-field w-full" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Recipient, reason, patient or MRN" maxLength={200} /></Field>
                    <Field label="Letter status"><select className="v-field w-full" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value, coordination: event.target.value === 'issued' ? filters.coordination : '' })}><option value="">All states</option>{['draft', 'issued', 'revoked'].map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
                    <Field label="Coordination"><select className="v-field w-full" value={filters.coordination} onChange={event => setFilters({ ...filters, coordination: event.target.value, status: event.target.value ? 'issued' : filters.status })}><option value="">All progress</option>{(['pending', 'scheduled', 'completed', 'declined'] as const).map(status => <option key={status} value={status}>{status === 'pending' ? 'No outcome recorded' : queueLabels[status]}</option>)}</select></Field>
                    <Field label="Referral owner"><select className="v-field w-full" value={filters.mine} onChange={event => setFilters({ ...filters, mine: event.target.value })}><option value="">All visible referrals</option><option value="1">My referrals</option></select></Field>
                    <Field label="Find patient choices"><input className="v-field w-full" value={patientSearch} onChange={event => setPatientSearch(event.target.value)} placeholder="Name or MRN" maxLength={100} /></Field>
                    <Field label="Patient context"><select className="v-field w-full" value={props.patient?.id || ''} onChange={event => router.get('/desk/referrals', query({}, event.target.value), { preserveState: true, preserveScroll: true })}><option value="">All patients</option>{props.patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name} · {patient.mrn}</option>)}</select></Field>
                    <p className="text-xs leading-relaxed text-secondary">Up to 100 patient choices. Apply the patient search to find others. Counts cover issued referrals matching the patient, search and owner filters.</p>
                    <div className="flex flex-wrap gap-2"><button className="v-btn v-btn--quiet">Apply filters</button><Link className="v-btn v-btn--ghost" href={'/desk/referrals' + (props.patient ? '?patient_id=' + props.patient.id : '')}>Reset</Link></div>
                </form>
                <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">{props.patient ? props.patient.name + ' · Referrals' : 'Referral worklist'}</h2><p className="text-sm text-secondary">{props.records.total} referrals</p></div>
                {props.records.data.length === 0 ? <div className="border-y border-border py-6"><h3 className="font-semibold">No referrals in this view</h3><p className="mt-1 text-sm text-secondary">Prepare a letter or change the patient, letter status and coordination filters.</p></div> : <ul className="divide-y divide-border border-y border-border">{props.records.data.map(record => <li key={record.id} className="py-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"><div className="min-w-0 flex-1 basis-64"><h3 className="break-words text-base font-semibold"><Link className="hover:text-accent-text hover:underline" href={'/desk/referrals/' + record.id}>To {record.recipient}</Link></h3><div className="mt-1"><RecordPatient record={record} /></div><p className="mt-2 line-clamp-2 max-w-[75ch] break-words text-sm leading-relaxed text-secondary">{record.reason}</p></div><div className="flex flex-wrap gap-2"><Badge tone={record.status === 'issued' ? 'success' : 'muted'}>{record.status}</Badge>{record.status === 'issued' && <CoordinationBadge status={record.coordination_status} />}</div></div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"><p className="text-xs text-secondary">{record.issued_at ? 'Issued ' + referralTime(record.issued_at, props.timezone) : 'Draft created ' + referralTime(record.created_at, props.timezone)}{record.scheduled_on && record.status === 'issued' && ' · Scheduled ' + record.scheduled_on}{record.revoked_at && ' · Revoked ' + referralTime(record.revoked_at, props.timezone)}</p><div className="flex flex-wrap gap-2"><Link className="v-btn v-btn--ghost v-btn--sm" href={'/desk/referrals/' + record.id}>Open referral</Link>{record.can_edit && <>
                        {record.status === 'draft' && <><button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={() => setSelected({ record, mode: 'edit' })}>Edit draft</button><button type="button" className="v-btn v-btn--primary v-btn--sm" onClick={() => setSelected({ record, mode: 'issue' })}>Issue referral</button></>}
                        {canCoordinate(record) && <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={() => setSelected({ record, mode: 'coordinate' })}>Record progress</button>}
                        {record.status === 'issued' && <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setSelected({ record, mode: 'revoke' })}>Revoke referral</button>}
                    </>}</div></div>
                </li>)}</ul>}
                <Pagination records={props.records} /><p className="max-w-[75ch] text-xs leading-relaxed text-secondary">Issuing preserves the letter in this clinic. Share it through your existing process. Coordination records your clinic’s progress notes; it does not book an appointment or contact the recipient.</p>
            </section>
            <Sidebar open={creating} onClose={closeCreate} title="New referral" description={'Documenting as ' + props.provider_name} width={760}>
                <form aria-busy={form.processing} onSubmit={event => { event.preventDefault(); if (form.processing) return; form.post('/desk/referrals', { onSuccess: () => { setCreating(false); form.reset('recipient', 'reason', 'letter', 'clinical_encounter_id'); } }); }}><fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                    <ContextFields context={props} patientId={form.data.patient_id} encounterId={form.data.clinical_encounter_id} onPatient={value => form.setData('patient_id', value)} onEncounter={value => form.setData('clinical_encounter_id', value)} /><ReferralFields data={form.data} onChange={(field, value) => form.setData(field, value)} /><Errors errors={form.errors} /><ReferralActions busy={form.processing} label="Save draft" onClose={closeCreate} />
                </fieldset></form>
            </Sidebar>
            {selected?.mode === 'edit' && <EditReferralSidebar record={selected.record} onClose={() => setSelected(null)} />}
            {selected && (selected.mode === 'issue' || selected.mode === 'revoke') && <ReferralTransitionSidebar record={selected.record} action={selected.mode} onClose={() => setSelected(null)} />}
            {selected?.mode === 'coordinate' && <CoordinationSidebar record={selected.record} clinicDate={props.clinic_date} onClose={() => setSelected(null)} />}
        </DeskPage>
    </>;
}
