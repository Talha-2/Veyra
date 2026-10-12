import { useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import type { AppointmentRecord, AvailableSlot, ProviderRecord } from '../../types/healthcare';
import { controlClass } from './patient-form';

export function AppointmentForm({ provider, appointment, date, onSaved, onProcessingChange }: { provider: ProviderRecord; appointment?: AppointmentRecord; date: string; onSaved: () => void; onProcessingChange?: (processing: boolean) => void }) {
    const form = useForm({ patient_id: appointment?.patient.id.toString() ?? '', provider_id: provider.id,
        clinic_location_id: appointment?.clinic_location_id ?? provider.locations[0]?.id ?? 0,
        healthcare_service_id: appointment?.healthcare_service_id ?? provider.services[0]?.id ?? 0,
        starts_at: '', idempotency_key: crypto.randomUUID() });
    const [day, setDay] = useState(date);
    const [query, setQuery] = useState('');
    const [patients, setPatients] = useState<{ id: number; name: string; mrn: string }[]>([]);
    const [patientPage, setPatientPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [slots, setSlots] = useState<AvailableSlot[]>([]);
    const [loading, setLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => { onProcessingChange?.(form.processing); }, [form.processing, onProcessingChange]);
    useEffect(() => {
        if (appointment) return;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch('/desk/calendar/patients?search=' + encodeURIComponent(query) + '&page=' + patientPage, { signal: controller.signal, headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error('Patients unavailable');
                const data = await response.json(); setPatients(data.data); setHasMore(Boolean(data.next_page_url));
            } catch { if (!controller.signal.aborted) setLookupError('Could not load patients. Retry your search.'); }
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, patientPage, appointment]);
    useEffect(() => {
        const controller = new AbortController(); setSlots([]); form.setData('starts_at', '');
        if (!day || !form.data.clinic_location_id || !form.data.healthcare_service_id) return;
        const previous = new Date(day + 'T00:00:00Z'); previous.setUTCDate(previous.getUTCDate() - 1);
        const next = new Date(day + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 2);
        const params = new URLSearchParams({ location_id: String(form.data.clinic_location_id), service_id: String(form.data.healthcare_service_id), from: previous.toISOString(), to: next.toISOString(), ...(appointment ? { ignore_appointment_id: String(appointment.id) } : {}) });
        setLoading(true);
        fetch('/desk/providers/' + provider.id + '/slots?' + params, { signal: controller.signal, headers: { Accept: 'application/json' } })
            .then(async r => { const result = await r.json(); if (!r.ok) throw new Error(result.message ?? 'Could not check availability.'); return result; })
            .then(result => { setSlots(result.slots.filter((slot: AvailableSlot) => dateInZone(slot.starts_at, slot.timezone) === day)); setLookupError(''); })
            .catch(error => { if (!controller.signal.aborted) setLookupError(error.message); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [day, form.data.clinic_location_id, form.data.healthcare_service_id, revision]);
    const location = provider.locations.find(l => l.id === form.data.clinic_location_id);
    const options = { preserveScroll: true, onSuccess: onSaved, onError: () => setRevision(r => r + 1) };
    return <form className="space-y-5" onSubmit={e => { e.preventDefault(); if (appointment) form.patch('/desk/appointments/' + appointment.id + '/reschedule', options); else form.post('/desk/appointments', options); }}>
        <fieldset disabled={form.processing} className="space-y-5"><p className="text-sm text-secondary">{provider.name}{appointment ? ' · ' + appointment.patient.name : ''}</p>
        {!appointment && <><label className="block text-sm text-secondary">Find patient<input className={controlClass + ' mt-1'} value={query} placeholder="Patient name or record number" onChange={e => { setQuery(e.target.value); setPatientPage(1); }} /></label>
        <label className="block text-sm text-secondary">Patient<select className={controlClass + ' mt-1'} required value={form.data.patient_id} onChange={e => form.setData('patient_id', e.target.value)}><option value="">Select registered patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name} · {p.mrn}</option>)}</select></label>
        <div className="flex gap-2"><button type="button" className="v-btn v-btn--ghost" disabled={patientPage === 1} onClick={() => setPatientPage(p => p - 1)}>Previous patients</button><button type="button" className="v-btn v-btn--ghost" disabled={!hasMore} onClick={() => setPatientPage(p => p + 1)}>Next patients</button></div></>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-secondary">Location<select disabled={Boolean(appointment)} className={controlClass + ' mt-1'} value={form.data.clinic_location_id} onChange={e => form.setData('clinic_location_id', Number(e.target.value))}>{provider.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="block text-sm text-secondary">Service<select disabled={Boolean(appointment)} className={controlClass + ' mt-1'} value={form.data.healthcare_service_id} onChange={e => form.setData('healthcare_service_id', Number(e.target.value))}>{provider.services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>)}</select></label></div>
        <label className="block text-sm text-secondary">Appointment date<input type="date" required className={controlClass + ' mt-1'} value={day} onChange={e => setDay(e.target.value)} /></label>
        <fieldset><legend className="mb-2 text-sm font-medium">Available times · {location?.timezone ?? 'Select location'}</legend>
        {loading ? <div role="status" className="h-12 animate-pulse rounded-lg bg-surface-hover p-3 text-sm text-tertiary">Checking availability…</div> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map(slot => <label key={slot.starts_at} className={'flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm ' + (form.data.starts_at === slot.starts_at ? 'border-accent bg-accent-subtle text-accent' : 'border-border hover:bg-surface-hover')}><input type="radio" required name="appointment_slot" value={slot.starts_at} checked={form.data.starts_at === slot.starts_at} onChange={() => form.setData('starts_at', slot.starts_at)} /><span>{timeInZone(slot.starts_at, slot.timezone)}</span></label>)}</div> : <p className="text-sm text-secondary">No slots available. Try another date or review the provider's working hours.</p>}</fieldset>
        {lookupError && <p role="alert" className="text-sm text-danger">{lookupError}</p>}{Object.entries(form.errors).map(([k, v]) => <p key={k} role="alert" className="text-sm text-danger">{v}</p>)}
        <button className="v-btn v-btn--primary" disabled={form.processing || loading || !form.data.starts_at}>{form.processing ? 'Saving…' : appointment ? 'Confirm reschedule' : 'Confirm booking'}</button></fieldset>
    </form>;
}
export function dateInZone(instant: string, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
    return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
export function timeInZone(instant: string, timezone: string): string { return new Date(instant).toLocaleTimeString('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }); }
