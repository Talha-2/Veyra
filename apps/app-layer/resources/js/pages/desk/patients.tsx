import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { DeskPage, Panel } from '../../components/desk-pages/layout';
import { PageLinks } from '../../components/desk-pages/bits';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, Badge } from '../../components/ui/primitives';
import Sidebar from '../../components/ui/sidebar';
import { PatientForm, controlClass } from '../../components/healthcare/patient-form';
import type { PageResult, PatientRecord } from '../../types/healthcare';

export default function Patients({ patients, filters, registration_profile }: { patients: PageResult<PatientRecord>; registration_profile?: { id: number; name: string | null; phone: string | null; email: string | null } | null; filters: { search: string; status: string } }) {
    const [open, setOpen] = useState(Boolean(registration_profile));
    const [search, setSearch] = useState(filters.search);
    return <><Head title="Patients" /><DeskPage header={<PageHeader title="Patients" description="Patient registration and demographics, connected to every conversation." actions={<button className="v-btn v-btn--primary" onClick={() => setOpen(true)}><UserPlus size={16} />Register patient</button>} />}>
        <section><form className="mb-5 flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); router.get('/desk/patients', { search, status: filters.status }); }}>
            <label className="min-w-0 flex-1"><span className="sr-only">Search patients</span><input className={controlClass} placeholder="Search name, medical record number or phone" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label><span className="sr-only">Patient status</span><select className={controlClass} value={filters.status} onChange={e => router.get('/desk/patients', { search, status: e.target.value })}><option value="active">Active patients</option><option value="archived">Archived patients</option></select></label>
            <button className="v-btn v-btn--secondary">Search</button>
        </form>
        <Panel>{patients.data.length === 0 ? <EmptyState icon={<UserPlus size={22} />} title="No patients found">Register a patient to connect their care journey and conversations.</EmptyState> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-tertiary"><tr>{['Patient', 'Record number', 'Age', 'Phone / email', 'Status'].map(h => <th className="px-5 py-4 font-medium" key={h}>{h}</th>)}</tr></thead><tbody>{patients.data.map(p => <tr key={p.id} className="border-t border-border hover:bg-surface-hover"><td className="px-5 py-4"><Link className="font-medium text-primary hover:underline" href={'/desk/patients/' + p.id}>{p.contact.name}</Link></td><td className="px-5 py-4 tabular-nums text-secondary">{p.mrn}</td><td className="px-5 py-4">{p.age ?? '—'}</td><td className="px-5 py-4 text-secondary">{p.contact.phone ?? p.contact.email ?? 'Not recorded'}</td><td className="px-5 py-4"><Badge tone={p.status === 'active' ? 'success' : 'muted'}>{p.status}</Badge></td></tr>)}</tbody></table></div>}</Panel>
        <PageLinks links={patients.links} summary={patients.total + ' patients'} /></section>
    </DeskPage><Sidebar open={open} onClose={() => setOpen(false)} title="Register patient"><PatientForm profile={registration_profile} onSaved={() => setOpen(false)} /></Sidebar></>;
}
