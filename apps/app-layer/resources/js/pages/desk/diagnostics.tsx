import { Head, Link, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { FlaskConical, ScanLine, Plus } from 'lucide-react';
import { DeskPage, Panel } from '../../components/desk-pages/layout';
import { PageHeader } from '../../components/ui/page';
import { Badge } from '../../components/ui/primitives';
import Sidebar from '../../components/ui/sidebar';
import { ContextFields, Field, Errors, Pagination, RecordPatient, type AncillaryContext, type ClinicalItem, type PageRecords } from './diagnostics-components';

type ContactStatus = 'not_recorded' | 'contacted' | 'attempted' | 'not_required';
type Order = ClinicalItem & {
    kind: string; name: string; indication: string; priority: string; status: string;
    result: string | null; result_flag: string | null; review_note: string | null;
    ordered_at: string | null; resulted_at: string | null; reviewed_at: string | null;
    cancelled_at: string | null; cancellation_reason: string | null;
    patient_contact_status: ContactStatus;
    follow_up_task: { id: number; status: string; due_on: string; assigned_user_id: number | null } | null;
};
type Filters = { status: string; flag: string; search: string; mine: string };
type Props = AncillaryContext & {
    kind: 'lab' | 'imaging'; status: string; records: PageRecords<Order>;
    timezone: string; clinic_date: string; actor_id: number;
    members: { id: number; name: string }[]; filters: Filters;
    counts: { awaiting_review: number; critical: number; abnormal: number; ordered: number };
};
const flags = ['normal', 'abnormal', 'critical', 'not_applicable'];
const contactLabels: Record<ContactStatus, string> = { not_recorded: 'Not recorded', contacted: 'Patient contacted', attempted: 'Contact attempted', not_required: 'Contact not required' };
const readable = (value: string) => value.replaceAll('_', ' ');
const dateTime = (value: string | null, timezone: string) => value ? new Date(value).toLocaleString(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';

export default function Diagnostics(props: Props) {
    const [creating, setCreating] = useState(false);
    const [selected, setSelected] = useState<Order | null>(null);
    const [action, setAction] = useState('');
    const [editing, setEditing] = useState<Order | null>(null);
    const [filters, setFilters] = useState(props.filters);
    const [patientSearch, setPatientSearch] = useState(props.q);
    useEffect(() => { setFilters(props.filters); setPatientSearch(props.q); }, [props.filters, props.q]);
    const edit = useForm({ version: 1, name: '', indication: '', priority: 'routine' });
    const base = props.kind === 'lab' ? '/desk/labs' : '/desk/images';
    const title = props.kind === 'lab' ? 'Laboratory orders' : 'Imaging orders';
    const Icon = props.kind === 'lab' ? FlaskConical : ScanLine;
    const form = useForm({ patient_id: String(props.patient?.id || ''), clinical_encounter_id: '', kind: props.kind, name: '', indication: '', priority: 'routine' });
    const transition = useForm({ version: 1, action: '', result: '', result_flag: 'normal', review_note: '', reason: '', patient_contact_status: 'not_recorded' as ContactStatus, follow_up: null as { assigned_user_id: string; due_on: string } | null });
    function openAction(record: Order, next: string) {
        transition.clearErrors();
        transition.setData({ version: record.version, action: next, result: '', result_flag: 'normal', review_note: '', reason: '', patient_contact_status: record.patient_contact_status ?? 'not_recorded', follow_up: null });
        setSelected(record); setAction(next);
    }
    const filterQuery = (patch: Partial<Filters> = {}, patientId = String(props.patient?.id || '')) => ({ ...filters, ...patch, patient_id: patientId, q: patientSearch });
    const queueHref = (patch: Partial<Filters>) => base + '?' + new URLSearchParams(filterQuery(patch)).toString();
    const closeTransition = () => { if (!transition.processing) setSelected(null); };
    const memberName = (id: number | null) => props.members.find(member => member.id === id)?.name ?? 'Unassigned';
    const queues = [
        { label: 'Awaiting review', count: props.counts.awaiting_review, status: 'resulted', flag: '' },
        { label: 'Critical results', count: props.counts.critical, status: 'resulted', flag: 'critical' },
        { label: 'Abnormal results', count: props.counts.abnormal, status: 'resulted', flag: 'abnormal' },
        { label: 'Awaiting results', count: props.counts.ordered, status: 'ordered', flag: '' },
    ];

    return <>
        <Head title={title} />
        <DeskPage width="wide" header={<PageHeader title={title} description="Record returned reports, review results and arrange provider follow-up." actions={<button type="button" className="v-btn v-btn--primary" onClick={() => { form.setData('patient_id', String(props.patient?.id || '')); form.clearErrors(); setCreating(true); }}><Plus size={16} />New order</button>} back={props.patient ? { href: '/desk/patients/' + props.patient.id + '/chart', label: props.patient.name + ' · Chart' } : undefined} />}>
            <nav aria-label="Clinical modules" className="flex flex-wrap gap-2">{[['/desk/labs', 'Labs'], ['/desk/images', 'Imaging'], ['/desk/documents', 'Documents'], ['/desk/referrals', 'Referrals']].map(([href, label]) => <Link key={href} href={href + (props.patient ? '?patient_id=' + props.patient.id : '')} className={'v-btn ' + (base === href ? 'v-btn--primary' : 'v-btn--ghost')} aria-current={base === href ? 'page' : undefined}>{label}</Link>)}</nav>
            <section className="space-y-6" aria-label="Order worklist">
                <div className="flex flex-wrap gap-2" aria-label="Result queues">{queues.map(queue => <Link key={queue.label} href={queueHref({ status: queue.status, flag: queue.flag })} className={'v-btn ' + (filters.status === queue.status && filters.flag === queue.flag ? 'v-btn--quiet' : 'v-btn--ghost')} aria-current={filters.status === queue.status && filters.flag === queue.flag ? 'page' : undefined}>{queue.label}<span className="font-semibold tabular-nums">{queue.count}</span></Link>)}</div>
                <form className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={event => { event.preventDefault(); router.get(base, filterQuery(), { preserveState: true, preserveScroll: true }); }}>
                    <Field label="Search orders"><input className="v-field w-full" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Order, indication, patient or MRN" maxLength={200} /></Field>
                    <Field label="Order status"><select className="v-field w-full" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All states</option>{['draft', 'ordered', 'resulted', 'reviewed', 'cancelled'].map(status => <option key={status} value={status}>{readable(status)}</option>)}</select></Field>
                    <Field label="Result flag"><select className="v-field w-full" value={filters.flag} onChange={event => setFilters({ ...filters, flag: event.target.value })}><option value="">All flags</option>{flags.map(flag => <option key={flag} value={flag}>{readable(flag)}</option>)}</select></Field>
                    <Field label="Order owner"><select className="v-field w-full" value={filters.mine} onChange={event => setFilters({ ...filters, mine: event.target.value })}><option value="">All visible orders</option><option value="1">My orders</option></select></Field>
                    <Field label="Find patient choices"><input className="v-field w-full" value={patientSearch} onChange={event => setPatientSearch(event.target.value)} placeholder="Name or MRN" maxLength={100} /></Field>
                    <Field label="Patient context"><select className="v-field w-full" value={props.patient?.id || ''} onChange={event => router.get(base, filterQuery({}, event.target.value), { preserveState: true, preserveScroll: true })}><option value="">All patients</option>{props.patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name} · {patient.mrn}</option>)}</select></Field>
                    <p className="text-xs leading-relaxed text-secondary">Up to 100 patient choices. Apply the patient search to find others. Result queues include the current patient, search and owner filters.</p>
                    <div className="flex flex-wrap items-center gap-2"><button className="v-btn v-btn--quiet">Apply filters</button><Link href={base + (props.patient ? '?patient_id=' + props.patient.id : '')} className="v-btn v-btn--ghost">Reset</Link></div>
                </form>
                <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">{props.patient ? props.patient.name + ' · Orders' : 'Clinical worklist'}</h2><p className="text-sm text-secondary">{props.records.total} orders{props.filters.status === 'resulted' && ' · Critical and abnormal results first'}</p></div>
                {props.records.data.length === 0 ? <Panel className="p-6"><div className="flex items-start gap-3"><Icon className="shrink-0 text-secondary" size={24} /><div><h3 className="font-semibold">No orders in this view</h3><p className="mt-1 text-sm text-secondary">Create an order or change the patient, status and result filters.</p></div></div></Panel> : <Panel><ul className="divide-y divide-border">{props.records.data.map(record => <li key={record.id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                        <div className="min-w-0 flex-1 basis-64"><button type="button" className="text-left text-base font-semibold text-primary hover:text-accent-text hover:underline" onClick={() => openAction(record, 'view')}>{record.name}</button><div className="mt-1"><RecordPatient record={record} /></div><p className="mt-2 line-clamp-2 break-words text-sm text-secondary">{record.result || record.indication}</p></div>
                        <div className="flex flex-wrap items-center gap-2"><Badge tone={record.status === 'reviewed' ? 'success' : 'muted'}>{record.status}</Badge>{record.result_flag && <ResultFlag flag={record.result_flag} />}{record.priority === 'urgent' && <Badge tone="danger">Urgent</Badge>}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"><p className="text-xs text-secondary">{record.resulted_at ? 'Result entered ' + dateTime(record.resulted_at, props.timezone) : record.ordered_at ? 'Ordered ' + dateTime(record.ordered_at, props.timezone) : 'Draft created ' + dateTime(record.created_at, props.timezone)}{record.reviewed_at && ' · Reviewed ' + dateTime(record.reviewed_at, props.timezone)}{record.follow_up_task && ' · Follow-up ' + record.follow_up_task.status}</p>
                        <div className="flex flex-wrap items-center gap-2"><button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => openAction(record, 'view')}>View details</button>{record.can_edit && <>
                            {record.status === 'draft' && <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={() => { edit.clearErrors(); edit.setData({ version: record.version, name: record.name, indication: record.indication, priority: record.priority }); setEditing(record); }}>Edit draft</button>}
                            {record.status === 'draft' && <button type="button" className="v-btn v-btn--primary v-btn--sm" onClick={() => openAction(record, 'order')}>Place order</button>}
                            {record.status === 'ordered' && <button type="button" className="v-btn v-btn--primary v-btn--sm" onClick={() => openAction(record, 'result')}>Enter result</button>}
                            {record.status === 'resulted' && <button type="button" className="v-btn v-btn--primary v-btn--sm" onClick={() => openAction(record, 'review')}>Review result</button>}
                            {['draft', 'ordered'].includes(record.status) && <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => openAction(record, 'cancel')}>Cancel order</button>}
                        </>}</div>
                    </div>
                </li>)}</ul></Panel>}
                <Pagination records={props.records} />
                <p className="max-w-[75ch] text-xs leading-relaxed text-secondary">Orders and results are entered by your clinic. Send orders through your existing laboratory or imaging process. Recording a review or a follow-up task does not contact the patient.</p>
            </section>
            <Sidebar open={creating} onClose={() => { if (!form.processing) setCreating(false); }} title={'New ' + (props.kind === 'lab' ? 'laboratory' : 'imaging') + ' order'} description={'Documenting as ' + props.provider_name}>
                <form className="space-y-5" aria-busy={form.processing} onSubmit={event => { event.preventDefault(); if (form.processing) return; form.post('/desk/diagnostics', { onSuccess: () => { setCreating(false); form.reset('name', 'indication', 'clinical_encounter_id'); } }); }}><fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                    <ContextFields context={props} patientId={form.data.patient_id} encounterId={form.data.clinical_encounter_id} onPatient={value => form.setData('patient_id', value)} onEncounter={value => form.setData('clinical_encounter_id', value)} />
                    <Field label={props.kind === 'lab' ? 'Test or panel' : 'Imaging study'}><input required className="v-field w-full" maxLength={255} value={form.data.name} onChange={event => form.setData('name', event.target.value)} /></Field>
                    <Field label="Clinical indication"><textarea required rows={4} className="v-field h-auto w-full" value={form.data.indication} onChange={event => form.setData('indication', event.target.value)} maxLength={10000} /></Field>
                    <Priority value={form.data.priority} onChange={value => form.setData('priority', value)} />
                    <Errors errors={form.errors} /><FormActions busy={form.processing} label="Save draft" onClose={() => setCreating(false)} />
                </fieldset></form>
            </Sidebar>
            <Sidebar open={!!selected} onClose={closeTransition} title={action === 'view' ? 'Order details' : action === 'result' ? 'Enter returned result' : action === 'review' ? 'Review result' : action === 'cancel' ? 'Cancel order' : 'Place order'} description={selected?.name} width={760}>
                {selected && <>
                    <div className="mb-6 space-y-3"><RecordPatient record={selected} /><div className="flex flex-wrap gap-2"><Badge>{selected.status}</Badge>{selected.result_flag && <ResultFlag flag={selected.result_flag} />}{selected.priority === 'urgent' && <Badge tone="danger">Urgent</Badge>}</div><p className="text-xs text-secondary">Documenting provider: {selected.provider_name} · Entered by {selected.author_name}</p></div>
                    {(action === 'view' || action === 'review') && <OrderDetails record={selected} timezone={props.timezone} memberName={memberName} />}
                    {action === 'view' ? <div className="mt-6 flex flex-wrap gap-2">{selected.can_edit && selected.status === 'resulted' && <button type="button" className="v-btn v-btn--primary" onClick={() => openAction(selected, 'review')}>Review result</button>}<button type="button" className="v-btn v-btn--ghost" onClick={closeTransition}>Close</button></div> : <form className="mt-6 space-y-5" aria-busy={transition.processing} onSubmit={event => { event.preventDefault(); if (transition.processing || !selected.can_edit) return; transition.post('/desk/diagnostics/' + selected.id + '/transition', { onSuccess: () => setSelected(null) }); }}><fieldset disabled={transition.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                        {action === 'order' && <><p className="whitespace-pre-wrap break-words text-sm">{selected.indication}</p><p className="text-sm text-secondary">Confirm this order is ready to send through your clinic’s ordering process. The order details will be locked.</p></>}
                        {action === 'result' && <><Field label="Result or report"><textarea required rows={7} className="v-field h-auto w-full" value={transition.data.result} onChange={event => transition.setData('result', event.target.value)} maxLength={20000} /></Field><Field label="Result flag"><select className="v-field w-full" value={transition.data.result_flag} onChange={event => transition.setData('result_flag', event.target.value)}>{flags.map(flag => <option key={flag} value={flag}>{readable(flag)}</option>)}</select></Field><p className="text-sm text-secondary">Verify the report belongs to this patient before saving. Saved results are preserved in the record.</p></>}
                        {action === 'review' && <>
                            <Field label="Review and follow-up plan"><textarea required rows={5} className="v-field h-auto w-full" value={transition.data.review_note} onChange={event => transition.setData('review_note', event.target.value)} maxLength={10000} /></Field>
                            <Field label="Contact status recorded at review"><select className="v-field w-full" value={transition.data.patient_contact_status} onChange={event => transition.setData('patient_contact_status', event.target.value as ContactStatus)}>{Object.entries(contactLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                            <div className="space-y-4 border-t border-border pt-5"><label className="flex items-start gap-3 text-sm font-medium"><input type="checkbox" className="mt-0.5 shrink-0" disabled={selected.patient.status !== 'active'} checked={transition.data.follow_up !== null} onChange={event => transition.setData('follow_up', event.target.checked ? { assigned_user_id: '', due_on: props.clinic_date } : null)} /><span>Arrange provider follow-up<span className="mt-1 block font-normal text-secondary">{selected.patient.status === 'active' ? 'Create an assigned recall task. Your clinical plan stays in the reviewed result.' : 'Follow-up tasks require an active patient. You can save this review without a task.'}</span></span></label>
                                {transition.data.follow_up && <div className="grid gap-4 sm:grid-cols-2"><Field label="Assign to"><select required className="v-field w-full" value={transition.data.follow_up.assigned_user_id} onChange={event => transition.setData('follow_up', { ...transition.data.follow_up!, assigned_user_id: event.target.value })}><option value="">Choose a team member</option>{props.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Due date"><input required type="date" min={props.clinic_date} className="v-field w-full" value={transition.data.follow_up.due_on} onChange={event => transition.setData('follow_up', { ...transition.data.follow_up!, due_on: event.target.value })} /></Field></div>}
                            </div><p className="text-xs leading-relaxed text-secondary">Save review records your plan and contact disposition. It does not send a patient message.</p>
                        </>}
                        {action === 'cancel' && <Field label="Cancellation reason"><textarea required rows={4} className="v-field h-auto w-full" value={transition.data.reason} onChange={event => transition.setData('reason', event.target.value)} maxLength={2000} /></Field>}
                        <Errors errors={transition.errors} /><FormActions busy={transition.processing} label={action === 'review' ? 'Save review' : action === 'result' ? 'Save result' : action === 'cancel' ? 'Cancel order' : 'Place order'} onClose={closeTransition} />
                    </fieldset></form>}
                </>}
            </Sidebar>
            <Sidebar open={!!editing} onClose={() => { if (!edit.processing) setEditing(null); }} title="Edit order draft" description={editing?.patient.name}>
                <form className="space-y-5" aria-busy={edit.processing} onSubmit={event => { event.preventDefault(); if (edit.processing || !editing?.can_edit) return; edit.patch('/desk/diagnostics/' + editing.id, { onSuccess: () => setEditing(null) }); }}><fieldset disabled={edit.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                    <Field label="Test or study"><input required className="v-field w-full" maxLength={255} value={edit.data.name} onChange={event => edit.setData('name', event.target.value)} /></Field>
                    <Field label="Clinical indication"><textarea required rows={5} className="v-field h-auto w-full" maxLength={10000} value={edit.data.indication} onChange={event => edit.setData('indication', event.target.value)} /></Field>
                    <Priority value={edit.data.priority} onChange={value => edit.setData('priority', value)} /><Errors errors={edit.errors} /><FormActions busy={edit.processing} label="Save draft" onClose={() => setEditing(null)} />
                </fieldset></form>
            </Sidebar>
        </DeskPage>
    </>;
}

function ResultFlag({ flag }: { flag: string }) { return <Badge tone={flag === 'critical' ? 'danger' : flag === 'abnormal' ? 'warning' : flag === 'normal' ? 'success' : 'muted'}>{readable(flag)}</Badge>; }
function Priority({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <Field label="Priority"><select className="v-field w-full" value={value} onChange={event => onChange(event.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option></select></Field>; }
function FormActions({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) { return <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5"><button type="button" disabled={busy} className="v-btn v-btn--ghost" onClick={onClose}>Close</button><button type="submit" disabled={busy} className="v-btn v-btn--primary">{busy ? 'Saving…' : label}</button></div>; }
function OrderDetails({ record, timezone, memberName }: { record: Order; timezone: string; memberName: (id: number | null) => string }) {
    return <div className="space-y-6">
        <section><h3 className="text-sm font-semibold">Clinical indication</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.indication}</p></section>
        {record.result && <section className="border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">Returned report</h3>{record.result_flag && <ResultFlag flag={record.result_flag} />}</div><p className="mt-1 text-xs text-secondary">Entered {dateTime(record.resulted_at, timezone)} · {timezone}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.result}</p></section>}
        {record.review_note && <section className="border-t border-border pt-5"><h3 className="text-sm font-semibold">Review and follow-up plan</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.review_note}</p><p className="mt-2 text-xs text-secondary">Reviewed {dateTime(record.reviewed_at, timezone)} · Contact status recorded at review: {contactLabels[record.patient_contact_status ?? 'not_recorded']}</p></section>}
        {record.follow_up_task && <section className="border-t border-border pt-5"><h3 className="text-sm font-semibold">Provider follow-up</h3><p className="mt-2 text-sm text-secondary">{memberName(record.follow_up_task.assigned_user_id)} · Due {record.follow_up_task.due_on} · {record.follow_up_task.status}</p><Link href={'/desk/care-tasks?patient_id=' + record.patient_id} className="v-btn v-btn--ghost v-btn--sm mt-2">Open care tasks</Link></section>}
        {record.cancellation_reason && <section className="border-t border-border pt-5"><h3 className="text-sm font-semibold">Cancellation</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-secondary">{record.cancellation_reason}</p><p className="mt-2 text-xs text-secondary">Cancelled {dateTime(record.cancelled_at, timezone)}</p></section>}
    </div>;
}
