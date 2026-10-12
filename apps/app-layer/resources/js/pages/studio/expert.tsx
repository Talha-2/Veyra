import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

import { runtimeLook } from '../../components/studio-agent/runtime';
import { EditorWell } from '../../components/studio-capability/editor-well';
import { SaveBar, Toggle } from '../../components/studio/form';
import { Disclosure, Fact, PageStack, Panel, SideCard, Stacked, WithSide } from '../../components/studio/space';
import { Callout, IconTile, List, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Mono } from '../../components/ui/primitives';
import StudioLayout from '../../layouts/studio-layout';

interface Props {
    expert: {
        id: number; slug: string; name: string; description: string; system_prompt: string | null;
        runtime: string; runtime_label: string; runtime_description: string; latency_critical: boolean;
        model: string | null; reasoning_effort: string | null; is_builtin: boolean; enabled: boolean;
        skill_ids: number[]; action_ids: number[];
    };
    all_skills: { id: number; name: string; description: string; gated: boolean; private: boolean }[];
    all_actions: { id: number; name: string; kind: string; durable: boolean }[];
    retired_private_skills: { id: number; name: string }[];
}

type Effort = '' | 'low' | 'medium' | 'high';

const EFFORTS: { value: Effort; label: string }[] = [
    { value: '', label: 'Default' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

/**
 * One expert. The main column is what it is told and what it can reach, in
 * the order a person fills them in; the model override is folded under
 * Advanced. Facts, how its runtime behaves and deleting it sit in the side
 * panel.
 */
export default function ExpertDetail({ expert, all_skills, all_actions, retired_private_skills }: Props) {
    const deletionError = usePage().props.errors.expert;
    const { data, setData, patch, processing, errors, isDirty, reset } = useForm({
        name: expert.name,
        description: expert.description,
        system_prompt: expert.system_prompt ?? '',
        model: expert.model ?? '',
        reasoning_effort: expert.reasoning_effort ?? '',
        enabled: expert.enabled,
        skill_ids: expert.skill_ids,
        action_ids: expert.action_ids,
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        patch(`/studio/experts/${expert.id}`, { preserveScroll: true });
    };

    const toggleId = (key: 'skill_ids' | 'action_ids', id: number) =>
        setData(key, data[key].includes(id) ? data[key].filter((x) => x !== id) : [...data[key], id]);

    const setAll = (key: 'skill_ids' | 'action_ids', ids: number[]) => setData(key, ids);

    const look = runtimeLook(expert.runtime);
    // Keep historical conversation profiles editable without presenting them as specialists.
    const talker = expert.runtime === 'talker';
    const legacy = expert.is_builtin || talker;
    // A rough rule of thumb (about four characters a token in English) — good
    // enough to show what a prompt costs on every turn, not a billing figure.
    const promptTokens = Math.ceil(data.system_prompt.length / 4);
    const writes = all_actions.filter((a) => a.durable && data.action_ids.includes(a.id)).length;
    const effort = (EFFORTS.some((e) => e.value === data.reasoning_effort) ? data.reasoning_effort : '') as Effort;
    const effortLabel = EFFORTS.find((e) => e.value === effort)?.label ?? 'Default';

    const destroy = () => {
        if (confirm(`Delete “${expert.name}”? It stops receiving specialist tasks. The skills and actions it used are kept.`)) {
            router.delete(`/studio/experts/${expert.id}`);
        }
    };

    return (
        <form onSubmit={submit}>
            <Head title={expert.name} />

            <PageHeader
                back={{ href: '/studio/experts', label: 'Experts' }}
                title={expert.name}
                description={expert.description}
                meta={
                    <>
                        <Badge tone={look.tone}>{expert.runtime_label}</Badge>
                        {expert.is_builtin && <Badge>Built-in</Badge>}
                        {data.enabled ? <Badge tone="success" dot>Enabled</Badge> : <Badge tone="warning" dot>Disabled</Badge>}
                    </>
                }
            />

            <PageStack>
                {legacy && <Callout tone="info">This is a preserved legacy profile. Its settings remain recoverable; <Link href="/studio/runtime" className="underline">Core runtime</Link> controls the current taker and worker.</Callout>}
                <WithSide
                    side={
                        <>
                            <SideCard title="At a glance">
                                <Fact label="Runtime">{expert.runtime_label}</Fact>
                                <Fact label="Type">{expert.is_builtin ? 'Built-in' : 'Custom'}</Fact>
                                <Fact label="Model">{data.model ? <span className="font-mono text-xs break-all">{data.model}</span> : <span className="text-secondary">Runtime default</span>}</Fact>
                                {!talker && (
                                    <>
                                        <Fact label="Reasoning">{effortLabel}</Fact>
                                        <Fact label="Skills">{all_skills.length} available</Fact>
                                        <Fact label="Tools">{writes > 0 ? `${data.action_ids.length} · ${writes} ${writes === 1 ? 'write' : 'writes'}` : data.action_ids.length}</Fact>
                                    </>
                                )}
                                <Fact label="Role">{legacy ? 'Preserved legacy profile' : data.enabled ? 'Optional specialist' : 'Disabled specialist'}</Fact>
                                <Fact label="Slug"><Mono className="break-all">{expert.slug}</Mono></Fact>
                            </SideCard>

                            <SideCard title={<span className="flex items-center gap-2.5"><IconTile tone={look.tone} size={28}><look.icon size={14} strokeWidth={1.9} /></IconTile>{legacy ? 'Legacy profile' : 'Specialist execution'}</span>}>
                                <p className="text-sm leading-relaxed text-secondary">{legacy ? 'These historical settings are preserved for reference. The core taker and worker run independently of expert profiles.' : 'The core worker delegates a task with the context this specialist needs. Its instructions, skill gate and history stay separate from the main conversation.'}</p>
                                <p className="mt-3 text-sm text-tertiary">
                                    {legacy ? 'Saving this profile does not replace core runtime settings.' : 'Returns results to the core worker. It cannot delegate to another expert.'}
                                </p>
                            </SideCard>

                            <SideCard title="Delete" tone="danger">
                                <p className="text-sm text-secondary">
                                    {expert.is_builtin
                                        ? 'This preserved built-in profile cannot be deleted. Configure current behavior in Core runtime.'
                                        : 'Removes this specialist. Reassign or share its private skills first. Shared skills and actions are kept.'}
                                </p>
                                <button type="button" className="v-btn v-btn--danger mt-4 w-full" onClick={destroy} disabled={expert.is_builtin}>
                                    <Trash2 size={14} strokeWidth={1.9} />
                                    Delete expert
                                </button>
                                {deletionError && <div className="mt-4"><Callout tone="warning">{deletionError}</Callout></div>}
                            </SideCard>
                            {retired_private_skills.length > 0 && <SideCard title="Deleted private skills">
                                <p className="text-sm leading-relaxed text-secondary">These skills still belong to this expert. Restore them to change their owner or make them shared.</p>
                                <ul className="mt-4 divide-y divide-border">{retired_private_skills.map(skill => <li key={skill.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <span className="min-w-0 break-words text-sm font-medium text-primary">{skill.name}</span>
                                    <Link href={`/studio/skills/${skill.id}/restore`} method="post" as="button" className="v-btn v-btn--quiet v-btn--sm">Restore skill</Link>
                                </li>)}</ul>
                            </SideCard>}
                        </>
                    }
                >
                    <Panel title="Identity" description={legacy ? 'Saved identity from the historical profile.' : 'Describe the specialty so the core worker knows when to delegate a task.'}>
                        <Stacked label="Name" htmlFor="expert-name" error={errors.name}>
                            <input id="expert-name" className="v-field max-w-md" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} />
                        </Stacked>
                        <Stacked label="When to delegate" htmlFor="expert-description" error={errors.description}
                            hint={legacy ? 'Preserved for reference.' : 'The core worker reads this description when choosing a specialist.'}
                            aside={<Mono style={{ color: data.description.length > 140 ? 'var(--warning)' : undefined }}>{data.description.length}/160</Mono>}>
                            <textarea id="expert-description" className="v-field text-base leading-relaxed" rows={3} value={data.description} maxLength={160} onChange={(e) => setData('description', e.target.value)} />
                        </Stacked>
                        <div className="border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                            <Toggle checked={data.enabled} onChange={(v) => setData('enabled', v)} label="Enabled"
                                hint="A disabled specialist cannot receive delegated work or run private skill tests. Its settings are kept."
                                 />
                        </div>
                    </Panel>

                    <Panel
                        title="Prompt"
                        description={legacy
                            ? 'Historical instructions remain editable for reference and recovery.'
                            : 'Instructions for this specialist’s isolated work. Put reusable procedures in shared or owned private skills.'}
                    >
                        <EditorWell
                            value={data.system_prompt}
                            onChange={(v) => setData('system_prompt', v)}
                            label="System prompt"
                            minRows={10}
                            error={errors.system_prompt}
                            trailing={<>About {promptTokens.toLocaleString()} tokens on every turn</>}
                            max={20000} placeholder={legacy ? 'Preserved profile instructions…' : 'You handle billing questions delegated by the core worker…'}
                        />
                    </Panel>

                    {talker ? (
                        <Panel title="Skills and tools" description="Fixed for the talker.">
                            <p className="text-sm text-secondary">
                                This historical conversation profile has no specialist skill or action grants. Configure conversation instructions in <Link href="/studio/runtime" className="text-accent-text hover:underline">Core runtime</Link>.
                            </p>
                        </Panel>
                    ) : (<>
                    {['private', 'shared'].map(audience => {
                        const skills = all_skills.filter(skill => skill.private === (audience === 'private'));
                        return <Panel key={audience} title={audience === 'private' ? 'Owned private skills' : 'Shared skills'} description={audience === 'private' ? 'Reserved for this expert. Other experts and the core worker cannot read these instructions.' : 'Enabled shared skills are available automatically, with no assignment required.'} aside={audience === 'private' && <Link href="/studio/skills?new=1" className="v-btn v-btn--quiet v-btn--sm">New skill</Link>}>
                            {skills.length === 0 ? <p className="text-base text-secondary">{audience === 'private' ? 'No private procedures yet. Create a skill and choose this expert as its owner.' : 'No enabled shared skills. Add procedures to the shared library.'}</p> : <ul className="divide-y divide-border">{skills.map(skill => <li key={skill.id}><Link href={`/studio/skills/${skill.id}`} className="block py-5 hover:text-accent-text"><span className="flex flex-wrap items-center gap-3"><span className="text-base font-medium">{skill.name}</span>{skill.gated && <Badge tone="info">Step-gated</Badge>}</span><p className="mt-2 max-w-[72ch] break-words text-base leading-relaxed text-secondary">{skill.description}</p></Link></li>)}</ul>}
                        </Panel>;
                    })}

                    <Panel
                        flush
                        title="Permitted actions"
                        description="Only explicitly granted actions can run. Reading a skill does not grant an action; approvals and customer scoping still apply."
                        aside={all_actions.length > 0 && (
                            <>
                                <Mono>{data.action_ids.length} of {all_actions.length}</Mono>
                                <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setAll('action_ids', data.action_ids.length === all_actions.length ? [] : all_actions.map((a) => a.id))}>
                                    {data.action_ids.length === all_actions.length ? 'Clear' : 'Select all'}
                                </button>
                            </>
                        )}
                    >
                        {all_actions.length === 0 ? (
                            <Empty>
                                No actions yet. Connect an app in <Link href="/studio/integrations" className="text-accent-text hover:underline">Integrations</Link> and its actions appear here.
                            </Empty>
                        ) : (
                            <Checklist>
                                {all_actions.map((a) => (
                                    <CheckRow key={a.id} checked={data.action_ids.includes(a.id)} onChange={() => toggleId('action_ids', a.id)}
                                        title={a.name} subtitle={a.kind}
                                        trailing={a.durable ? <Badge tone="warning">Writes</Badge> : <Badge>Reads</Badge>} />
                                ))}
                            </Checklist>
                        )}
                    </Panel>
                    </>)}

                    <Disclosure
                        title="Advanced"
                        summary={legacy ? `Preserved model: ${data.model || 'default'}` : `Model: ${data.model || 'core worker default'} · Reasoning: ${effortLabel.toLowerCase()}`}
                        defaultOpen={!!errors.model || !!errors.reasoning_effort}
                    >
                        <p className="text-sm text-secondary">
                            {talker
                                ? <>This is a preserved model setting. Configure the current taker model in <Link href="/studio/runtime" className="text-accent-text hover:underline">Core runtime</Link>.</>
                                : 'Leave these blank to inherit the core worker model and reasoning settings. Override them for this specialist when needed.'}
                        </p>
                        <Stacked label="Model" htmlFor="expert-model" error={errors.model}
                            hint={expert.latency_critical ? 'Latency-critical: a bigger model here is heard as a pause. Written as provider:model, for example openai:gpt-4o-mini.' : 'Quality-critical: tool use and long instructions. Written as provider:model, for example openai:gpt-4.1-mini. Used in voice, chat, Ask and skill tests.'}>
                            <input id="expert-model" className="v-field max-w-md font-mono text-sm" value={data.model} onChange={(e) => setData('model', e.target.value)} maxLength={120} placeholder={talker ? 'Preserved setting' : 'Core worker default'} />
                        </Stacked>
                        {!talker && (
                            <Stacked label="Reasoning effort" error={errors.reasoning_effort} hint="Higher thinks longer before acting: better on hard tasks, slower on every one. Applies in voice, chat, Ask and skill tests; a model without a reasoning setting ignores it.">
                                <SegmentedControl<Effort> value={effort} onChange={(v) => setData('reasoning_effort', v)} options={EFFORTS} />
                            </Stacked>
                        )}
                    </Disclosure>
                </WithSide>
            </PageStack>

            <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
        </form>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="px-7 pb-7 text-sm text-secondary">{children}</p>;
}

function Checklist({ children }: { children: ReactNode }) {
    return (
        <div style={{ borderTop: '1px solid var(--separator)' }}>
            <List>{children}</List>
        </div>
    );
}

/** A checkable row, 56px or more: the whole row is the hit target. */
function CheckRow({ checked, onChange, title, subtitle, trailing }: { checked: boolean; onChange: () => void; title: string; subtitle?: string; trailing?: ReactNode }) {
    return (
        <label className="flex min-h-14 cursor-pointer flex-wrap items-start gap-4 px-7 py-5 transition-colors last:rounded-b-lg hover:bg-surface-hover" style={{ background: checked ? 'color-mix(in srgb, var(--accent) 3%, transparent)' : undefined }}>
            <input type="checkbox" className="shrink-0" checked={checked} onChange={onChange} />
            <span className="min-w-0 flex-1">
                <span className="block break-words text-base font-medium" style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{title}</span>
                {subtitle && <span className="mt-1 block break-words text-base leading-relaxed text-secondary">{subtitle}</span>}
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
        </label>
    );
}

ExpertDetail.layout = (page: ReactNode) => <StudioLayout width="wide">{page}</StudioLayout>;
