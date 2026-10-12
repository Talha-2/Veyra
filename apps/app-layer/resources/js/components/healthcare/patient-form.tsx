import { useForm } from '@inertiajs/react';
import { useEffect, useState, type FormEvent } from 'react';
import type { PatientRecord } from '../../types/healthcare';

export const controlClass = 'v-field w-full';
export function PatientForm({ patient, onSaved, profile, onProcessingChange }: { patient?: PatientRecord; profile?: { id: number; name: string | null; phone: string | null; email: string | null } | null; onSaved?: () => void; onProcessingChange?: (processing: boolean) => void }) {
    const [existing, setExisting] = useState(Boolean(profile));
    const [search, setSearch] = useState('');
    const [contacts, setContacts] = useState<{ id: number; name: string | null; phone: string | null }[]>([]);
    const [contactPage, setContactPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const form = useForm({
        name: profile?.name ?? patient?.contact.name ?? '', phone: patient?.contact.phone ?? '', email: patient?.contact.email ?? '', contact_id: profile ? String(profile.id) : '',
        birth_date: patient?.birth_date ?? '', administrative_sex: patient?.administrative_sex ?? '', preferred_language: patient?.preferred_language ?? '',
        address_line_1: patient?.address_line_1 ?? '', address_line_2: patient?.address_line_2 ?? '',
        city: patient?.city ?? '', province: patient?.province ?? '', postal_code: patient?.postal_code ?? '', country: patient?.country ?? 'Pakistan',
        emergency_contact_name: patient?.emergency_contact_name ?? '', emergency_contact_relationship: patient?.emergency_contact_relationship ?? '', emergency_contact_phone: patient?.emergency_contact_phone ?? '',
    });
    useEffect(() => { onProcessingChange?.(form.processing); }, [form.processing, onProcessingChange]);
    useEffect(() => {
        if (!existing) return;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch('/desk/patients/contact-options?search=' + encodeURIComponent(search) + '&page=' + contactPage, { signal: controller.signal, headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error('Lookup unavailable');
                const data = await response.json();
                setContacts(data.data); setHasMore(Boolean(data.next_page_url)); setLookupError('');
            } catch (error) { if (!controller.signal.aborted) setLookupError('Could not load profiles. Try searching again.'); }
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [existing, search, contactPage]);
    function submit(event: FormEvent) {
        event.preventDefault();
        if (form.processing) return;
        const options = { preserveScroll: true, onSuccess: () => onSaved?.() };
        if (patient) form.patch('/desk/patients/' + patient.id, options); else form.post('/desk/patients', options);
    }
    const field = (key: keyof typeof form.data, label: string, type = 'text') => (
        <label key={key} className="block text-sm text-secondary">{label}
            <input className={controlClass + ' mt-1.5'} type={type} value={form.data[key]} onChange={e => form.setData(key, e.target.value)} aria-invalid={Boolean(form.errors[key])} />
            {form.errors[key] && <span className="mt-1 block text-xs text-danger" role="alert">{form.errors[key]}</span>}
        </label>
    );
    return <form onSubmit={submit}><fieldset disabled={form.processing} className="space-y-6">
        <fieldset className="space-y-4"><legend className="mb-3 text-md font-semibold text-primary">Patient identity</legend>
            {!patient && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={existing} onChange={e => { setExisting(e.target.checked); form.setData('contact_id', ''); }} />Link an existing conversation profile</label>}
            {existing ? <div className="space-y-3">
                <label className="block text-sm">Find conversation profile<input className={controlClass + ' mt-1.5'} value={search} onChange={e => { setSearch(e.target.value); setContactPage(1); }} placeholder="Name or phone" /></label>
                <label className="block text-sm">Profile<select className={controlClass + ' mt-1.5'} value={form.data.contact_id} required onChange={e => form.setData('contact_id', e.target.value)}><option value="">Select a profile</option>{profile && !contacts.some(c => c.id === profile.id) && <option value={profile.id}>{profile.name || 'Unnamed profile'} {profile.phone}</option>}{contacts.map(c => <option key={c.id} value={c.id}>{c.name ?? 'Unnamed profile'} {c.phone ?? ''}</option>)}</select></label>
                {lookupError && <p role="alert" className="text-sm text-danger">{lookupError}</p>}
                <div className="flex gap-2"><button className="v-btn v-btn--ghost" type="button" disabled={contactPage === 1} onClick={() => setContactPage(p => p - 1)}>Previous</button><button className="v-btn v-btn--ghost" type="button" disabled={!hasMore} onClick={() => setContactPage(p => p + 1)}>Next</button></div>
            </div> : <div className="grid gap-4 sm:grid-cols-2">{field('name', 'Full name')}{field('phone', 'Phone (optional)', 'tel')}{field('email', 'Email (optional)', 'email')}</div>}
            {existing && field('name', 'Full name (required for an unnamed profile)')}
            {form.errors.contact_id && <p role="alert" className="text-sm text-danger">{form.errors.contact_id}</p>}
        </fieldset>
        <fieldset><legend className="mb-3 text-md font-semibold text-primary">Demographics</legend><div className="grid gap-4 sm:grid-cols-2">
            {field('birth_date', 'Date of birth', 'date')}
            <label className="block text-sm text-secondary">Administrative sex<select className={controlClass + ' mt-1.5'} value={form.data.administrative_sex} onChange={e => form.setData('administrative_sex', e.target.value)}><option value="">Not recorded</option>{['female', 'male', 'other', 'unknown'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
            <label className="block text-sm text-secondary">Preferred language<select className={controlClass + ' mt-1.5'} value={form.data.preferred_language} onChange={e => form.setData('preferred_language', e.target.value)}><option value="">Not recorded</option><option value="en">English</option><option value="ur">Urdu</option></select></label>
        </div></fieldset>
        <fieldset><legend className="mb-3 text-md font-semibold text-primary">Address</legend><div className="grid gap-4 sm:grid-cols-2">{field('address_line_1', 'Address line 1')}{field('address_line_2', 'Address line 2')}{field('city', 'City')}{field('province', 'Province / region')}{field('postal_code', 'Postal code')}{field('country', 'Country')}</div></fieldset>
        <fieldset><legend className="mb-3 text-md font-semibold text-primary">Emergency contact</legend><div className="grid gap-4 sm:grid-cols-2">{field('emergency_contact_name', 'Name')}{field('emergency_contact_relationship', 'Relationship')}{field('emergency_contact_phone', 'Phone', 'tel')}</div></fieldset>
        <button className="v-btn v-btn--primary" disabled={form.processing}>{form.processing ? 'Saving…' : patient ? 'Save patient details' : 'Register patient'}</button>
    </fieldset></form>;
}
