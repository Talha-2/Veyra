import { useForm } from '@inertiajs/react';
import Sidebar from '../../components/ui/sidebar';
import { Badge } from '../../components/ui/primitives';
import { Errors, Field, RecordPatient, type ClinicalItem } from './diagnostics-components';

export type CoordinationStatus = 'pending' | 'scheduled' | 'completed' | 'declined';
export type CoordinationUpdate = { id: number; status: CoordinationStatus; scheduled_on: string | null; note: string; recorded_by_name: string; created_at: string };
export type ReferralRecord = ClinicalItem & {
    recipient: string; reason: string; letter: string; status: string;
    issued_at: string | null; revoked_at: string | null; revocation_reason: string | null;
    coordination_status: CoordinationStatus; scheduled_on: string | null; updates: CoordinationUpdate[];
};
export const referralTime = (value: string | null, timezone: string) => value ? new Date(value).toLocaleString(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
export const canCoordinate = (record: ReferralRecord) => record.can_edit && record.status === 'issued' && ['pending', 'scheduled'].includes(record.coordination_status);
export function CoordinationBadge({ status }: { status: CoordinationStatus }) { return <Badge tone={status === 'completed' ? 'success' : status === 'declined' ? 'warning' : status === 'scheduled' ? 'info' : 'muted'}>{status === 'pending' ? 'No outcome recorded' : status}</Badge>; }
export function ReferralFields({ data, onChange }: { data: { recipient: string; reason: string; letter: string }; onChange: (field: 'recipient' | 'reason' | 'letter', value: string) => void }) {
    return <>
        <Field label="Recipient specialist or service"><input required autoFocus className="v-field w-full" value={data.recipient} onChange={event => onChange('recipient', event.target.value)} maxLength={255} /></Field>
        <Field label="Referral reason"><textarea required rows={4} className="v-field h-auto w-full" value={data.reason} onChange={event => onChange('reason', event.target.value)} maxLength={10000} /></Field>
        <Field label="Referral letter"><textarea required rows={8} className="v-field h-auto w-full" value={data.letter} onChange={event => onChange('letter', event.target.value)} maxLength={20000} /></Field>
    </>;
}
export function ReferralActions({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) {
    return <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5"><button type="button" disabled={busy} onClick={onClose} className="v-btn v-btn--ghost">Close</button><button type="submit" disabled={busy} className="v-btn v-btn--primary">{busy ? 'Saving…' : label}</button></div>;
}
export function EditReferralSidebar({ record, onClose }: { record: ReferralRecord; onClose: () => void }) {
    const form = useForm({ version: record.version, recipient: record.recipient, reason: record.reason, letter: record.letter });
    const close = () => { if (!form.processing) onClose(); };
    return <Sidebar open onClose={close} title="Edit referral draft" description={record.patient.name} width={760}>
        <form aria-busy={form.processing} onSubmit={event => { event.preventDefault(); if (form.processing || !record.can_edit || record.status !== 'draft') return; form.patch('/desk/referrals/' + record.id, { onSuccess: onClose }); }}><fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <ReferralFields data={form.data} onChange={(field, value) => form.setData(field, value)} /><Errors errors={form.errors} /><ReferralActions busy={form.processing} label="Save draft" onClose={close} />
        </fieldset></form>
    </Sidebar>;
}
export function ReferralTransitionSidebar({ record, action, onClose }: { record: ReferralRecord; action: 'issue' | 'revoke'; onClose: () => void }) {
    const form = useForm({ version: record.version, action, reason: '' });
    const close = () => { if (!form.processing) onClose(); };
    return <Sidebar open onClose={close} title={action === 'issue' ? 'Issue referral' : 'Revoke referral'} description={'To ' + record.recipient} width={760}>
        <div className="mb-6"><RecordPatient record={record} /></div>
        <form aria-busy={form.processing} onSubmit={event => { event.preventDefault(); if (form.processing || !record.can_edit || record.status !== (action === 'issue' ? 'draft' : 'issued')) return; form.post('/desk/referrals/' + record.id + '/transition', { onSuccess: onClose }); }}><fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
            {action === 'issue' ? <><p className="text-sm leading-relaxed text-secondary">Confirm the recipient, reason and letter. Issuing preserves this letter in the clinic record. Share it through your clinic’s existing process.</p><section><h3 className="font-semibold">Referral reason</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.reason}</p></section><section className="border-t border-border pt-5"><h3 className="font-semibold">Referral letter</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.letter}</p></section></> : <><p className="text-sm text-secondary">Revocation preserves the issued letter and records why it was withdrawn.</p><Field label="Revocation reason"><textarea required rows={4} className="v-field h-auto w-full" value={form.data.reason} onChange={event => form.setData('reason', event.target.value)} maxLength={2000} /></Field></>}
            <Errors errors={form.errors} /><ReferralActions busy={form.processing} label={action === 'issue' ? 'Issue referral' : 'Revoke referral'} onClose={close} />
        </fieldset></form>
    </Sidebar>;
}
export function CoordinationSidebar({ record, clinicDate, onClose }: { record: ReferralRecord; clinicDate: string; onClose: () => void }) {
    const activePatient = record.patient.status === 'active';
    const initialDate = activePatient ? (record.scheduled_on && record.scheduled_on >= clinicDate ? record.scheduled_on : clinicDate) : null;
    const form = useForm({ version: record.version, status: activePatient ? 'scheduled' : 'completed', scheduled_on: initialDate as string | null, note: '' });
    const close = () => { if (!form.processing) onClose(); };
    return <Sidebar open onClose={close} title="Record referral progress" description={'To ' + record.recipient} width={640}>
        <div className="mb-6 space-y-3"><RecordPatient record={record} /><div className="flex flex-wrap gap-2"><Badge>{record.status}</Badge><CoordinationBadge status={record.coordination_status} /></div></div>
        <form aria-busy={form.processing} onSubmit={event => { event.preventDefault(); if (form.processing || !canCoordinate(record)) return; form.post('/desk/referrals/' + record.id + '/coordination', { onSuccess: onClose }); }}><fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <Field label="Progress"><select className="v-field w-full" value={form.data.status} onChange={event => form.setData({ ...form.data, status: event.target.value, scheduled_on: event.target.value === 'scheduled' ? clinicDate : null })}><option value="scheduled" disabled={!activePatient}>{record.coordination_status === 'scheduled' ? 'Rescheduled' : 'Scheduled'}</option><option value="completed">Completed</option><option value="declined">Declined</option></select></Field>
            {!activePatient && <p className="text-sm text-secondary">An inactive patient cannot be newly scheduled. You can record a completed or declined referral.</p>}
            {form.data.status === 'scheduled' && <Field label="Scheduled date"><input required type="date" min={clinicDate} className="v-field w-full" value={form.data.scheduled_on ?? ''} onChange={event => form.setData('scheduled_on', event.target.value)} /></Field>}
            <Field label="Coordination note"><textarea required rows={5} className="v-field h-auto w-full" value={form.data.note} onChange={event => form.setData('note', event.target.value)} maxLength={10000} /></Field>
            <p className="text-xs leading-relaxed text-secondary">This adds a dated entry to the clinical history. It does not change the issued letter, book an appointment or send a message.</p>
            <Errors errors={form.errors} /><ReferralActions busy={form.processing} label="Record progress" onClose={close} />
        </fieldset></form>
    </Sidebar>;
}
export function CoordinationHistory({ updates, timezone }: { updates: CoordinationUpdate[]; timezone: string }) {
    return <section className="space-y-4"><h2 className="text-lg font-semibold">Coordination history</h2>{updates.length === 0 ? <p className="text-sm text-secondary">No coordination updates recorded. An external visit may have occurred without an update in this record.</p> : <ol className="divide-y divide-border">{updates.map(update => <li key={update.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><CoordinationBadge status={update.status} />{update.scheduled_on && <span className="text-sm">Scheduled {update.scheduled_on}</span>}</div><span className="text-xs text-secondary">{referralTime(update.created_at, timezone)} · {update.recorded_by_name}</span></div><p className="mt-3 max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-relaxed">{update.note}</p></li>)}</ol>}</section>;
}
