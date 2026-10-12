import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import { DeskPage } from '../../components/desk-pages/layout';
import { PageHeader } from '../../components/ui/page';
import { Badge } from '../../components/ui/primitives';
import { RecordPatient, type PatientOption } from './diagnostics-components';
import { canCoordinate, CoordinationBadge, CoordinationHistory, CoordinationSidebar, EditReferralSidebar, ReferralTransitionSidebar, referralTime, type ReferralRecord } from './referral-components';

export default function Referral({ referral, patient, timezone, clinic_date }: { referral: ReferralRecord; patient: PatientOption; timezone: string; clinic_date: string }) {
    const [mode, setMode] = useState<'edit' | 'issue' | 'revoke' | 'coordinate' | null>(null);
    return <>
        <Head title={'Referral to ' + referral.recipient} />
        <DeskPage width="wide" header={<PageHeader title={'Referral to ' + referral.recipient} description={patient.name + ' · ' + patient.mrn} back={{ href: '/desk/referrals?patient_id=' + patient.id, label: 'Patient referrals' }} meta={<div className="flex flex-wrap gap-2"><Badge tone={referral.status === 'issued' ? 'success' : 'muted'}>{referral.status}</Badge>{referral.status === 'issued' && <CoordinationBadge status={referral.coordination_status} />}</div>} actions={referral.can_edit ? <>
            {referral.status === 'draft' && <><button type="button" className="v-btn v-btn--quiet" onClick={() => setMode('edit')}>Edit draft</button><button type="button" className="v-btn v-btn--primary" onClick={() => setMode('issue')}>Issue referral</button></>}
            {canCoordinate(referral) && <button type="button" className="v-btn v-btn--primary" onClick={() => setMode('coordinate')}>Record progress</button>}
            {referral.status === 'issued' && <button type="button" className="v-btn v-btn--quiet" onClick={() => setMode('revoke')}>Revoke referral</button>}
        </> : undefined} />}>
            <nav aria-label="Patient referral context" className="flex flex-wrap gap-2"><Link className="v-btn v-btn--ghost" href={'/desk/patients/' + patient.id + '/chart'}>Clinical chart</Link><Link className="v-btn v-btn--ghost" href={'/desk/documents?patient_id=' + patient.id}>Patient documents</Link>{referral.clinical_encounter_id && <Link className="v-btn v-btn--ghost" href={'/desk/encounters/' + referral.clinical_encounter_id}>Consultation</Link>}</nav>
            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <article className="min-w-0 space-y-6"><section><h2 className="text-lg font-semibold">{referral.status === 'draft' ? 'Draft letter' : 'Original referral letter'}</h2><div className="mt-3"><RecordPatient record={referral} /></div><p className="mt-2 text-xs leading-relaxed text-secondary">Documenting provider: {referral.provider_name} · Entered by {referral.author_name}{referral.issued_at && ' · Issued ' + referralTime(referral.issued_at, timezone)}</p></section>
                    <section className="border-t border-border pt-5"><h3 className="text-sm font-semibold">Referral reason</h3><p className="mt-3 max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-relaxed">{referral.reason}</p></section>
                    <section className="border-t border-border pt-5"><h3 className="text-sm font-semibold">Letter to {referral.recipient}</h3><p className="mt-4 max-w-[75ch] whitespace-pre-wrap break-words text-base leading-relaxed">{referral.letter}</p></section>
                    {referral.revoked_at && <section className="border-t border-border pt-5"><h3 className="text-sm font-semibold">Revocation</h3><p className="mt-2 text-xs text-secondary">Recorded {referralTime(referral.revoked_at, timezone)}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{referral.revocation_reason}</p></section>}
                    <p className="max-w-[75ch] text-xs leading-relaxed text-secondary">{referral.status === 'draft' ? 'This draft can be edited by its author until it is issued.' : 'The issued letter is preserved. Later coordination notes do not change its contents.'} Share documents through your clinic’s existing process.</p>
                </article>
                <aside className="min-w-0 space-y-6 border-t border-border pt-5 xl:border-t-0 xl:pt-0" aria-label="Referral tracking"><section className="space-y-3"><h2 className="text-lg font-semibold">Referral progress</h2>{referral.status === 'issued' ? <><CoordinationBadge status={referral.coordination_status} />{referral.scheduled_on && <p className="text-sm">Scheduled date: {referral.scheduled_on}</p>}{['completed', 'declined'].includes(referral.coordination_status) && <p className="text-sm text-secondary">This outcome is final. The recorded history remains available below.</p>}</> : <p className="text-sm text-secondary">{referral.status === 'draft' ? 'Progress can be recorded after the referral is issued.' : 'This referral was revoked. Its existing tracking history is preserved.'}</p>}<p className="text-xs leading-relaxed text-secondary">Clinic-recorded updates · {timezone}. No appointment booking or patient message is sent from this page.</p></section><CoordinationHistory updates={referral.updates} timezone={timezone} /></aside>
            </div>
            {mode === 'edit' && <EditReferralSidebar record={referral} onClose={() => setMode(null)} />}
            {(mode === 'issue' || mode === 'revoke') && <ReferralTransitionSidebar record={referral} action={mode} onClose={() => setMode(null)} />}
            {mode === 'coordinate' && <CoordinationSidebar record={referral} clinicDate={clinic_date} onClose={() => setMode(null)} />}
        </DeskPage>
    </>;
}
