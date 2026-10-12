import { useForm, router } from '@inertiajs/react';
import type { ProviderRecord, WorkingInterval } from '../../types/healthcare';
import { controlClass } from './patient-form';

export function AvailabilityEditor({ provider }: { provider: ProviderRecord }) {
    const form = useForm({ intervals: (provider.availability ?? []).map(i => ({ clinic_location_id: i.clinic_location_id, weekday: i.weekday, start_time: i.start_time, end_time: i.end_time })) });
    const block = useForm({ starts_at: '', ends_at: '', label: '' });
    function edit(index: number, patch: Partial<WorkingInterval>) { form.setData('intervals', form.data.intervals.map((row, i) => i === index ? { ...row, ...patch } : row)); }
    return <div className="space-y-10"><form className="space-y-4" onSubmit={e => { e.preventDefault(); form.put('/desk/providers/' + provider.id + '/availability', { preserveScroll: true }); }}>
        <div><h2 className="text-xl font-semibold">Working hours</h2><p className="mt-1 text-sm text-secondary">Times use each location's timezone. Split intervals around breaks.</p></div>
        {form.data.intervals.map((row, index) => <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <label className="text-xs text-secondary">Location<select className={controlClass + ' mt-1'} value={row.clinic_location_id} onChange={e => edit(index, { clinic_location_id: Number(e.target.value) })}>{provider.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label className="text-xs text-secondary">Day<select className={controlClass + ' mt-1'} value={row.weekday} onChange={e => edit(index, { weekday: Number(e.target.value) })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
            <label className="text-xs text-secondary">From<input type="time" step={300} required className={controlClass + ' mt-1'} value={row.start_time} onChange={e => edit(index, { start_time: e.target.value })} /></label>
            <label className="text-xs text-secondary">Until<input type="time" step={300} required className={controlClass + ' mt-1'} value={row.end_time} onChange={e => edit(index, { end_time: e.target.value })} /></label>
            <button className="v-btn v-btn--ghost" type="button" aria-label={'Remove interval ' + (index + 1)} onClick={() => form.setData('intervals', form.data.intervals.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        {Object.entries(form.errors).map(([key, error]) => <p key={key} role="alert" className="text-sm text-danger">{error}</p>)}
        <div className="flex flex-wrap gap-3"><button className="v-btn v-btn--secondary" type="button" disabled={!provider.locations.length} onClick={() => form.setData('intervals', [...form.data.intervals, { clinic_location_id: provider.locations[0].id, weekday: 1, start_time: '09:00', end_time: '17:00' }])}>Add interval</button><button className="v-btn v-btn--primary" disabled={form.processing}>Save working hours</button></div>
        {!provider.locations.length && <p className="text-sm text-secondary">Assign a clinic location before adding working hours.</p>}
    </form>
    <section><h2 className="mb-3 text-xl font-semibold">Leave and blocked time</h2><ul className="mb-5 space-y-3">{provider.blocks?.map(b => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{b.label ?? 'Blocked time'} · {new Date(b.starts_at).toLocaleString()} – {new Date(b.ends_at).toLocaleString()}</span><button className="v-btn v-btn--ghost" onClick={() => router.delete('/desk/providers/' + provider.id + '/blocks/' + b.id, { preserveScroll: true })}>Remove block</button></li>)}</ul>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); block.transform(data => ({ ...data, starts_at: new Date(data.starts_at).toISOString(), ends_at: new Date(data.ends_at).toISOString() })); block.post('/desk/providers/' + provider.id + '/blocks', { preserveScroll: true, onSuccess: () => block.reset() }); }}>
        <p className="text-xs text-tertiary">Block times use your device timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-secondary">From<input className={controlClass + ' mt-1'} type="datetime-local" required value={block.data.starts_at} onChange={e => block.setData('starts_at', e.target.value)} /></label><label className="text-sm text-secondary">Until<input className={controlClass + ' mt-1'} type="datetime-local" required value={block.data.ends_at} onChange={e => block.setData('ends_at', e.target.value)} /></label></div>
        <label className="block text-sm text-secondary">Label (optional)<input className={controlClass + ' mt-1'} value={block.data.label} onChange={e => block.setData('label', e.target.value)} /></label>{Object.entries(block.errors).map(([k, v]) => <p key={k} role="alert" className="text-sm text-danger">{v}</p>)}<button className="v-btn v-btn--secondary" disabled={block.processing}>Block time</button>
    </form></section></div>;
}
