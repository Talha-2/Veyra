import { Head, router, useForm } from '@inertiajs/react';
import { ChevronRight, FileText, ListOrdered, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import { ChoiceCard } from '../../components/studio-capability/choice-card';
import { useCreateParam } from '../../components/studio-capability/use-create-param';
import { Field } from '../../components/studio/form';
import Dialog from '../../components/ui/dialog';
import { Callout, Card, IconTile, List, ListRow, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, Mono, RelativeTime } from '../../components/ui/primitives';

interface SkillRow {
    id: number; slug: string; name: string; description: string;
    execution_mode: string; mode_label: string; enabled: boolean; version: number;
    experts_count: number; experts?: { id: number; name: string }[];
    updated_by: string | null; updated_at: string | null;
}
interface Mode { value: string; label: string; description: string; caution: string | null }

const modeIcon = (mode: string, size = 16) =>
    mode === 'gated' ? <ListOrdered size={size} strokeWidth={1.9} /> : <FileText size={size} strokeWidth={1.9} />;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export default function Skills({ skills, modes }: { skills: SkillRow[]; modes: Mode[] }) {
    const [creating, setCreating] = useCreateParam();
    const [filter, setFilter] = useState<string>('all');
    const [query, setQuery] = useState('');

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: skills.length, off: skills.filter((s) => !s.enabled).length };
        for (const m of modes) c[m.value] = skills.filter((s) => s.execution_mode === m.value).length;
        return c;
    }, [skills, modes]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return skills.filter((s) => {
            if (filter === 'off' ? s.enabled : filter !== 'all' && s.execution_mode !== filter) return false;
            if (!q) return true;
            return [s.name, s.description, ...(s.experts ?? []).map((e) => e.name)].some((t) => t.toLowerCase().includes(q));
        });
    }, [skills, filter, query]);

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
                description="Pages of instructions the agent opens when a conversation calls for them. Most are prose. A procedure that must not be improvised, like a payment or an identity check, runs one step at a time."
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
                <>
                    <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search skills and experts" className="w-full sm:w-70" />}>
                        <SegmentedControl value={filter} onChange={setFilter} options={filterOptions} />
                    </Toolbar>

                    <Card>
                        {visible.length === 0 ? (
                            <EmptyState
                                icon={<Sparkles size={22} strokeWidth={1.6} />}
                                title={query ? `No skills match “${query.trim()}”` : 'Nothing in this view'}
                                action={<button type="button" className="v-btn v-btn--ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Show all skills</button>}
                            >
                                Search looks at a skill's name, when it is used, and the experts that have it.
                            </EmptyState>
                        ) : (
                            <List>
                                {visible.map((s) => <SkillListRow key={s.id} skill={s} />)}
                            </List>
                        )}
                    </Card>

                    <p className="mt-3 px-1 text-xs text-tertiary">
                        {visible.length === skills.length ? `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}` : `Showing ${visible.length} of ${skills.length} skills`}
                        {' · '}A skill does nothing until it is granted to an expert.
                    </p>
                </>
            )}

            <Dialog open={creating} onClose={() => setCreating(false)} title="New skill" description="Name it and say when the agent should reach for it. You write the instructions on the next screen." width={580}>
                <CreateForm modes={modes} onDone={() => setCreating(false)} />
            </Dialog>
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
    const experts = s.experts ?? [];
    const gated = s.execution_mode === 'gated';

    return (
        <ListRow
            href={href}
            onClick={() => router.visit(href)}
            dim={!s.enabled}
            leading={<IconTile tone={gated ? 'info' : 'muted'}>{modeIcon(s.execution_mode)}</IconTile>}
            title={
                <span className="flex items-center gap-2">
                    <span className="truncate">{s.name}</span>
                    <Mono className="shrink-0">v{s.version}</Mono>
                </span>
            }
            subtitle={s.description}
            trailing={
                <>
                    <span className="hidden items-center gap-2 md:flex" title={experts.map((e) => e.name).join(', ') || undefined}>
                        {s.experts_count === 0 ? (
                            <Badge tone="warning">No expert yet</Badge>
                        ) : (
                            <>
                                <span className="flex -space-x-1.5">
                                    {experts.slice(0, 3).map((e) => (
                                        <span key={e.id} className="rounded-full" style={{ boxShadow: '0 0 0 2px var(--surface)' }}>
                                            <Avatar initials={initials(e.name)} name={e.name} size={22} />
                                        </span>
                                    ))}
                                </span>
                                <span className="max-w-35 truncate text-xs text-secondary">
                                    {experts.length > 0 ? experts[0].name : `${s.experts_count} experts`}
                                    {s.experts_count > 1 && <span className="text-tertiary"> +{s.experts_count - 1}</span>}
                                </span>
                            </>
                        )}
                    </span>
                    <span className="hidden w-23 justify-end lg:flex">
                        <Badge tone={gated ? 'info' : 'muted'}>{s.mode_label}</Badge>
                    </span>
                    <span className="flex w-12 justify-end">
                        <Badge tone={s.enabled ? 'success' : 'muted'} dot>{s.enabled ? 'On' : 'Off'}</Badge>
                    </span>
                    <span className="hidden w-16 justify-end sm:flex"><RelativeTime at={s.updated_at} /></span>
                    <ChevronRight size={15} strokeWidth={2} className="text-tertiary" />
                </>
            }
        />
    );
}

function CreateForm({ modes, onDone }: { modes: Mode[]; onDone: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', description: '', execution_mode: 'prose' });
    const mode = modes.find((m) => m.value === data.execution_mode);

    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/skills', { onSuccess: onDone }); };

    return (
        <form onSubmit={submit}>
            <Field label="Name" error={errors.name}>
                <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Reschedule a visit" maxLength={80} autoFocus />
            </Field>
            <Field label="When to use it" error={errors.description}
                hint={`${data.description.length}/200. The agent reads only this line to decide whether to open the skill, so say when, not how.`}>
                <input className="v-field" value={data.description} maxLength={200} onChange={(e) => setData('description', e.target.value)}
                    placeholder="When a caller wants to move or cancel a booked visit." />
            </Field>

            <div className="mb-5">
                <span className="v-label">How it runs</span>
                <div role="radiogroup" aria-label="How it runs" className="grid gap-2 sm:grid-cols-2">
                    {modes.map((m) => (
                        <ChoiceCard key={m.value} selected={data.execution_mode === m.value} onSelect={() => setData('execution_mode', m.value)}
                            icon={modeIcon(m.value)} title={m.label} description={m.description} />
                    ))}
                </div>
                {errors.execution_mode && <p className="mt-1.5 text-sm text-danger">{errors.execution_mode}</p>}
            </div>

            {mode?.caution && <div className="mb-5"><Callout tone="warning">{mode.caution}</Callout></div>}

            <div className="flex justify-end gap-2">
                <button type="button" className="v-btn v-btn--ghost" onClick={onDone}>Cancel</button>
                <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim() || !data.description.trim()}>
                    {processing ? 'Creating…' : 'Create skill'}
                </button>
            </div>
        </form>
    );
}
