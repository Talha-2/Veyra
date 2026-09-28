import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowDown, ArrowUp, CornerDownRight, FileText, GripVertical, ListOrdered, Play, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { ChoiceCard } from '../../components/studio-capability/choice-card';
import { EditorWell } from '../../components/studio-capability/editor-well';
import { SaveBar, Toggle } from '../../components/studio/form';
import { Fact, PageStack, Panel, SideCard, Stacked, WithSide } from '../../components/studio/space';
import { Callout, CopyButton } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Mono } from '../../components/ui/primitives';
import type { SharedProps } from '../../types';

interface Step { name: string; instruction: string }
interface Props {
    skill: {
        id: number; slug: string; name: string; description: string; body: string | null;
        execution_mode: string; steps: Step[]; enabled: boolean; version: number; rendered: string;
        experts: { id: number; name: string }[];
    };
    modes: { value: string; label: string; description: string; caution: string | null }[];
    agent_available: boolean;
}

const MAX_STEPS = 30;
let keySeed = 0;
const newKey = () => `step-${++keySeed}`;

const modeIcon = (mode: string) =>
    mode === 'gated' ? <ListOrdered size={16} strokeWidth={1.9} /> : <FileText size={16} strokeWidth={1.9} />;

/**
 * One skill. The editor is the page: what it is for, how it runs, and the
 * instructions in a full-width writing surface. Trying it and reading the
 * exact text the model receives sit in a side panel on wide screens and
 * below the editor on narrower ones.
 */
export default function SkillDetail({ skill, modes, agent_available }: Props) {
    const { data, setData, patch, processing, errors, isDirty, reset } = useForm({
        name: skill.name,
        description: skill.description,
        body: skill.body ?? '',
        execution_mode: skill.execution_mode,
        steps: skill.steps,
        enabled: skill.enabled,
    });
    const fieldErrors = errors as Record<string, string | undefined>;
    const gated = data.execution_mode === 'gated';
    const mode = modes.find((m) => m.value === data.execution_mode);
    const savedMode = modes.find((m) => m.value === skill.execution_mode);

    // Stable keys, so reordering moves the row rather than its contents.
    const [keys, setKeys] = useState<string[]>(() => skill.steps.map(newKey));
    const [armed, setArmed] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const dragFrom = useRef<number | null>(null);

    const submit = (e: FormEvent) => { e.preventDefault(); patch(`/studio/skills/${skill.id}`, { preserveScroll: true }); };

    const discard = () => { reset(); setKeys(skill.steps.map(newKey)); };

    const setStep = (i: number, patchStep: Partial<Step>) =>
        setData('steps', data.steps.map((s, j) => (j === i ? { ...s, ...patchStep } : s)));

    const addStep = () => {
        if (data.steps.length >= MAX_STEPS) return;
        setData('steps', [...data.steps, { name: '', instruction: '' }]);
        setKeys((k) => [...k, newKey()]);
    };

    const removeStep = (i: number) => {
        setData('steps', data.steps.filter((_, j) => j !== i));
        setKeys((k) => k.filter((_, j) => j !== i));
    };

    const moveStep = (from: number, to: number) => {
        if (to < 0 || to >= data.steps.length || from === to) return;
        const move = <T,>(list: T[]) => { const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };
        setData('steps', move(data.steps));
        setKeys((k) => move(k));
    };

    const chooseMode = (value: string) => {
        // A step-gated skill needs at least one step; start one so the
        // author sees where the steps go instead of meeting an error on save.
        if (value === 'gated' && data.steps.length === 0) {
            setData((d) => ({ ...d, execution_mode: value, steps: [{ name: '', instruction: '' }] }));
            setKeys([newKey()]);
            return;
        }
        setData('execution_mode', value);
    };

    const destroy = () => {
        if (!confirm(`Delete “${skill.name}”? Experts that have it stop being offered it on their next turn.`)) return;
        router.delete(`/studio/skills/${skill.id}`);
    };

    return (
        <form onSubmit={submit}>
            <Head title={skill.name} />

            <PageHeader
                back={{ href: '/studio/skills', label: 'Skills' }}
                title={skill.name}
                description={
                    skill.experts.length === 0 ? (
                        'Not granted to any expert yet, so the agent cannot use it. Grant it from an expert’s page.'
                    ) : (
                        <>
                            Used by{' '}
                            {skill.experts.map((e, i) => (
                                <span key={e.id}>
                                    {i > 0 && (i === skill.experts.length - 1 ? ' and ' : ', ')}
                                    <Link href={`/studio/experts/${e.id}`} className="text-accent-text hover:underline">{e.name}</Link>
                                </span>
                            ))}
                            .
                        </>
                    )
                }
                meta={
                    <>
                        <Badge tone={skill.enabled ? 'success' : 'muted'} dot>{skill.enabled ? 'On' : 'Off'}</Badge>
                        {savedMode && <Badge tone={skill.execution_mode === 'gated' ? 'info' : 'muted'}>{savedMode.label}</Badge>}
                        <Mono>Version {skill.version}</Mono>
                    </>
                }
            />

            <PageStack>
                <WithSide
                    side={
                        <>
                            <TryIt skillId={skill.id} available={agent_available} unsaved={isDirty} />
                            <AgentReads rendered={skill.rendered} version={skill.version} unsaved={isDirty} />
                            <SideCard title="Status">
                                <Toggle checked={data.enabled} onChange={(v) => setData('enabled', v)} label="Enabled"
                                    hint="Off keeps it granted to its experts, but they are not offered it." />
                                <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--separator)' }}>
                                    <Fact label="Saved version"><span className="tabular-nums">v{skill.version}</span></Fact>
                                    <Fact label="Experts">{skill.experts.length === 0 ? <span className="text-warning">None yet</span> : skill.experts.length}</Fact>
                                    <Fact label="Steps">{skill.execution_mode === 'gated' ? skill.steps.length : <span className="text-tertiary">Prose, no steps</span>}</Fact>
                                </div>
                                <div className="mt-5 flex items-center justify-between gap-3 border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                                    <span className="text-xs text-tertiary">Deleting cannot be undone.</span>
                                    <button type="button" className="v-btn v-btn--danger v-btn--sm" onClick={destroy}>
                                        <Trash2 size={14} strokeWidth={1.9} />
                                        Delete skill
                                    </button>
                                </div>
                            </SideCard>
                        </>
                    }
                >
                    <Panel title="What it is for" description="The agent sees these two lines for every skill it has, on every turn. Keep them short.">
                        <Stacked label="Name" htmlFor="skill-name" error={errors.name}>
                            <input id="skill-name" className="v-field max-w-md" value={data.name} maxLength={80} onChange={(e) => setData('name', e.target.value)} />
                        </Stacked>
                        <Stacked label="When to use it" htmlFor="skill-when" error={errors.description}
                            hint="The agent reads only this line to decide whether to open the skill, so say when, not how."
                            aside={<Mono style={{ color: data.description.length > 180 ? 'var(--warning)' : undefined }}>{data.description.length}/200</Mono>}>
                            <input id="skill-when" className="v-field" value={data.description} maxLength={200} onChange={(e) => setData('description', e.target.value)} dir="auto" />
                        </Stacked>
                    </Panel>

                    <Panel title="How it runs" description="Takes effect on the next conversation after you save.">
                        <div role="radiogroup" aria-label="How it runs" className="grid gap-4 @min-[560px]:grid-cols-2">
                            {modes.map((m) => (
                                <ChoiceCard key={m.value} selected={data.execution_mode === m.value} onSelect={() => chooseMode(m.value)}
                                    icon={modeIcon(m.value)} title={m.label} description={m.description} />
                            ))}
                        </div>
                        {mode?.caution && <Callout tone="warning">{mode.caution}</Callout>}
                    </Panel>

                    <Panel
                        title={gated ? 'Framing' : 'Instructions'}
                        description={gated
                            ? 'Read once, before the first step. Rules that apply across every step go here; what to do goes in the steps.'
                            : 'Imperative, in short paragraphs. Say what to check before asking the caller, and what to confirm before writing anything down.'}
                    >
                        <EditorWell
                            value={data.body}
                            onChange={(v) => setData('body', v)}
                            label={gated ? 'Framing' : 'Instructions'}
                            max={30000}
                            minRows={gated ? 4 : 12}
                            error={errors.body}
                            placeholder={gated
                                ? 'Never read a card number back. If the caller hesitates, offer to send a payment link instead.'
                                : 'Find the booking first: ask for the reference, or the name and date. Confirm the new time back to the caller before changing anything.'}
                        />
                    </Panel>

                    {gated && (
                        <Panel
                            title="Steps"
                            description="Run in order. The agent sees one step at a time and cannot move on until it has what the step asks for."
                            aside={<Mono>{data.steps.length} of {MAX_STEPS}</Mono>}
                        >
                            {errors.steps && <Callout tone="danger">{errors.steps}</Callout>}

                            <ol className="flex flex-col">
                                {data.steps.map((step, i) => {
                                    const last = i === data.steps.length - 1;
                                    const nameError = fieldErrors[`steps.${i}.name`];
                                    const instructionError = fieldErrors[`steps.${i}.instruction`];

                                    return (
                                        <li
                                            key={keys[i] ?? i}
                                            draggable={armed === i}
                                            onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; }}
                                            onDragOver={(e) => { if (dragFrom.current === null) return; e.preventDefault(); setOver(i); }}
                                            onDragLeave={() => setOver((o) => (o === i ? null : o))}
                                            onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) moveStep(dragFrom.current, i); dragFrom.current = null; setOver(null); setArmed(null); }}
                                            onDragEnd={() => { dragFrom.current = null; setOver(null); setArmed(null); }}
                                            className="group relative flex gap-4"
                                        >
                                            {/* the rail: number, then a line down to the next step */}
                                            <div className="flex w-8 shrink-0 flex-col items-center">
                                                <span className="mt-4 flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
                                                    style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                                    {i + 1}
                                                </span>
                                                {!last && <span className="my-1.5 w-px flex-1" style={{ background: 'var(--border-strong)' }} aria-hidden="true" />}
                                            </div>

                                            <div className="mb-5 min-w-0 flex-1 rounded-lg p-5 transition-[border-color,box-shadow] duration-150"
                                                style={{
                                                    background: 'var(--surface)',
                                                    border: `1px solid ${over === i && dragFrom.current !== i ? 'var(--border-accent)' : 'var(--border)'}`,
                                                    boxShadow: armed === i ? 'var(--shadow-raised)' : 'var(--shadow-xs)',
                                                }}>
                                                <div className="flex items-center gap-2">
                                                    <button type="button" aria-label={`Drag step ${i + 1} to reorder`} title="Drag to reorder"
                                                        onPointerDown={() => setArmed(i)} onPointerUp={() => setArmed(null)}
                                                        className="-ml-1.5 flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-tertiary hover:bg-surface-hover hover:text-secondary active:cursor-grabbing">
                                                        <GripVertical size={15} strokeWidth={1.9} />
                                                    </button>
                                                    <input className="v-field flex-1 font-medium" placeholder="Step name, e.g. Confirm identity" value={step.name} maxLength={80}
                                                        onChange={(e) => setStep(i, { name: e.target.value })} aria-label={`Step ${i + 1} name`} />
                                                    <div className="flex shrink-0 items-center opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                                                        <button type="button" className="v-btn v-btn--ghost v-btn--icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStep(i, i - 1)}>
                                                            <ArrowUp size={14} strokeWidth={2} />
                                                        </button>
                                                        <button type="button" className="v-btn v-btn--ghost v-btn--icon" aria-label={`Move step ${i + 1} down`} disabled={last} onClick={() => moveStep(i, i + 1)}>
                                                            <ArrowDown size={14} strokeWidth={2} />
                                                        </button>
                                                        <button type="button" className="v-btn v-btn--ghost v-btn--icon hover:text-danger" aria-label={`Remove step ${i + 1}`} onClick={() => removeStep(i)}>
                                                            <Trash2 size={14} strokeWidth={1.9} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <textarea className="v-field mt-3 text-md leading-[1.6]" rows={3} dir="auto" maxLength={1000}
                                                    placeholder="What the agent does in this step, and what it must have before moving on."
                                                    value={step.instruction} onChange={(e) => setStep(i, { instruction: e.target.value })} aria-label={`Step ${i + 1} instruction`} />
                                                {(nameError || instructionError) && <p className="mt-1.5 text-sm text-danger">{nameError ?? instructionError}</p>}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>

                            <div className="flex items-center gap-3 pl-12">
                                <button type="button" className="v-btn v-btn--quiet" onClick={addStep} disabled={data.steps.length >= MAX_STEPS}>
                                    <Plus size={14} strokeWidth={2} />
                                    Add step
                                </button>
                                {data.steps.length === 0 && <span className="text-sm text-tertiary">A step-gated skill needs at least one step before it can be saved.</span>}
                            </div>
                        </Panel>
                    )}
                </WithSide>
            </PageStack>

            <SaveBar processing={processing} dirty={isDirty} label="Save new version" onDiscard={discard} />
        </form>
    );
}

/** The saved artefact, frontmatter included — exactly what the model is handed, not a live preview of the form. */
function AgentReads({ rendered, version, unsaved }: { rendered: string; version: number; unsaved: boolean }) {
    return (
        <SideCard title="What the agent reads" aside={<CopyButton value={rendered} />}>
            <p className="-mt-2 mb-4 text-sm text-secondary">Version {version}, exactly as the model receives it.</p>
            {unsaved && <div className="mb-3"><Badge tone="warning">Your unsaved edits are not shown</Badge></div>}
            {/* A bounded code block: the one place this page scrolls inside itself. */}
            <pre className="max-h-96 overflow-auto rounded-md px-4 py-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-secondary" dir="auto"
                style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>{rendered}</pre>
        </SideCard>
    );
}

/**
 * Try the *saved* version against a written scenario. A dry run on the agent
 * layer: reads are real, writes are simulated, so nothing is filed for a
 * caller who does not exist. Its own request, outside the editor's form, so
 * trying never submits unsaved edits.
 */
function TryIt({ skillId, available, unsaved }: { skillId: number; available: boolean; unsaved: boolean }) {
    const { flash } = usePage<SharedProps>().props;
    const [scenario, setScenario] = useState(flash.skill_test?.scenario ?? '');
    const [running, setRunning] = useState(false);
    const result = flash.skill_test;

    const run = () => {
        if (!scenario.trim()) return;
        setRunning(true);
        router.post(`/studio/skills/${skillId}/test`, { scenario }, { preserveScroll: true, onFinish: () => setRunning(false) });
    };

    return (
        <SideCard title="Try it" aside={!available ? <Badge tone="muted" dot>Agent offline</Badge> : undefined}>
            <p className="-mt-2 mb-4 text-sm text-secondary">Something a caller might say. Reads are real; writes are simulated.</p>
            <textarea className="v-field text-base" rows={4} value={scenario} onChange={(e) => setScenario(e.target.value)} dir="auto" disabled={!available || running}
                aria-label="Scenario" maxLength={5000}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } }}
                placeholder="“Hi, I need to move my Thursday visit to next week. My reference is 4471.”" />
            {!available && <p className="mt-2.5 text-sm text-tertiary">Connect the agent layer to try skills from here.</p>}
            {available && unsaved && <p className="mt-2.5 text-sm text-warning">This runs the saved version. Save first to try your edits.</p>}
            <button type="button" className="v-btn v-btn--quiet mt-4 w-full" disabled={!available || running || !scenario.trim()} onClick={run}>
                <Play size={14} strokeWidth={2} />
                {running ? <span className="v-shimmer">Running the saved version…</span> : 'Run the saved version'}
            </button>

            {result && (
                <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--separator)' }} aria-live="polite">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge tone={result.failed ? 'danger' : 'success'} dot>{result.failed ? 'Failed' : 'Replied'}</Badge>
                        <Mono>{result.tokens.toLocaleString()} tokens</Mono>
                    </div>
                    {result.steps.length > 0 && (
                        <ol className="mb-3 flex flex-col gap-1.5">
                            {result.steps.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-sm text-secondary">
                                    <CornerDownRight size={14} strokeWidth={1.8} className="mt-1 shrink-0 text-tertiary" />
                                    <span className="min-w-0 wrap-break-word">{s}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                    <p className="rounded-md px-4 py-3 text-base leading-relaxed whitespace-pre-wrap text-primary" style={{ background: 'var(--surface-sunken)' }} dir="auto">
                        {result.reply || 'No reply.'}
                    </p>
                    <p className="mt-2.5 text-xs text-tertiary">The private guidance the front desk would speak from, not what a caller would hear.</p>
                </div>
            )}
        </SideCard>
    );
}
