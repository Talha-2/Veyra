import { Head, Link, router, useForm } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

import { runtimeLook } from '../../components/studio-agent/runtime';
import { Field, SaveBar, Section, Toggle } from '../../components/studio/form';
import { Card, CardBody, CardHeader, IconTile, KeyValues, List, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Mono } from '../../components/ui/primitives';

interface Props {
    expert: {
        id: number; slug: string; name: string; description: string; system_prompt: string | null;
        runtime: string; runtime_label: string; runtime_description: string; latency_critical: boolean;
        model: string | null; reasoning_effort: string | null; is_builtin: boolean; enabled: boolean;
        skill_ids: number[]; action_ids: number[];
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
 * One expert, as a detail page: what it is told and what it can reach in the
 * main column, in the order a person fills them in; the facts, how its
 * runtime behaves and the way to delete it in a sticky inspector.
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
    const promptChars = data.system_prompt.length;
    // A rough rule of thumb (about four characters a token in English) — good
    // enough to show what a prompt costs on every turn, not a billing figure.
    const promptTokens = Math.ceil(promptChars / 4);
    const writes = all_actions.filter((a) => a.durable && data.action_ids.includes(a.id)).length;
    const effort = (EFFORTS.some((e) => e.value === data.reasoning_effort) ? data.reasoning_effort : '') as Effort;

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

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                    <Section title="Identity" description="How other experts see this one when deciding whether to hand off.">
                        <Field inline label="Name" error={errors.name}>
                            <input className="v-field max-w-[320px]" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} />
                        </Field>
                        <Field inline label="One-line description" error={errors.description}
                            hint="Every other expert’s routing block includes this line, so its length is paid on every turn of every call.">
                            <input className="v-field" value={data.description} maxLength={160} onChange={(e) => setData('description', e.target.value)} />
                            <div className="mt-1.5 text-right text-2xs tabular-nums" style={{ color: data.description.length > 140 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{data.description.length}/160</div>
                        </Field>
                        <Toggle checked={data.enabled} onChange={(v) => setData('enabled', v)} label="Enabled"
                            hint="A disabled expert is never routed to. Its settings are kept."
                            caution={expert.is_builtin && !data.enabled ? 'Disabling a built-in expert removes half of every call. Only do this to test a replacement.' : undefined} />
                    </Section>

                    <Section
                        title="Prompt"
                        description={expert.latency_critical
                            ? 'This expert speaks, on a small fast model. Shorter prompts mean faster first words — keep it to what it needs to hold a conversation.'
                            : 'This expert never speaks and runs on a larger model. It can afford detail, but the skills carry the procedures; keep the prompt to principles.'}
                        aside={<Mono>{promptChars.toLocaleString()} chars · ~{promptTokens.toLocaleString()} tokens</Mono>}
                    >
                        <textarea className="v-field h-auto font-mono text-sm leading-relaxed" rows={14} value={data.system_prompt} onChange={(e) => setData('system_prompt', e.target.value)} dir="auto"
                            placeholder={expert.latency_critical ? 'You are the voice of the business on the phone…' : 'You carry out tasks for the talker…'} aria-label="System prompt" />
                        {errors.system_prompt && <p className="mt-1.5 text-sm text-danger">{errors.system_prompt}</p>}
                    </Section>

                    <Section title="Model" description="Leave both on default and the runtime decides. Override only when this expert needs something the default cannot do.">
                        <Field inline label="Model" error={errors.model}
                            hint={expert.latency_critical ? 'Latency-critical: a bigger model here is heard as a pause.' : 'Quality-critical: tool use and long instructions. The agent layer resolves the provider.'}>
                            <input className="v-field max-w-[320px] font-mono text-sm" value={data.model} onChange={(e) => setData('model', e.target.value)} placeholder="Runtime default" />
                        </Field>
                        <Field inline label="Reasoning effort" error={errors.reasoning_effort}
                            hint="Higher thinks longer before acting: better on hard tasks, slower on every one.">
                            <SegmentedControl<Effort> value={effort} onChange={(v) => setData('reasoning_effort', v)} options={EFFORTS} />
                        </Field>
                    </Section>

                    <Section
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
                                        trailing={s.gated && <Badge tone="warning">Step-gated</Badge>} />
                                ))}
                            </Checklist>
                        )}
                    </Section>

                    <Section
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
                                        trailing={a.durable && <Badge tone="info">Writes</Badge>} />
                                ))}
                            </Checklist>
                        )}
                    </Section>

                    <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
                </div>

                {/* Inspector. */}
                <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
                    <Card>
                        <CardHeader title="At a glance" />
                        <CardBody>
                            <KeyValues
                                items={[
                                    { label: 'Runtime', value: expert.runtime_label },
                                    { label: 'Status', value: data.enabled ? 'Enabled' : <span className="text-warning">Disabled</span> },
                                    { label: 'Type', value: expert.is_builtin ? 'Built-in' : 'Custom' },
                                    { label: 'Model', value: data.model ? <span className="font-mono text-xs break-all">{data.model}</span> : <span className="text-secondary">Runtime default</span> },
                                    { label: 'Reasoning', value: EFFORTS.find((e) => e.value === effort)?.label ?? 'Default' },
                                    { label: 'Skills', value: `${data.skill_ids.length} of ${all_skills.length}` },
                                    { label: 'Tools', value: writes > 0 ? `${data.action_ids.length} · ${writes} ${writes === 1 ? 'write' : 'writes'}` : `${data.action_ids.length}` },
                                    { label: 'Slug', value: <Mono className="break-all">{expert.slug}</Mono> },
                                ]}
                            />
                        </CardBody>
                    </Card>

                    <Card padded>
                        <div className="flex items-center gap-2.5">
                            <IconTile tone={look.tone} size={30}><look.icon size={15} strokeWidth={1.9} /></IconTile>
                            <h2 className="text-md font-semibold text-primary">How a {expert.runtime} runs</h2>
                        </div>
                        <p className="mt-3 text-sm text-secondary">{expert.runtime_description}</p>
                        <p className="mt-2 text-sm text-tertiary">
                            {expert.latency_critical
                                ? 'Latency is the budget here: every word of prompt and every extra tool is paid before the caller hears anything.'
                                : 'Quality is the budget here: it works behind the talker, so a slower, stronger model is affordable.'}
                        </p>
                    </Card>

                    <Card className="border-(--danger-border)">
                        <CardHeader title="Danger zone" border={false} />
                        <div className="px-5 pb-5">
                            {expert.is_builtin ? (
                                <>
                                    <p className="text-sm text-secondary">Built-in experts cannot be deleted. Turn off <span className="font-medium text-primary">Enabled</span> instead to take it out of calls.</p>
                                    <button type="button" className="v-btn v-btn--danger mt-3 w-full" disabled>
                                        <Trash2 size={14} strokeWidth={1.9} />
                                        Delete expert
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-secondary">Removes it from every call at once. The skills and actions it used are kept.</p>
                                    <button type="button" className="v-btn v-btn--danger mt-3 w-full" onClick={destroy}>
                                        <Trash2 size={14} strokeWidth={1.9} />
                                        Delete expert
                                    </button>
                                </>
                            )}
                        </div>
                    </Card>
                </aside>
            </div>
        </form>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="px-6 pt-1 pb-6 text-sm text-secondary">{children}</p>;
}

function Checklist({ children }: { children: ReactNode }) {
    return (
        <div style={{ borderTop: '1px solid var(--separator)' }}>
            <List>{children}</List>
        </div>
    );
}

/** A checkable row: the whole row is the hit target. */
function CheckRow({ checked, onChange, title, subtitle, trailing }: { checked: boolean; onChange: () => void; title: string; subtitle?: string; trailing?: ReactNode }) {
    return (
        <label className="flex cursor-pointer items-start gap-3.5 px-6 py-3 transition-colors hover:bg-surface-hover" style={{ background: checked ? 'color-mix(in srgb, var(--accent) 3%, transparent)' : undefined }}>
            <input type="checkbox" className="mt-0.75 shrink-0" checked={checked} onChange={onChange} />
            <span className="min-w-0 flex-1">
                <span className="block text-base font-medium" style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{title}</span>
                {subtitle && <span className="mt-0.5 block text-sm text-tertiary">{subtitle}</span>}
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-2 pt-0.5">{trailing}</span>}
        </label>
    );
}
