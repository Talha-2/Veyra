import { Head, Link, useForm } from '@inertiajs/react';
import { Bot, ChevronRight, Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreateParam } from '../../components/studio-capability/use-create-param';
import { Group, PageStack, Stacked } from '../../components/studio/space';
import { Card, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState } from '../../components/ui/primitives';
import Sidebar from '../../components/ui/sidebar';
import StudioLayout from '../../layouts/studio-layout';

interface ExpertRow {
    id: number; slug: string; name: string; description: string;
    runtime: string; runtime_label: string; model: string | null;
    is_builtin: boolean; enabled: boolean; skills_count: number; actions_count: number;
}
interface Props {
    experts: ExpertRow[];
    runtimes: { value: string; label: string; description: string }[];
    legacy_experts: ExpertRow[];
}

export default function Experts({ experts, runtimes, legacy_experts = [] }: Props) {
    const [creating, setCreating] = useCreateParam();
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const visible = experts.filter(expert => (status === 'all' || expert.enabled === (status === 'enabled'))
        && [expert.name, expert.description, expert.runtime_label].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
    return <>
        <Head title="Experts" />
        <PageHeader title="Experts" description="Optional specialists for tasks that need dedicated instructions or private skills. The core taker and worker handle conversations and shared skills even with no experts."
            actions={<button type="button" className="v-btn v-btn--primary" onClick={() => setCreating(true)}><Plus size={15} />New expert</button>} />
        <PageStack>
            <div className="flex flex-wrap items-center justify-between gap-3 text-base text-secondary"><p>Configure everyday conversation and actions in the core runtime.</p><Link href="/studio/runtime" className="v-btn v-btn--quiet">Core runtime<ChevronRight size={15} /></Link></div>
            <section>
                <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search specialists" className="w-full sm:w-72" />}><SegmentedControl value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} /></Toolbar>
                <Card className="mt-5">
                    {visible.length === 0 ? <EmptyState icon={<Bot size={22} />} title={experts.length === 0 ? 'Add a specialist when you need one' : 'No specialists in this view'}
                        action={experts.length === 0 ? <button type="button" className="v-btn v-btn--quiet" onClick={() => setCreating(true)}>Create an expert</button> : <button type="button" className="v-btn v-btn--ghost" onClick={() => { setQuery(''); setStatus('all'); }}>Show all experts</button>}>
                        {experts.length === 0 ? 'Use an expert for a focused area such as billing, with its own private procedures and permitted actions. Shared skills already work through the core worker.' : 'Search names, descriptions and runtimes, or change the status filter.'}
                    </EmptyState> : <ul className="divide-y divide-border">{visible.map(expert => <li key={expert.id}>
                        <Link href={`/studio/experts/${expert.id}`} className="group flex flex-col gap-4 px-6 py-6 hover:bg-surface-hover sm:flex-row sm:items-start sm:gap-6 sm:px-8">
                            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="break-words text-lg font-semibold text-primary">{expert.name}</h2><Badge tone={expert.enabled ? 'success' : 'muted'} dot>{expert.enabled ? 'Enabled' : 'Disabled'}</Badge></div><p className="mt-2 max-w-[72ch] break-words text-base leading-relaxed text-secondary">{expert.description}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-secondary"><span>{expert.runtime_label}</span><span>{expert.skills_count} assigned skills</span><span>{expert.actions_count} permitted actions</span><span className="break-all">{expert.model || 'Core worker model'}</span></div></div>
                            <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary sm:pt-1">Configure<ChevronRight size={16} /></span>
                        </Link>
                    </li>)}</ul>}
                </Card>
                <p className="mt-4 text-sm text-secondary">Showing {visible.length} of {experts.length} optional experts. Delegated work runs in each expert’s own context.</p>
            </section>
            {legacy_experts.length > 0 && <Group title="Preserved legacy profiles" description="Historical conversation and built-in profiles remain available for reference. Core runtime settings now control the taker and worker."><Card><ul className="divide-y divide-border">{legacy_experts.map(expert => <li key={expert.id}><Link href={`/studio/experts/${expert.id}`} className="flex flex-wrap items-center justify-between gap-3 px-7 py-5 hover:bg-surface-hover"><span className="min-w-0 break-words font-medium">{expert.name}</span><span className="flex items-center gap-3 text-sm text-secondary">{expert.runtime_label || expert.runtime}<ChevronRight size={16} /></span></Link></li>)}</ul></Card></Group>}
        </PageStack>
        <Sidebar open={creating} onClose={() => { if (!busy) setCreating(false); }} title="New expert" description="Define a focused specialty. Configure its instructions, private skills and action permissions next." width={640}><CreateForm runtimes={runtimes.filter(runtime => runtime.value !== 'talker')} onBusy={setBusy} onDone={() => setCreating(false)} /></Sidebar>
    </>;
}

function CreateForm({ runtimes, onBusy, onDone }: { runtimes: Props['runtimes']; onBusy: (busy: boolean) => void; onDone: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', description: '', runtime: 'worker' });
    const submit = (event: FormEvent) => { event.preventDefault(); post('/studio/experts', { onStart: () => onBusy(true), onFinish: () => onBusy(false), onSuccess: onDone }); };
    return <form onSubmit={submit} className="flex flex-col gap-6">
        <Stacked label="Name" htmlFor="expert-name" error={errors.name}><input id="expert-name" className="v-field" value={data.name} maxLength={80} onChange={event => setData('name', event.target.value)} autoFocus required disabled={processing} placeholder="Billing specialist" /></Stacked>
        <Stacked label="When to delegate" htmlFor="expert-description" error={errors.description} hint="Describe the tasks this specialist handles so the core worker can choose it."><textarea id="expert-description" className="v-field text-base leading-relaxed" rows={4} value={data.description} maxLength={160} onChange={event => setData('description', event.target.value)} required disabled={processing} placeholder="Invoice questions, payment disputes and refund requests." /></Stacked>
        <Stacked label="Runtime" htmlFor="expert-runtime" error={errors.runtime} hint="Worker is the standard specialist runtime."><select id="expert-runtime" className="v-field" value={data.runtime} onChange={event => setData('runtime', event.target.value)} disabled={processing}>{runtimes.map(runtime => <option key={runtime.value} value={runtime.value}>{runtime.label}</option>)}</select></Stacked>
        <div className="flex justify-end gap-3 border-t border-border pt-6"><button type="button" className="v-btn v-btn--ghost" disabled={processing} onClick={onDone}>Cancel</button><button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim() || !data.description.trim()}>{processing ? 'Creating…' : 'Create expert'}</button></div>
    </form>;
}
Experts.layout = (page: ReactNode) => <StudioLayout width="wide">{page}</StudioLayout>;
