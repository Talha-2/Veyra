import { Head, Link, router, useForm } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

import { runtimeLook } from '../../components/studio-agent/runtime';
import { EditorWell } from '../../components/studio-capability/editor-well';
import { SaveBar, Toggle } from '../../components/studio/form';
import { Disclosure, Fact, PageStack, Panel, SideCard, Stacked, WithSide } from '../../components/studio/space';
import { IconTile, List, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Mono } from '../../components/ui/primitives';

interface Props {
    expert: {
        id: number; slug: string; name: string; description: string; system_prompt: string | null;
        runtime: string; runtime_label: string; runtime_description: string; latency_critical: boolean;
        model: string | null; reasoning_effort: string | null; is_builtin: boolean; enabled: boolean;
        skill_ids: number[]; action_ids: number[];
        /** The first enabled expert of its runtime. */
        primary: boolean;
        /** Other enabled experts on the same runtime. */
        siblings: number;
    };
    all_skills: { id: number; name: string; description: string; gated: boolean }[];
    all_actions: { id: number; name: string; kind: string; durable: boolean }[];
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
export default function ExpertDetail({ expert, all_skills, all_actions }: Props) {
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
    // The talker's tools are fixed (answer from knowledge, hand off to the
    // worker) and it runs through the voice pipeline, which has no reasoning
    // setting: only its prompt and model take effect, so only those are offered.
    const talker = expert.runtime === 'talker';
    // A rough rule of thumb (about four characters a token in English) — good
    // enough to show what a prompt costs on every turn, not a billing figure.
    const promptTokens = Math.ceil(data.system_prompt.length / 4);
    const writes = all_actions.filter((a) => a.durable && data.action_ids.includes(a.id)).length;
    const effort = (EFFORTS.some((e) => e.value === data.reasoning_effort) ? data.reasoning_effort : '') as Effort;
    const effortLabel = EFFORTS.find((e) => e.value === effort)?.label ?? 'Default';

    const destroy = () => {
        if (confirm(`Delete “${expert.name}”? It stops handling calls immediately. The skills and actions it used are kept.`)) {
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
                                        <Fact label="Skills">{data.skill_ids.length} of {all_skills.length}</Fact>
                                        <Fact label="Tools">{writes > 0 ? `${data.action_ids.length} · ${writes} ${writes === 1 ? 'write' : 'writes'}` : data.action_ids.length}</Fact>
                                    </>
                                )}
                                <Fact label="Role">{roleLabel(expert)}</Fact>
                                <Fact label="Slug"><Mono className="break-all">{expert.slug}</Mono></Fact>
                            </SideCard>

                            <SideCard title={<span className="flex items-center gap-2.5"><IconTile tone={look.tone} size={28}><look.icon size={14} strokeWidth={1.9} /></IconTile>How a {expert.runtime} runs</span>}>
                                <p className="text-sm text-secondary">{expert.runtime_description}</p>
                                <p className="mt-3 text-sm text-tertiary">
                                    {expert.latency_critical
                                        ? 'Latency is the budget here: every word of prompt and every extra tool is paid before the caller hears anything.'
                                        : 'Quality is the budget here: it works behind the talker, so a slower, stronger model is affordable.'}
                                </p>
                            </SideCard>

                            <SideCard title="Delete" tone="danger">
                                <p className="text-sm text-secondary">
                                    {expert.is_builtin
                                        ? <>Built-in experts cannot be deleted. Turn off <span className="font-medium text-primary">Enabled</span> instead to take it out of calls.</>
                                        : 'Removes it from every call at once. The skills and actions it used are kept.'}
                                </p>
                                <button type="button" className="v-btn v-btn--danger mt-4 w-full" onClick={destroy} disabled={expert.is_builtin}>
                                    <Trash2 size={14} strokeWidth={1.9} />
                                    Delete expert
                                </button>
                            </SideCard>
                        </>
                    }
                >
                    <Panel title="Identity" description={talker ? 'How your team tells this talker apart. The talker is not routed to; it is the voice.' : 'The description is how the agent decides to hand a task to this expert, so say what it handles.'}>
                        <Stacked label="Name" htmlFor="expert-name" error={errors.name}>
                            <input id="expert-name" className="v-field max-w-md" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} />
                        </Stacked>
                        <Stacked label="One-line description" htmlFor="expert-description" error={errors.description}
                            hint={talker ? 'For your team. Not sent to the model.' : 'Every other expert’s routing block includes this line, so its length is paid on every turn of every call.'}
                            aside={<Mono style={{ color: data.description.length > 140 ? 'var(--warning)' : undefined }}>{data.description.length}/160</Mono>}>
                            <input id="expert-description" className="v-field" value={data.description} maxLength={160} onChange={(e) => setData('description', e.target.value)} />
                        </Stacked>
                        <div className="border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                            <Toggle checked={data.enabled} onChange={(v) => setData('enabled', v)} label="Enabled"
                                hint="A disabled expert is never routed to. Its settings are kept."
                                caution={expert.is_builtin && !data.enabled ? 'Disabling a built-in expert removes half of every call. Only do this to test a replacement.' : undefined} />
                        </div>
                    </Panel>

                    <Panel
                        title="Prompt"
                        description={expert.latency_critical
                            ? 'This expert speaks, on a small fast model. Shorter prompts mean faster first words — keep it to what it needs to hold a conversation.'
                            : 'This expert never speaks and runs on a larger model. It can afford detail, but the skills carry the procedures; keep the prompt to principles.'}
                    >
                        <EditorWell
                            value={data.system_prompt}
                            onChange={(v) => setData('system_prompt', v)}
                            label="System prompt"
                            minRows={10}
                            error={errors.system_prompt}
                            trailing={<>About {promptTokens.toLocaleString()} tokens on every turn</>}
                            placeholder={expert.latency_critical ? 'You are the voice of the business on the phone…' : 'You carry out tasks for the talker…'}
                        />
                    </Panel>

                    {talker ? (
                        <Panel title="Skills and tools" description="Fixed for the talker.">
                            <p className="text-sm text-secondary">
                                The talker answers from your knowledge and hands everything else to the worker, so it has no skills or actions of its own.
                                Grant skills and actions to a <Link href="/studio/experts" className="text-accent-text hover:underline">worker expert</Link>.
                            </p>
                        </Panel>
                    ) : (<>
                    <Panel
                        flush
                        title="Skills"
                        description="Only each skill’s name and description go into the prompt. The body is read when the expert decides it is relevant."
                        aside={all_skills.length > 0 && (
                            <>
                                <Mono>{data.skill_ids.length} of {all_skills.length}</Mono>
                                <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => setAll('skill_ids', data.skill_ids.length === all_skills.length ? [] : all_skills.map((s) => s.id))}>
                                    {data.skill_ids.length === all_skills.length ? 'Clear' : 'Select all'}
                                </button>
                            </>
                        )}
                    >
                        {all_skills.length === 0 ? (
                            <Empty>
                                No skills yet. A skill is a procedure the expert can follow — <Link href="/studio/skills" className="text-accent-text hover:underline">write the first one</Link>.
                            </Empty>
                        ) : (
                            <Checklist>
                                {all_skills.map((s) => (
                                    <CheckRow key={s.id} checked={data.skill_ids.includes(s.id)} onChange={() => toggleId('skill_ids', s.id)}
                                        title={s.name} subtitle={s.description}
                                        trailing={s.gated && <Badge tone="info">Step-gated</Badge>} />
                                ))}
                            </Checklist>
                        )}
                    </Panel>

                    <Panel
                        flush
                        title="Tools"
                        description="The actions this expert may call. Writes are durable: the talker waits for them to finish before hanging up."
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
                        summary={talker ? `Model: ${data.model || 'Identity default'}` : `Model: ${data.model || 'runtime default'} · Reasoning: ${effortLabel.toLowerCase()}`}
                        defaultOpen={!!errors.model || !!errors.reasoning_effort}
                    >
                        <p className="text-sm text-secondary">
                            {talker
                                ? <>Leave it on default to use the talker model set on <Link href="/studio/agent#models" className="text-accent-text hover:underline">Identity → Models</Link>. A model here replaces it in voice sessions.</>
                                : 'Leave both on default and the runtime decides. Override only when this expert needs something the default cannot do.'}
                        </p>
                        <Stacked label="Model" htmlFor="expert-model" error={errors.model}
                            hint={expert.latency_critical ? 'Latency-critical: a bigger model here is heard as a pause. Written as provider:model, for example openai:gpt-4o-mini.' : 'Quality-critical: tool use and long instructions. Written as provider:model, for example openai:gpt-4.1-mini. Used in voice, chat, Ask and skill tests.'}>
                            <input id="expert-model" className="v-field max-w-md font-mono text-sm" value={data.model} onChange={(e) => setData('model', e.target.value)} placeholder={talker ? 'Identity default' : 'Runtime default'} />
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

/** How the agent layer uses this expert, in a few words. */
function roleLabel(expert: Props['expert']): string {
    if (!expert.enabled) return 'Not used (disabled)';
    if (expert.runtime === 'talker') return expert.primary ? 'Speaks in voice sessions' : 'Not used: an earlier talker speaks';
    if (expert.runtime === 'text') return expert.primary ? 'Starts every Ask thread' : 'Ask hands tasks to it';
    if (!expert.primary) return 'Gets tasks that fit its description';
    return expert.siblings > 0 ? 'Starts each conversation, hands off to others' : 'Handles every task';
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
        <label className="flex min-h-14 cursor-pointer items-center gap-4 px-7 py-3.5 transition-colors last:rounded-b-lg hover:bg-surface-hover" style={{ background: checked ? 'color-mix(in srgb, var(--accent) 3%, transparent)' : undefined }}>
            <input type="checkbox" className="shrink-0" checked={checked} onChange={onChange} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium" style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{title}</span>
                {subtitle && <span className="mt-0.5 block truncate text-sm text-tertiary">{subtitle}</span>}
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
        </label>
    );
}
