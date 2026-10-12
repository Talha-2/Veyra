import { Head, Link, useForm } from '@inertiajs/react';
import { ChevronRight, FileText, ListOrdered, LockKeyhole, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { ChoiceCard } from '../../components/studio-capability/choice-card';
import { useCreateParam } from '../../components/studio-capability/use-create-param';
import { Stacked } from '../../components/studio/space';
import Sidebar from '../../components/ui/sidebar';
import { Callout, Card, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Mono, RelativeTime } from '../../components/ui/primitives';
import StudioLayout from '../../layouts/studio-layout';

interface SkillRow {
    id: number; slug: string; name: string; description: string;
    execution_mode: string; mode_label: string; enabled: boolean; version: number;
    experts_count: number; experts?: { id: number; name: string }[];
    updated_by: string | null; updated_at: string | null;
    private_expert: { id: number; name: string } | null;
}
interface Mode { value: string; label: string; description: string; caution: string | null }
interface Owner { id: number; name: string; enabled: boolean }

const modeIcon = (mode: string, size = 16) =>
    mode === 'gated' ? <ListOrdered size={size} strokeWidth={1.9} /> : <FileText size={size} strokeWidth={1.9} />;

export default function Skills({ skills, modes, private_experts }: { skills: SkillRow[]; modes: Mode[]; private_experts: Owner[] }) {
    const [creating, setCreating] = useCreateParam();
    const [filter, setFilter] = useState<string>('all');
    const [query, setQuery] = useState('');
    const [audience, setAudience] = useState('all');
    const [busy, setBusy] = useState(false);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: skills.length, off: skills.filter((s) => !s.enabled).length };
        for (const m of modes) c[m.value] = skills.filter((s) => s.execution_mode === m.value).length;
        return c;
    }, [skills, modes]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return skills.filter((s) => {
            if (filter === 'off' ? s.enabled : filter !== 'all' && s.execution_mode !== filter) return false;
            if (audience === 'shared' && s.private_expert || audience === 'private' && !s.private_expert) return false;
            if (!q) return true;
            return [s.name, s.description, s.private_expert?.name ?? '', ...(s.experts ?? []).map((e) => e.name)].some((t) => t.toLowerCase().includes(q));
        });
    }, [skills, filter, query, audience]);

    const filterOptions = [
        { value: 'all', label: <FilterLabel text="All" count={counts.all} /> },
        ...modes.map((m) => ({ value: m.value, label: <FilterLabel text={m.label} count={counts[m.value] ?? 0} /> })),
        ...(counts.off > 0 ? [{ value: 'off', label: <FilterLabel text="Off" count={counts.off} /> }] : []),
    ];

    return (
        <>
            <Head title="Skills" />

            <PageHeader
                title="Skills"
                description="Give the agent a clear procedure to follow. Keep shared skills in the main library, and reserve specialist instructions for one expert."
                actions={
                    <button type="button" className="v-btn v-btn--primary" onClick={() => setCreating(true)}>
                        <Plus size={15} strokeWidth={2} />
                        New skill
                    </button>
                }
            />

            {skills.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Sparkles size={22} strokeWidth={1.6} />}
                        title="No skills yet"
                        action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setCreating(true)}>Write the first skill</button>}
                    >
                        The agent already answers from its prompt and the knowledge base. Skills are for things it should do, the same way every time: book a visit, take a payment, check who is calling.
                    </EmptyState>
                </Card>
            ) : (
                <div className="pt-3">
                    <div className="mb-2">
                        <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search skills and experts" className="w-full sm:w-70" />}>
                            <SegmentedControl value={filter} onChange={setFilter} options={filterOptions} />
                        </Toolbar>
                    </div>
                    <div className="mb-6 flex flex-wrap items-center gap-3">
                        <label htmlFor="skill-audience" className="text-sm font-medium text-secondary">Audience</label>
                        <select id="skill-audience" className="v-field w-auto" value={audience} onChange={event => setAudience(event.target.value)}>
                            <option value="all">All skills</option><option value="shared">Shared library</option><option value="private">Expert-private</option>
                        </select>
                        <p className="text-sm text-secondary">{visible.length} of {skills.length} skills</p>
                    </div>

                    <Card>
                        {visible.length === 0 ? (
                            <EmptyState
                                icon={<Sparkles size={22} strokeWidth={1.6} />}
                                title={query ? `No skills match “${query.trim()}”` : 'Nothing in this view'}
                                action={<button type="button" className="v-btn v-btn--ghost" onClick={() => { setQuery(''); setFilter('all'); setAudience('all'); }}>Show all skills</button>}
                            >
                                Search looks at a skill's name, when it is used, and the experts that have it.
                            </EmptyState>
                        ) : (
                            <ul className="divide-y divide-border">
                                {visible.map((s) => <SkillListRow key={s.id} skill={s} />)}
                            </ul>
                        )}
                    </Card>

                    <p className="mt-4 px-1 text-sm text-tertiary">
                        {visible.length === skills.length ? `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}` : `Showing ${visible.length} of ${skills.length} skills`}
                        {' · '}Shared skills stay in the main library. Private skills belong to one expert.
                    </p>
                </div>
            )}

            <Sidebar open={creating} onClose={() => { if (!busy) setCreating(false); }} title="New skill" description="Choose who can use it, then write its instructions on the next screen." width={640}>
                <CreateForm modes={modes} owners={private_experts} onBusy={setBusy} onDone={() => setCreating(false)} />
            </Sidebar>
        </>
    );
}

function FilterLabel({ text, count }: { text: string; count: number }) {
    return (
        <>
            {text}
            <span className="text-2xs text-tertiary tabular-nums">{count}</span>
        </>
    );
}

function SkillListRow({ skill: s }: { skill: SkillRow }) {
    const href = `/studio/skills/${s.id}`;
    const gated = s.execution_mode === 'gated';

    return (
        <li>
            <Link href={href} className="group flex flex-col gap-4 px-6 py-6 transition-colors hover:bg-surface-hover sm:flex-row sm:items-start sm:gap-6 sm:px-8">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3"><h2 className="break-words text-lg font-semibold text-primary">{s.name}</h2><Mono>v{s.version}</Mono><Badge tone={s.enabled ? 'success' : 'muted'} dot>{s.enabled ? 'Enabled' : 'Disabled'}</Badge></div>
                    <p className="mt-2 max-w-[72ch] break-words text-base leading-relaxed text-secondary">{s.description}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-secondary">
                        <span className="flex items-center gap-2">{modeIcon(s.execution_mode)}{gated ? s.mode_label : 'Instructions'}</span>
                        <span className="flex items-center gap-2">{s.private_expert && <LockKeyhole size={15} />} {s.private_expert ? `Private · ${s.private_expert.name}` : 'Shared library'}</span>
                        <span>Updated <RelativeTime at={s.updated_at} /></span>
                    </div>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary sm:pt-1">Open skill <ChevronRight size={16} /></span>
            </Link>
        </li>
    );
}

function CreateForm({ modes, owners, onBusy, onDone }: { modes: Mode[]; owners: Owner[]; onBusy: (busy: boolean) => void; onDone: () => void }) {
    const [privateSkill, setPrivateSkill] = useState(false);
    const { data, setData, post, processing, errors } = useForm({ name: '', description: '', execution_mode: 'prose', private_expert_id: null as number | null });
    const mode = modes.find((m) => m.value === data.execution_mode);

    const submit = (e: FormEvent) => { e.preventDefault(); if (privateSkill && data.private_expert_id === null) return; post('/studio/skills', { onStart: () => onBusy(true), onFinish: () => onBusy(false), onSuccess: onDone }); };

    return (
        <form onSubmit={submit}>
            <fieldset disabled={processing} className="flex min-w-0 flex-col gap-6 border-0 p-0">
            <Stacked label="Name" htmlFor="skill-name" error={errors.name}>
                <input id="skill-name" className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Reschedule a visit" maxLength={80} autoFocus />
            </Stacked>
            <Stacked label="When to use it" htmlFor="skill-when" error={errors.description}
                hint="The agent reads only this line to decide whether to open the skill, so say when, not how."
                aside={<Mono>{data.description.length}/200</Mono>}>
                <textarea id="skill-when" className="v-field" rows={3} value={data.description} maxLength={200} onChange={(e) => setData('description', e.target.value)}
                    placeholder="When a caller wants to move or cancel a booked visit." />
            </Stacked>

            <Stacked label="Who can use it" htmlFor="new-skill-audience">
                <select id="new-skill-audience" className="v-field" value={privateSkill ? 'private' : 'shared'} onChange={event => { setPrivateSkill(event.target.value === 'private'); setData('private_expert_id', null); }}>
                    <option value="shared">Shared library</option><option value="private">One expert only</option>
                </select>
            </Stacked>
            {privateSkill && <Stacked label="Expert owner" htmlFor="new-skill-owner" error={errors.private_expert_id}>
                <select id="new-skill-owner" className="v-field" required value={data.private_expert_id ?? ''} onChange={event => setData('private_expert_id', event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Choose an expert</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}{!owner.enabled ? ' (disabled)' : ''}</option>)}
                </select>
                {owners.length === 0 && <p className="mt-2 text-sm text-secondary">Create a company expert first from <Link href="/studio/experts" className="text-accent-text underline">Experts</Link>.</p>}
                <p className="mt-2 text-sm leading-relaxed text-secondary">Kept outside the main skill library. Its enabled owner can run these instructions in an isolated expert context. Test the saved skill after creating it.</p>
            </Stacked>}

            <Stacked label="How it runs" error={errors.execution_mode}>
                <div role="radiogroup" aria-label="How it runs" className="grid gap-3 sm:grid-cols-2">
                    {modes.map((m) => (
                        <ChoiceCard key={m.value} selected={data.execution_mode === m.value} onSelect={() => setData('execution_mode', m.value)}
                            icon={modeIcon(m.value)} title={m.label} description={m.description} />
                    ))}
                </div>
            </Stacked>

            {mode?.caution && <Callout tone="warning">{mode.caution}</Callout>}

            <div className="mt-2 flex justify-end gap-2 border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                <button type="button" className="v-btn v-btn--ghost" onClick={onDone} disabled={processing}>Cancel</button>
                <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim() || !data.description.trim() || privateSkill && data.private_expert_id === null}>
                    {processing ? 'Creating…' : 'Create skill'}
                </button>
            </div>
            </fieldset>
        </form>
    );
}

Skills.layout = (page: ReactNode) => <StudioLayout width="wide">{page}</StudioLayout>;
